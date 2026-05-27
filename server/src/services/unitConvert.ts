/**
 * 单位转换工具
 * 支持：L/100km ↔ MPG，km ↔ miles，L ↔ gal
 */

// 转换常量
const L_PER_US_GAL = 3.78541;
const L_PER_IMP_GAL = 4.54609;
const KM_PER_MILE = 1.60934;

/**
 * 油耗转换：L/100km → MPG (US)
 */
export function l100kmToMpgUs(l100km: number): number {
  if (l100km === 0) return 0;
  return (100 * L_PER_US_GAL) / l100km;
}

/**
 * 油耗转换：MPG (US) → L/100km
 */
export function mpgUsToL100km(mpg: number): number {
  if (mpg === 0) return 0;
  return (100 * L_PER_US_GAL) / mpg;
}

/**
 * 油耗转换：L/100km → MPG (Imperial)
 */
export function l100kmToMpgImperial(l100km: number): number {
  if (l100km === 0) return 0;
  return (100 * L_PER_IMP_GAL) / l100km;
}

/**
 * 距离转换：km → miles
 */
export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

/**
 * 距离转换：miles → km
 */
export function milesToKm(miles: number): number {
  return miles * KM_PER_MILE;
}

/**
 * 油量转换：L → US gal
 */
export function litersToUsGal(liters: number): number {
  return liters / L_PER_US_GAL;
}

/**
 * 油量转换：US gal → L
 */
export function usGalToLiters(gal: number): number {
  return gal * L_PER_US_GAL;
}

/**
 * 格式化油耗显示
 * @param value 油耗值
 * @param unit 单位 ('L/100km' | 'MPG')
 */
export function formatEfficiency(value: number, unit: 'L/100km' | 'MPG'): string {
  if (unit === 'L/100km') {
    return `${value.toFixed(1)} L/100km`;
  } else {
    return `${Math.round(value)} MPG`;
  }
}

/**
 * 格式化价格显示
 * @param price 每升价格
 * @param country 国家代码
 * @param currencySymbol 货币符号
 */
export function formatPrice(
  pricePerLiter: number,
  country: string,
  currencySymbol: string
): { primary: string; secondary?: string } {
  if (country === 'US') {
    // 美国：主显示 $/gal，辅助显示 $/L
    const pricePerGal = pricePerLiter * L_PER_US_GAL;
    return {
      primary: `${currencySymbol}${pricePerGal.toFixed(3)}/gal`,
      secondary: `(${currencySymbol}${pricePerLiter.toFixed(3)}/L)`,
    };
  } else {
    // 中国/加拿大：显示 $/L
    const symbol = country === 'CN' ? '¥' : currencySymbol;
    return {
      primary: `${symbol}${pricePerLiter.toFixed(2)}/L`,
    };
  }
}

/**
 * 格式化距离显示
 * @param meters 距离（米）
 * @param unit 单位 ('km' | 'miles')
 */
export function formatDistance(meters: number, unit: 'km' | 'miles'): string {
  if (unit === 'km') {
    const km = meters / 1000;
    return km < 1 ? `${Math.round(meters)}m` : `${km.toFixed(1)}km`;
  } else {
    const miles = meters / 1000 / KM_PER_MILE;
    return miles < 0.1 ? `${Math.round(meters * 3.28084)}ft` : `${miles.toFixed(1)}mi`;
  }
}
