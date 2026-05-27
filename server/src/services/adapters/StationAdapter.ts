/**
 * 加油站数据源适配器接口
 * 所有数据源（腾讯地图、Google Maps、Mock）必须实现此接口
 */
export interface Station {
  externalId: string;
  source: 'tencent' | 'google' | 'mock';
  name: string;
  brand: string;
  lat: number;
  lng: number;
  address: string;
  prices: {
    regular?: number;  // 92# / Regular(87)
    mid?: number;       // 95# / Mid(89)
    premium?: number;   // 98# / Premium(91)
    diesel?: number;    // 0#柴油
  };
  rating?: number;
  distance?: number;    // 距离（米）
}

export interface StationDetail extends Station {
  phone?: string;
  openTime?: string;
  photos?: string[];
}

export interface IStationAdapter {
  /**
   * 搜索附近加油站
   * @param lat 纬度
   * @param lng 经度
   * @param radius 搜索半径（米）
   * @param grade 油号筛选（可选）
   */
  searchNearby(
    lat: number,
    lng: number,
    radius: number,
    grade?: string
  ): Promise<Station[]>;

  /**
   * 获取加油站详情
   * @param externalId 外部数据源的 ID
   */
  getStationDetail(externalId: string): Promise<StationDetail | null>;

  /**
   * 获取加油站实时油价
   * @param externalId 外部数据源的 ID
   */
  getPrice(externalId: string): Promise<Station['prices'] | null>;
}
