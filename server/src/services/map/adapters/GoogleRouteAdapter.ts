/**
 * Google Route 适配器
 *
 * 负责路线相关操作：
 * - Directions API 调用（路线规划）
 * - 路线格式化/解析
 * - 途经点管理
 * - 多种出行方式支持
 */
import axios from 'axios';
import { IMapAdapter } from '../IMapAdapter';
import GoogleMapInitializer from '../GoogleMapInitializer';
import {
  MapAdapterType,
  MapConfig,
  RouteRequest,
  RouteResult,
  RouteStep,
  TravelMode,
  RoutePreference,
} from '../types';

export class GoogleRouteAdapter implements IMapAdapter {
  readonly adapterType = MapAdapterType.ROUTE;

  private config: MapConfig | null = null;
  private initialized = false;

  /** Directions API base URL */
  private readonly directionsUrl = 'https://maps.googleapis.com/maps/api/directions/json';

  // ─── IMapAdapter 实现 ──────────────────────────

  async initialize(config: MapConfig): Promise<void> {
    this.config = config;
    GoogleMapInitializer.init(config);
    this.initialized = true;
    console.log('[GoogleRouteAdapter] 已初始化');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  destroy(): void {
    this.config = null;
    this.initialized = false;
    console.log('[GoogleRouteAdapter] 已销毁');
  }

  // ─── 路线规划 ──────────────────────────────────

  /**
   * 计算路线
   *
   * 调用 Google Directions API，支持 Driving / Walking / Bicycling / Transit
   */
  async calculateRoute(request: RouteRequest): Promise<RouteResult> {
    this.ensureInit();

    const params: Record<string, any> = {
      origin: `${request.origin.lat},${request.origin.lng}`,
      destination: `${request.destination.lat},${request.destination.lng}`,
      key: GoogleMapInitializer.getApiKey(),
      language: this.config?.language || 'en',
      region: this.config?.region || 'ca',
      mode: (request.travelMode || 'DRIVING').toLowerCase(),
      alternatives: 'false',
    };

    // 途经点
    if (request.waypoints && request.waypoints.length > 0) {
      const wp = request.waypoints
        .map((w) => {
          const loc = `${w.location.lat},${w.location.lng}`;
          return w.isVia ? `via:${loc}` : loc;
        })
        .join('|');
      params.waypoints = `optimize:true|${wp}`;
    }

    // 路线偏好 → avoid 参数
    if (request.avoidTolls) params.avoid = params.avoid ? `${params.avoid}|tolls` : 'tolls';
    if (request.avoidHighways) params.avoid = params.avoid ? `${params.avoid}|highways` : 'highways';

    // 出发时间 → traffic_model
    if (request.departureTime) {
      params.departure_time = Math.floor(request.departureTime / 1000);
      params.traffic_model = this.mapRoutePreference(request.routePreference || 'RECOMMENDED');
    }

    try {
      const response = await axios.get(this.directionsUrl, {
        params,
        timeout: this.config?.timeout || 10000,
      });

      const data = response.data;

      if (data.status !== 'OK') {
        throw new Error(`Directions API 返回异常状态: ${data.status} - ${data.error_message || ''}`);
      }

      return this.parseDirectionsResponse(data);
    } catch (error: any) {
      console.error('[GoogleRouteAdapter] 路线计算失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取路线距离矩阵（仅距离/时间，不含路线步骤）
   *
   * 使用场景：多点间距离快速评估（不做完整路线规划）
   */
  async getDistanceMatrix(
    origins: { lat: number; lng: number }[],
    destinations: { lat: number; lng: number }[]
  ): Promise<{
    distances: number[][]; // 米
    durations: number[][]; // 秒
  }> {
    this.ensureInit();

    const originStr = origins.map((o) => `${o.lat},${o.lng}`).join('|');
    const destStr = destinations.map((d) => `${d.lat},${d.lng}`).join('|');

    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/distancematrix/json',
      {
        params: {
          origins: originStr,
          destinations: destStr,
          key: GoogleMapInitializer.getApiKey(),
          mode: 'driving',
          language: this.config?.language || 'en',
          region: this.config?.region || 'ca',
        },
        timeout: this.config?.timeout || 10000,
      }
    );

    const data = response.data;
    if (data.status !== 'OK') {
      throw new Error(`Distance Matrix API 异常: ${data.status}`);
    }

    const distances: number[][] = [];
    const durations: number[][] = [];

    for (const row of data.rows) {
      const dRow: number[] = [];
      const durRow: number[] = [];
      for (const el of row.elements) {
        dRow.push(el.status === 'OK' ? el.distance.value : -1);
        durRow.push(el.status === 'OK' ? el.duration.value : -1);
      }
      distances.push(dRow);
      durations.push(durRow);
    }

    return { distances, durations };
  }

  /**
   * 简化路线 → 仅返回折线编码 + 距离/时间摘要
   *
   * 适用于前端只需要绘制路线而无需步骤详情的场景
   */
  async getSimplifiedRoute(request: RouteRequest): Promise<{
    polyline: string;
    distance: number;
    duration: number;
    originAddress: string;
    destinationAddress: string;
  }> {
    const full = await this.calculateRoute(request);
    return {
      polyline: full.overviewPolyline,
      distance: full.totalDistance,
      duration: full.totalDuration,
      originAddress: full.originAddress,
      destinationAddress: full.destinationAddress,
    };
  }

  // ─── 路线格式化 ──────────────────────────────

  /**
   * 格式化路线为人类可读摘要
   */
  formatRouteSummary(result: RouteResult): string {
    const distanceKm = (result.totalDistance / 1000).toFixed(1);
    const durationMin = Math.round(result.totalDuration / 60);

    if (durationMin < 60) {
      return `${distanceKm} km, 约 ${durationMin} 分钟`;
    }
    const hours = Math.floor(durationMin / 60);
    const mins = durationMin % 60;
    return `${distanceKm} km, 约 ${hours} 小时 ${mins} 分钟`;
  }

  /**
   * 格式化距离（米 → 可读字符串）
   */
  formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  /**
   * 格式化时长（秒 → 可读字符串）
   */
  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds} 秒`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`;
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h} 小时 ${m} 分钟`;
  }

  // ─── 私有方法 ──────────────────────────────────

  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error('[GoogleRouteAdapter] 适配器未初始化，请先调用 initialize()');
    }
  }

  private parseDirectionsResponse(data: any): RouteResult {
    const route = data.routes[0];
    const leg = route.legs[0];

    const steps: RouteStep[] = route.legs.flatMap((lg: any) =>
      lg.steps.map((s: any) => ({
        distance: s.distance?.value || 0,
        duration: s.duration?.value || 0,
        instruction: this.stripHtml(s.html_instructions || ''),
        startLocation: {
          lat: s.start_location.lat,
          lng: s.start_location.lng,
        },
        endLocation: {
          lat: s.end_location.lat,
          lng: s.end_location.lng,
        },
        travelMode: s.travel_mode || 'DRIVING',
        polyline: s.polyline?.points || '',
      }))
    );

    return {
      totalDistance: route.legs.reduce((sum: number, lg: any) => sum + (lg.distance?.value || 0), 0),
      totalDuration: route.legs.reduce((sum: number, lg: any) => sum + (lg.duration?.value || 0), 0),
      steps,
      overviewPolyline: route.overview_polyline?.points || '',
      originAddress: leg.start_address || '',
      destinationAddress: leg.end_address || '',
      waypointOrder: route.waypoint_order || [],
      summary: route.summary || '',
    };
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  }

  private mapRoutePreference(pref: RoutePreference): string {
    switch (pref) {
      case 'FASTEST':
        return 'best_guess';
      case 'SHORTEST':
        return 'pessimistic';
      case 'RECOMMENDED':
      default:
        return 'best_guess';
    }
  }
}
