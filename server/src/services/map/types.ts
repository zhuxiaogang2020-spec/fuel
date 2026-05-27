/**
 * Map 适配器共享类型定义
 *
 * 用于 Google Maps API 集成的 AdapterFactory 设计模式
 */

// ─── 适配器类型枚举 ──────────────────────────────
export enum MapAdapterType {
  MARKER = 'marker',
  ROUTE = 'route',
  LAYER = 'layer',
}

// ─── 地图配置 ────────────────────────────────────
export interface MapConfig {
  /** Google Maps API Key */
  apiKey: string;
  /** 默认语言（如 zh-CN, en） */
  language?: string;
  /** 默认区域（如 cn, ca） */
  region?: string;
  /** 请求超时（毫秒） */
  timeout?: number;
}

// ─── Marker 相关 ────────────────────────────────
export interface MarkerLocation {
  lat: number;
  lng: number;
}

export interface MarkerIcon {
  /** 图标 URL */
  url: string;
  /** 缩放后的宽度（px） */
  scaledWidth?: number;
  /** 缩放后的高度（px） */
  scaledHeight?: number;
  /** 锚点 X */
  anchorX?: number;
  /** 锚点 Y */
  anchorY?: number;
}

export interface MarkerOptions {
  /** 唯一标识 */
  id: string;
  /** 经纬度 */
  position: MarkerLocation;
  /** 标记标题 */
  title?: string;
  /** 信息窗内容片段 (HTML) */
  snippet?: string;
  /** 自定义图标 */
  icon?: MarkerIcon;
  /** 是否可拖拽 */
  draggable?: boolean;
  /** Z 轴层级 */
  zIndex?: number;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

export interface MarkerClusterOptions {
  /** 聚合的标记列表 */
  markers: MarkerOptions[];
  /** 聚合算法：grid | distance */
  algorithm?: 'grid' | 'distance';
  /** 聚合网格大小（米），algorithm=grid 时有效 */
  gridSize?: number;
  /** 聚合距离阈值（米），algorithm=distance 时有效 */
  maxDistance?: number;
}

export interface MarkerCluster {
  /** 聚合中心 */
  center: MarkerLocation;
  /** 聚合内的标记数量 */
  count: number;
  /** 聚合内标记 ID 列表 */
  markerIds: string[];
  /** 最小边界 */
  bounds?: {
    southwest: MarkerLocation;
    northeast: MarkerLocation;
  };
}

// ─── Route 相关 ──────────────────────────────────

/** 出行方式 */
export type TravelMode = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';

/** 路线偏好 */
export type RoutePreference =
  | 'RECOMMENDED'   // 推荐
  | 'SHORTEST'      // 最短
  | 'FASTEST';      // 最快

/** 途经点 */
export interface Waypoint {
  /** 途经点位置 */
  location: MarkerLocation;
  /** 是否为必经点 */
  isVia?: boolean;
}

export interface RouteRequest {
  /** 起点 */
  origin: MarkerLocation;
  /** 终点 */
  destination: MarkerLocation;
  /** 途经点（最多 25 个） */
  waypoints?: Waypoint[];
  /** 出行方式 */
  travelMode?: TravelMode;
  /** 路线偏好 */
  routePreference?: RoutePreference;
  /** 是否避开收费站 */
  avoidTolls?: boolean;
  /** 是否避开高速 */
  avoidHighways?: boolean;
  /** 出发时间（timestamp，用于预估到达时间） */
  departureTime?: number;
}

export interface RouteStep {
  /** 步骤距离（米） */
  distance: number;
  /** 步骤耗时（秒） */
  duration: number;
  /** HTML 指令文本 */
  instruction: string;
  /** 起点 */
  startLocation: MarkerLocation;
  /** 终点 */
  endLocation: MarkerLocation;
  /** 出行方式 */
  travelMode: string;
  /** 折线编码（简化路径点） */
  polyline?: string;
}

export interface RouteResult {
  /** 路线总距离（米） */
  totalDistance: number;
  /** 路线总耗时（秒） */
  totalDuration: number;
  /** 路线步骤 */
  steps: RouteStep[];
  /** 概览折线（完整路径） */
  overviewPolyline: string;
  /** 起点实际地址 */
  originAddress: string;
  /** 终点实际地址 */
  destinationAddress: string;
  /** 途经点顺序索引 */
  waypointOrder?: number[];
  /** 预估收费金额（本地货币） */
  tollCost?: number;
  /** 路线摘要 */
  summary: string;
}

// ─── Layer 相关 ──────────────────────────────────

/** 图层类型 */
export type LayerType = 'heatmap' | 'geojson' | 'traffic' | 'transit' | 'bicycling';

export interface LayerOptions {
  /** 图层唯一标识 */
  id: string;
  /** 图层类型 */
  type: LayerType;
  /** 图层透明度 0-1 */
  opacity?: number;
  /** 是否可见 */
  visible?: boolean;
  /** Z 轴层级 */
  zIndex?: number;
}

export interface HeatmapPoint {
  location: MarkerLocation;
  /** 权重（影响热力半径/强度） */
  weight?: number;
}

export interface HeatmapLayerOptions extends LayerOptions {
  type: 'heatmap';
  /** 热力点数据 */
  points: HeatmapPoint[];
  /** 热力半径（米） */
  radius?: number;
  /** 颜色渐变 [start, mid, end]，如 ['#00ff00', '#ffff00', '#ff0000'] */
  gradient?: string[];
  /** 最大强度 */
  maxIntensity?: number;
}

export interface GeoJsonLayerOptions extends LayerOptions {
  type: 'geojson';
  /** GeoJSON 数据（已序列化为字符串） */
  geojson: string;
  /** 填充颜色 */
  fillColor?: string;
  /** 填充透明度 */
  fillOpacity?: number;
  /** 描边颜色 */
  strokeColor?: string;
  /** 描边宽度 */
  strokeWeight?: number;
}

export interface TrafficLayerOptions extends LayerOptions {
  type: 'traffic';
  /** 是否显示实时路况 */
  realtime?: boolean;
}

export interface TransitLayerOptions extends LayerOptions {
  type: 'transit';
}

export interface BicyclingLayerOptions extends LayerOptions {
  type: 'bicycling';
}

/** 图层选项联合类型 */
export type AnyLayerOptions =
  | HeatmapLayerOptions
  | GeoJsonLayerOptions
  | TrafficLayerOptions
  | TransitLayerOptions
  | BicyclingLayerOptions;
