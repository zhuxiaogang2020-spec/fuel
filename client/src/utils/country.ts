import type { CountryInfo, CountryCode } from '@/types/country';

const COUNTRY_BOUNDS = {
  CN: { minLat: 18.0, maxLat: 54.0, minLng: 73.0, maxLng: 135.0 },
  CA: { minLat: 42.0, maxLat: 83.0, minLng: -141.0, maxLng: -52.0 },
  US: { minLat: 18.0, maxLat: 72.0, minLng: -180.0, maxLng: -52.0 },
};

/**
 * 根据经纬度检测国家
 */
export function detectCountry(lat: number, lng: number): CountryInfo {
  // 检查中国
  const cn = COUNTRY_BOUNDS.CN;
  if (lat >= cn.minLat && lat <= cn.maxLat && lng >= cn.minLng && lng <= cn.maxLng) {
    return {
      country: 'CN',
      language: 'zh',
      unitSystem: 'metric',
      currency: 'CNY',
      currencySymbol: '¥',
      priceUnit: '¥/L',
      distanceUnit: 'km',
      efficiencyUnit: 'L/100km',
    };
  }

  // 检查加拿大
  const ca = COUNTRY_BOUNDS.CA;
  if (lat >= ca.minLat && lat <= ca.maxLat && lng >= ca.minLng && lng <= ca.maxLng) {
    return {
      country: 'CA',
      language: 'en',
      unitSystem: 'metric',
      currency: 'CAD',
      currencySymbol: 'C$',
      priceUnit: 'C$/L',
      distanceUnit: 'km',
      efficiencyUnit: 'L/100km',
    };
  }

  // 检查美国
  const us = COUNTRY_BOUNDS.US;
  if (lat >= us.minLat && lat <= us.maxLat && lng >= us.minLng && lng <= us.maxLng) {
    return {
      country: 'US',
      language: 'en',
      unitSystem: 'imperial',
      currency: 'USD',
      currencySymbol: '$',
      priceUnit: '$/gal',
      distanceUnit: 'miles',
      efficiencyUnit: 'MPG',
    };
  }

  // 其他
  return {
    country: 'OTHER',
    language: 'en',
    unitSystem: 'metric',
    currency: 'OTHER',
    currencySymbol: '',
    priceUnit: '/L',
    distanceUnit: 'km',
    efficiencyUnit: 'L/100km',
  };
}

/**
 * 获取油号本地化标签
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
