# Fuel2 - 全球化加油站比价与油耗记账小程序

## 项目结构

```
weixin_fuel2/
├── server/                # 后端 Node.js + Express + TypeScript
│   ├── src/
│   │   ├── app.ts                 # 主入口
│   │   ├── config/index.ts         # 配置（DB、API Key、Mock开关）
│   │   ├── db/connection.ts       # MySQL 连接池
│   │   ├── db/schema.sql         # 数据库 DDL
│   │   ├── middleware/auth.ts     # 微信登录中间件
│   │   ├── middleware/rateLimit.ts # 流控熔断
│   │   ├── routes/               # API 路由
│   │   ├── services/             # 业务逻辑
│   │   │   ├── adapters/         # 数据源适配器
│   │   │   ├── adapterFactory.ts  # 适配器工厂
│   │   │   ├── countryDetect.ts  # 国家检测
│   │   │   ├── geohash.ts        # Geohash 工具
│   │   │   ├── cache.ts           # Geohash 缓存
│   │   │   ├── unitConvert.ts    # 单位转换
│   │   │   └── fuelCalc.ts       # 油耗计算
│   │   └── data/fallback_stations.json  # 兜底 Mock 数据
│   ├── package.json
│   └── tsconfig.json
│
├── client/                # 前端 Uni-app + Vue3 + TypeScript
│   ├── pages/                # 小程序页面
│   │   ├── index/              # 首页（地图+底部抽屉）
│   │   ├── station-detail/     # 加油站详情
│   │   ├── refuel/             # 加油记录表单
│   │   ├── stats/              # 油耗统计
│   │   └── profile/            # 个人中心
│   ├── components/            # 公共组件
│   │   ├── StationCard.vue     # 加油站卡片
│   │   ├── PriceTag.vue        # 价格标签
│   │   ├── BottomDrawer.vue    # 底部抽屉
│   │   └── FuelChart.vue       # 油耗趋势图
│   ├── utils/                 # 工具类
│   ├── store/                 # Pinia 状态管理
│   ├── App.vue
│   ├── main.ts
│   ├── manifest.json           # 微信 AppID 配置
│   └── pages.json             # 页面路由 + TabBar
│
└── README.md
```

## 快速启动

### 1. 数据库初始化

```bash
mysql -u root < server/src/db/schema.sql
```

### 2. 后端启动

```bash
cd server
npm install
# 创建 .env 文件（参考下方环境变量）
npm run dev        # 开发模式
# 或
npm run build      # 构建
npm start           # 生产模式
```

### 3. 前端启动

```bash
cd client
npm install
npm run dev:mp-weixin   # 启动微信小程序开发模式
```

然后用**微信开发者工具**打开 `client/dist/dev/mp-weixin/` 目录。

## 环境变量（server/.env）

```env
# 服务器
PORT=3000

# 数据库
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=fuel_db

# 微信小程序
WECHAT_APPID=wx5ebd4176b7e2eb8d
WECHAT_SECRET=你的小程序密钥

# 腾讯地图 API（中国数据源）
TENCENT_MAP_KEY=你的腾讯地图Key
TENCENT_MAP_ENABLED=true

# Google Maps API（北美数据源）
GOOGLE_MAPS_KEY=你的GoogleMapsKey
GOOGLE_MAPS_ENABLED=true

# Mock 模式（无 API Key 时自动启用）
MOCK_ENABLED=true

# 流控
API_DAILY_LIMIT=1000
```

## API 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 微信登录 |
| GET | `/api/auth/userinfo` | 获取用户信息 |
| GET | `/api/stations/nearby` | 搜索附近加油站 |
| GET | `/api/stations/:id` | 加油站详情 |
| POST | `/api/records` | 创建加油记录 |
| GET | `/api/records` | 获取加油记录列表 |
| GET | `/api/records/stats` | 获取统计数据 |
| DELETE | `/api/records/:id` | 删除加油记录 |
| GET | `/api/prices/compare` | 比价接口 |
| GET | `/api/prices/radius-options` | 半径选项 |
| GET | `/health` | 健康检查 |

## 三国适配规则

| 项目 | 🇨🇳 中国 | 🇨🇦 加拿大 | 🇺🇸 美国 |
|------|------------|--------------|----------|
| 语言 | 中文 | English | English |
| 油号 | 92#/95#/98# | Regular/Mid/Premium | Regular/Mid/Premium |
| 价格单位 | ¥/L | C$/L | $/gal + $/L |
| 距离 | km | km | miles |
| 油耗 | L/100km | MPG (Imp) | MPG (US) |
| 主功能 | 记账 | 比价 | 比价 |
| 排序默认 | 最近 | 最便宜 | 最便宜 |

## Mock 模式

当满足以下条件时自动启用 Mock 模式：
- `MOCK_ENABLED=true`，或
- 对应的 API Key 未配置

Mock 模式下所有接口返回 `server/src/data/fallback_stations.json` 中的数据，无需真实数据库或 API。

## 部署建议

- **推荐部署地**：腾讯云香港节点（可同时访问腾讯地图和 Google Maps API）
- **国内用户**：可忍受延迟则直连，否则建议加一台香港轻量服务器做转发
- **数据库**：MySQL 8.0，建议与后端同区域部署

## 技术栈

- 前端：Uni-app + Vue 3 + TypeScript + Pinia
- 后端：Node.js + Express + TypeScript
- 数据库：MySQL 8.0
- 数据源：腾讯地图 API（中国）+ Google Maps API（北美）
- 认证：微信小程序 code2Session
