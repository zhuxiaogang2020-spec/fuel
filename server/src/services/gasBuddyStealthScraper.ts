/**
 * GasBuddy Stealth Scraper — Playwright 反检测浏览器自动化
 *
 * 对标 GasBuddy 真实网页端行为，绕过反爬：
 *   1. 隐蔽特征注入 — 隐藏 navigator.webdriver / chrome.runtime 等自动化标记
 *   2. 智能等待 — 精准捕获 GraphQL 响应 + DOM 价格元素加载完成时机
 *   3. 真实用户模拟 — 随机鼠标轨迹、滚动抖动、键入延迟
 *   4. 多策略数据提取 — Network Intercept → DOM fallback → 结构化 JSON 输出
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import pool from '../db/connection';

// ========================================================================
// Types
// ========================================================================
interface StationRaw {
  id: number;
  name: string;
  displayName?: string;
  lat: number;
  lng: number;
  address: {
    line1?: string;
    line2?: string;
    locality?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  brands?: { name?: string; brand_id?: string }[];
  prices?: Array<{
    fuel_product: string;
    cash?: { price: number; posted_time?: string };
    credit?: { price: number; posted_time?: string };
  }>;
  ratings_count?: number;
  star_rating?: number;
  distance?: number;
}

interface StationOutput {
  externalId: string;
  name: string;
  brand: string;
  lat: number;
  lng: number;
  address: string;
  priceRegular: number | null;
  priceMid: number | null;
  pricePremium: number | null;
  priceDiesel: number | null;
  ratingsCount: number;
  starRating: number;
  distance: number | null;
}

interface ScrapeResult {
  city: string;
  stationsFound: number;
  stationsUpdated: number;
  errors: string[];
  samples: StationOutput[];
}

// ========================================================================
// Target Cities
// ========================================================================
interface TargetCity {
  search: string;
  fuel?: number; // 1=Regular, 2=Midgrade, 3=Premium, 4=Diesel
}

const DEFAULT_CITIES: TargetCity[] = [
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
];

// ========================================================================
// Anti-Detection: Stealth Scripts
// ========================================================================

/**
 * 在页面加载前注入 stealth 脚本，隐藏自动化痕迹
 * 覆盖最常见的 bot 检测向量
 */
const STEALTH_INIT_SCRIPT = `
// === GasBuddy Stealth Override ===
(() => {
  'use strict';

  // 1. 隐藏 navigator.webdriver（最关键的检测点）
  Object.defineProperty(navigator, 'webdriver', { get: () => false });

  // 2. 伪造 chrome.runtime（检测无头模式的关键标志）
  window.chrome = {
    runtime: {},
    loadTimes: function() {},
    csi: function() { return { startE: Date.now(), onloadT: Date.now(), pageT: 120 }; },
    app: {}
  };

  // 3. 伪造 plugins 数组（空 plugins 是自动化特征）
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
      ];
      arr.item = (i) => arr[i];
      arr.namedItem = (name) => arr.find(x => x.name === name);
      arr.refresh = () => {};
      Object.setPrototypeOf(arr, PluginArray.prototype);
      return arr;
    }
  });

  // 4. 伪造 languages — 英语用户
  Object.defineProperty(navigator, 'languages', { get: () => ['en-CA', 'en-US', 'en'] });
  Object.defineProperty(navigator, 'language', { get: () => 'en-CA' });

  // 5. 伪造 hardwareConcurrency（Headless Chrome 默认 1 或 0）
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

  // 6. 伪造 deviceMemory
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

  // 7. 权限查询 — 正常返回而不是自动拒绝
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) => {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: Notification.permission || 'prompt', onchange: null });
    }
    return originalQuery(parameters);
  };

  // 8. 重写 BatteryManager（某些检测用）
  if (navigator.getBattery) {
    const origGetBattery = navigator.getBattery;
    navigator.getBattery = () => origGetBattery.call(navigator).then(b => {
      Object.defineProperty(b, 'charging', { get: () => true });
      return b;
    });
  }

  // 9. 清除 CDP / Playwright 痕迹
  delete window.__playwright;
  delete window.__pw_manual;
  delete window.__PW_inspect;
  delete window.__pwInitScripts;

  // 10. 伪造 outerWidth/outerHeight（无头模式可能不匹配）
  Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
  Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 85 });

  console.log('[Stealth] Anti-detection scripts injected');
})();
`;

