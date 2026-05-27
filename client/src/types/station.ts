/** Fuel2 类型定义 */

// 加油站价格
export interface StationPrices {
  regular?: number
  mid?: number
  premium?: number
  diesel?: number
}

// 加油站
export interface Station {
  externalId: string
  source: 'tencent' | 'google' | 'mock'
  name: string
  brand?: string
  lat: number
  lng: number
  address?: string
  prices?: StationPrices
  rating?: number
  distance?: number
  localGradeLabel?: string
  country?: string
}

// 国家信息
export interface CountryInfo {
  country: 'CN' | 'CA' | 'US'
  language: 'zh' | 'en'
  unitSystem: 'metric' | 'imperial'
  currency: string
  currencySymbol: string
  priceUnit: string
  distanceUnit: string
  efficiencyUnit: string
}

// 加油记录
export interface RefuelRecord {
  id: number
  userId: number
  stationId: number
  vehicleId?: number
  grade: 'regular' | 'mid' | 'premium' | 'diesel'
  amount: number
  volume?: number
  odometer?: number
  isFullTank: boolean
  receiptUrl?: string
  fuelEfficiency?: number
  efficiencyUnit?: string
  createdAt: string
}

// 车辆
export interface Vehicle {
  id: number
  userId: number
  name: string
  plateNumber?: string
  model?: string
  lastGrade?: 'regular' | 'mid' | 'premium' | 'diesel'
  createdAt: string
  updatedAt: string
}

// API 响应
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
