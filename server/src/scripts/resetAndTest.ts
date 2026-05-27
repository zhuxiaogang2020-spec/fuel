import '../config/index';
import pool from '../db/connection';

async function resetAll() {
  console.log('[Reset] 清空所有城市的抓取状态...');
  await pool.query(`UPDATE price_fetch_state SET last_fetched_at=NULL, is_fetching=0, stations_count=0, error_message=NULL`);
  
  console.log('[Reset] 清空旧 gasbuddy 数据...');
  await pool.query(`DELETE FROM stations WHERE source='gasbuddy'`);
  
  console.log('[Reset] 完成！');
  await pool.end();
  process.exit(0);
}

resetAll().catch(e => { console.error(e.message); process.exit(1); });