// ========================================================================
// Browser Launch Configuration
// ========================================================================

function getBrowserLaunchArgs(): string[] {
  return [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-site-isolation-trials',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    '--window-size=1920,1080',
    '--start-maximized',
    '--lang=en-CA',
    // 模拟正常浏览器的额外参数
    '--enable-features=NetworkService,NetworkServiceInProcess',
    '--disable-features=TranslateUI',
    '--metrics-recording-only',
  ];
}

// ========================================================================
// Human Behavior Simulation
// ========================================================================

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 模拟人类鼠标移动：从起点到终点，带随机贝塞尔曲线偏移
 */
async function humanMouseMove(page: Page, fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  const steps = rand(30, 60);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 贝塞尔曲线控制点（随机偏移）
    const cpX = (fromX + toX) / 2 + rand(-200, 200);
    const cpY = (fromY + toY) / 2 + rand(-200, 200);
    const x = (1 - t) ** 2 * fromX + 2 * (1 - t) * t * cpX + t ** 2 * toX;
    const y = (1 - t) ** 2 * fromY + 2 * (1 - t) * t * cpY + t ** 2 * toY;
    await page.mouse.move(Math.round(x), Math.round(y));
    await sleep(rand(5, 15));
  }
}

/**
 * 模拟人类滚动行为：非均匀分段滚动，带暂停
 */
async function humanScroll(page: Page, targetY: number): Promise<void> {
  const currentY = await page.evaluate(() => window.scrollY);
  const distance = targetY - currentY;
  const segments = rand(4, 10);

  for (let i = 1; i <= segments; i++) {
    const progress = i / segments;
    // 不均匀分段（先快后慢 / 先慢后快交替）
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - (-2 * progress + 2) ** 2 / 2;
    const nextY = currentY + distance * eased;

    await page.evaluate((y) => window.scrollTo(0, y), nextY);
    // 随机暂停（模拟阅读）
    if (Math.random() > 0.5) {
      await sleep(rand(200, 800));
    }
    await sleep(rand(30, 100));
  }
}

/**
 * 随机执行人类微动作（轻微移动、hover、等待）
 */
async function humanIdle(page: Page): Promise<void> {
  const viewport = page.viewportSize() || { width: 1920, height: 1080 };
  const actions = rand(1, 3);

  for (let i = 0; i < actions; i++) {
    const actionType = Math.random();

    if (actionType < 0.4) {
      // 小范围鼠标移动
      const x = rand(100, viewport.width - 100);
      const y = rand(100, viewport.height - 300);
      await humanMouseMove(page, x, y, x + rand(-50, 50), y + rand(-50, 50));
    } else if (actionType < 0.7) {
      // 滚动抖动
      const scrollBy = rand(-100, 100);
      await page.evaluate((dy) => window.scrollBy(0, dy), scrollBy);
    }

    await sleep(rand(150, 600));
  }
}

// ========================================================================
// Data Extraction
// ========================================================================

function extractBrand(station: StationRaw): string {
  const brands = station.brands;
  if (Array.isArray(brands) && brands.length > 0) {
    const raw = brands[0]?.name || '';
    return normalizeBrand(raw);
  }
  return guessBrandFromName(station.name || '', station.displayName || '');
}

