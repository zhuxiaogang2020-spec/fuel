import axios from 'axios';
import { IStationAdapter, Station, StationDetail } from './StationAdapter';
import { PriceLookupFn } from '../priceProvider';
import config from '../../config/index';

/**
 * Google Maps Places API (New) 适配器
 * 文档：https://developers.google.com/maps/documentation/places/web-service/op-overview
 *
 * 注意：需要在 Google Cloud Console 启用「Places API (New)」而非旧版 Places API
 *
 * 油价策略：
 *   1. 注入 PriceProvider → 查 DB（GasBuddy 爬取的实时数据）
 *   2. 未注入 / DB 无数据 → 降级使用 Mock 随机数据
 */
export class GoogleAdapter implements IStationAdapter {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://places.googleapis.com/v1/places';

  /** DB 油价查询回调（由 adapterFactory 注入） */
  private priceProvider: PriceLookupFn | null = null;

  constructor() {
    this.apiKey = config.googleMaps.key;
    if (!this.apiKey) {
      console.warn('Google Maps API Key 未配置，将使用 Mock 数据');
    }
  }

  /**
   * 注入 DB 油价查询函数
   *
   * 由 adapterFactory 在单例初始化时调用。
   * 注入后 searchNearby / getPrice 会优先走 DB 数据而非随机 Mock。
   */
  setPriceProvider(fn: PriceLookupFn): void {
    this.priceProvider = fn;
    console.log('[GoogleAdapter] 已接入 DB 油价查询');
  }

  async searchNearby(
    lat: number,
    lng: number,
    radius: number,
    _grade?: string
  ): Promise<Station[]> {
    if (!this.apiKey) {
      throw new Error('Google Maps API Key 未配置');
    }

    try {
      const url = `${this.baseUrl}:searchNearby`;

      const response = await axios.post(url, {
        includedTypes: ['gas_station'],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: Math.min(radius, 50000),
          },
        },
        rankPreference: 'DISTANCE',
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.photos,places.types',
        },
        timeout: 10000,
      });

      const places = response.data?.places;
      if (!places || places.length === 0) return [];

      // 批量查 DB 获取真实油价（GasBuddy 爬虫写入的数据）
      const externalIds = places.map((item: any) => `google_${item.id}`);
      let dbPrices: Map<string, Station['prices']> = new Map();
      if (this.priceProvider) {
        dbPrices = await this.priceProvider(externalIds);
        if (dbPrices.size > 0) {
          console.log(`[GoogleAdapter] DB 命中 ${dbPrices.size}/${externalIds.length} 条真实油价`);
        }
      }

      const stations: Station[] = places.map((item: any) => {
        const externalId = `google_${item.id}`;
        const distance = this.calcDistance(
          lat, lng,
          item.location.latitude,
          item.location.longitude
        );

        // 优先使用 DB 真实油价，无数据则降级 Mock
        const prices = dbPrices.get(externalId) || this.getMockPrices();

        return {
          externalId,
          source: 'google',
          name: item.displayName?.text || '',
          brand: this.extractBrand(
            item.displayName?.text || '',
            item.formattedAddress || ''
          ),
          lat: item.location.latitude,
          lng: item.location.longitude,
          address: item.formattedAddress || '',
          prices,
          rating: item.rating || 0,
          distance,
        };
      });

      return stations.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } catch (error: any) {
      const msg = error.response?.data?.error?.message || error.message;
      console.error('Google Maps 搜索失败:', msg);
      throw error;
    }
  }

  async getStationDetail(externalId: string): Promise<StationDetail | null> {
    if (!this.apiKey) return null;

    try {
      const placeId = externalId.replace('google_', '');
      const url = `${this.baseUrl}/${encodeURIComponent(placeId)}`;

      const response = await axios.get(url, {
        headers: {
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,rating,nationalPhoneNumber,regularOpeningHours,photos,priceLevel',
        },
        timeout: 10000,
      });

      const item = response.data;
      if (!item) return null;

      // 尝试从 DB 查真实油价
      let prices: Station['prices'] = this.getMockPrices();
      if (this.priceProvider) {
        const dbMap = await this.priceProvider([externalId]);
        if (dbMap.has(externalId)) {
          prices = dbMap.get(externalId)!;
        }
      }

      const hours = item.regularOpeningHours?.weekdayDescriptions?.join(', ') || '未知';

      return {
        externalId,
        source: 'google',
        name: item.displayName?.text || '',
        brand: this.extractBrand(item.displayName?.text || '', ''),
        lat: item.location?.latitude || 0,
        lng: item.location?.longitude || 0,
        address: item.formattedAddress || '',
        prices,
        rating: item.rating || 0,
        phone: item.nationalPhoneNumber || '',
        openTime: hours,
        photos: item.photos?.map((p: any) => p.name) || [],
      };
    } catch (error: any) {
      console.error('Google Maps 详情查询失败:', error.message);
      return null;
    }
  }

  async getPrice(externalId: string): Promise<Station['prices'] | null> {
    // 优先查 DB 真实油价
    if (this.priceProvider) {
      const dbMap = await this.priceProvider([externalId]);
      if (dbMap.has(externalId)) {
        return dbMap.get(externalId)!;
      }
    }
    // 降级 Mock
    return this.getMockPrices();
  }

  private extractBrand(name: string, address: string): string {
    const fullText = `${name} ${address}`.toLowerCase();
    if (fullText.includes('shell')) return 'Shell';
    if (fullText.includes('petro') || fullText.includes('petro-canada')) return 'Petro-Canada';
    if (fullText.includes('esso') || fullText.includes('exxon')) return 'Esso';
    if (fullText.includes('canadian tire')) return 'Canadian Tire';
    if (fullText.includes('costco')) return 'Costco';
    if (fullText.includes('7-eleven') || fullText.includes('7eleven')) return '7-Eleven';
    if (fullText.includes('husky')) return 'Husky';
    return 'Other';
  }

  private getMockPrices() {
    // 加拿大油价范围 C$/L
    return {
      regular: 1.45 + Math.random() * 0.3,   // Regular 87
      mid: 1.58 + Math.random() * 0.3,       // Mid 89
      premium: 1.70 + Math.random() * 0.3,    // Premium 91
      diesel: 1.40 + Math.random() * 0.2,      // Diesel
    };
  }

  private calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
