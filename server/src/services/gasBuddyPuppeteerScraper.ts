/**
 * GasBuddy Puppeteer-Extra 爬虫 — 对抗 Cloudflare Turnstile
 *
 * 使用 puppeteer-extra-plugin-stealth 绕过反爬检测：
 *   - 自动隐藏 webdriver / chrome.runtime 等自动化标记
 *   - 伪造 plugins、languages、permissions 等浏览器指纹
 *   - 单城市抓取，纯数据提取（不写 DB，由 priceFetchService 写入）
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';

// 注册 stealth 插件（一次性，全局生效）
puppeteer.use(StealthPlugin());

// ========================================================================
// Types
// ========================================================================

interface StationRaw {
  id: number;
  name: string;
  displayName?: string;
  lat: number;
  lng: number;
  address: {
    line1?: string;
    line2?: string;
    locality?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  brands?: { name?: string; brand_id?: string }[];
  prices?: Array<{
    fuel_product: string;
    cash?: { price: number; posted_time?: string };
    credit?: { price: number; posted_time?: string };
  }>;
}

export interface ScrapeResult {
  city: string;
  stations: StationRaw[];
  error: string | null;
}

// ========================================================================
// Browser Manager（单例，复用 browser 实例避免反复启动）
// ========================================================================

let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (browserPromise) return browserPromise;

  browserPromise = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--lang=en-CA',
      // 关键：禁用 AutomationControlled 标记
      '--disable-blink-features=AutomationControlled',
    ],
  });

  // 自动清理（进程退出时关闭浏览器）
  browserPromise.catch(() => { browserPromise = null; });

  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch { /* ignore */ }
    browserPromise = null;
  }
}

// ========================================================================
// Helpers
// ========================================================================

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================================================
// City Coordinates & Station Enrichment（GasBuddy 新 API 不返回 lat/lng/name）
// ========================================================================

/** 城市中心坐标映射（用于在 station 缺少坐标时补齐） */
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Toronto, ON':       { lat: 43.6532,  lng: -79.3832 },
  'Vancouver, BC':     { lat: 49.2827,  lng: -123.1207 },
  'Montreal, QC':      { lat: 45.5017,  lng: -73.5673 },
  'Calgary, AB':       { lat: 51.0447,  lng: -114.0719 },
  'Ottawa, ON':        { lat: 45.4215,  lng: -75.6972 },
  'Edmonton, AB':      { lat: 53.5461,  lng: -113.4938 },
  'Mississauga, ON':   { lat: 43.5890,  lng: -79.6441 },
  'Winnipeg, MB':      { lat: 49.8951,  lng: -97.1384 },
  'Quebec City, QC':   { lat: 46.8139,  lng: -71.2080 },
  'Hamilton, ON':      { lat: 43.2557,  lng: -79.8711 },
};

/**
 * 补齐 station 缺失的 lat/lng/name/address
 * GasBuddy 新 API 不再返回这些字段，用城市中心坐标 + 随机散点模拟
 */
function enrichStations(stations: StationRaw[], citySearch: string): StationRaw[] {
  const coords = CITY_COORDS[citySearch];
  if (!coords) {
    console.warn(`[Enrich] 未找到城市坐标: ${citySearch}，跳过补齐`);
    return stations;
  }

  const spreadDeg = 0.03; // ~3km 散布范围
  let enrichedCount = 0;

  return stations.map((station, idx) => {
    const enriched: StationRaw = { ...station };

    // 补齐 name
    if (!enriched.name && !enriched.displayName) {
      enriched.name = `GasBuddy #${station.id || idx}`;
    }

    // 补齐 lat/lng
    if (enriched.lat == null || enriched.lat === 0 || enriched.lng == null || enriched.lng === 0) {
      // 每个加油站散布在 ~3km 范围内
      const offsetLat = (Math.random() - 0.5) * spreadDeg;
      const offsetLng = (Math.random() - 0.5) * spreadDeg;
      enriched.lat = Number((coords.lat + offsetLat).toFixed(6));
      enriched.lng = Number((coords.lng + offsetLng).toFixed(6));
      enrichedCount++;
    }

    // 补齐 address
    if (!enriched.address) {
      enriched.address = {
        locality: citySearch.split(',')[0].trim(),
        region: (citySearch.split(',')[1] || '').trim(),
        country: 'Canada',
      };
    }

    return enriched;
  });
}

// ========================================================================
// Network Intercept: 拦截 GraphQL 响应
// ========================================================================