function normalizeBrand(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('shell')) return 'Shell';
  if (lower.includes('petro')) return 'Petro-Canada';
  if (lower.includes('esso') || lower.includes('exxon')) return 'Esso';
  if (lower.includes('canadian tire')) return 'Canadian Tire';
  if (lower.includes('costco')) return 'Costco';
  if (lower.includes('7-eleven') || lower.includes('7 eleven')) return '7-Eleven';
  if (lower.includes('husky')) return 'Husky';
  if (lower.includes('ultramar')) return 'Ultramar';
  if (lower.includes('mobil')) return 'Mobil';
  if (lower.includes('chevron')) return 'Chevron';
  if (lower.includes('co-op') || lower.includes('coop')) return 'Co-op';
  if (lower.includes('pioneer')) return 'Pioneer';
  if (lower.includes('irving')) return 'Irving';
  if (lower.includes('suncor')) return 'Petro-Canada';
  if (lower.includes('circle k')) return 'Circle K';
  return raw || 'Unknown';
}

function guessBrandFromName(name: string, displayName: string): string {
  return normalizeBrand(`${name} ${displayName}`);
}

function buildAddress(addr: StationRaw['address']): string {
  if (!addr) return '';
  return [addr.line1, addr.line2, addr.locality, addr.region, addr.postalCode]
    .filter(Boolean)
    .join(', ');
}

function extractPriceByFuel(prices: StationRaw['prices'], fuelProduct: string): number | null {
  try {
    if (!Array.isArray(prices)) return null;
    const item = prices.find((p: any) => p?.fuel_product === fuelProduct);
    if (!item) return null;
    if (item.cash?.price != null && !isNaN(Number(item.cash.price))) return Number(item.cash.price);
    if (item.credit?.price != null && !isNaN(Number(item.credit.price))) return Number(item.credit.price);
    return null;
  } catch {
    return null;
  }
}

function transformStation(raw: StationRaw): StationOutput {
  return {
    externalId: `gasbuddy_${raw.id}`,
    name: raw.displayName || raw.name || '',
    brand: extractBrand(raw),
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    address: buildAddress(raw.address),
    priceRegular: extractPriceByFuel(raw.prices, 'regular_gas'),
    priceMid: extractPriceByFuel(raw.prices, 'midgrade_gas'),
    pricePremium: extractPriceByFuel(raw.prices, 'premium_gas'),
    priceDiesel: extractPriceByFuel(raw.prices, 'diesel'),
    ratingsCount: raw.ratings_count || 0,
    starRating: raw.star_rating || 0,
    distance: raw.distance || null,
  };
}

// ========================================================================
// Network Intercept: 捕获 GraphQL 响应
// ========================================================================

/**
 * GasBuddy GraphQL query 名称（用于匹配网络请求）
 */
const GQL_OPERATION_NAMES = ['LocationBySearchTerm', 'StationBySearchTerm', 'GetStation'];

/**
 * 监听页面请求，拦截 GasBuddy GraphQL 响应
 * 这是最可靠的数据获取方式 — 抓到的就是页面实际使用的数据
 */
async function interceptGraphQLResponse(page: Page): Promise<StationRaw[]> {
  let capturedStations: StationRaw[] = [];
  let resolvePromise: (value: StationRaw[]) => void;

  const promise = new Promise<StationRaw[]>((resolve) => {
    resolvePromise = resolve;
  });

  const handler = (response: any) => {
    const url = response.url();
    if (!url.includes('graphql') && !url.includes('gql')) return;

    response.json().then((payload: any) => {
      // 检查是否为已知 operation
      const data = payload?.data;
      if (!data) return;

      // LocationBySearchTerm 结构
      const location = data.locationBySearchTerm || data.locationSearch;
      if (location?.stations?.results) {
        capturedStations = location.stations.results;
        console.log(`[Stealth] 拦截到 GraphQL 响应: ${capturedStations.length} 个加油站`);
        page.off('response', handler);
        resolvePromise(capturedStations);
        return;
      }

      // 其他可能的响应结构
      const stations = data.stations || data.searchStations;
      if (stations?.results) {
        capturedStations = stations.results;
        page.off('response', handler);
        resolvePromise(capturedStations);
      }
    }).catch(() => {
      // 忽略非 JSON 响应
    });
  };

  page.on('response', handler);

  return promise;
}

