/**
 * 将 GoogleAdapter 返回的加油站列表写入 stations 表
 * 价格暂时用 Mock 值，后续 GasBuddy 爬虫成功后会覆盖为真实价格
 *
 * 用法: npx ts-node --transpile-only src/scripts/seedStations.ts
 */
import pool from '../db/connection';
import { getAdapter } from '../services/adapterFactory';
import { detectCountry } from '../services/countryDetect';

async function seed(lat: number, lng: number, radius: number) {
  const countryInfo = detectCountry(lat, lng);
  const adapter = getAdapter(countryInfo.country);

  console.log(`[Seed] 查询附近加油站: lat=${lat}, lng=${lng}, radius=${radius}m`);
  const stations = await adapter.searchNearby(lat, lng, radius);

  console.log(`[Seed] 获取到 ${stations.length} 个加油站`);

  let inserted = 0;
  let updated = 0;

  for (const s of stations) {
    try {
      await pool.query(
        `INSERT INTO stations (external_id, source, name, brand, lat, lng, address,
          price_regular, price_mid, price_premium, price_diesel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), brand = VALUES(brand),
           lat = VALUES(lat), lng = VALUES(lng), address = VALUES(address),
           price_regular = COALESCE(NULLIF(price_regular, 0), VALUES(price_regular)),
           price_mid = COALESCE(NULLIF(price_mid, 0), VALUES(price_mid)),
           price_premium = COALESCE(NULLIF(price_premium, 0), VALUES(price_premium)),
           price_diesel = COALESCE(NULLIF(price_diesel, 0), VALUES(price_diesel))`,
        [
          s.externalId, 'google', s.name, s.brand || '',
          s.lat, s.lng, s.address || '',
          s.prices?.regular ?? null,
          s.prices?.mid ?? null,
          s.prices?.premium ?? null,
          s.prices?.diesel ?? null,
        ]
      );
      inserted++;
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY') {
        updated++;
      } else {
        console.error(`[Seed] 写入失败 ${s.externalId}:`, err.message);
      }
    }
  }

  console.log(`[Seed] 完成! 新增 ${inserted}, 已存在 ${updated}`);
  process.exit(0);
}

// 默认: St. Catharines 区域
const lat = parseFloat(process.argv[2]) || 43.1612;
const lng = parseFloat(process.argv[3]) || -79.2235;
const radius = parseInt(process.argv[4]) || 25000;

seed(lat, lng, radius).catch(err => {
  console.error('[Seed] 失败:', err.message);
  process.exit(1);
});
