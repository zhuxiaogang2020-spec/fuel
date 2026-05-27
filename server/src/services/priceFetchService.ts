/**
 * GasBuddy 价格服务 — 直接调用家庭 IP 上的 FastAPI
 *
 * 不做任何本地缓存 / DB 写入。FastAPI 自带缓存，我们只管调。
 */

import config from '../config/index';
import { fetchPricesFromApi } from './gasBuddyApiClient';

// ========================================================================
// Types
// ========================================================================

interface CityDef {
  search: string;
  fuel: number;
  lat: number;
  lng: number;
}

/** API 响应格式的加油站 */
export interface FormattedStation {
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
}

// ========================================================================
// City → Coordinate Mapping
// ========================================================================

const CITY_DEFINITIONS: CityDef[] = [
  { search: 'Toronto, ON',       fuel: 1, lat: 43.6532,  lng: -79.3832 },
  { search: 'Vancouver, BC',     fuel: 1, lat: 49.2827,  lng: -123.1207 },
  { search: 'Montreal, QC',      fuel: 1, lat: 45.5017,  lng: -73.5673 },
  { search: 'Calgary, AB',       fuel: 1, lat: 51.0447,  lng: -114.0719 },
  { search: 'Ottawa, ON',        fuel: 1, lat: 45.4215,  lng: -75.6972 },
  { search: 'Edmonton, AB',      fuel: 1, lat: 53.5461,  lng: -113.4938 },
  { search: 'Mississauga, ON',   fuel: 1, lat: 43.5890,  lng: -79.6441 },
  { search: 'Winnipeg, MB',      fuel: 1, lat: 49.8951,  lng: -97.1384 },
  { search: 'Quebec City, QC',   fuel: 1, lat: 46.8139,  lng: -71.2080 },
  { search: 'Hamilton, ON',      fuel: 1, lat: 43.2557,  lng: -79.8711 },
];

/**
 * 根据用户坐标找最近的加拿大城市（200km 以内有效）
 */
export function findNearestCity(lat: number, lng: number): CityDef | null {
  let best: CityDef | null = null;
  let bestDist = Infinity;

  for (const city of CITY_DEFINITIONS) {
    const dLat = (city.lat - lat) * (Math.PI / 180);
    const dLng = (city.lng - lng) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * Math.PI / 180) * Math.cos(city.lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }

  if (best && bestDist < 200000) return best;
  return null;
}

// ========================================================================
// Fuel type label mapping
// ========================================================================

const FUEL_LABEL: Record<string, string> = {
  regular_gas: 'regular',
  midgrade_gas: 'mid',
  premium_gas: 'premium',
  diesel: 'diesel',
};

// ========================================================================
// 核心：直接调 FastAPI，返回格式化数据
// ========================================================================

/**
 * 从 FastAPI 获取加拿大某城市的加油站价格，直接返回 API 格式
 *
 * @param lat  用户纬度
 * @param lng  用户经度
 * @returns    格式化后的加油站列表（不含 distance，由调用方计算）
 */
export async function fetchCanadianStations(
  lat: number,
  lng: number
): Promise<{ stations: FormattedStation[]; city: string } | null> {
  if (!config.gasBuddyApi.enabled) {
    console.log('[PriceFetch] GasBuddy API 已禁用');
    return null;
  }

  const city = findNearestCity(lat, lng);
  if (!city) {
    console.log(`[PriceFetch] 用户 (${lat.toFixed(2)}, ${lng.toFixed(2)}) 不在加拿大城市范围内，跳过`);
    return null;
  }

  console.log(`[PriceFetch] ▶ 用户 (${lat.toFixed(2)}, ${lng.toFixed(2)}) → ${city.search}`);

  const result = await fetchPricesFromApi(city.search, city.fuel);

  if (result.error) {
    console.error(`[PriceFetch] ✗ ${city.search}: ${result.error}`);
    return null;
  }

  // FastAPI 返回的 StationRaw[] → API 响应格式
  const stations: FormattedStation[] = result.stations.map(s => {
    const prices: FormattedStation['prices'] = { regular: 0, mid: 0, premium: 0, diesel: 0 };

    if (s.prices) {
      for (const p of s.prices) {
        const key = FUEL_LABEL[p.fuel_product];
        if (key && p.cash?.price != null) {
          prices[key as keyof typeof prices] = p.cash.price;
        }
      }
    }

    const addr = s.address;
    const address = [addr?.line1, addr?.locality, addr?.region]
      .filter(Boolean).join(', ');

    return {
      externalId: `gasbuddy_${s.id}`,
      source: 'gasbuddy_api',
      name: s.displayName || s.name,
      brand: s.brands?.[0]?.name || '',
      lat: s.lat,
      lng: s.lng,
      address: address || city.search,
      prices,
    };
  });

  console.log(`[PriceFetch] ✓ ${city.search}: ${stations.length} 个加油站`);

  return { stations, city: city.search };
}

// ========================================================================
// 调试 API（app.ts 引用，保持兼容）
// ========================================================================

/**
 * 手动刷新某个城市（调试用）
 * 直接调 FastAPI，返回获取到的条数
 */
export async function forceRefreshCity(cityName: string) {
  const def = CITY_DEFINITIONS.find(c => c.search === cityName);
  if (!def) return { city: cityName, stationsUpdated: 0, error: '未知城市' };

  const result = await fetchPricesFromApi(def.search, def.fuel);
  if (result.error) {
    return { city: cityName, stationsUpdated: 0, error: result.error };
  }
  return { city: cityName, stationsUpdated: result.stations.length };
}

export { CITY_DEFINITIONS };
