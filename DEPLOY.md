# Fuel2 部署文档

## 📦 项目概览

Fuel2 是一个加油记录与油价对比小程序，包含两个主要部分：

- **client/** — 微信小程序前端（uni-app）
- **server/** — Express + MySQL 后端

---

## 🗄 数据库表结构

> 数据库: `fuel_db` (utf8mb4)，所有初始化 SQL 在 `server/src/db/schema.sql`

### 1. `users` — 用户表

```sql
CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    openid          VARCHAR(64) UNIQUE NOT NULL,      -- 微信 openid
    nickname        VARCHAR(128),                      -- 用户昵称
    avatar_url      VARCHAR(512),                      -- 头像 URL
    country         VARCHAR(8) DEFAULT 'CN',           -- 国家: CN/CA/US/OTHER
    unit_preference ENUM('metric','imperial') DEFAULT 'metric',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 2. `stations` — 加油站缓存表

```sql
CREATE TABLE IF NOT EXISTS stations (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    external_id     VARCHAR(128),                      -- 外部数据源 ID
    source          ENUM('tencent','google','mock','gasbuddy'),  -- 数据来源
    name            VARCHAR(256) NOT NULL,             -- 加油站名称
    brand           VARCHAR(64),                       -- 品牌
    lat             DECIMAL(10,8) NOT NULL,            -- 纬度
    lng             DECIMAL(11,8) NOT NULL,            -- 经度
    address         VARCHAR(512),                      -- 地址
    geohash         VARCHAR(12),                       -- 地理 hash
    price_regular   DECIMAL(8,3),                      -- Regular 92# 价格
    price_mid       DECIMAL(8,3),                      -- Mid 95# 价格
    price_premium   DECIMAL(8,3),                      -- Premium 98# 价格
    price_diesel    DECIMAL(8,3),                      -- 柴油价格
    last_updated    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_geohash (geohash),
    INDEX idx_location (lat, lng),
    UNIQUE INDEX idx_external_id (external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 3. `refuel_records` — 加油记录表

```sql
CREATE TABLE IF NOT EXISTS refuel_records (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT NOT NULL,                     -- 用户 ID
    vehicle_id       INT,                              -- 车辆 ID（migration 追加）
    station_id       INT NOT NULL,                     -- 加油站 ID
    grade            ENUM('regular','mid','premium','diesel') NOT NULL,  -- 油号
    amount           DECIMAL(10,2) NOT NULL,           -- 金额
    volume           DECIMAL(10,3),                    -- 油量（升/加仑）
    odometer         DECIMAL(10,1),                    -- 里程
    is_full_tank     BOOLEAN DEFAULT FALSE,            -- 是否加满
    receipt_url      VARCHAR(512),                     -- 小票照片 URL
    fuel_efficiency  DECIMAL(8,2),                     -- 油耗
    efficiency_unit  ENUM('L/100km','MPG') DEFAULT 'L/100km',
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
    INDEX idx_user_time (user_id, created_at),
    INDEX idx_vehicle (vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4. `vehicles` — 车辆表（migration 追加）

```sql
CREATE TABLE IF NOT EXISTS vehicles (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,                      -- 用户 ID
    name            VARCHAR(64) NOT NULL DEFAULT '我的车',  -- 车辆名称
    plate_number    VARCHAR(32),                       -- 车牌号
    model           VARCHAR(128),                      -- 车辆型号
    last_grade      ENUM('regular','mid','premium','diesel') DEFAULT NULL,  -- 上次加油油号
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5. `cached_grids` — Geohash 缓存表

```sql
CREATE TABLE IF NOT EXISTS cached_grids (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    geohash_prefix  VARCHAR(12) NOT NULL,
    radius          INT NOT NULL,
    country         VARCHAR(8) NOT NULL,
    data            JSON NOT NULL,                     -- 缓存数据
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_grid (geohash_prefix, radius, country)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6. `user_rate_limits` — 用户流控表

```sql
CREATE TABLE IF NOT EXISTS user_rate_limits (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT NOT NULL,
    api_calls_today  INT DEFAULT 0,
    last_call_date   DATE NOT NULL,
    blocked_until    TIMESTAMP NULL,
    UNIQUE KEY uk_user_date (user_id, last_call_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 7. `global_configs` — 全局配置表

```sql
CREATE TABLE IF NOT EXISTS global_configs (
    `key`       VARCHAR(64) PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 初始数据
INSERT INTO global_configs (`key`, value) VALUES
('api_daily_limit', '1000'),
('circuit_breaker_open', 'false')
ON DUPLICATE KEY UPDATE value=VALUES(value);
```

### 8. `price_fetch_state` — 价格抓取状态表（migration 追加）

```sql
CREATE TABLE IF NOT EXISTS price_fetch_state (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    city_name         VARCHAR(128) NOT NULL COMMENT '城市名',
    last_fetched_at   TIMESTAMP NULL COMMENT '最后一次抓取成功时间',
    is_fetching       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '并发锁',
    fetch_started_at  TIMESTAMP NULL COMMENT '本次抓取开始时间',
    stations_count    INT DEFAULT 0 COMMENT '上次抓取加油站数量',
    error_message     TEXT NULL COMMENT '最后一次错误信息',
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_city (city_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 建库 + 执行迁移

```bash
# 初始化数据库（建表 + 默认值）
npm run db:init

# 执行迁移（追加 vehicles 表、price_fetch_state 表等）
mysql -u root fuel_db < src/db/migration_add_vehicles.sql
mysql -u root fuel_db < src/db/migration_add_price_fetch_state.sql
```

---

## 🔧 环境变量

### 后端 (`server/.env`)

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `PORT` | 否 | `3000` | 服务端口 |
| `DB_HOST` | 否 | `127.0.0.1` | MySQL 主机 |
| `DB_PORT` | 否 | `3306` | MySQL 端口 |
| `DB_USER` | 否 | `root` | MySQL 用户 |
| `DB_PASSWORD` | 否 | `(空)` | MySQL 密码 |
| `DB_NAME` | 否 | `fuel_db` | MySQL 数据库名 |
| `WECHAT_APPID` | **是** | `wx5ebd4176b7e2eb8d` | 微信小程序 AppID |
| `WECHAT_SECRET` | **是** | `(空)` | 微信小程序 Secret |
| `TENCENT_MAP_KEY` | ① | `(空)` | 腾讯地图 API Key（国内数据源） |
| `TENCENT_MAP_ENABLED` | 否 | `true` | 腾讯地图是否启用 |
| `GOOGLE_MAPS_KEY` | ② | `(空)` | Google Maps API Key（国外数据源） |
| `GOOGLE_MAPS_ENABLED` | 否 | `true` | Google Maps 是否启用 |
| `GOOGLE_MAPS_LANGUAGE` | 否 | `en` | Google Maps 语言 |
| `GOOGLE_MAPS_REGION` | 否 | `ca` | Google Maps 区域 |
| `GOOGLE_MAPS_TIMEOUT` | 否 | `10000` | Google Maps 请求超时(ms) |
| `NODE_ENV` | 否 | `development` | 环境模式 |
| `USE_MOCK` | 否 | `(自动)` | 强制 Mock 模式（无 API Key 时自动降级） |
| `MOCK_ENABLED` | 否 | `(同上)` | 同上 |
| `API_DAILY_LIMIT` | 否 | `1000` | 单用户每日 API 调用上限 |
| `GASBUDDY_API_URL` | ③ | `http://localhost:8000` | GasBuddy FastAPI 服务地址 |
| `GASBUDDY_API_ENABLED` | 否 | `true` | 是否启用 FastAPI 服务 |
| `GASBUDDY_PRICES_PATH` | 否 | `/prices` | 价格查询路径 |
| `GASBUDDY_SEARCH_RADIUS` | 否 | `25` | 搜索半径（公里） |
| `GASBUDDY_API_TIMEOUT_MS` | 否 | `30000` | FastAPI 请求超时(ms) |
| `LOCAL_SCRAPER_ENABLED` | 否 | `true` | 是否启用本地 Puppeteer 爬虫 |
| `PRICE_CACHE_MAX_AGE_MINUTES` | 否 | `180` | 价格缓存有效期（分钟） |
| `SCRAPER_TIMEOUT_MS` | 否 | `90000` | 本地爬虫超时(ms) |

> ① 国内用户必填；② 国外用户必填；③ 运行在家庭 IP 上的 GasBuddy FastAPI 服务，用于加拿大/美国油价查询

### 前端 (`client/.env`)

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `VITE_API_BASE_URL` | **是** | `http://localhost:3000/api` | 后端 API 地址（微信小程序需配置白名单域名） |
| `VITE_GASBUDDY_SEARCH_RADIUS` | 否 | `15` | 油价搜索半径（英里） |

---

## 🚀 部署步骤

### 1. MySQL 初始化

```bash
# 建库建表
mysql -u root -p < server/src/db/schema.sql

# 执行迁移
mysql -u root -p fuel_db < server/src/db/migration_add_vehicles.sql
mysql -u root -p fuel_db < server/src/db/migration_add_price_fetch_state.sql
```

### 2. 后端部署

```bash
cd server

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入实际值

# 构建
npm run build

# 启动
npm start
```

### 3. 前端构建

微信小程序端使用 uni-app 构建，在微信开发者工具中导入 `client/dist/build/mp-weixin` 目录。

```bash
cd client
npm install
npm run build:mp-weixin
```

然后在微信开发者工具中：
1. 打开项目目录 `client/dist/build/mp-weixin`
2. 填入小程序的 AppID
3. 在「详情 → 本地设置」中勾选「不校验合法域名...」（开发调试用）
4. 真机预览需在微信公众平台配置 `request` 合法域名

### 4. 部署检查清单

- [ ] MySQL 已初始化（执行了 schema.sql + migrations）
- [ ] `server/.env` 中 `WECHAT_APPID` / `WECHAT_SECRET` 已填写
- [ ] 国内部署：已填写 `TENCENT_MAP_KEY`
- [ ] 国外部署：已填写 `GOOGLE_MAPS_KEY`
- [ ] 加拿大/美国部署：已配置 `GASBUDDY_API_URL`（FastAPI 服务）
- [ ] `client/.env` 中 `VITE_API_BASE_URL` 指向正确的后端地址
- [ ] 微信公众平台已添加后端 API 域名到 `request` 白名单
- [ ] 后端端口（默认 3000）未被占用

---

## 📁 项目结构

```
fuel2/
├── client/                          # uni-app 小程序前端
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index/               # 首页（地图 + 加油站列表）
│   │   │   ├── station-detail/      # 加油站详情
│   │   │   ├── refuel/              # 添加加油记录
│   │   │   ├── stats/               # 油耗统计
│   │   │   └── profile/             # 个人中心
│   │   ├── components/              # 公共组件
│   │   ├── store/                   # Pinia 状态管理
│   │   ├── utils/                   # 工具函数
│   │   ├── types/                   # TypeScript 类型
│   │   ├── App.vue
│   │   └── pages.json
│   ├── .env
│   └── package.json
├── server/                          # Express 后端
│   ├── src/
│   │   ├── app.ts                   # 入口
│   │   ├── config/                  # 配置
│   │   ├── routes/                  # API 路由
│   │   ├── services/                # 业务逻辑、爬虫
│   │   ├── db/                      # 数据库连接 + SQL
│   │   ├── scripts/                 # 脚本
│   │   └── types/                   # 类型定义
│   ├── .env / .env.example
│   └── package.json
└── start-server.bat                 # Windows 启动脚本
```

## 📡 API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 微信登录 |
| GET  | `/api/auth/userinfo` | 获取用户信息 |
| GET  | `/api/stations/:id` | 加油站详情 |
| GET  | `/api/prices/compare` | 油价对比 |
| GET  | `/api/prices/gasbuddy` | GasBuddy 直连油价 |
| POST | `/api/records` | 添加加油记录 |
| GET  | `/api/records` | 获取加油记录列表 |
| GET  | `/api/records/stats` | 加油统计 |
| GET  | `/api/vehicles` | 获取车辆列表 |
| POST | `/api/vehicles` | 添加车辆 |
| PUT  | `/api/vehicles/:id` | 更新车辆 |
| DEL  | `/api/vehicles/:id` | 删除车辆 |
| GET  | `/api/health` | 健康检查 |

---

## ⚠️ 注意事项

1. **微信小程序白名单**：后端 API 域名必须在微信公众平台「开发 → 开发管理 → 服务器域名 → request 合法域名」中添加
2. **GasBuddy 数据**：加拿大/美国油价通过家庭 IP 上的 FastAPI 服务获取（反爬策略），后端本地 Puppeteer 爬虫作为备用
3. **Mock 模式**：当未配置 `TENCENT_MAP_KEY` 且未配置 `GOOGLE_MAPS_KEY` 时自动启用，使用本地测试数据
4. **价格单位**：GasBuddy FastAPI 返回单位为分/升（cents/L），后端自动除以 100 转换为元/升
