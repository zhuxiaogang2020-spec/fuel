import { query, queryOne, execute } from '../db/connection';
import config from '../config/index';

interface CachedData {
  geohashPrefix: string;
  radius: number;
  country: string;
  data: any;
  expiresAt: Date;
}

/**
 * 获取缓存
 * @returns 缓存数据，未命中或已过期返回 null
 */
export async function getCache(
  geohashPrefix: string,
  radius: number,
  country: string
): Promise<any | null> {
  try {
    const record = await queryOne<{ data: string; expires_at: Date }>(
      `SELECT data, expires_at FROM cached_grids 
       WHERE geohash_prefix = ? AND radius = ? AND country = ?`,
      [geohashPrefix, radius, country]
    );

    if (!record) return null;

    const expiresAt = new Date(record.expires_at);
    if (expiresAt < new Date()) {
      // 已过期，删除缓存
      await execute(
        'DELETE FROM cached_grids WHERE geohash_prefix = ? AND radius = ? AND country = ?',
        [geohashPrefix, radius, country]
      );
      return null;
    }

    // mysql2 已自动解析 JSON 字段，直接返回
    return typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
  } catch (error) {
    console.error('读取缓存失败:', (error as Error).message);
    return null;
  }
}

/**
 * 设置缓存
 */
export async function setCache(
  geohashPrefix: string,
  radius: number,
  country: string,
  data: any
): Promise<void> {
  try {
    const ttlMinutes = config.cache.ttlMinutes;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    await execute(
      `INSERT INTO cached_grids (geohash_prefix, radius, country, data, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at)`,
      [geohashPrefix, radius, country, JSON.stringify(data), expiresAt]
    );
  } catch (error) {
    console.error('写入缓存失败:', (error as Error).message);
  }
}

/**
 * 清除过期缓存
 */
export async function cleanExpiredCache(): Promise<void> {
  try {
    await execute('DELETE FROM cached_grids WHERE expires_at < NOW()');
  } catch (error) {
    console.error('清除过期缓存失败:', (error as Error).message);
  }
}
