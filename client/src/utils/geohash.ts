/**
 * Geohash 前端工具（简化版）
 * 用于本地缓存加油站位置
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * 计算经纬度的 Geohash
 */
export function encode(lat: number, lng: number, precision: number = 5): string {
  let isEven = true;
  let bit = 0;
  let ch = 0;
  let geohash = '';

  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) + 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) + 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }

    isEven = !isEven;
    bit++;

    if (bit === 5) {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}

/**
 * 计算两点距离（米）
 */
export function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface CachedStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  price?: number;
  distance?: number;
  timestamp: number;
}

const CACHE_KEY = 'fuel2_nearby_stations';
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/**
 * 获取缓存的附近加油站
 */
export function getCachedStations(lat: number, lng: number): CachedStation[] | null {
  try {
    const raw = uni.getStorageSync(CACHE_KEY);
    if (!raw) return null;

    const cached = JSON.parse(raw);
    const age = Date.now() - cached.timestamp;

    if (age > CACHE_TTL) {
      uni.removeStorageSync(CACHE_KEY);
      return null;
    }

    // 检查位置是否变化太大（> 500m 则失效）
    const moved = getDistance(lat, lng, cached.lat, cached.lng);
    if (moved > 500) {
      uni.removeStorageSync(CACHE_KEY);
      return null;
    }

    return cached.stations;
  } catch {
    return null;
  }
}

/**
 * 缓存附近加油站
 */
export function setCachedStations(
  lat: number,
  lng: number,
  stations: CachedStation[]
): void {
  try {
    uni.setStorageSync(
      CACHE_KEY,
      JSON.stringify({
        lat,
        lng,
        stations,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    console.error('缓存加油站失败:', error);
  }
}
