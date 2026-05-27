/**
 * GasBuddy FastAPI 客户端 — 调用家庭IP上运行的 FastAPI 服务获取油价
 *
 * 替代原来的 Puppeteer/Playwright 本地爬虫方案。
 * 服务端返回的已经是结构化的 JSON 数据，无需再做 HTML 解析。
 *
 * FastAPI 端点: GET {baseUrl}{pricesPath}?address=&radius=&fuel_type=
 * 文档: gasbuddy_intface.md
 */

import axios from 'axios';
import config from '../config';

// ========================================================================
// Types
// ========================================================================

/** FastAPI /prices 返回的单个价格条目 */
interface GasBuddyPriceItem {
  site_id: string;
  name: string;
  address: string;
  lat: number;
  long: number;
  brand: string;
  distance: number;
  fuel_type: string;
  cost: number;
  source: string;
}

/** FastAPI /prices 完整响应 */
interface GasBuddyApiResponse {
  address: string;
  lat: number;
  lng: number;
  radius_miles: number;
  cached: boolean;
  count: number;
  prices: GasBuddyPriceItem[];
}

/** 写入 DB 用的 station 结构（与 priceFetchService 中 StationRaw 一致） */
export interface StationRaw {
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

// ========================================================================
// Fuel type mapping（兼容旧 fuel 数值编码）
// ========================================================================

const FUEL_TYPE_MAP: Record<number, string> = {
  1: 'regular_gas',
  2: 'midgrade_gas',
  3: 'premium_gas',
  4: 'diesel',
};

// ========================================================================
// 数据转换：FastAPI 返回 → StationRaw[]
// ========================================================================

/**
 * 将 FastAPI 返回的扁平价格列表按 site_id 分组，
 * 转为 priceFetchService 需要的 StationRaw[] 格式
 */
function transformToStations(items: GasBuddyPriceItem[], citySearch: string): StationRaw[] {
  // 按 site_id 分组（同一加油站可能有 regular/premium/diesel 等多个价格条目）
  const grouped = new Map<string, GasBuddyPriceItem[]>();
  for (const item of items) {
    if (!item.site_id) continue;
    const existing = grouped.get(item.site_id);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(item.site_id, [item]);
    }
  }

  // 解析城市名/省份
  const [locality, region] = citySearch.split(',').map(s => s.trim());

  const stations: StationRaw[] = [];

  for (const [siteId, entries] of grouped) {
    const first = entries[0];

    // 从 site_id 中提取数字 ID
    const numericId = parseInt(siteId.replace(/^gasbuddy_/, ''), 10) || 0;

    const station: StationRaw = {
      id: numericId,
      name: first.name,
      displayName: first.name,
      lat: first.lat,
      lng: first.long,
      address: {
        line1: first.address && first.address !== 'See properties' ? first.address : undefined,
        locality: locality || undefined,
        region: region || undefined,
        country: 'Canada',
      },
      brands: first.brand ? [{ name: first.brand }] : undefined,
      /** GasBuddy FastAPI 返回的 cost 是分(cents/L)，需除以100转换为元($/L) */
      prices: entries.map(e => ({
        fuel_product: e.fuel_type,
        cash: { price: e.cost / 100 },
      })),
    };

    stations.push(station);
  }

  return stations;
}

// ========================================================================
// 核心 API：调用 FastAPI 获取城市油价
// ========================================================================

/**
 * 调用家庭 IP 上运行的 GasBuddy FastAPI 服务
 *
 * @param citySearch  城市搜索词，如 "Toronto, ON"
 * @param fuel        油品编码（1=Regular, 2=Midgrade, 3=Premium, 4=Diesel），不传则获取全部
 * @returns           转换后的 StationRaw[]（可直接写入 DB）
 */
export async function fetchPricesFromApi(
  citySearch: string,
  fuel?: number
): Promise<{ stations: StationRaw[]; error: string | null }> {
  const { baseUrl, pricesPath, radius, timeoutMs } = config.gasBuddyApi;

  const params: Record<string, string | number> = {
    address: citySearch,
    radius,
  };

  // 如果指定了油品，添加过滤参数
  if (fuel != null && FUEL_TYPE_MAP[fuel]) {
    params.fuel_type = FUEL_TYPE_MAP[fuel];
  }

  console.log(`[GasBuddyAPI] ▶ 请求 ${citySearch} radius=${radius}`);

  try {
    const response = await axios.get<GasBuddyApiResponse>(`${baseUrl}${pricesPath}`, {
      params,
      timeout: timeoutMs,
    });

    const data = response.data;
    console.log(
      `[GasBuddyAPI] ✓ ${citySearch}: 返回 ${data.count} 条, cached=${data.cached}`
    );

    if (!data.prices || data.prices.length === 0) {
      return { stations: [], error: null };
    }

    const stations = transformToStations(data.prices, citySearch);
    console.log(`[GasBuddyAPI] → 分组为 ${stations.length} 个加油站`);

    return { stations, error: null };
  } catch (err: any) {
    const msg = err.message || String(err);
    if (err.response) {
      const detail = err.response.data?.detail || '';
      console.error(`[GasBuddyAPI] ✗ ${citySearch}: HTTP ${err.response.status} — ${detail || msg}`);
    } else {
      console.error(`[GasBuddyAPI] ✗ ${citySearch}: ${msg}`);
    }
    return { stations: [], error: msg };
  }
}

export default fetchPricesFromApi;
