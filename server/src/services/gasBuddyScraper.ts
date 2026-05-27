import axios from 'axios';
import pool from '../db/connection';
import config from '../config/index';

/**
 * GasBuddy 油价爬虫服务 v2
 * 通过 GasBuddy GraphQL API 周期性爬取加拿大主要城市的真实油价
 * 存入 MySQL stations 表，供前端 API 查询
 *
 * 注意：GasBuddy 的 GraphQL API 可能会变化或需要认证。
 *       如果 API 不可用，将 fallback 到 Google Places 的模拟价格。
 */

const GASBUDDY_GQL_URL = 'https://gasbuddy.com/graphql';

// 基于实际 GasBuddy GraphQL schema (来自 StackOverflow 验证过的 query)
// 关键差异：prices 是一个数组 [{ fuel_product, cash, credit }], 不是对象树
const LOCATION_QUERY = `
query LocationBySearchTerm($brandId: Int, $cursor: String, $fuel: Int, $maxAge: Int, $search: String) {
  locationBySearchTerm(search: $search) {
    countryCode
    displayName
    latitude
    longitude
    stations(brandId: $brandId, cursor: $cursor, fuel: $fuel, maxAge: $maxAge) {
      count
      cursor { next }
      results {
        id
        name
        displayName
        address {
          line1
          line2
          locality
          region
          postalCode
          country
        }
        lat
        lng
        brands {
          brand_id
          image_url
          name
        }
        brandings {
          brand_id
          branding_type
        }
        prices {
          cash {
            nickname
            posted_time
            price
          }
          credit {
            nickname
            posted_time
            price
          }
          fuel_product
        }
        ratings_count
        star_rating
        fuels
      }
    }
  }
}`;

// 目标城市列表（可通过 .env 扩展）
interface TargetCity {
  search: string;
  country: string;
  limit: number;
}

const DEFAULT_CITIES: TargetCity[] = [
  { search: 'Toronto, ON', country: 'CA', limit: 50 },
  { search: 'Vancouver, BC', country: 'CA', limit: 50 },
  { search: 'Montreal, QC', country: 'CA', limit: 50 },
  { search: 'Calgary, AB', country: 'CA', limit: 50 },
  { search: 'Ottawa, ON', country: 'CA', limit: 50 },
  { search: 'Edmonton, AB', country: 'CA', limit: 50 },
  { search: 'Mississauga, ON', country: 'CA', limit: 30 },
  { search: 'Winnipeg, MB', country: 'CA', limit: 30 },
  { search: 'Quebec City, QC', country: 'CA', limit: 30 },
  { search: 'Hamilton, ON', country: 'CA', limit: 30 },
];

/**
 * 从 prices 数组中提取指定燃料类型的价格
 * GasBuddy 返回的 prices 是数组：
 * [{ fuel_product: "regular_gas", cash: { price: 1.55 }, credit: { price: 1.58 } }, ...]
 */
function extractPriceByFuel(prices: any[], fuelProduct: string): number | null {
  try {
    if (!Array.isArray(prices)) return null;
    const item = prices.find((p: any) => p?.fuel_product === fuelProduct);
    if (!item) return null;

    // 优先 cash 价格
    if (item.cash?.price != null && !isNaN(item.cash.price)) return Number(item.cash.price);
    // 回退 credit 价格
    if (item.credit?.price != null && !isNaN(item.credit.price)) return Number(item.credit.price);
    return null;
  } catch {
    return null;
  }
}

/**
 * 从 brands 数组中提取品牌名
 * GasBuddy 返回: brands: [{ brand_id: "122", name: "Shell", image_url: "..." }]
 */
function extractBrandFromBrands(station: any): string {
  const brands = station.brands;
  if (Array.isArray(brands) && brands.length > 0) {
    const brandName = brands[0]?.name;
    if (brandName) return normalizeBrandName(brandName);
  }
  // fallback 到 station name
  return guessBrandFromName(station.name || '', station.displayName || '');
}

