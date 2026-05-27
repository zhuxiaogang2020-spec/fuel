import { IStationAdapter } from './adapters/StationAdapter';
import { MockAdapter } from './adapters/MockAdapter';
import { TencentAdapter } from './adapters/TencentAdapter';
import { GoogleAdapter } from './adapters/GoogleAdapter';
import { createDbPriceProvider } from './priceProvider';
import { detectCountry, CountryCode } from './countryDetect';
import config from '../config/index';

let mockAdapterInstance: MockAdapter | null = null;
let tencentAdapterInstance: TencentAdapter | null = null;
let googleAdapterInstance: GoogleAdapter | null = null;

/**
 * 获取适配器实例（单例模式）
 */
function getMockAdapter(): MockAdapter {
  if (!mockAdapterInstance) {
    mockAdapterInstance = new MockAdapter();
  }
  return mockAdapterInstance;
}

function getTencentAdapter(): TencentAdapter {
  if (!tencentAdapterInstance) {
    tencentAdapterInstance = new TencentAdapter();
  }
  return tencentAdapterInstance;
}

function getGoogleAdapter(): GoogleAdapter {
  if (!googleAdapterInstance) {
    googleAdapterInstance = new GoogleAdapter();
    // 注入 DB 油价查询 → 优先使用 GasBuddy 爬虫写入的真实数据
    const dbPriceProvider = createDbPriceProvider();
    googleAdapterInstance.setPriceProvider(dbPriceProvider);
    console.log('[AdapterFactory] GoogleAdapter 已注入 DB 油价 Provider');
  }
  return googleAdapterInstance;
}

/**
 * 根据国家代码获取对应的数据源适配器
 * @param country 国家代码
 * @param forceMock 强制使用 Mock 模式
 */
export function getAdapter(country?: CountryCode, forceMock: boolean = false): IStationAdapter {
  // Mock 模式优先
  if (forceMock || config.mock.enabled) {
    console.log('[AdapterFactory] 使用 Mock 适配器');
    return getMockAdapter();
  }

  // 根据国家选择适配器
  if (country === 'CN') {
    if (config.tencentMap.enabled && config.tencentMap.key) {
      console.log('[AdapterFactory] 使用腾讯地图适配器 (CN)');
      return getTencentAdapter();
    }
  } else if (country === 'CA' || country === 'US') {
    if (config.googleMaps.enabled && config.googleMaps.key) {
      console.log(`[AdapterFactory] 使用 Google Maps 适配器 (${country})`);
      return getGoogleAdapter();
    }
  }

  // 兜底：使用 Mock 适配器
  console.log('[AdapterFactory] 无可用数据源，降级到 Mock 模式');
  return getMockAdapter();
}

/**
 * 根据经纬度自动检测国家并返回对应适配器
 * @param lat 纬度
 * @param lng 经度
 */
export function getAdapterByLocation(lat: number, lng: number): IStationAdapter {
  const countryInfo = detectCountry(lat, lng);
  return getAdapter(countryInfo.country);
}

/**
 * 根据 externalId 前缀自动选择适配器
 * 
 * externalId 命名约定：
 *   google_xxx  → GoogleAdapter
 *   tencent_xxx → TencentAdapter  
 *   mock_xxx    → MockAdapter
 *   其他格式     → 降级到 MockAdapter
 * 
 * 用于 GET /api/stations/:id 等需要根据数据源查询详情的场景
 */
export function getAdapterByExternalId(externalId: string): IStationAdapter {
  if (externalId.startsWith('google_')) {
    if (config.googleMaps.enabled && config.googleMaps.key) {
      console.log('[AdapterFactory] externalId 前缀 google_ → Google Maps 适配器');
      return getGoogleAdapter();
    }
    console.warn('[AdapterFactory] Google Maps 适配器不可用，降级 Mock');
  } else if (externalId.startsWith('tencent_')) {
    if (config.tencentMap.enabled && config.tencentMap.key) {
      console.log('[AdapterFactory] externalId 前缀 tencent_ → 腾讯地图适配器');
      return getTencentAdapter();
    }
    console.warn('[AdapterFactory] 腾讯地图适配器不可用，降级 Mock');
  }

  // 兜底：Mock 适配器
  console.log('[AdapterFactory] externalId 无已知前缀，降级到 Mock 适配器');
  return getMockAdapter();
}

/**
 * 检查是否有可用的真实数据源（非 Mock）
 */
export function hasRealDataSource(country: CountryCode): boolean {
  if (country === 'CN') {
    return config.tencentMap.enabled && !!config.tencentMap.key;
  } else if (country === 'CA' || country === 'US') {
    return config.googleMaps.enabled && !!config.googleMaps.key;
  }
  return false;
}
