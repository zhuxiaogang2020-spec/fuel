import { scrapeAllCities, scrapeSingleCity } from './gasBuddyScraper';
import { stealthScrapeAllCities, stealthScrapeCity } from './gasBuddyStealthScraper';

/**
 * 油价爬虫定时调度器
 * 
 * 配置方式（.env）：
 *   GASBUDDY_ENABLED=true              — 启用自动抓取
 *   GASBUDDY_INTERVAL_HOURS=3          — 抓取间隔（小时），默认 3
 *   GASBUDDY_INITIAL_DELAY_MS=5000     — 首次启动延迟（毫秒），默认 30s
 *   GASBUDDY_MODE=stealth              — 抓取模式: 'api'(默认/旧GraphQL) | 'stealth'(Playwright反爬)
 */

type ScrapeMode = 'api' | 'stealth';

function getScrapeMode(): ScrapeMode {
  const mode = (process.env.GASBUDDY_MODE || '').toLowerCase();
  return mode === 'stealth' ? 'stealth' : 'api';
}

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

export function startScheduler(): void {
  const enabled = process.env.GASBUDDY_ENABLED !== 'false'; // 默认启用
  if (!enabled) {
    console.log('[Scheduler] GasBuddy 爬虫未启用 (GASBUDDY_ENABLED=false)');
    return;
  }

  const mode = getScrapeMode();
  const intervalHours = parseInt(process.env.GASBUDDY_INTERVAL_HOURS || '3', 10);
  const intervalMs = intervalHours * 60 * 60 * 1000;
  const initialDelay = parseInt(process.env.GASBUDDY_INITIAL_DELAY_MS || '30000', 10);

  console.log(`[Scheduler] GasBuddy 爬虫已启动 (mode=${mode})，每 ${intervalHours}h 抓取一次（首次延迟 ${initialDelay / 1000}s）`);

  // 首次延时后抓取，避免阻塞服务器启动
  setTimeout(() => {
    runScheduledScrape();
    // 之后每隔 intervalMs 抓取
    intervalHandle = setInterval(runScheduledScrape, intervalMs);
  }, initialDelay);
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[Scheduler] GasBuddy 爬虫已停止');
  }
}

async function runScheduledScrape(): Promise<void> {
  if (isRunning) {
    console.log('[Scheduler] 上次抓取尚未完成，跳过本次');
    return;
  }

  const mode = getScrapeMode();
  isRunning = true;
  try {
    if (mode === 'stealth') {
      await stealthScrapeAllCities();
    } else {
      await scrapeAllCities();
    }
  } catch (err: any) {
    console.error('[Scheduler] 定时抓取出错:', err.message);
  } finally {
    isRunning = false;
  }
}

/**
 * 手动触发抓取（供 API 调试用）
 * @param city  可选城市名
 * @param mode  可选 'api' | 'stealth'，不传则读取 .env
 */
export async function manualScrape(city?: string, mode?: ScrapeMode): Promise<any> {
  const actualMode = mode || getScrapeMode();
  if (actualMode === 'stealth') {
    if (city) return stealthScrapeCity(city);
    return stealthScrapeAllCities();
  }
  if (city) return scrapeSingleCity(city);
  return scrapeAllCities();
}
