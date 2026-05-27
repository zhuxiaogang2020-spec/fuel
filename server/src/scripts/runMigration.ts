/**
 * 迁移脚本：创建 price_fetch_state 表（如果不存在）
 * 用法：npx ts-node src/scripts/runMigration.ts
 */
import '../config/index'; // 加载 .env
import pool from '../db/connection';

async function runMigration() {
  console.log('[Migration] 检查 price_fetch_state 表...');
  try {
    // 分开执行两条 SQL（避免多语句限制）
    await pool.query(`CREATE TABLE IF NOT EXISTS price_fetch_state (
    id INT AUTO_INCREMENT PRIMARY KEY,
    city_name VARCHAR(128) NOT NULL COMMENT '城市名',
    last_fetched_at TIMESTAMP NULL COMMENT '最后一次成功抓取时间',
    is_fetching TINYINT(1) NOT NULL DEFAULT 0 COMMENT '并发锁',
    fetch_started_at TIMESTAMP NULL COMMENT '本次抓取开始时间',
    stations_count INT DEFAULT 0 COMMENT '上次抓取的加油站数量',
    error_message TEXT NULL COMMENT '最后一次错误信息',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_city (city_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    await pool.query(`INSERT IGNORE INTO price_fetch_state (city_name) VALUES
    ('Toronto, ON'), ('Vancouver, BC'), ('Montreal, QC'),
    ('Calgary, AB'), ('Ottawa, ON'), ('Edmonton, AB'),
    ('Mississauga, ON'), ('Winnipeg, MB'),
    ('Quebec City, QC'), ('Hamilton, ON')`);

    console.log('[Migration] price_fetch_state 表已就绪');
    
    // 验证
    const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM price_fetch_state') as any;
    console.log(`[Migration] 已预置 ${rows[0].cnt} 个城市记录`);
    
    await pool.end();
    process.exit(0);
  } catch (err: any) {
    console.error('[Migration] 失败:', err.message);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
