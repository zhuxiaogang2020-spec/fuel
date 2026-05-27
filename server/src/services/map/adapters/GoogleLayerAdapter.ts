/**
 * Google Layer 适配器
 *
 * 负责图层/叠加层相关操作：
 * - 热力图数据准备
 * - GeoJSON 图层管理
 * - 交通/公交/骑行图层配置
 * - 图层序列化（供前端消费）
 */
import { IMapAdapter } from '../IMapAdapter';
import GoogleMapInitializer from '../GoogleMapInitializer';
import {
  MapAdapterType,
  MapConfig,
  HeatmapPoint,
  HeatmapLayerOptions,
  GeoJsonLayerOptions,
  TrafficLayerOptions,
  TransitLayerOptions,
  BicyclingLayerOptions,
  AnyLayerOptions,
  LayerType,
  MarkerLocation,
} from '../types';

export class GoogleLayerAdapter implements IMapAdapter {
  readonly adapterType = MapAdapterType.LAYER;

  private config: MapConfig | null = null;
  private initialized = false;

  /** 已注册的图层 */
  private layers = new Map<string, AnyLayerOptions>();

  // ─── IMapAdapter 实现 ──────────────────────────

  async initialize(config: MapConfig): Promise<void> {
    this.config = config;
    GoogleMapInitializer.init(config);
    this.initialized = true;
    console.log('[GoogleLayerAdapter] 已初始化');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  destroy(): void {
    this.layers.clear();
    this.config = null;
    this.initialized = false;
    console.log('[GoogleLayerAdapter] 已销毁，所有图层已清除');
  }

  // ─── 热力图图层 ───────────────────────────────

  /**
   * 创建热力图图层
   *
   * 将散点数据格式化为热力图配置，供前端 Google Maps HeatmapLayer 消费。
   */
  createHeatmapLayer(options: Omit<HeatmapLayerOptions, 'id'> & { id?: string }): HeatmapLayerOptions {
    this.ensureInit();
    const id = options.id || `heatmap_${Date.now()}`;
    const layer: HeatmapLayerOptions = {
      id,
      type: 'heatmap',
      visible: options.visible ?? true,
      opacity: options.opacity ?? 0.6,
      zIndex: options.zIndex ?? 0,
      points: options.points,
      radius: options.radius ?? 20,
      gradient: options.gradient ?? [
        'rgba(0, 255, 255, 0)',
        'rgba(0, 255, 255, 1)',
        'rgba(0, 191, 255, 1)',
        'rgba(0, 127, 255, 1)',
        'rgba(0, 63, 255, 1)',
        'rgba(0, 0, 255, 1)',
        'rgba(0, 0, 223, 1)',
        'rgba(0, 0, 191, 1)',
        'rgba(0, 0, 159, 1)',
        'rgba(0, 0, 127, 1)',
        'rgba(63, 0, 91, 1)',
        'rgba(127, 0, 63, 1)',
        'rgba(191, 0, 31, 1)',
        'rgba(255, 0, 0, 1)',
      ],
      maxIntensity: options.maxIntensity,
    };

    this.layers.set(id, layer);
    return layer;
  }

  /**
   * 数据处理 → 将业务数据转为热力图点
   *
   * @param items 业务数据（至少含经纬度）
   * @param latKey 纬度字段名
   * @param lngKey 经度字段名
   * @param weightKey 权重字段名（可选）
   */
  buildHeatmapPoints<T extends Record<string, any>>(
    items: T[],
    latKey: string,
    lngKey: string,
    weightKey?: string
  ): HeatmapPoint[] {
    return items
      .map((item) => ({
        location: {
          lat: Number(item[latKey]),
          lng: Number(item[lngKey]),
        } as MarkerLocation,
        weight: weightKey ? Number(item[weightKey]) || 1 : 1,
      }))
      .filter(
        (p) =>
          !isNaN(p.location.lat) &&
          !isNaN(p.location.lng) &&
          p.location.lat >= -90 &&
          p.location.lat <= 90 &&
          p.location.lng >= -180 &&
          p.location.lng <= 180
      );
  }

  /**
   * 更新热力图数据
   */
  updateHeatmapData(
    layerId: string,
    points: HeatmapPoint[],
    maxIntensity?: number
  ): HeatmapLayerOptions | null {
    const layer = this.layers.get(layerId);
    if (!layer || layer.type !== 'heatmap') {
      console.warn(`[GoogleLayerAdapter] 热力图层 ${layerId} 不存在`);
      return null;
    }

    const updated: HeatmapLayerOptions = {
      ...layer,
      points,
      maxIntensity: maxIntensity ?? layer.maxIntensity,
    };

    this.layers.set(layerId, updated);
    return updated;
  }

  // ─── GeoJSON 图层 ──────────────────────────────

  /**
   * 创建 GeoJSON 图层
   *
   * 用于显示区域边界、自定义多边形等地理数据。
   */
  createGeoJsonLayer(options: Omit<GeoJsonLayerOptions, 'id'> & { id?: string }): GeoJsonLayerOptions {
    this.ensureInit();

    // 验证 JSON 有效性
    try {
      JSON.parse(options.geojson);
    } catch {
      throw new Error('[GoogleLayerAdapter] 无效的 GeoJSON 字符串');
    }

    const id = options.id || `geojson_${Date.now()}`;
    const layer: GeoJsonLayerOptions = {
      id,
      type: 'geojson',
      visible: options.visible ?? true,
      opacity: options.opacity ?? 1,
      zIndex: options.zIndex ?? 1,
      geojson: options.geojson,
      fillColor: options.fillColor ?? '#FF0000',
      fillOpacity: options.fillOpacity ?? 0.35,
      strokeColor: options.strokeColor ?? '#FF0000',
      strokeWeight: options.strokeWeight ?? 2,
    };

    this.layers.set(id, layer);
    return layer;
  }

  /**
   * 从对象动态生成 GeoJSON Feature
   */
  buildGeoJsonFeature(
    coordinates: number[][],
    properties?: Record<string, any>,
    geometryType: 'Polygon' | 'MultiPolygon' = 'Polygon'
  ): string {
    return JSON.stringify({
      type: 'Feature',
      geometry: {
        type: geometryType,
        coordinates: geometryType === 'Polygon' ? [coordinates] : coordinates,
      },
      properties: properties || {},
    });
  }

  /**
   * 构建 GeoJSON FeatureCollection
   */
  buildGeoJsonCollection(features: string[]): string {
    const parsed = features.map((f) => JSON.parse(f));
    return JSON.stringify({
      type: 'FeatureCollection',
      features: parsed,
    });
  }

  // ─── 交通/公交/骑行图层 ──────────────────────

  /**
   * 创建交通路况图层
   */
  createTrafficLayer(options: Omit<TrafficLayerOptions, 'id' | 'type'> & { id?: string }): TrafficLayerOptions {
    this.ensureInit();
    const id = options.id || 'traffic_layer';
    const layer: TrafficLayerOptions = {
      id,
      type: 'traffic',
      visible: options.visible ?? true,
      opacity: options.opacity ?? 1,
      zIndex: options.zIndex ?? 2,
      realtime: options.realtime ?? true,
    };
    this.layers.set(id, layer);
    return layer;
  }

  /**
   * 创建公交线路图层
   */
  createTransitLayer(options: Omit<TransitLayerOptions, 'id' | 'type'> & { id?: string }): TransitLayerOptions {
    this.ensureInit();
    const id = options.id || 'transit_layer';
    const layer: TransitLayerOptions = {
      id,
      type: 'transit',
      visible: options.visible ?? true,
      opacity: options.opacity ?? 1,
      zIndex: options.zIndex ?? 2,
    };
    this.layers.set(id, layer);
    return layer;
  }

  /**
   * 创建骑行道图层
   */
  createBicyclingLayer(options: Omit<BicyclingLayerOptions, 'id' | 'type'> & { id?: string }): BicyclingLayerOptions {
    this.ensureInit();
    const id = options.id || 'bicycling_layer';
    const layer: BicyclingLayerOptions = {
      id,
      type: 'bicycling',
      visible: options.visible ?? true,
      opacity: options.opacity ?? 1,
      zIndex: options.zIndex ?? 2,
    };
    this.layers.set(id, layer);
    return layer;
  }

  // ─── 图层管理 ──────────────────────────────────

  /**
   * 获取图层配置
   */
  getLayer(id: string): AnyLayerOptions | undefined {
    return this.layers.get(id);
  }

  /**
   * 获取所有图层
   */
  getAllLayers(): AnyLayerOptions[] {
    return Array.from(this.layers.values());
  }

  /**
   * 按类型筛选图层
   */
  getLayersByType(type: LayerType): AnyLayerOptions[] {
    return this.getAllLayers().filter((l) => l.type === type);
  }

  /**
   * 移除图层
   */
  removeLayer(id: string): boolean {
    return this.layers.delete(id);
  }

  /**
   * 设置图层可见性
   */
  setLayerVisible(id: string, visible: boolean): boolean {
    const layer = this.layers.get(id);
    if (!layer) return false;
    layer.visible = visible;
    this.layers.set(id, layer);
    return true;
  }

  /**
   * 设置图层透明度
   */
  setLayerOpacity(id: string, opacity: number): boolean {
    if (opacity < 0 || opacity > 1) return false;
    const layer = this.layers.get(id);
    if (!layer) return false;
    layer.opacity = opacity;
    this.layers.set(id, layer);
    return true;
  }

  /**
   * 序列化所有图层配置（供 API 返回给前端）
   */
  serializeLayers(): AnyLayerOptions[] {
    return this.getAllLayers();
  }

  // ─── 私有方法 ──────────────────────────────────

  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error('[GoogleLayerAdapter] 适配器未初始化，请先调用 initialize()');
    }
  }
}