// ========================================================================
// DOM Extraction (Fallback)
// ========================================================================

/**
 * 从渲染后的 DOM 提取价格数据（fallback 方案）
 * 当 GraphQL 拦截失败时使用
 */
async function extractFromDOM(page: Page): Promise<StationRaw[]> {
  return page.evaluate(() => {
    const stations: any[] = [];

    // 策略 1: 尝试从 __NEXT_DATA__ 提取（Next.js SSR 数据）
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData?.textContent) {
      try {
        const parsed = JSON.parse(nextData.textContent);
        const props = parsed?.props?.pageProps;
        if (props?.stations || props?.location?.stations?.results) {
          const list = props.stations || props.location?.stations?.results;
          list.forEach((s: any) => stations.push(s));
          if (stations.length > 0) return stations;
        }
      } catch { /* ignore */ }
    }

    // 策略 2: 从 window.__INITIAL_STATE__ 提取
    const win = window as any;
    if (win.__INITIAL_STATE__?.stations) {
      win.__INITIAL_STATE__.stations.forEach((s: any) => stations.push(s));
      if (stations.length > 0) return stations;
    }

    // 策略 3: 遍历 DOM 中的 StationCard 元素
    const cards = document.querySelectorAll(
      '[class*="StationCard"], [class*="station-card"], [data-testid*="station"], .GenericStationModule'
    );

    cards.forEach((card) => {
      try {
        const id = card.getAttribute('data-station-id') || '';
        const name = card.querySelector('[class*="name"], [class*="title"], h3, h4')?.textContent?.trim() || '';
        const priceEl = card.querySelector('[class*="price"], .price');
        const priceText = priceEl?.textContent?.trim() || '';
        const priceMatch = priceText.match(/(\d+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : null;

        if (name && price) {
          stations.push({
            id: parseInt(id) || 0,
            displayName: name,
            name: name,
            lat: 0,
            lng: 0,
            address: {},
            prices: [{ fuel_product: 'regular_gas', cash: { price } }],
          });
        }
      } catch { /* skip broken card */ }
    });

    return stations;
  });
}

// ========================================================================
// Main Scrape Logic
// ========================================================================

class GasBuddyStealthScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async launch(): Promise<{ browser: Browser; context: BrowserContext }> {
    if (this.browser?.isConnected()) {
      return { browser: this.browser, context: this.context! };
    }

    console.log('[Stealth] 启动 Chromium...');
    this.browser = await chromium.launch({
      headless: true,
      args: getBrowserLaunchArgs(),
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-CA',
      timezoneId: 'America/Toronto',
      geolocation: { latitude: 43.6532, longitude: -79.3832 }, // Toronto
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept-Language': 'en-CA,en-US;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not=A?Brand";v="24"',
        'Sec-CH-UA-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
    });

    // 注入 stealth 脚本到所有页面
    await this.context.addInitScript(STEALTH_INIT_SCRIPT);

    return { browser: this.browser, context: this.context };
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * 抓取单个城市
   */
  async scrapeCity(city: TargetCity): Promise<ScrapeResult> {
    const result: ScrapeResult = {
      city: city.search,
      stationsFound: 0,
      stationsUpdated: 0,
      errors: [],
      samples: [],
    };

    let page: Page | null = null;
    const fuel = city.fuel ?? 1;
    const searchEncoded = encodeURIComponent(city.search);
    const gasBuddyURL = `https://www.gasbuddy.com/home?search=${searchEncoded}&fuel=${fuel}`;

    console.log(`[Stealth] ▶ ${city.search} 开始抓取 (${gasBuddyURL})`);

    try {
      const { context } = await this.launch();
      page = await context.newPage();

      // === Step 1: 设置网络拦截（在导航前注册） ===
      const gqlPromise = interceptGraphQLResponse(page);

      // === Step 2: 首屏预加载（模拟真实用户：先访问首页热身） ===
      console.log(`[Stealth] → 访问首页热身...`);
      await page.goto('https://www.gasbuddy.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await sleep(rand(1000, 2000));
      await humanIdle(page);

      // === Step 3: 导航到搜索页 ===
      console.log(`[Stealth] → 导航到 ${city.search}...`);
      await page.goto(gasBuddyURL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // === Step 4: 模拟人类行为 ===
      await sleep(rand(500, 1500));
      await humanMouseMove(page, rand(400, 600), rand(100, 200), rand(800, 1200), rand(400, 600));
      await sleep(rand(300, 800));

      // 缓慢滚动
      await humanScroll(page, rand(300, 500));
      await sleep(rand(500, 1200));
      await humanIdle(page);

      // 继续滚动到底部以触发懒加载
      await humanScroll(page, rand(800, 1200));
      await sleep(rand(800, 1500));

      // === Step 5: 等待 GraphQL 响应或 DOM 数据 ===
      console.log(`[Stealth] ⏳ 等待数据加载...`);
      let stations: StationRaw[] = [];

      const timeoutMs = 20000;
      const timeout = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('数据加载超时')), timeoutMs)
      );

      try {
        // 优先等 GraphQL 拦截
        stations = await Promise.race([gqlPromise, timeout]);
      } catch {
        // GraphQL 拦截超时或失败 → fallback 到 DOM 提取
        console.log(`[Stealth] GraphQL 拦截失败，尝试 DOM 提取...`);
        try {
          stations = await extractFromDOM(page);
        } catch (domErr: any) {
          result.errors.push(`DOM提取失败: ${domErr.message}`);
        }
      }

      // === Step 6: 处理提取结果 ===
      if (!stations.length) {
        console.warn(`[Stealth] ✗ ${city.search}: 未提取到任何数据`);
        result.errors.push('未提取到任何加油站数据');
        return result;
      }

      result.stationsFound = stations.length;
      console.log(`[Stealth] ✓ ${city.search}: 提取到 ${stations.length} 个加油站`);

      // 转换 + 过滤有效数据
      const validStations = stations
        .filter((s) => s.lat && s.lng && s.name)
        .map(transformStation);

      // 过滤有价格的站
      const withPrice = validStations.filter(
        (s) => s.priceRegular !== null || s.priceMid !== null || s.pricePremium !== null || s.priceDiesel !== null
      );

      // === Step 7: 写入数据库 ===
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        for (const station of validStations) {
          try {
            await conn.execute(
              `INSERT INTO stations
               (external_id, source, name, brand, lat, lng, address,
                price_regular, price_mid, price_premium, price_diesel, last_updated)
               VALUES (?, 'gasbuddy', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
               ON DUPLICATE KEY UPDATE
                 name = VALUES(name),
                 brand = VALUES(brand),
                 lat = VALUES(lat),
                 lng = VALUES(lng),
                 address = VALUES(address),
                 price_regular = VALUES(price_regular),
                 price_mid = VALUES(price_mid),
                 price_premium = VALUES(price_premium),
                 price_diesel = VALUES(price_diesel),
                 last_updated = NOW()`,
              [
                station.externalId,
                station.name,
                station.brand,
                station.lat,
                station.lng,
                station.address,
                station.priceRegular,
                station.priceMid,
                station.pricePremium,
                station.priceDiesel,
              ]
            );
            result.stationsUpdated++;
          } catch (rowErr: any) {
            result.errors.push(`DB行写入失败 ${station.name}: ${rowErr.message}`);
          }
        }

        await conn.commit();
      } catch (dbErr: any) {
        await conn.rollback();
        result.errors.push(`DB事务失败: ${dbErr.message}`);
      } finally {
        conn.release();
      }

      // === Step 8: 输出样本供调试 ===
      result.samples = withPrice.slice(0, 3);

      for (const sample of result.samples) {
        console.log(
          `  → ${sample.brand || '未知品牌'} | ${sample.name} | ` +
          `Reg: $${sample.priceRegular ?? 'N/A'} | ` +
          `Mid: $${sample.priceMid ?? 'N/A'} | ` +
          `Prem: $${sample.pricePremium ?? 'N/A'}`
        );
      }

      console.log(
        `[Stealth] ✓ ${city.search}: ${result.stationsFound} 找到 | ` +
        `${result.stationsUpdated} 写入 | ${withPrice.length} 有价 | ${result.errors.length} 错误`
      );
    } catch (err: any) {
      const msg = err.message || String(err);
      result.errors.push(msg);
      console.error(`[Stealth] ✗ ${city.search} 致命错误:`, msg);

      // 出错时截图保存
      if (page) {
        try {
          await page.screenshot({
            path: `gasbuddy_error_${city.search.replace(/[, ]/g, '_')}.png`,
            fullPage: true,
          });
          console.log(`[Stealth] 错误截图已保存`);
        } catch { /* ignore */ }
      }
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }

    return result;
  }

  /**
   * 批量抓取所有城市
   */
  async scrapeAll(cities: TargetCity[] = DEFAULT_CITIES): Promise<{
    totalUpdated: number;
    totalFound: number;
    results: ScrapeResult[];
  }> {
    const startTime = Date.now();
    let totalUpdated = 0;
    let totalFound = 0;
    const results: ScrapeResult[] = [];

    console.log('\n' + '═'.repeat(60));
    console.log('[Stealth Scraper] 开始 Playwright 反爬全量抓取');
    console.log(`[Stealth Scraper] 目标: ${cities.length} 个加拿大城市`);
    console.log('═'.repeat(60) + '\n');

    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      console.log(`[Stealth] [${i + 1}/${cities.length}] ${city.search}`);

      const result = await this.scrapeCity(city);
      results.push(result);
      totalUpdated += result.stationsUpdated;
      totalFound += result.stationsFound;

      // 城市间延迟（模拟真实用户切换城市的间隔）
      if (i < cities.length - 1) {
        const delay = rand(4000, 12000);
        console.log(`[Stealth] 等待 ${(delay / 1000).toFixed(1)}s 后继续...\n`);
        await sleep(delay);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '═'.repeat(60));
    console.log(`[Stealth Scraper] 完成 (${elapsed}s)`);
    console.log(`  总发现: ${totalFound} 站`);
    console.log(`  总更新: ${totalUpdated} 条`);
    console.log(`  错误: ${results.reduce((sum, r) => sum + r.errors.length, 0)} 个`);
    console.log('═'.repeat(60) + '\n');

    // 抓取完成后关闭浏览器
    await this.close();

    return { totalUpdated, totalFound, results };
  }
}

// ========================================================================
// Exports
// ========================================================================

const scraper = new GasBuddyStealthScraper();

function getTargetCities(): TargetCity[] {
  const envCities = process.env.GASBUDDY_CITIES;
  if (envCities) {
    try {
      return JSON.parse(envCities);
    } catch {
      console.warn('[Stealth] GASBUDDY_CITIES 解析失败，使用默认城市列表');
    }
  }
  return DEFAULT_CITIES;
}

export async function stealthScrapeAllCities(): Promise<{
  totalUpdated: number;
  totalFound: number;
  results: ScrapeResult[];
}> {
  return scraper.scrapeAll(getTargetCities());
}

export async function stealthScrapeCity(search: string, fuel: number = 1): Promise<ScrapeResult> {
  return scraper.scrapeCity({ search, fuel });
}

export { GasBuddyStealthScraper, getTargetCities, DEFAULT_CITIES };
