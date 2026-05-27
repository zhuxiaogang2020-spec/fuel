import axios from 'axios';
import { IStationAdapter, Station, StationDetail } from './StationAdapter';
import config from '../../config/index';

/**
 * 腾讯地图 API 适配器
 * 文档：https://lbs.qq.com/service/webService/webServiceGuide/webServiceOverview
 */
export class TencentAdapter implements IStationAdapter {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://apis.map.qq.com/ws';

  constructor() {
    this.apiKey = config.tencentMap.key;
    if (!this.apiKey) {
      console.warn('腾讯地图 API Key 未配置，将使用 Mock 数据');
    }
  }

  async searchNearby(
    lat: number,
    lng: number,
    radius: number,
    grade?: string
  ): Promise<Station[]> {
    if (!this.apiKey) {
      throw new Error('腾讯地图 API Key 未配置');
    }

    try {
      const url = `${this.baseUrl}/place/v1/search`;
      const params = {
        key: this.apiKey,
        keyword: '加油站',
        boundary: `nearby(${lat},${lng},${radius})`,
        page_size: 20,
        page_index: 1,
        orderby: '_distance',
        output: 'json',
      };

      const response = await axios.get(url, { params });
      const data = response.data;

      if (data.status !== 0) {
        throw new Error(`腾讯地图 API 错误: ${data.message}`);
      }

      const stations: Station[] = data.data.map((item: any) => ({
        externalId: `tencent_${item.id}`,
        source: 'tencent',
        name: item.title,
        brand: this.extractBrand(item.title),
        lat: item.location.lat,
        lng: item.location.lng,
        address: item.address || '',
        prices: this.getMockPrices(), // 腾讯地图不提供油价，使用 Mock
        rating: item.avg_rating || 0,
        distance: item._distance,
      }));

      return stations;
    } catch (error: any) {
      console.error('腾讯地图搜索失败:', error.message);
      throw error;
    }
  }

  async getStationDetail(externalId: string): Promise<StationDetail | null> {
    if (!this.apiKey) return null;

    try {
      const id = externalId.replace('tencent_', '');
      const url = `${this.baseUrl}/place/v1/detail`;
      const params = {
        key: this.apiKey,
        id,
        output: 'json',
      };

      const response = await axios.get(url, { params });
      const data = response.data;

      if (data.status !== 0) return null;

      const item = data.data;
      return {
        externalId,
        source: 'tencent',
        name: item.title,
        brand: this.extractBrand(item.title),
        lat: item.location.lat,
        lng: item.location.lng,
        address: item.address || '',
        prices: this.getMockPrices(),
        rating: item.avg_rating || 0,
        phone: item.tel || '',
        openTime: item.open_time || '未知',
        photos: [],
      };
    } catch (error: any) {
      console.error('腾讯地图详情查询失败:', error.message);
      return null;
    }
  }

  async getPrice(externalId: string): Promise<Station['prices'] | null> {
    // 腾讯地图不提供实时油价，返回 Mock 数据
    return this.getMockPrices();
  }

  private extractBrand(name: string): string {
    if (name.includes('中石化') || name.includes('中国石化')) return '中石化';
    if (name.includes('中石油') || name.includes('中国石油')) return '中石油';
    if (name.includes('壳牌') || name.includes('Shell')) return '壳牌';
    if (name.includes('BP')) return 'BP';
    if (name.includes('民营')) return '民营';
    return '其他';
  }

  private getMockPrices() {
    return {
      regular: 7.82 + (Math.random() - 0.5) * 0.5,  // 92#
      mid: 8.31 + (Math.random() - 0.5) * 0.5,     // 95#
      premium: 9.05 + (Math.random() - 0.5) * 0.5,  // 98#
      diesel: 7.52 + (Math.random() - 0.5) * 0.3,   // 柴油
    };
  }
}
