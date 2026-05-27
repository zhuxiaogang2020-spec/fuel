/**
 * Map 适配器模块统一导出
 *
 * 使用方式：
 * ```typescript
 * import { MapAdapterFactory, MapAdapterType, GoogleMarkerAdapter } from './services/map';
 * ```
 */
// 工厂
export { MapAdapterFactory } from './MapAdapterFactory';

// 初始化器
export { GoogleMapInitializer } from './GoogleMapInitializer';

// 接口
export { IMapAdapter } from './IMapAdapter';

// 适配器实现
export { GoogleMarkerAdapter } from './adapters/GoogleMarkerAdapter';
export { GoogleRouteAdapter } from './adapters/GoogleRouteAdapter';
export { GoogleLayerAdapter } from './adapters/GoogleLayerAdapter';

// 类型（按需导入）
export type {
  MapConfig,
  MarkerOptions,
  MarkerLocation,
  MarkerIcon,
  MarkerClusterOptions,
  MarkerCluster,
  RouteRequest,
  RouteResult,
  RouteStep,
  Waypoint,
  TravelMode,
  RoutePreference,
  HeatmapPoint,
  HeatmapLayerOptions,
  GeoJsonLayerOptions,
  TrafficLayerOptions,
  TransitLayerOptions,
  BicyclingLayerOptions,
  AnyLayerOptions,
  LayerType,
} from './types';

export { MapAdapterType } from './types';
