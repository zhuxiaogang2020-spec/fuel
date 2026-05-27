/**
 * 单位转换工具（前端版）
 */

export const L_PER_US_GAL = 3.78541;
export const L_PER_IMP_GAL = 4.54609;
export const KM_PER_MILE = 1.60934;

/**
 * 格式化价格显示
 */
export function formatPrice(
  pricePerLiter: number,
  country: string,
  currencySymbol: string
): { primary: string; secondary?: string } {
  if (country === 'US') {
    const pricePerGal = pricePerLiter * L_PER_US_GAL;
    return {
      primary: `${currencySymbol}${pricePerGal.toFixed(3)}/gal`,
      secondary: `(${currencySymbol}${pricePerLiter.toFixed(3)}/L)`,
    };
  } else {
    const symbol = country === 'CN' ? '¥' : currencySymbol;
    return {
      primary: `${symbol}${pricePerLiter.toFixed(2)}/L`,
    };
  }
}

/**
 * 格式化距离显示
 */
export function formatDistance(meters: number, unit: 'km' | 'miles'): string {
  if (unit === 'km') {
    const km = meters / 1000;
    return km < 1 ? `${Math.round(meters)}m` : `${km.toFixed(1)}km`;
  } else {
    const miles = meters / 1000 / KM_PER_MILE;
    return miles < 0.1
      ? `${Math.round(meters * 3.28084)}ft`
      : `${miles.toFixed(1)}mi`;
  }
}

/**
 * 格式化油耗显示
 */
export function formatEfficiency(value: number, unit: 'L/100km' | 'MPG'): string {
  if (unit === 'L/100km') {
    return `${value.toFixed(1)} L/100km`;
  } else {
    return `${Math.round(value)} MPG`;
  }
}

/**
 * 获取油耗颜色（省油绿色，费油红色）
 */
export function getEfficiencyColor(value: number, unit: 'L/100km' | 'MPG'): string {
  if (unit === 'L/100km') {
    // 越低越好
    if (value <= 6) return '#00C9A7'; // 省油 - 绿色
    if (value <= 8) return '#FFD93D'; // 一般 - 黄色
    return '#EF4444'; // 费油 - 红色
  } else {
    // 越高越好
    if (value >= 35) return '#00C9A7'; // 省油 - 绿色
    if (value >= 25) return '#FFD93D'; // 一般 - 黄色
    return '#EF4444'; // 费油 - 红色
  }
}
