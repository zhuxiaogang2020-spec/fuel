/**
 * 测试 Google Maps 适配器 —— 验证 API Key 是否能正常获取加拿大加油站数据
 * 用法: npx ts-node src/scripts/testGoogleAdapter.ts
 */
import { GoogleAdapter } from '../services/adapters/GoogleAdapter';

async function main() {
  const adapter = new GoogleAdapter();

  // 测试坐标：Toronto 市中心
  const lat = 43.6532;
  const lng = -79.3832;
  const radius = 25000; // 25km

  console.log(`\n========== 测试 Google Places API ==========`);
  console.log(`坐标: (${lat}, ${lng}) | 半径: ${radius}m\n`);

  try {
    console.log('调用 searchNearby...');
    const stations = await adapter.searchNearby(lat, lng, radius);
    
    console.log(`\n✅ 成功获取 ${stations.length} 个加油站:\n`);
    
    if (stations.length === 0) {
      console.log('⚠️ 返回空数组 → Google API 可能未返回数据（检查 API Key 权限或 Places API (New) 是否启用）');
    } else {
      stations.slice(0, 5).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.name}`);
        console.log(`     ID: ${s.externalId}`);
        console.log(`     坐标: (${s.lat}, ${s.lng})`);
        console.log(`     距离: ${(s.distance! / 1000).toFixed(2)}km`);
        console.log(`     价格: R$${s.prices?.regular?.toFixed(2)}\n`);
      });
    }
  } catch (error: any) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error(`\n❌ Google API 调用失败: ${msg}`);
    if (error.response?.status === 403) {
      console.error('→ API Key 未启用 Places API (New) 或配额不足');
    } else if (error.response?.status === 400) {
      console.error('→ 请求参数有误，检查 Places API (New) 是否启用');
    }
    console.error('→ 完整错误:', JSON.stringify(error.response?.data || error, null, 2));
  }
}

main().catch(console.error);
