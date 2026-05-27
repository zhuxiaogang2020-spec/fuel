/**
 * 调试：拦截完整的 GraphQL 响应，看 location 对象和 station 边缘信息
 */
import '../config/index';
import { scrapeCity } from '../services/gasBuddyPuppeteerScraper';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(StealthPlugin());

async function debug() {
  const browser = await puppeteerExtra.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1920,1080', '--lang=en-CA'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  let capturedData: any = null;
  let resolvePromise!: (v: any) => void;
  const done = new Promise<any>((resolve) => { resolvePromise = resolve; });

  page.on('response', async (response: any) => {
    const url = response.url();
    if (!url.includes('graphql') && !url.includes('gql')) return;
    try {
      const payload = await response.json();
      const data = payload?.data;
      if (!data) return;
      
      const loc = data.locationBySearchTerm || data.locationSearch;
      if (loc?.stations?.results?.length > 0) {
        capturedData = {
          // location 对象的顶层 key
          locationKeys: Object.keys(loc),
          // location 对象完整 dump（排除 stations 减少输出）
          locationWithoutStations: { ...loc, stations: `[${loc.stations.results.length} stations]` },
          // stations 边缘信息（edges 如果有的话）
          stationsEdgesFirst: loc.stations?.edges?.[0] ? Object.keys(loc.stations.edges[0]) : 'no edges',
          // 第一个 station 的完整 edge 数据
          stationsEdgeFirstData: loc.stations?.edges?.[0] || 'n/a',
          // 第一个 station 
          stationKeys: Object.keys(loc.stations.results[0]),
        };
        resolvePromise(capturedData);
      }
    } catch {}
  });

  await page.goto(`https://www.gasbuddy.com/home?search=Toronto%2C+ON&fuel=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  const result = await Promise.race([done, new Promise(r => setTimeout(() => r(null), 30000))]);
  
  if (result) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('TIMEOUT - no graphql response captured');
  }

  await browser.close();
  process.exit(0);
}

debug().catch(err => { console.error(err); process.exit(1); });
