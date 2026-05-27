CREATE DATABASE IF NOT EXISTS fuel_db DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fuel_db;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    openid VARCHAR(64) UNIQUE NOT NULL,
    nickname VARCHAR(128),
    avatar_url VARCHAR(512),
    country VARCHAR(8) DEFAULT 'CN',
    unit_preference ENUM('metric','imperial') DEFAULT 'metric',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 加油站缓存表
CREATE TABLE IF NOT EXISTS stations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    external_id VARCHAR(128),
    source ENUM('tencent','google','mock','gasbuddy'),
    name VARCHAR(256) NOT NULL,
    brand VARCHAR(64),
    lat DECIMAL(10,8) NOT NULL,
    lng DECIMAL(11,8) NOT NULL,
    address VARCHAR(512),
    geohash VARCHAR(12),
    price_regular DECIMAL(8,3),
    price_mid DECIMAL(8,3),
    price_premium DECIMAL(8,3),
    price_diesel DECIMAL(8,3),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_geohash (geohash),
    INDEX idx_location (lat, lng),
    UNIQUE INDEX idx_external_id (external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 加油记录表
CREATE TABLE IF NOT EXISTS refuel_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    station_id INT NOT NULL,
    grade ENUM('regular','mid','premium','diesel') NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    volume DECIMAL(10,3),
    odometer DECIMAL(10,1),
    is_full_tank BOOLEAN DEFAULT FALSE,
    receipt_url VARCHAR(512),
    fuel_efficiency DECIMAL(8,2),
    efficiency_unit ENUM('L/100km','MPG') DEFAULT 'L/100km',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
    INDEX idx_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Geohash 缓存表
CREATE TABLE IF NOT EXISTS cached_grids (
    id INT AUTO_INCREMENT PRIMARY KEY,
    geohash_prefix VARCHAR(12) NOT NULL,
    radius INT NOT NULL,
    country VARCHAR(8) NOT NULL,
    data JSON NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_grid (geohash_prefix, radius, country)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户流控表
CREATE TABLE IF NOT EXISTS user_rate_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    api_calls_today INT DEFAULT 0,
    last_call_date DATE NOT NULL,
    blocked_until TIMESTAMP NULL,
    UNIQUE KEY uk_user_date (user_id, last_call_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 全局配置表
CREATE TABLE IF NOT EXISTS global_configs (
    `key` VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 初始化全局配置
INSERT INTO global_configs (`key`, value) VALUES
('api_daily_limit', '1000'),
('circuit_breaker_open', 'false')
ON DUPLICATE KEY UPDATE value=VALUES(value);