function normalizeBrandName(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('shell')) return 'Shell';
  if (lower.includes('petro')) return 'Petro-Canada';
  if (lower.includes('esso') || lower.includes('exxon')) return 'Esso';
  if (lower.includes('canadian tire')) return 'Canadian Tire';
  if (lower.includes('costco')) return 'Costco';
  if (lower.includes('7-eleven') || lower.includes('7 eleven')) return '7-Eleven';
  if (lower.includes('husky')) return 'Husky';
  if (lower.includes('ultramar')) return 'Ultramar';
  if (lower.includes('mobil')) return 'Mobil';
  if (lower.includes('chevron')) return 'Chevron';
  if (lower.includes('co-op') || lower.includes('coop')) return 'Co-op';
  if (lower.includes('pioneer')) return 'Pioneer';
  if (lower.includes('irving')) return 'Irving';
  return raw; // 返回原始名称
}

function guessBrandFromName(name: string, displayName: string): string {
  return normalizeBrandName(`${name} ${displayName}`);
}

// 构建地址字符串
function buildAddress(addr: any): string {
  if (!addr) return '';
  return [addr.line1, addr.line2, addr.locality, addr.region, addr.postalCode]
    .filter(Boolean)
    .join(', ');
}

/**
 * 抓取单个城市的加油站油价数据
 */
async function scrapeCity(city: TargetCity): Promise<{
  city: string;
  stationsFound: number;
  stationsUpdated: number;
  errors: string[];
}> {
  const result = { city: city.search, stationsFound: 0, stationsUpdated: 0, errors: [] as string[] };

  try {
    console.log(`[GasBuddy] 开始抓取 ${city.search}...`);

    const response = await axios.post(
      GASBUDDY_GQL_URL,
      {
        operationName: 'LocationBySearchTerm',
        query: LOCATION_QUERY,
        variables: {
          brandId: null,
          cursor: null,
          fuel: 1,
          maxAge: 0,
          search: city.search,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept-Language': 'en-CA,en;q=0.9',
          'Origin': 'https://www.gasbuddy.com',
          'Referer': 'https://www.gasbuddy.com/',
        },
        timeout: 15000,
        validateStatus: (status) => status < 500, // 4xx 也返回，我们自己处理
      }
    );

    // 处理各种 HTTP 状态码
    if (response.status === 400) {
      result.errors.push('GasBuddy API 返回 400 — 可能 API 已变更或需要认证 Cookie');
      console.error(`[GasBuddy] ${city.search}: HTTP 400 Bad Request`);
      console.error(`[GasBuddy] 响应体:`, JSON.stringify(response.data).slice(0, 500));
      return result;
    }

    if (response.status === 401 || response.status === 403) {
      result.errors.push(`GasBuddy API 返回 ${response.status} — 需要认证，API 可能已关闭公开访问`);
      console.error(`[GasBuddy] ${city.search}: HTTP ${response.status} 需要认证`);
      return result;
    }

    if (response.status !== 200) {
      result.errors.push(`HTTP ${response.status}: ${response.statusText}`);
      console.warn(`[GasBuddy] ${city.search}: HTTP ${response.status}`);
      return result;
    }

    // 检查 GraphQL 错误
    if (response.data?.errors) {
      const gqlErrors = response.data.errors.map((e: any) => e.message).join('; ');
      result.errors.push(`GraphQL 错误: ${gqlErrors}`);
      console.error(`[GasBuddy] ${city.search} GraphQL 错误:`, gqlErrors);
      return result;
    }

    const data = response.data?.data?.locationBySearchTerm;
    if (!data) {
      result.errors.push('GraphQL 返回空 data');
      console.warn(`[GasBuddy] ${city.search}: 无数据返回，响应:`, JSON.stringify(response.data).slice(0, 300));
      return result;
    }

    const stations = data.stations?.results;
    if (!stations || stations.length === 0) {
      console.warn(`[GasBuddy] ${city.search}: 没有找到加油站`);
      return result;
    }

    result.stationsFound = stations.length;

    // 批量写入数据库
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const station of stations) {
        try {
          if (!station.lat || !station.lng || !station.name) continue;

          const externalId = `gasbuddy_${station.id}`;
          const name = station.displayName || station.name;
          const brand = extractBrandFromBrands(station);
          const lat = Number(station.lat);
          const lng = Number(station.lng);
          const address = buildAddress(station.address);

          const priceRegular = extractPriceByFuel(station.prices, 'regular_gas');
          const priceMid = extractPriceByFuel(station.prices, 'midgrade_gas');
          const pricePremium = extractPriceByFuel(station.prices, 'premium_gas');
          const priceDiesel = extractPriceByFuel(station.prices, 'diesel');

          // 如果完全没有价格数据，跳过（避免覆盖已有的有效数据）
          if (priceRegular === null && priceMid === null && pricePremium === null && priceDiesel === null) {
            continue;
          }

          // UPSERT: 有则更新价格，无则插入新站
          await conn.execute(
            `INSERT INTO stations
             (external_id, source, name, brand, lat, lng, address,
              price_regular, price_mid, price_premium, price_diesel, last_updated)
             VALUES (?, 'gasbuddy', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               brand = VALUES(brand),
               lat = VALUES(lat),
               lng = VALUES(lng),
               address = VALUES(address),
               price_regular = VALUES(price_regular),
               price_mid = VALUES(price_mid),
               price_premium = VALUES(price_premium),
               price_diesel = VALUES(price_diesel),
               last_updated = NOW()`,
            [
              externalId, name, brand, lat, lng, address,
              priceRegular, priceMid, pricePremium, priceDiesel,
            ]
          );

          result.stationsUpdated++;
        } catch (stationErr: any) {
          result.errors.push(`${station.name}: ${stationErr.message}`);
        }
      }

      await conn.commit();
      console.log(`[GasBuddy] ${city.search}: 处理 ${result.stationsFound} 个站，已更新 ${result.stationsUpdated} 条`);
    } catch (dbErr: any) {
      await conn.rollback();
      result.errors.push(`DB事务失败: ${dbErr.message}`);
      console.error(`[GasBuddy] ${city.search} DB错误:`, dbErr.message);
    } finally {
      conn.release();
    }
  } catch (err: any) {
    if (err.response) {
      const msg = `HTTP ${err.response.status}: ${err.response.statusText}`;
      result.errors.push(msg);
      console.error(`[GasBuddy] ${city.search} 请求失败:`, msg);
      if (err.response.data) {
        console.error(`[GasBuddy] 响应体:`, JSON.stringify(err.response.data).slice(0, 500));
      }
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      result.errors.push(`网络连接失败: ${err.message}`);
      console.error(`[GasBuddy] ${city.search} 网络错误:`, err.message);
    } else {
      result.errors.push(err.message);
      console.error(`[GasBuddy] ${city.search} 错误:`, err.message);
    }
  }

  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 主抓取流程
 */
