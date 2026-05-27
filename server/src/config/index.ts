import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // 服务器配置
  port: process.env.PORT || 3000,

  // 数据库配置
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fuel_db',
  },

  // 微信小程序配置
  wechat: {
    appid: process.env.WECHAT_APPID || 'wx5ebd4176b7e2eb8d',
    secret: process.env.WECHAT_SECRET || '',
  },

  // 腾讯地图 API（国内数据源）
  tencentMap: {
    key: process.env.TENCENT_MAP_KEY || '',
    enabled: process.env.TENCENT_MAP_ENABLED !== 'false',
  },

  // Google Maps API（国外数据源）
  googleMaps: {
    key: process.env.GOOGLE_MAPS_KEY || '',
    enabled: process.env.GOOGLE_MAPS_ENABLED !== 'false',
    // MapAdapterFactory 子适配器配置
    language: process.env.GOOGLE_MAPS_LANGUAGE || 'en',
    region: process.env.GOOGLE_MAPS_REGION || 'ca',
    timeout: parseInt(process.env.GOOGLE_MAPS_TIMEOUT || '10000', 10),
  },

  // Map 适配器工厂配置
  mapAdapter: {
    /** 是否启用 Marker 适配器 */
    markerEnabled: process.env.MAP_ADAPTER_MARKER_ENABLED !== 'false',
    /** 是否启用 Route 适配器 */
    routeEnabled: process.env.MAP_ADAPTER_ROUTE_ENABLED !== 'false',
    /** 是否启用 Layer 适配器 */
    layerEnabled: process.env.MAP_ADAPTER_LAYER_ENABLED !== 'false',
  },

  // Mock 模式（无真实 API 时自动降级）
  mock: {
    enabled: process.env.USE_MOCK === 'true' || 
             process.env.MOCK_ENABLED === 'true' || 
             (!process.env.TENCENT_MAP_KEY && !process.env.GOOGLE_MAPS_KEY),
  },

  // 流控配置
  rateLimit: {
    dailyLimit: parseInt(process.env.API_DAILY_LIMIT || '1000'),
  },

  // Geohash 缓存配置
  cache: {
    geohashPrecision: 5,
    ttlMinutes: 10,
  },

  // GasBuddy FastAPI 远程服务（运行在家庭 IP 上）
  // 替代本地 Puppeteer 爬虫，由 FastAPI 第三方服务处理反爬
  gasBuddyApi: {
    /** FastAPI 服务地址（含协议和端口） */
    baseUrl: process.env.GASBUDDY_API_URL || 'http://localhost:8000',
    /** 价格查询路径 */
    pricesPath: process.env.GASBUDDY_PRICES_PATH || '/prices',
    /** 搜索半径（英里），默认 15 */
    radius: parseFloat(process.env.GASBUDDY_SEARCH_RADIUS || '15'),
    /** 请求超时（毫秒） */
    timeoutMs: parseInt(process.env.GASBUDDY_API_TIMEOUT_MS || '30000', 10),
    /** 是否启用（设为 false 可回退到本地爬虫） */
    enabled: process.env.GASBUDDY_API_ENABLED !== 'false',
  },

  // 本地 Puppeteer 爬虫（按需爬取 + 本地缓存，完全免费）
  // 使用 puppeteer-extra + stealth-plugin 对抗 Cloudflare Turnstile
  localScraper: {
    enabled: process.env.LOCAL_SCRAPER_ENABLED !== 'false', // 默认启用
    // 缓存有效期（分钟），默认3小时
    cacheMaxAgeMinutes: parseInt(process.env.PRICE_CACHE_MAX_AGE_MINUTES || '180', 10),
    // 单次抓取超时（毫秒）
    runTimeoutMs: parseInt(process.env.SCRAPER_TIMEOUT_MS || '90000', 10),
    // 最大并发抓取数
    maxConcurrentFetches: 2,
    // 加拿大目标城市
    cities: [
      { search: 'Toronto, ON', fuel: 1 },
      { search: 'Vancouver, BC', fuel: 1 },
      { search: 'Montreal, QC', fuel: 1 },
      { search: 'Calgary, AB', fuel: 1 },
      { search: 'Ottawa, ON', fuel: 1 },
      { search: 'Edmonton, AB', fuel: 1 },
      { search: 'Mississauga, ON', fuel: 1 },
      { search: 'Winnipeg, MB', fuel: 1 },
      { search: 'Quebec City, QC', fuel: 1 },
      { search: 'Hamilton, ON', fuel: 1 },
    ],
  },
};

export default config;
