import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getAdapter, getAdapterByLocation } from '../services/adapterFactory';
import { detectCountry, normalizeGrade, getGradeLabel } from '../services/countryDetect';
import { getCache, setCache } from '../services/cache';
import { encode } from '../services/geohash';
import { execute } from '../db/connection';
import config from '../config/index';

const router = Router();

/**
 * GET /api/prices/compare
 * 比价接口：按半径搜索并对比加油站价格
 * Query: lat, lng, radius?, grade?, sort?
 *
 * 核心功能（加拿大/美国）：
 * - 支持半径 3/5/10/20km 切换
 * - 按最便宜或最近排序
 * - 高亮最低价
 */
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseInt(req.query.radius as string) || 5000;
    const grade = (req.query.grade as string) || 'regular';
    const sort = (req.query.sort as string) || 'price'; // price | distance

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: '缺少有效的 lat/lng 参数' });
    }

    // 检测国家
    const countryInfo = detectCountry(lat, lng);
    const country = countryInfo.country;

    // 检查缓存
    const geohashPrefix = encode(lat, lng, config.cache.geohashPrecision);
    const cached = await getCache(geohashPrefix, radius, country);
    let stations;

    if (cached) {
      console.log(`[Prices] 缓存命中: ${geohashPrefix}, radius=${radius}`);
      stations = cached;
    } else {
      // 调用适配器获取数据
      const adapter = getAdapter(country);
      console.log(`[Prices] 适配器选择: country=${country}, 平台=${adapter.constructor.name}`);
      const normalizedGrade = normalizeGrade(grade, country);
      stations = await adapter.searchNearby(lat, lng, radius, normalizedGrade);

      // 写入缓存
      await setCache(geohashPrefix, radius, country, stations);
    }

    // 过滤油号
    const gradeKey = normalizeGrade(grade, country);
    const filtered = stations.filter((s: any) => s.prices?.[gradeKey] != null);

    if (filtered.length === 0) {
      return res.json({
        success: true,
        country: countryInfo,
        stations: [],
        cheapest: null,
        message: '附近暂无加油站数据',
      });
    }

    // 排序
    if (sort === 'price') {
      filtered.sort((a: any, b: any) => {
        const priceA = a.prices?.[gradeKey] ?? Infinity;
        const priceB = b.prices?.[gradeKey] ?? Infinity;
        return priceA - priceB;
      });
    } else {
      filtered.sort((a: any, b: any) => (a.distance || 0) - (b.distance || 0));
    }

    // 找出最低价
    const cheapest = filtered.reduce((min: any, s: any) => {
      const price = s.prices?.[gradeKey];
      if (price && (!min || price < min.price)) {
        return { station: s, price };
      }
      return min;
    }, null);

    // 添加本地化标签
    const result = filtered.map((s: any) => ({
      ...s,
      localGradeLabel: getGradeLabel(gradeKey, country),
      isCheapest: s.externalId === cheapest?.station?.externalId,
    }));

    return res.json({
      success: true,
      country: countryInfo,
      radius,
      grade: gradeKey,
      stations: result,
      cheapest: cheapest
        ? {
            stationName: cheapest.station.name,
            brand: cheapest.station.brand,
            price: cheapest.price,
            distance: cheapest.station.distance,
          }
        : null,
    });
  } catch (error: any) {
    console.error('比价查询错误:', error.message);

    // 降级到 Mock
    try {
      console.log('[Prices] API 调用失败，降级到 Mock 模式');
      const mockAdapter = getAdapter(undefined, true);
      const lat = parseFloat(req.query.lat as string) || 43.6532;
      const lng = parseFloat(req.query.lng as string) || -79.3832;
      const radius = parseInt(req.query.radius as string) || 5000;

      const stations = await mockAdapter.searchNearby(lat, lng, radius);
      return res.json({
        success: true,
        source: 'mock_fallback',
        country: detectCountry(lat, lng),
        stations,
        warning: '数据源暂时不可用，显示模拟数据',
      });
    } catch (mockError: any) {
      return res.status(500).json({
        error: '比价查询失败，请稍后重试',
        detail: error.message,
      });
    }
  }
});

