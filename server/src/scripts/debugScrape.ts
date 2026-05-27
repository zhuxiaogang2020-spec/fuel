/**
 * 调试脚本：只抓取并打印原始数据，不写DB
 * 用法：npx ts-node --transpile-only src/scripts/debugScrape.ts
 */
import '../config/index';
import { scrapeCity } from '../services/gasBuddyPuppeteerScraper';

async function debug() {
  const city = 'Toronto, ON';
  console.log(`[Debug] 抓取 ${city}...`);
  const result = await scrapeCity(city, 1);
  
  console.log(`\n错误信息: ${result.error || '无'}`);
  console.log(`加油站数量: ${result.stations.length}`);
  
  if (result.stations.length > 0) {
    console.log('\n--- 第1个加油站完整数据 ---');
    console.log(JSON.stringify(result.stations[0], null, 2));
    
    // 检查关键字段
    const first = result.stations[0];
    console.log('\n--- 关键字段检查 ---');
    console.log(`id: ${first.id}`);
    console.log(`name: "${first.name}"`);
    console.log(`displayName: "${first.displayName}"`);
    console.log(`lat: ${first.lat} (类型: ${typeof first.lat})`);
    console.log(`lng: ${first.lng} (类型: ${typeof first.lng})`);
    console.log(`address: ${JSON.stringify(first.address)}`);
    console.log(`brands: ${JSON.stringify(first.brands)}`);
    console.log(`prices: ${JSON.stringify(first.prices)}`);
    
    // 检查 prices 字段
    if (first.prices) {
      console.log('\n--- Prices 详情 ---');
      first.prices.forEach((p: any, i: number) => {
        console.log(`  [${i}] fuel_product=${p.fuel_product}, cash=${JSON.stringify(p.cash)}, credit=${JSON.stringify(p.credit)}`);
      });
    }
    
    // 检查所有 stations 的 lat/lng 情况
    const noLat = result.stations.filter(s => s.lat == null || s.lat === 0).length;
    const noLng = result.stations.filter(s => s.lng == null || s.lng === 0).length;
    const noName = result.stations.filter(s => !s.name).length;
    const noPrice = result.stations.filter(s => {
      const prices = s.prices || [];
      return !prices.some((p: any) => p?.cash?.price != null || p?.credit?.price != null);
    }).length;
    
    console.log(`\n--- 全量统计 (${result.stations.length}条) ---`);
    console.log(`缺少 lat: ${noLat}`);
    console.log(`缺少 lng: ${noLng}`);
    console.log(`缺少 name: ${noName}`);
    console.log(`缺少 price: ${noPrice}`);
  }
  
  process.exit(0);
}

debug().catch(err => {
  console.error('[Debug] 失败:', err);
  process.exit(1);
});
