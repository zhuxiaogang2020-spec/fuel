import { IStationAdapter, Station, StationDetail } from './StationAdapter';
import fs from 'fs';
import path from 'path';

/**
 * Mock 数据适配器
 * 用于开发测试，以及外部 API 不可用时的降级
 */
export class MockAdapter implements IStationAdapter {
  private stations: Station[] = [];

  constructor() {
    this.loadMockData();
  }

  private loadMockData() {
    try {
      const dataPath = path.join(__dirname, '../../data/fallback_stations.json');
      const raw = fs.readFileSync(dataPath, 'utf-8');
      const data = JSON.parse(raw);
      this.stations = data.stations || [];
    } catch (error) {
      console.error('加载 Mock 数据失败:', (error as Error).message);
      this.stations = getDefaultMockStations();
    }
  }

  async searchNearby(
    lat: number,
    lng: number,
    radius: number,
    grade?: string
  ): Promise<Station[]> {
    // 简单模拟：返回所有 Mock 站点，计算距离
    const result = this.stations.map(s => ({
      ...s,
      distance: this.calcDistance(lat, lng, s.lat, s.lng),
    })).filter(s => s.distance! <= radius);

    // 按距离排序
    result.sort((a, b) => (a.distance || 0) - (b.distance || 0));

    return Promise.resolve(result);
  }

  async getStationDetail(externalId: string): Promise<StationDetail | null> {
    const station = this.stations.find(s => s.externalId === externalId);
    if (!station) return null;

    return Promise.resolve({
      ...station,
      phone: '(555) 123-4567',
      openTime: '24小时营业',
      photos: [],
    });
  }

  async getPrice(externalId: string): Promise<Station['prices'] | null> {
    const station = this.stations.find(s => s.externalId === externalId);
    return station ? Promise.resolve(station.prices) : null;
  }

  private calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // 地球半径（米）
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

/**
 * 默认 Mock 数据（当 JSON 文件加载失败时使用）
 */
function getDefaultMockStations(): Station[] {
  return [
    // 中国 Mock 数据
    {
      externalId: 'mock_cn_001',
      source: 'mock',
      name: '中石化人民路站',
      brand: '中石化',
      lat: 29.5647,
      lng: 106.5507,
      address: '重庆市渝中区人民路123号',
      prices: { regular: 7.82, mid: 8.31, premium: 9.05, diesel: 7.52 },
      rating: 4.8,
    },
    {
      externalId: 'mock_cn_002',
      source: 'mock',
      name: '壳牌解放路站',
      brand: '壳牌',
      lat: 29.5589,
      lng: 106.5572,
      address: '重庆市渝中区解放路456号',
      prices: { regular: 7.91, mid: 8.45, premium: 9.12, diesel: 7.60 },
      rating: 4.5,
    },
    // 加拿大 Mock 数据
    {
      externalId: 'mock_ca_001',
      source: 'mock',
      name: 'Shell Yonge St',
      brand: 'Shell',
      lat: 43.6532,
      lng: -79.3832,
      address: '123 Yonge St, Toronto, ON',
      prices: { regular: 1.52, mid: 1.65, premium: 1.78, diesel: 1.45 },
      rating: 4.5,
    },
    {
      externalId: 'mock_ca_002',
      source: 'mock',
      name: 'Petro-Canada Bay St',
      brand: 'Petro-Canada',
      lat: 43.6629,
      lng: -79.3957,
      address: '456 Bay St, Toronto, ON',
      prices: { regular: 1.58, mid: 1.72, premium: 1.85, diesel: 1.50 },
      rating: 4.2,
    },
    {
      externalId: 'mock_ca_003',
      source: 'mock',
      name: 'Esso Dundas W',
      brand: 'Esso',
      lat: 43.6452,
      lng: -79.4225,
      address: '789 Dundas St W, Toronto, ON',
      prices: { regular: 1.65, mid: 1.78, premium: 1.92, diesel: 1.55 },
      rating: 4.0,
    },
  ];
}
