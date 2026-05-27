/**
 * 调试脚本：查看 GasBuddy 返回的 station 对象所有键名
 */
import '../config/index';
import { scrapeCity } from '../services/gasBuddyPuppeteerScraper';

async function debug() {
  const city = 'Toronto, ON';
  console.log(`[Debug] 抓取 ${city}...`);
  const result = await scrapeCity(city, 1);
  
  if (result.stations.length === 0) {
    console.log('没有数据');
    process.exit(0);
  }

  const s = result.stations[0];
  console.log('\n=== 所有顶层 key ===');
  console.log(Object.keys(s));
  
  // 递归检查所有属性
  console.log('\n=== 完整对象 (深度遍历) ===');
  function dump(obj: any, prefix: string = '') {
    if (obj === null || obj === undefined) {
      console.log(prefix + ' = ' + obj);
      return;
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      console.log(prefix + ' = ' + JSON.stringify(obj));
      return;
    }
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        console.log(prefix + key + ':');
        dump(val, prefix + '  ');
      } else {
        console.log(prefix + key + ' = ' + JSON.stringify(val));
      }
    }
  }
  dump(s);

  // 第2个 station 确认格式
  if (result.stations.length > 1) {
    console.log('\n=== 第2个 station 的 key ===');
    console.log(Object.keys(result.stations[1]));
  }
  
  process.exit(0);
}

debug().catch(err => { console.error(err); process.exit(1); });
