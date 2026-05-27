/**
 * 清除缓存并查 DB
 */
import pool from '../db/connection';

async function check() {
  // 1. 清除缓存
  await pool.query('DELETE FROM cached_grids');
  console.log('[Check] 缓存已清除');

  // 2. 查 stations 表
  const [rows] = await pool.query(
    'SELECT external_id, name, source, lat, lng, price_regular, price_mid, price_premium, price_diesel FROM stations'
  ) as [any[], any];
  console.log(`[Check] stations 表共 ${rows.length} 条`);
  for (const r of rows) {
    console.log(`  ${r.external_id} | ${r.name} | regular=${r.price_regular} mid=${r.price_mid} premium=${r.price_premium} diesel=${r.price_diesel}`);
  }
  process.exit(0);
}

check().catch(err => { console.error(err.message); process.exit(1); });
