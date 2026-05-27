/**
 * 一次性脚本：预填充加拿大加油站真实数据
 * 用法：npx ts-node src/scripts/scrapeAllCanada.ts
 * 或：  npm run scrape:canada （需要在 package.json 中添加）
 *
 * 调用 GasBuddy Puppeteer 爬虫，抓取 10 个加拿大城市的真实油价和加油站数据
 */
import '../config/index'; // 加载 .env
import { forceRefreshCity, CITY_DEFINITIONS } from '../services/priceFetchService';

async function scrapeAll() {
  console.log('========================================');
  console.log('  GasBuddy 加拿大油价数据全量抓取');
  console.log('========================================');
  console.log(`目标城市: ${CITY_DEFINITIONS.length} 个\n`);

  const results: { city: string; stationsUpdated: number; error?: string }[] = [];

  for (let i = 0; i < CITY_DEFINITIONS.length; i++) {
    const city = CITY_DEFINITIONS[i];
    console.log(`\n[${i + 1}/${CITY_DEFINITIONS.length}] 正在抓取 ${city.search}...`);
    
    try {
      const result = await forceRefreshCity(city.search);
      results.push(result);
      if (result.error) {
        console.log(`  ✗ ${city.search} 失败: ${result.error}`);
      } else {
        console.log(`  ✓ ${city.search} 完成，更新 ${result.stationsUpdated} 条`);
      }
    } catch (err: any) {
      console.log(`  ✗ ${city.search} 异常: ${err.message}`);
      results.push({ city: city.search, stationsUpdated: 0, error: err.message });
    }

    // 城市间间隔 2 秒，避免被限流
    if (i < CITY_DEFINITIONS.length - 1) {
      console.log('  ...等待 2 秒...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const totalUpdated = results.reduce((sum, r) => sum + r.stationsUpdated, 0);
  const failedCities = results.filter(r => r.error).map(r => r.city);

  console.log('\n========================================');
  console.log('  抓取完成！');
  console.log(`  总计更新: ${totalUpdated} 条记录`);
  if (failedCities.length > 0) {
    console.log(`  失败城市: ${failedCities.join(', ')}`);
  }
  console.log('========================================');

  process.exit(0);
}

scrapeAll().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
