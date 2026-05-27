/**
 * GasBuddy 客户端工具 — 直连 FastAPI，不经过 Express 中转
 *
 * 用法:
 *   import { fetchGasPrices } from '@/utils/gasbuddy';
 *   const result = await fetchGasPrices(lat, lng);
 */

const API_URL = import.meta.env.VITE_GASBUDDY_API_URL || 'http://localhost:8000';
const SEARCH_RADIUS = Number(import.meta.env.VITE_GASBUDDY_SEARCH_RADIUS) || 15;

// ========================================================================
// 加拿大城市坐标映射
// ========================================================================

interface CityDef {
  search: string;
  lat: number;
  lng: number;
}

const CITY_DEFINITIONS: CityDef[] = [
  { search: 'Toronto, ON',       lat: 43.6532,  lng: -79.3832 },
  { search: 'Vancouver, BC',     lat: 49.2827,  lng: -123.1207 },
  { search: 'Montreal, QC',      lat: 45.5017,  lng: -73.5673 },
  { search: 'Calgary, AB',       lat: 51.0447,  lng: -114.0719 },
  { search: 'Ottawa, ON',        lat: 45.4215,  lng: -75.6972 },
  { search: 'Edmonton, AB',      lat: 53.5461,  lng: -113.4938 },
  { search: 'Mississauga, ON',   lat: 43.5890,  lng: -79.6441 },
  { search: 'Winnipeg, MB',      lat: 49.8951,  lng: -97.1384 },
  { search: 'Quebec City, QC',   lat: 46.8139,  lng: -71.2080 },
  { search: 'Hamilton, ON',      lat: 43.2557,  lng: -79.8711 },
];

