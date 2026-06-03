# Fuel2

Fuel2 是一个面向微信小程序的加油站比价与油耗记账项目。当前代码由两部分组成：

- `client/`: Uni-app + Vue 3 + TypeScript + Pinia 小程序端
- `server/`: Node.js + Express + TypeScript + MySQL 后端

项目支持中国、加拿大、美国场景的加油站搜索、价格对比、车辆管理和加油记录统计。数据源按地区和配置自动切换，缺少真实 API Key 时会回退到 Mock 数据。

## 项目结构

```text
weixin_fuel2/
├── client/
│   ├── src/
│   │   ├── pages/              # 小程序页面
│   │   │   ├── index/          # 首页 / 附近加油站
│   │   │   ├── station-detail/ # 加油站详情
│   │   │   ├── refuel/         # 添加加油记录
│   │   │   ├── stats/          # 油耗统计
│   │   │   └── profile/        # 个人中心
│   │   ├── components/         # StationCard、PriceTag、BottomDrawer、FuelChart
│   │   ├── store/              # Pinia 状态
│   │   ├── utils/              # 请求、认证、国家识别、单位换算等工具
│   │   ├── manifest.json       # 小程序配置
│   │   └── pages.json          # 页面路由与 tabBar
│   ├── package.json
│   └── vite.config.ts
├── server/
│   ├── src/
│   │   ├── app.ts              # Express 入口
│   │   ├── config/             # 环境变量配置
│   │   ├── db/                 # MySQL schema 与迁移
│   │   ├── middleware/         # 登录态与限流
│   │   ├── routes/             # auth、stations、records、vehicles、prices
│   │   ├── services/           # 地图适配、价格抓取、缓存、油耗计算
│   │   ├── scripts/            # 调试、抓取和数据库脚本
│   │   └── data/               # fallback_stations.json
│   └── package.json
└── README.md
```

## 功能概览

- 微信小程序登录，开发环境支持 Mock openid。
- 按经纬度搜索附近加油站，支持距离和价格排序。
- 支持加油站详情、油价比较、半径选项查询。
- 支持车辆 CRUD，每个用户最多 5 辆车。
- 支持加油记录创建、列表、删除和统计。
- 满箱记录会尝试计算油耗。
- 支持 Geohash 网格缓存和用户级 API 限流。
- 支持腾讯地图、Google Maps、GasBuddy FastAPI、本地 Puppeteer 抓取和 Mock fallback。

## 环境要求

- Node.js 18+
- npm
- MySQL 8.0+
- 微信开发者工具
- 可选：Google Maps API Key、腾讯地图 API Key
- 可选：GasBuddy FastAPI 服务，默认地址为 `http://localhost:8000`

## 后端启动

```bash
cd server
npm install
```

创建 `server/.env`：

```env
PORT=3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=fuel_db

WECHAT_APPID=wx5ebd4176b7e2eb8d
WECHAT_SECRET=

TENCENT_MAP_KEY=
TENCENT_MAP_ENABLED=true

GOOGLE_MAPS_KEY=
GOOGLE_MAPS_ENABLED=true
GOOGLE_MAPS_LANGUAGE=en
GOOGLE_MAPS_REGION=ca
GOOGLE_MAPS_TIMEOUT=10000

MAP_ADAPTER_MARKER_ENABLED=true
MAP_ADAPTER_ROUTE_ENABLED=true
MAP_ADAPTER_LAYER_ENABLED=true

MOCK_ENABLED=true
API_DAILY_LIMIT=1000

GASBUDDY_API_URL=http://localhost:8000
GASBUDDY_PRICES_PATH=/prices
GASBUDDY_SEARCH_RADIUS=15
GASBUDDY_API_TIMEOUT_MS=30000
GASBUDDY_API_ENABLED=true

LOCAL_SCRAPER_ENABLED=true
PRICE_CACHE_MAX_AGE_MINUTES=180
SCRAPER_TIMEOUT_MS=90000
```

初始化数据库：

```bash
mysql -u root < src/db/schema.sql
```

启动开发服务：

```bash
npm run dev
```

构建与生产启动：

```bash
npm run build
npm start
```

服务启动时会自动尝试执行以下迁移：

- `migration_add_price_fetch_state.sql`
- `migration_add_gasbuddy.sql`
- `migration_add_vehicles.sql`

