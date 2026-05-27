/**
 * 油价查询 Provider
 *
 * 从 stations 表查询真实油价（由 GasBuddy 爬虫写入），
 * 返回一个批量查询函数，供 GoogleAdapter 等适配器使用。
 */
import pool from '../db/connection';
import { Station } from './adapters/StationAdapter';

/** 油价结构（与 Station.prices 保持一致） */
export type StationPrices = Station['prices'];

/** 价格查询回调类型 */
export type PriceLookupFn = (externalIds: string[]) => Promise<Map<string, StationPrices>>;

/**
 * 创建 DB 油价查询函数
 *
 * 通过 externalId 批量查询 stations 表中的真实油价。
 * 数据来源：GasBuddy Puppeteer/Playwright 爬虫写入。
 *
 * @returns PriceLookupFn，调用方注入到 GoogleAdapter
 */
export function createDbPriceProvider(): PriceLookupFn {
  return async (externalIds: string[]): Promise<Map<string, StationPrices>> => {
    if (externalIds.length === 0) return new Map();

    try {
      const placeholders = externalIds.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT external_id,
                CAST(price_regular AS DOUBLE) AS price_regular,
                CAST(price_mid AS DOUBLE) AS price_mid,
                CAST(price_premium AS DOUBLE) AS price_premium,
                CAST(price_diesel AS DOUBLE) AS price_diesel
         FROM stations
         WHERE external_id IN (${placeholders})
           AND source IN ('google', 'gasbuddy')`,
        externalIds
      ) as [any[], any];

      const map = new Map<string, StationPrices>();
      for (const row of rows) {
        const prices: StationPrices = {};
        const r = Number(row.price_regular);
        const m = Number(row.price_mid);
        const p = Number(row.price_premium);
        const d = Number(row.price_diesel);

        if (r > 0) prices.regular = r;
        if (m > 0) prices.mid = m;
        if (p > 0) prices.premium = p;
        if (d > 0) prices.diesel = d;

        if (Object.keys(prices).length > 0) {
          map.set(row.external_id, prices);
        }
      }

      return map;
    } catch (err: any) {
      console.warn('[PriceProvider] DB 油价查询失败:', err.message);
      return new Map();
    }
  };
}

/**
 * 批量查询 + 自动回填 DB （首次查询后写入 stations 表，后续直接用）
 *
 * @param externalIds 待查询的 externalId 列表
 * @param fallbackPrices 无 DB 记录时的兜底油价（可选）
 */
export async function batchUpsertPrices(
  externalIds: string[],
  fallbackPrices?: StationPrices
): Promise<Map<string, StationPrices>> {
  const lookup = createDbPriceProvider();
  const existing = await lookup(externalIds);

  // 将未找到的 externalId 写入默认油价
  if (fallbackPrices && externalIds.length > 0) {
    const missing = externalIds.filter(id => !existing.has(id));
    if (missing.length > 0) {
      try {
        const values = missing.map((id) => [
          id, 'google', fallbackPrices.regular ?? null,
          fallbackPrices.mid ?? null, fallbackPrices.premium ?? null,
          fallbackPrices.diesel ?? null,
        ]);

        for (const vals of values) {
          await pool.query(
            `INSERT INTO stations (external_id, source, price_regular, price_mid, price_premium, price_diesel)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               price_regular = COALESCE(VALUES(price_regular), price_regular),
               price_mid = COALESCE(VALUES(price_mid), price_mid),
               price_premium = COALESCE(VALUES(price_premium), price_premium),
               price_diesel = COALESCE(VALUES(price_diesel), price_diesel)`,
            vals
          );
        }

        // 回填后重新查询
        const refreshed = await lookup(missing);
        for (const [id, prices] of refreshed) {
          existing.set(id, prices);
        }
      } catch (err: any) {
        console.warn('[PriceProvider] 批量插入失败:', err.message);
      }
    }
  }

  return existing;
}