function findNearestCity(lat: number, lng: number): CityDef | null {
  let best: CityDef | null = null;
  let bestDist = Infinity;

  for (const city of CITY_DEFINITIONS) {
    const dLat = (city.lat - lat) * (Math.PI / 180);
    const dLng = (city.lng - lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((city.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }

  // 始终使用最近的城市（不限制距离），由 FastAPI 返回结果
  return best;
}

// ========================================================================
// FastAPI 响应类型
// ========================================================================

interface FastApiPriceItem {
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

interface FastApiResponse {
  address: string;
  lat: number;
  lng: number;
  radius_miles: number;
  cached: boolean;
  count: number;
  prices: FastApiPriceItem[];
}

// ========================================================================
// 客户端期望的加油站格式
// ========================================================================

export interface GasStation {
  externalId: string;
  source: string;
  name: string;
  brand: string;
  lat: number;
  lng: number;
  address: string;
  prices: {
    regular: number;
    mid: number;
    premium: number;
    diesel: number;
  };
  distance: number;
  localGradeLabel: string;
  country: string;
}

interface GasBuddyResult {
  success: boolean;
  source: string;
  country: {
    country: string;
    language: string;
    unitSystem: string;
    currency: string;
    currencySymbol: string;
    priceUnit: string;
    distanceUnit: string;
    efficiencyUnit: string;
  };
  stations: GasStation[];
  error?: string;
}

// ========================================================================
// 核心：直连 FastAPI 并转换数据
// ========================================================================

const FUEL_MAP: Record<string, keyof GasStation['prices']> = {
  regular_gas: 'regular',
  midgrade_gas: 'mid',
  premium_gas: 'premium',
  diesel: 'diesel',
};

const CA_COUNTRY_INFO: GasBuddyResult['country'] = {
  country: 'CA',
  language: 'en',
  unitSystem: 'metric',
  currency: 'CAD',
  currencySymbol: 'C$',
  priceUnit: 'C$/L',
  distanceUnit: 'km',
  efficiencyUnit: 'L/100km',
};

/** 清洗站名：去掉末尾的加拿大邮编（如 M5C 2H6） */
export function cleanStationName(raw: string): string {
  return raw.replace(/\s+[A-Z]\d[A-Z]\s+\d[A-Z]\d$/, '').trim();
}

/**
 * 直接调用 GasBuddy FastAPI 获取油价
 *
 * @param lat 用户纬度
 * @param lng 用户经度
 * @param radiusKm 搜索半径（公里），不传则使用环境变量默认值
 */
export async function fetchGasPrices(lat: number, lng: number, radiusKm?: number): Promise<GasBuddyResult> {
  const city = findNearestCity(lat, lng);
  if (!city) {
    return {
      success: false,
      source: 'gasbuddy',
      country: CA_COUNTRY_INFO,
      stations: [],
      error: '不在加拿大主要城市范围内',
    };
  }

  // 半径：优先使用传入的 km 值，转换为英里（FastAPI 期望英里）
  const radiusMiles = radiusKm != null ? Math.round((radiusKm / 1.60934) * 10) / 10 : SEARCH_RADIUS;
  const url = `${API_URL}/prices?address=${encodeURIComponent(city.search)}&radius=${radiusMiles}`;

  console.log('[GasBuddy] ▶ 直连 FastAPI:', url);

  return new Promise((resolve) => {
    uni.request({
      url,
      method: 'GET',
      timeout: 30000,
      success: (res) => {
        if (res.statusCode !== 200) {
          console.error('[GasBuddy] HTTP', res.statusCode, res.data);
          resolve({
            success: false,
            source: 'gasbuddy',
            country: CA_COUNTRY_INFO,
            stations: [],
            error: `服务异常 (${res.statusCode})`,
          });
          return;
        }

        const data = res.data as FastApiResponse;
        console.log(`[GasBuddy] ✓ ${city.search}: ${data.count} 条, cached=${data.cached}`);

        if (!data.prices || data.prices.length === 0) {
          resolve({
            success: true,
            source: 'gasbuddy',
            country: CA_COUNTRY_INFO,
            stations: [],
          });
          return;
        }

        // 按 site_id 分组（同一加油站可能有 multiple fuel types）
        const groupMap = new Map<string, FastApiPriceItem[]>();
        for (const item of data.prices) {
          if (!item.site_id) continue;
          const arr = groupMap.get(item.site_id);
          if (arr) {
            arr.push(item);
          } else {
            groupMap.set(item.site_id, [item]);
          }
        }

        // 计算用户到每个加油站的距离
        const R = 6371000;
        const stations: GasStation[] = [];

        for (const [siteId, items] of groupMap) {
          const first = items[0];

          // 各油品价格 (FastAPI 返回的是分(cents)，需除以100转为元)
          const prices: GasStation['prices'] = { regular: 0, mid: 0, premium: 0, diesel: 0 };
          for (const item of items) {
            const key = FUEL_MAP[item.fuel_type];
            if (key) prices[key] = item.cost / 100;
          }

          // 距离（相对于用户位置）
          const dLat = ((first.lat - lat) * Math.PI) / 180;
          const dLng = ((first.long - lng) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat * Math.PI) / 180) *
              Math.cos((first.lat * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

          stations.push({
            externalId: siteId,
            source: 'gasbuddy',
            name: cleanStationName(first.name),
            brand: first.brand || '',
            lat: first.lat,
            lng: first.long,
            address: first.address && first.address !== 'See properties' ? first.address : city.search,
            prices,
            distance: Math.round(distance),
            localGradeLabel: 'Regular(87)',
            country: 'CA',
          });
        }

        // 按距离排序
        stations.sort((a, b) => a.distance - b.distance);

        console.log(`[GasBuddy] → 分组为 ${stations.length} 个加油站`);

        resolve({
          success: true,
          source: 'gasbuddy',
          country: CA_COUNTRY_INFO,
          stations,
        });
      },
      fail: (err) => {
        console.error('[GasBuddy] 请求失败:', err.errMsg);
        resolve({
          success: false,
          source: 'gasbuddy',
          country: CA_COUNTRY_INFO,
          stations: [],
          error: err.errMsg || '网络错误',
        });
      },
    });
  });
}

export default fetchGasPrices;
