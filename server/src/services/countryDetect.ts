/**
 * 根据经纬度检测用户所在国家
 * 用于自动切换数据源、语言、单位制式
 */

// 国家边界范围（简化版，实际生产应使用 GeoIP 或专业库）
const COUNTRY_BOUNDS = {
  CN: { minLat: 18.0, maxLat: 54.0, minLng: 73.0, maxLng: 135.0 },
  CA: { minLat: 42.0, maxLat: 83.0, minLng: -141.0, maxLng: -52.0 },
  US: { minLat: 18.0, maxLat: 72.0, minLng: -180.0, maxLng: -52.0 },
};

export type CountryCode = 'CN' | 'CA' | 'US' | 'OTHER';

export interface CountryInfo {
  country: CountryCode;
  language: 'zh' | 'en';
  unitSystem: 'metric' | 'imperial';
  currency: 'CNY' | 'CAD' | 'USD' | 'OTHER';
  currencySymbol: string;
  priceUnit: string;       // 油价显示单位
  distanceUnit: 'km' | 'miles';
  efficiencyUnit: 'L/100km' | 'MPG';
}

const COUNTRY_INFO: Record<CountryCode, Omit<CountryInfo, 'country'>> = {
  CN: {
    language: 'zh',
    unitSystem: 'metric',
    currency: 'CNY',
    currencySymbol: '¥',
    priceUnit: '¥/L',
    distanceUnit: 'km',
    efficiencyUnit: 'L/100km',
  },
  CA: {
    language: 'en',
    unitSystem: 'imperial',
    currency: 'CAD',
    currencySymbol: 'C$',
    priceUnit: 'C$/L',
    distanceUnit: 'km',
    efficiencyUnit: 'MPG',
  },
  US: {
    language: 'en',
    unitSystem: 'imperial',
    currency: 'USD',
    currencySymbol: '$',
    priceUnit: '$/gal',
    distanceUnit: 'miles',
    efficiencyUnit: 'MPG',
  },
  OTHER: {
    language: 'en',
    unitSystem: 'metric',
    currency: 'OTHER',
    currencySymbol: '',
    priceUnit: '/L',
    distanceUnit: 'km',
    efficiencyUnit: 'L/100km',
  },
};

/**
 * 根据经纬度检测国家
 * @param lat 纬度
 * @param lng 经度
 * @returns 国家信息
 */
export function detectCountry(lat: number, lng: number): CountryInfo {
  // 检查中国
  const cn = COUNTRY_BOUNDS.CN;
  if (lat >= cn.minLat && lat <= cn.maxLat && lng >= cn.minLng && lng <= cn.maxLng) {
    return { country: 'CN', ...COUNTRY_INFO.CN };
  }

  // 检查加拿大
  const ca = COUNTRY_BOUNDS.CA;
  if (lat >= ca.minLat && lat <= ca.maxLat && lng >= ca.minLng && lng <= ca.maxLng) {
    return { country: 'CA', ...COUNTRY_INFO.CA };
  }

  // 检查美国
  const us = COUNTRY_BOUNDS.US;
  if (lat >= us.minLat && lat <= us.maxLat && lng >= us.minLng && lng <= us.maxLng) {
    return { country: 'US', ...COUNTRY_INFO.US };
  }

  return { country: 'OTHER', ...COUNTRY_INFO.OTHER };
}

/**
 * 获取油号本地化标签
 * @param grade 归一化油号
 * @param country 国家代码
 */
export function getGradeLabel(grade: string, country: CountryCode): string {
  const labels: Record<CountryCode, Record<string, string>> = {
    CN: {
      regular: '92#',
      mid: '95#',
      premium: '98#',
      diesel: '0#柴油',
    },
    CA: {
      regular: 'Regular(87)',
      mid: 'Mid(89)',
      premium: 'Premium(91)',
      diesel: 'Diesel',
    },
    US: {
      regular: 'Regular(87)',
      mid: 'Mid(89)',
      premium: 'Premium(91)',
      diesel: 'Diesel',
    },
    OTHER: {
      regular: 'Regular',
      mid: 'Mid',
      premium: 'Premium',
      diesel: 'Diesel',
    },
  };

  return labels[country]?.[grade] || grade;
}

/**
 * 获取归一化油号（从本地标签转换）
 */
export function normalizeGrade(label: string, country: CountryCode): string {
  const normalized: Record<CountryCode, Record<string, string>> = {
    CN: {
      '92#': 'regular',
      '95#': 'mid',
      '98#': 'premium',
      '0#柴油': 'diesel',
      '92': 'regular',
      '95': 'mid',
      '98': 'premium',
    },
    CA: {
      'regular': 'regular',
      'mid': 'mid',
      'premium': 'premium',
      'diesel': 'diesel',
      '87': 'regular',
      '89': 'mid',
      '91': 'premium',
    },
    US: {
      'regular': 'regular',
      'mid': 'mid',
      'premium': 'premium',
      'diesel': 'diesel',
      '87': 'regular',
      '89': 'mid',
      '91': 'premium',
    },
    OTHER: {
      'regular': 'regular',
      'mid': 'mid',
      'premium': 'premium',
      'diesel': 'diesel',
    },
  };

  const key = label.toLowerCase();
  return normalized[country]?.[key] || label;
}
