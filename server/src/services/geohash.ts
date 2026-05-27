import ngeohash from 'ngeohash';

/**
 * 计算经纬度的 Geohash
 * @param lat 纬度
 * @param lng 经度
 * @param precision 精度（默认 5，约 ±2.4km）
 */
export function encode(lat: number, lng: number, precision: number = 5): string {
  return ngeohash.encode(lat, lng, precision);
}

/**
 * 解码 Geohash 为经纬度范围
 */
export function decode(hash: string): { latitude: number; longitude: number } {
  return ngeohash.decode(hash);
}

/**
 * 获取 Geohash 前缀（用于缓存 key）
 */
export function getPrefix(lat: number, lng: number, precision: number = 5): string {
  return encode(lat, lng, precision);
}

/**
 * 计算两点之间的距离（米）
 */
export function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球半径（米）
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