/**
 * GET /api/prices/proxy
 * 代理：前端调此接口，后端转发到 gas.dunbo.uk/prices，避免前端直连
 * Query: address, radius (miles), fuel_type?
 */
router.get('/proxy', async (req: Request, res: Response) => {
  try {
    const { address, radius_km, fuel_type } = req.query;
    if (!address) {
      return res.status(400).json({ error: '缺少 address 参数' });
    }

    const { baseUrl, pricesPath, timeoutMs } = config.gasBuddyApi;
    const proxyUrl = `${baseUrl}${pricesPath}`;
    // radius 前端传的是公里值 → 用 radius_km 传给 FastAPI（radius 是英里，二者互斥）
    const params: Record<string, any> = {
      address,
      radius_km: radius_km || config.gasBuddyApi.radius,
    };
    if (fuel_type) params.fuel_type = fuel_type;

    console.log(`[Prices Proxy] ▶ 转发请求到 ${proxyUrl}`, params);

    const response = await axios.get(proxyUrl, {
      params,
      timeout: timeoutMs,
    });

    // 将返回的加油站保存到本地 DB，供详情页查询
    const prices = response.data?.prices || [];
    if (prices.length > 0) {
      // 按 site_id 分组，合并各油品价格
      const groups = new Map<string, any[]>();
      for (const item of prices) {
        if (!item.site_id) continue;
        const arr = groups.get(item.site_id);
        if (arr) arr.push(item); else groups.set(item.site_id, [item]);
      }
      for (const [siteId, items] of groups) {
        const first = items[0];
        let reg: number | null = null, mid: number | null = null, prem: number | null = null, dies: number | null = null;
        for (const i of items) {
          const val = i.cost != null ? i.cost / 100 : null;
          if (i.fuel_type === 'regular_gas') reg = val;
          else if (i.fuel_type === 'midgrade_gas') mid = val;
          else if (i.fuel_type === 'premium_gas') prem = val;
          else if (i.fuel_type === 'diesel') dies = val;
        }
        try {
          await execute(
            `INSERT INTO stations (external_id, source, name, brand, lat, lng, address, price_regular, price_mid, price_premium, price_diesel)
             VALUES (?, 'gasbuddy', ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), brand=VALUES(brand), lat=VALUES(lat), lng=VALUES(lng), address=VALUES(address),
               price_regular=VALUES(price_regular), price_mid=VALUES(price_mid), price_premium=VALUES(price_premium), price_diesel=VALUES(price_diesel)`,
            [siteId, first.name, first.brand || '', first.lat, first.long, first.address || '', reg, mid, prem, dies]
          );
        } catch (dbErr: any) {
          console.warn(`[Prices Proxy] 保存站点 ${siteId} 失败:`, dbErr.message);
        }
      }
      console.log(`[Prices Proxy] ✓ 已保存 ${groups.size} 个加油站到本地 DB`);
    }

    console.log(`[Prices Proxy] ✓ 返回 ${response.data?.count || 0} 条`);
    return res.json(response.data);
  } catch (error: any) {
    console.error('[Prices Proxy] ✗ 转发失败:', error.message);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    return res.status(502).json({ error: '代理请求失败', detail: error.message });
  }
});

/**
 * GET /api/prices/radius-options
 * 获取支持的比价半径选项
 */
router.get('/radius-options', (req: Request, res: Response) => {
  const options = [
    { value: 3000, label: '3km', labelEn: '3km' },
    { value: 5000, label: '5km', labelEn: '5km' },
    { value: 10000, label: '10km', labelEn: '10km' },
    { value: 20000, label: '20km', labelEn: '20km' },
  ];
  return res.json({ success: true, options });
});

export default router;
