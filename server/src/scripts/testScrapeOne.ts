import '../config/index';
import { forceRefreshCity } from '../services/priceFetchService';

async function testScrape() {
  console.log('[Test] 开始抓取 Toronto, ON...');
  const result = await forceRefreshCity('Toronto, ON');
  console.log('[Test] 结果:', JSON.stringify(result, null, 2));
  process.exit(0);
}

testScrape().catch(err => {
  console.error('[Test] 失败:', err.message);
  process.exit(1);
});