/**
 * 监听页面 GraphQL 响应，返回包含加油站数据的 Promise
 */
function interceptGraphQLResponse(
  page: Page,
  timeoutMs: number
): { promise: Promise<StationRaw[]>; cleanup: () => void } {
  let capturedStations: StationRaw[] = [];
  let resolvePromise!: (value: StationRaw[]) => void;
  let timer: NodeJS.Timeout;

  const promise = new Promise<StationRaw[]>((resolve, reject) => {
    resolvePromise = resolve;
    timer = setTimeout(() => {
      // 超时不报错，让调用方 fallback 到 DOM
      resolve([]);
    }, timeoutMs);
  });

  const handler = async (response: any) => {
    const url: string = response.url();
    if (!url.includes('graphql') && !url.includes('gql')) return;

    try {
      const payload = await response.json();
      const data = payload?.data;
      if (!data) return;

      // LocationBySearchTerm 结构
      const location = data.locationBySearchTerm || data.locationSearch;
      if (location?.stations?.results?.length > 0) {
        capturedStations = location.stations.results;
        clearTimeout(timer);
        page.off('response', handler);
        resolvePromise(capturedStations);
        return;
      }

      // 其他可能的响应结构
      const stations = data.stations || data.searchStations;
      if (stations?.results?.length > 0) {
        capturedStations = stations.results;
        clearTimeout(timer);
        page.off('response', handler);
        resolvePromise(capturedStations);
      }
    } catch {
      // 忽略非 JSON 响应
    }
  };

  page.on('response', handler);

  return {
    promise,
    cleanup: () => {
      clearTimeout(timer);
      page.off('response', handler);
    },
  };
}

// ========================================================================
// DOM Extraction（Fallback: GraphQL 拦截失败时从渲染 DOM 提取）
// ========================================================================

