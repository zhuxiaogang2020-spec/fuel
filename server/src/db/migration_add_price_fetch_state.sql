-- Migration: 价格抓取状态缓存表
-- 用途：按城市追踪 Apify 爬取的新鲜度，支持按需懒加载 + 3小时缓存策略

CREATE TABLE IF NOT EXISTS price_fetch_state (
    id INT AUTO_INCREMENT PRIMARY KEY,
    city_name VARCHAR(128) NOT NULL COMMENT '城市名，如 Vancouver, BC',
    last_fetched_at TIMESTAMP NULL COMMENT '最后一次成功抓取时间',
    is_fetching TINYINT(1) NOT NULL DEFAULT 0 COMMENT '并发锁：1=正在抓取中',
    fetch_started_at TIMESTAMP NULL COMMENT '本次抓取开始时间',
    stations_count INT DEFAULT 0 COMMENT '上次抓取的加油站数量',
    error_message TEXT NULL COMMENT '最后一次错误信息',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_city (city_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='价格抓取状态缓存（按需爬取策略核心表）';

-- 预置10个加拿大城市的空记录
INSERT IGNORE INTO price_fetch_state (city_name) VALUES
    ('Toronto, ON'),
    ('Vancouver, BC'),
    ('Montreal, QC'),
    ('Calgary, AB'),
    ('Ottawa, ON'),
    ('Edmonton, AB'),
    ('Mississauga, ON'),
    ('Winnipeg, MB'),
    ('Quebec City, QC'),
    ('Hamilton, ON');
