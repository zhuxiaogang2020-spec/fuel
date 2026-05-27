/**
 * 完整流程测试：forceRefreshCity → scrapeCity → enrichStations → writeStationsToDB
 */
import '../config/index';
import { forceRefreshCity } from '../services/priceFetchService';
import pool from '../db/connection';

async function test() {
  const city = 'Toronto, ON';
  console.log(`\n=== 测试 ${city} 完整流程 ===\n`);
  
  const result = await forceRefreshCity(city);
  console.log(`\nforceRefreshCity 返回:`, JSON.stringify(result, null, 2));
  
  // 查 DB
  const [rows] = await pool.query(
    `SELECT external_id, name, lat, lng, price_regular, price_mid, price_premium, price_diesel, address 
     FROM stations WHERE source='gasbuddy' ORDER BY lat DESC LIMIT 5`
  ) as [any[], any];
  
  console.log(`\nDB 中的 gasbuddy 数据 (前5条):`);
  rows.forEach((r: any) => {
    console.log(`  ${r.name} | (${r.lat}, ${r.lng}) | \$R=${r.price_regular} \$M=${r.price_mid} \$P=${r.price_premium} \$D=${r.price_diesel} | ${r.address}`);
  });
  
  const [cnt] = await pool.query(`SELECT COUNT(*) as total FROM stations WHERE source='gasbuddy'`) as [any[], any];
  console.log(`\n总记录数: ${cnt[0].total}`);
  
  await pool.end();
  process.exit(0);
}

test().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