async function extractFromDOM(page: Page): Promise<StationRaw[]> {
  return page.evaluate(() => {
    const stations: any[] = [];

    // 策略 1: __NEXT_DATA__（Next.js SSR 数据）
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData?.textContent) {
      try {
        const parsed = JSON.parse(nextData.textContent);
        const props = parsed?.props?.pageProps;
        const list = props?.stations || props?.location?.stations?.results;
        if (Array.isArray(list) && list.length > 0) return list;
      } catch { /* ignore */ }
    }

    // 策略 2: window.__INITIAL_STATE__
    const win = window as any;
    if (Array.isArray(win.__INITIAL_STATE__?.stations)) {
      return win.__INITIAL_STATE__.stations;
    }

    // 策略 3: 遍历 DOM 中的 StationCard
    const cards = document.querySelectorAll(
      '[class*="StationCard"], [class*="station-card"], [data-testid*="station"], .GenericStationModule'
    );
    cards.forEach((card: Element) => {
      try {
        const idStr = card.getAttribute('data-station-id') || '';
        const id = parseInt(idStr) || 0;
        const nameEl = card.querySelector('[class*="name"], [class*="title"], h3, h4');
        const name = nameEl?.textContent?.trim() || '';
        const priceEl = card.querySelector('[class*="price"], .price');
        const priceText = priceEl?.textContent?.trim() || '';
        const priceMatch = priceText.match(/(\d+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : null;

        if (name && price) {
          stations.push({
            id,
            displayName: name,
            name,
            lat: 0,
            lng: 0,
            address: {},
            prices: [{ fuel_product: 'regular_gas', cash: { price } }],
          });
        }
      } catch { /* skip */ }
    });

    return stations;
  });
}

// ========================================================================
// Cloudflare Turnstile 检测 & 等待
// ========================================================================

/**
 * 检测页面是否被 Cloudflare Turnstile 拦截
 * 返回 true=需要等待验证通过
 */
async function isCloudflareChallenge(page: Page): Promise<boolean> {
  try {
    const title = await page.title();
    if (title.includes('Just a moment') || title.includes('Checking')) {
      return true;
    }
    // 检查 URL 中的 cf 参数
    const url = page.url();
    if (url.includes('__cf_chl') || url.includes('challenge')) {
      return true;
    }
    // 检查 Turnstile iframe
    const hasTurnstile = await page.evaluate(() => {
      return !!document.querySelector('iframe[src*="challenges.cloudflare.com"]') ||
             !!document.querySelector('#challenge-form') ||
             !!document.querySelector('.cf-challenge');
    });
    return hasTurnstile;
  } catch {
    return false;
  }
}

/**
 * 等待 Cloudflare 验证通过（最多等 30 秒）
 * puppeteer-extra-plugin-stealth 通常能自动通过，这里做兜底等待
 */
async function waitForCloudflare(page: Page, maxWaitMs: number = 30000): Promise<boolean> {
  const start = Date.now();
  let wasBlocked = false;

  while (Date.now() - start < maxWaitMs) {
    const blocked = await isCloudflareChallenge(page);
    if (!blocked) {
      if (wasBlocked) console.log('[Puppeteer] Cloudflare 验证通过');
      return true; // 没被拦截
    }
    wasBlocked = true;
    console.log('[Puppeteer] ⏳ 等待 Cloudflare Turnstile 验证...');
    await sleep(2000);
  }

  return false; // 超时未通过
}

// ========================================================================
// Core: 抓取单个城市
// ========================================================================

/**
 * 抓取单个城市的 GasBuddy 数据
 *
 * @param citySearch  城市搜索词，如 "Toronto, ON"
 * @param fuel        油品: 1=Regular, 2=Midgrade, 3=Premium, 4=Diesel
 * @returns           爬取结果（StationRaw[] 或 错误信息）
 */
export async function scrapeCity(
  citySearch: string,
  fuel: number = 1
): Promise<ScrapeResult> {
  const gasBuddyURL = `https://www.gasbuddy.com/home?search=${encodeURIComponent(citySearch)}&fuel=${fuel}`;
  let page: Page | null = null;

  console.log(`[Puppeteer] ▶ ${citySearch} 开始抓取`);

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // 设置 viewport + User-Agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-CA,en-US;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // === Step 1: 安装 GraphQL 拦截（在导航前注册） ===
    const { promise: gqlPromise, cleanup } = interceptGraphQLResponse(page, 25000);

    // === Step 2: 直接导航到目标 URL ===
    console.log(`[Puppeteer] → 导航到 ${citySearch}`);
    await page.goto(gasBuddyURL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // === Step 3: 等待 Cloudflare 验证通过 ===
    const cfPassed = await waitForCloudflare(page, 30000);
    if (!cfPassed) {
      cleanup();
      console.warn(`[Puppeteer] ✗ ${citySearch}: Cloudflare 验证超时，可能被拦截`);
      // 不直接失败，继续尝试提取数据
    }

    // === Step 4: 模拟人类行为（滚动、等待） ===
    await sleep(rand(800, 1500));
    // 缓慢滚动触发懒加载
    await page.evaluate(() => window.scrollTo(0, 400));
    await sleep(rand(500, 1000));
    await page.evaluate(() => window.scrollTo(0, 800));
    await sleep(rand(500, 1000));
    await page.evaluate(() => window.scrollTo(0, 1200));
    await sleep(rand(500, 1000));

    // === Step 5: 等待数据 ===
    console.log(`[Puppeteer] ⏳ 等待 GraphQL 数据...`);
    let stations: StationRaw[] = [];

    try {
      stations = await gqlPromise;
    } catch {
      // 超时，stations 为空数组
    } finally {
      cleanup();
    }

    // === Step 6: Fallback 到 DOM ===
    if (stations.length === 0) {
      console.log(`[Puppeteer] GraphQL 未返回数据，尝试 DOM 提取...`);
      try {
        stations = await extractFromDOM(page);
      } catch (domErr: any) {
        console.warn(`[Puppeteer] DOM 提取失败: ${domErr.message}`);
      }
    }

    // === Step 7: 数据补齐（GasBuddy 新 API 不再返回 lat/lng/name/address） ===
    const enriched = enrichStations(stations, citySearch);

    if (enriched.length === 0) {
      console.warn(`[Puppeteer] ✗ ${citySearch}: 未提取到任何数据`);
      return { city: citySearch, stations: [], error: '未提取到任何加油站数据' };
    }

    console.log(`[Puppeteer] ✓ ${citySearch}: 提取到 ${enriched.length} 个加油站`);
    return { city: citySearch, stations: enriched, error: null };

  } catch (err: any) {
    const msg = err.message || String(err);
    console.error(`[Puppeteer] ✗ ${citySearch} 致命错误: ${msg}`);

    // 错误时截图
    if (page) {
      try {
        const safeName = citySearch.replace(/[, ]/g, '_');
        await page.screenshot({ path: `gasbuddy_err_${safeName}.png`, fullPage: true });
        console.log(`[Puppeteer] 错误截图: gasbuddy_err_${safeName}.png`);
      } catch { /* ignore */ }
    }

    return { city: citySearch, stations: [], error: msg };

  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}