export async function scrapeAllCities(): Promise<{
  totalUpdated: number;
  totalFound: number;
  errors: string[];
}> {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[GasBuddy Scraper] 开始全量抓取');
  console.log('========================================\n');

  let totalUpdated = 0;
  let totalFound = 0;
  const allErrors: string[] = [];

  const cities = getTargetCities();

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const result = await scrapeCity(city);

    totalUpdated += result.stationsUpdated;
    totalFound += result.stationsFound;
    allErrors.push(...result.errors);

    if (i < cities.length - 1) {
      const delay = 8000 + Math.floor(Math.random() * 17000);
      console.log(`[GasBuddy] 等待 ${(delay / 1000).toFixed(0)}s 后继续...\n`);
      await sleep(delay);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n========================================');
  console.log(`[GasBuddy Scraper] 抓取完成 (${elapsed}s)`);
  console.log(`  发现加油站: ${totalFound}`);
  console.log(`  更新数据库: ${totalUpdated} 条`);
  if (allErrors.length > 0) {
    console.log(`  错误数: ${allErrors.length}`);
    allErrors.slice(0, 5).forEach((e) => console.warn(`    - ${e}`));
  }
  console.log('========================================\n');

  return { totalUpdated, totalFound, errors: allErrors };
}

function getTargetCities(): TargetCity[] {
  const envCities = process.env.GASBUDDY_CITIES;
  if (envCities) {
    try {
      return JSON.parse(envCities);
    } catch {
      console.warn('[GasBuddy] GASBUDDY_CITIES 解析失败，使用默认城市列表');
    }
  }
  return DEFAULT_CITIES;
}

export async function scrapeSingleCity(search: string): Promise<any> {
  return scrapeCity({ search, country: 'CA', limit: 50 });
}
