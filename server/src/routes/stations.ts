import { Router, Request, Response } from 'express';
import { getAdapter, getAdapterByLocation, getAdapterByExternalId } from '../services/adapterFactory';
import { detectCountry, normalizeGrade, getGradeLabel } from '../services/countryDetect';
import { getCache, setCache } from '../services/cache';
import { encode } from '../services/geohash';
import config from '../config/index';
import pool from '../db/connection';

const router = Router();

/**
 * GET /api/stations/nearby
 * 搜索附近加油站
 * Query: lat, lng, radius?, grade?, sort?
 */
router.get('/nearby', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseInt(req.query.radius as string) || 25000;
    const grade = req.query.grade as string | undefined;
    const sort = (req.query.sort as string) || 'distance'; // distance | price

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: '缺少有效的 lat/lng 参数' });
    }

    // 检测国家
    const countryInfo = detectCountry(lat, lng);
    const country = countryInfo.country;

    // ================================================================
    // 加拿大用户请走 /api/gasbuddy/nearby（GasBuddy FastAPI 直通）
    // 此处只处理非加拿大国家
    // ================================================================
    let stations: any[] = [];
    const dataSource = countryInfo.country === 'CN' ? 'tencent' : 'google';

    // 检查缓存
    const geohashPrefix = encode(lat, lng, config.cache.geohashPrecision);
    const cached = await getCache(geohashPrefix, radius, country);
    if (cached) {
      console.log(`[Stations] 缓存命中: ${geohashPrefix}, radius=${radius}`);
      return res.json({
        success: true,
        source: 'cache',
        country: countryInfo,
        stations: sort === 'price' ? cached.sort((a: any, b: any) => {
          const priceA = a.prices?.regular || Infinity;
          const priceB = b.prices?.regular || Infinity;
          return priceA - priceB;
        }) : cached,
      });
    }

    // 数据库
    try {
      const [dbStations] = await pool.query(
        `SELECT id, external_id, source, name, brand, 
                CAST(lat AS DOUBLE) as lat, CAST(lng AS DOUBLE) as lng, address,
                CAST(price_regular AS DOUBLE) as price_regular,
                CAST(price_mid AS DOUBLE) as price_mid,
                CAST(price_premium AS DOUBLE) as price_premium,
                CAST(price_diesel AS DOUBLE) as price_diesel
         FROM stations`
      ) as [any[], any];

      if (Array.isArray(dbStations) && dbStations.length > 0) {
        const R = 6371000;
        stations = (dbStations as any[]).map((s: any) => {
          const sLat = Number(s.lat);
          const sLng = Number(s.lng);
          const dLat = ((sLat - lat) * Math.PI) / 180;
          const dLng = ((sLng - lng) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) ** 2 +
            Math.cos((lat * Math.PI) / 180) * Math.cos((sLat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
          const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

          return {
            externalId: s.external_id || `db_${s.id}`,
            source: 'db',
            name: s.name,
            brand: s.brand,
            lat: sLat,
            lng: sLng,
            address: s.address,
            prices: {
              regular: Number(s.price_regular) || 0,
              mid: Number(s.price_mid) || 0,
              premium: Number(s.price_premium) || 0,
              diesel: Number(s.price_diesel) || 0,
            },
            distance,
          };
        }).filter((s: any) => s.distance <= radius)
          .sort((a: any, b: any) => a.distance - b.distance);
      }
    } catch (dbErr: any) {
      console.warn('[Stations] DB查询失败，回退适配器:', dbErr.message);
    }

    // 适配器
    if (stations.length === 0) {
      const adapter = getAdapter(country);
      stations = await adapter.searchNearby(lat, lng, radius, grade);

      if (stations.length === 0) {
        console.log('[Stations] 适配器未返回数据，降级到 Mock 模式');
        const mockAdapter = getAdapter(undefined, true);
        stations = await mockAdapter.searchNearby(lat, lng, radius, grade);
      }
    }

    // 过滤油号
    if (grade) {
      const normalizedGrade = normalizeGrade(grade, country);
      stations = stations.filter(s => s.prices?.[normalizedGrade as keyof typeof s.prices] != null);
    }

    // 排序
    if (sort === 'price') {
      stations.sort((a, b) => {
        const priceA = a.prices?.regular ?? Infinity;
        const priceB = b.prices?.regular ?? Infinity;
        return priceA - priceB;
      });
    } else {
      stations.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    // 添加本地化标签
    const result = stations.map(s => ({
      ...s,
      localGradeLabel: getGradeLabel(grade || 'regular', country),
      country,
    }));

    // 写入缓存
    await setCache(geohashPrefix, radius, country, result);

    return res.json({
      success: true,
      source: dataSource,
      country: countryInfo,
      stations: result,
    });
  } catch (error: any) {
    console.error('搜索加油站错误:', error.message);

    // 降级：使用 Mock 适配器
    try {
      console.log('[Stations] API 调用失败，降级到 Mock 模式');
      const mockAdapter = getAdapter(undefined, true);
      const lat = parseFloat(req.query.lat as string) || 29.5647;
      const lng = parseFloat(req.query.lng as string) || 106.5507;
      const radius = parseInt(req.query.radius as string) || 25000;

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
        error: '搜索加油站失败，请稍后重试',
        detail: error.message,
      });
    }
  }
});

/**
 * GET /api/stations/:id
 * 获取加油站详情
 * Params: id (externalId)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const externalId = req.params.id;

    // 优先从数据库查询
    try {
      const [rows] = await pool.query(
        `SELECT id, external_id, source, name, brand,
                CAST(lat AS DOUBLE) as lat, CAST(lng AS DOUBLE) as lng, address,
                CAST(price_regular AS DOUBLE) as price_regular,
                CAST(price_mid AS DOUBLE) as price_mid,
                CAST(price_premium AS DOUBLE) as price_premium,
                CAST(price_diesel AS DOUBLE) as price_diesel
         FROM stations WHERE external_id = ? LIMIT 1`,
        [externalId]
      ) as [any[], any];

      if (rows.length > 0) {
        const s = rows[0];
        return res.json({
          success: true,
          station: {
            externalId: s.external_id || `db_${s.id}`,
            source: 'db',
            name: s.name,
            brand: s.brand,
            lat: Number(s.lat),
            lng: Number(s.lng),
            address: s.address,
            prices: {
              regular: Number(s.price_regular) || 0,
              mid: Number(s.price_mid) || 0,
              premium: Number(s.price_premium) || 0,
              diesel: Number(s.price_diesel) || 0,
            },
            phone: '',
            openTime: '',
          },
        });
      }
    } catch (dbErr: any) {
      console.warn('[Stations] 详情DB查询失败:', dbErr.message);
    }

    // 回退：根据 externalId 前缀选择对应适配器
    const adapter = getAdapterByExternalId(externalId);
    const detail = await adapter.getStationDetail(externalId);
    if (!detail) {
      return res.status(404).json({ error: '加油站不存在' });
    }
    return res.json({ success: true, station: detail });
  } catch (error: any) {
    console.error('获取加油站详情错误:', error.message);
    return res.status(500).json({ error: '获取加油站详情失败' });
  }
});

export default router;
