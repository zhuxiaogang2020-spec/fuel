declare module 'ngeohash' {
  export function encode(latitude: number, longitude: number, precision?: number): string;
  export function decode(hashstring: string): { latitude: number; longitude: number };
  export function decode_bbox(hashstring: string): [number, number, number, number];
  export function neighbor(hashstring: string, direction: [number, number]): string;
  /**
 * 获取指定 geohash 字符串周围所有相邻的 geohash 编码
 * @param {string} hashstring - 目标 geohash 编码字符串
 * @returns {string[]} 相邻的 geohash 编码数组，包含八个方向的邻居
 */
export function neighbors(hashstring: string): string[];
}