## 前端启动

```bash
cd client
npm install
npm run dev:mp-weixin
```

然后用微信开发者工具打开：

```text
client/dist/dev/mp-weixin/
```

前端 API 地址来自 `VITE_API_BASE_URL`，未配置时默认使用：

```text
http://192.168.8.170:3000/api
```

本地调试时建议创建 `client/.env.local`：

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

## 常用脚本

后端：

```bash
npm run dev             # ts-node-dev 开发服务
npm run build           # TypeScript 编译
npm start               # 运行 dist/app.js
npm run db:init         # 执行 schema.sql
npm run db:migrate      # 执行 migration_add_gasbuddy.sql
npm run scrape:canada   # 抓取加拿大城市油价
```

前端：

```bash
npm run dev:mp-weixin
npm run build:mp-weixin
npm run type-check
```

## API 接口

### 基础

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |

### 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 微信登录；Body: `code`, `nickname?`, `avatarUrl?` |
| GET | `/api/auth/userinfo` | 获取用户信息；Query: `openid` |

### 加油站与比价

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/stations/nearby` | 附近加油站；Query: `lat`, `lng`, `radius?`, `grade?`, `sort?` |
| GET | `/api/stations/:id` | 加油站详情 |
| GET | `/api/prices/compare` | 价格对比；Query: `lat`, `lng`, `radius?`, `grade?`, `sort?` |
| GET | `/api/prices/radius-options` | 获取 3/5/10/20km 半径选项 |

### 加油记录

以下接口需要请求头 `X-WX-OpenID`：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/records` | 创建记录；Body: `stationId`, `grade`, `amount`, `volume?`, `odometer`, `vehicleId?`, `isFullTank?`, `receiptUrl?` |
| GET | `/api/records` | 记录列表；Query: `limit?`, `offset?`, `vehicleId?` |
| GET | `/api/records/stats` | 统计数据；Query: `vehicleId?` |
| DELETE | `/api/records/:id` | 删除记录 |

### 车辆

以下接口需要请求头 `X-WX-OpenID`：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/vehicles` | 获取车辆列表 |
| POST | `/api/vehicles` | 创建车辆；Body: `name`, `plateNumber?`, `model?`, `lastGrade?` |
| PUT | `/api/vehicles/:id` | 更新车辆 |
| DELETE | `/api/vehicles/:id` | 删除车辆 |

### 抓取调试

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/scrape/gasbuddy` | 手动触发 GasBuddy 抓取；Body: `city?`, `mode?` |
| POST | `/api/scrape/refresh-city` | 通过 GasBuddy FastAPI 刷新城市；Body: `city` |

## 数据源与回退策略

- 中国区域优先使用腾讯地图适配器。
- 非中国区域优先使用 Google Maps / GasBuddy 相关数据源。
- 后端会先查 MySQL `stations` 表，再按地区调用适配器。
- 命中 Geohash 缓存时直接返回缓存数据。
- 如果真实数据源不可用，会回退到 `server/src/data/fallback_stations.json`。
- `MOCK_ENABLED=true` 或未配置地图 API Key 时会启用 Mock 模式。

## 数据库

核心表：

- `users`: 用户与 openid
- `vehicles`: 用户车辆，来自迁移 `migration_add_vehicles.sql`
- `stations`: 加油站缓存与价格字段
- `refuel_records`: 加油记录与油耗
- `cached_grids`: Geohash 网格缓存
- `user_rate_limits`: 用户限流状态
- `global_configs`: 全局配置
- `price_fetch_state`: 价格抓取状态，来自迁移

## 开发注意事项

- `records` 和 `vehicles` 接口依赖 `X-WX-OpenID` 请求头，客户端请求封装会自动带上本地保存的 openid。
- 开发环境或 Mock 模式下，登录接口会用传入的 `code` 生成 `dev_` 开头的 openid，不会调用微信 `code2Session`。
- 前端默认 API 地址是局域网 IP，换机器调试时要通过 `VITE_API_BASE_URL` 覆盖。
- 本地 Puppeteer 抓取依赖浏览器环境，GasBuddy FastAPI 可作为远程抓取替代方案。
- README 中的配置项按当前代码整理；如果新增路由或环境变量，应同步更新本文档。
