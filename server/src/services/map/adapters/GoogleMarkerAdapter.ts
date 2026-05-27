/**
 * Google Marker 适配器
 *
 * 负责标记相关操作：
 * - 创建/格式化标记数据
 * - 自定义图标处理
 * - 标记聚合（聚类）计算
 * - 信息窗口内容生成
 */
import { IMapAdapter } from '../IMapAdapter';
import GoogleMapInitializer from '../GoogleMapInitializer';
import {
  MapAdapterType,
  MapConfig,
  MarkerOptions,
  MarkerClusterOptions,
  MarkerCluster,
  MarkerLocation,
  MarkerIcon,
} from '../types';

export class GoogleMarkerAdapter implements IMapAdapter {
  readonly adapterType = MapAdapterType.MARKER;

  private config: MapConfig | null = null;
  private initialized = false;

  // ─── IMapAdapter 实现 ──────────────────────────

  async initialize(config: MapConfig): Promise<void> {
    this.config = config;
    GoogleMapInitializer.init(config);
    this.initialized = true;
    console.log('[GoogleMarkerAdapter] 已初始化');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  destroy(): void {
    this.config = null;
    this.initialized = false;
    console.log('[GoogleMarkerAdapter] 已销毁');
  }

  // ─── 标记操作 ──────────────────────────────────

  /**
   * 创建单个标记数据
   *
   * 将业务数据格式化为 Google Maps 兼容的标记结构。
   * 客户端的 map 组件可直接消费此数据渲染标记。
   */
  createMarker(options: MarkerOptions): MarkerOptions {
    this.ensureInit();
    return {
      ...options,
      id: options.id || `marker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      zIndex: options.zIndex ?? 0,
    };
  }

  /**
   * 批量创建标记
   */
  createMarkers(markers: MarkerOptions[]): MarkerOptions[] {
    return markers.map((m) => this.createMarker(m));
  }

  /**
   * 生成自定义图标 URL
   *
   * 通过 Google Static Maps API 或 CDN 返回标记图标。
   * 支持动态颜色、大小、标签。
   *
   * @param color 图标颜色（hex）
   * @param label 图标上的文字标签
   * @param size 尺寸（px）
   */
  generateIconUrl(color: string = '#FF0000', label?: string, size: number = 40): string {
    // 使用 Google Charts API 的动态标记图标
    let url = `https://chart.googleapis.com/chart?chst=d_map_pin_letter`;
    if (label && label.length === 1) {
      url += `&chld=${encodeURIComponent(label)}|${color.replace('#', '')}|000000`;
    } else {
      url = `https://chart.googleapis.com/chart?chst=d_map_pin_icon&chld=gas_station|${color.replace('#', '')}`;
    }
    return url;
  }

  /**
   * 标记聚合（聚类）
   *
   * 使用基于网格的聚合算法，将近距离标记合并为聚类点。
   * 适用于大量标记的性能优化场景。
   */
  clusterMarkers(options: MarkerClusterOptions): MarkerCluster[] {
    const { markers, algorithm = 'grid', gridSize = 5000, maxDistance = 1000 } = options;

    if (algorithm === 'grid') {
      return this.clusterByGrid(markers, gridSize);
    }
    return this.clusterByDistance(markers, maxDistance);
  }

  /**
   * 网格聚合算法
   */
  private clusterByGrid(markers: MarkerOptions[], gridSize: number): MarkerCluster[] {
    const clusters = new Map<string, MarkerOptions[]>();

    for (const marker of markers) {
      // 计算网格 key
      const gridLat = Math.floor(marker.position.lat / (gridSize / 111320));
      const gridLng = Math.floor(
        marker.position.lng /
          (gridSize / (111320 * Math.cos((marker.position.lat * Math.PI) / 180)))
      );
      const key = `${gridLat}_${gridLng}`;

      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key)!.push(marker);
    }

    return Array.from(clusters.entries()).map(([, mks]) => ({
      center: {
        lat: mks.reduce((s, m) => s + m.position.lat, 0) / mks.length,
        lng: mks.reduce((s, m) => s + m.position.lng, 0) / mks.length,
      },
      count: mks.length,
      markerIds: mks.map((m) => m.id),
    }));
  }

  /**
   * 距离聚合算法（简易版）
   */
  private clusterByDistance(markers: MarkerOptions[], maxDistance: number): MarkerCluster[] {
    const clustered = new Set<number>();
    const result: MarkerCluster[] = [];

    for (let i = 0; i < markers.length; i++) {
      if (clustered.has(i)) continue;

      const group: MarkerOptions[] = [markers[i]];
      clustered.add(i);

      for (let j = i + 1; j < markers.length; j++) {
        if (clustered.has(j)) continue;
        const dist = this.haversineDistance(
          markers[i].position,
          markers[j].position
        );
        if (dist <= maxDistance) {
          group.push(markers[j]);
          clustered.add(j);
        }
      }

      result.push({
        center: {
          lat: group.reduce((s, m) => s + m.position.lat, 0) / group.length,
          lng: group.reduce((s, m) => s + m.position.lng, 0) / group.length,
        },
        count: group.length,
        markerIds: group.map((m) => m.id),
      });
    }

    return result;
  }

  /**
   * 生成信息窗口 HTML
   *
   * 为标记生成标准化的 info window 内容。
   */
  buildInfoWindowContent(marker: MarkerOptions, extraFields?: Record<string, string>): string {
    const parts: string[] = [];

    if (marker.title) {
      parts.push(`<div style="font-weight:bold;margin-bottom:4px">${this.escapeHtml(marker.title)}</div>`);
    }
    if (marker.snippet) {
      parts.push(`<div style="margin-bottom:4px">${marker.snippet}</div>`);
    }
    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) {
        parts.push(
          `<div style="font-size:12px;color:#666">${this.escapeHtml(key)}: ${this.escapeHtml(value)}</div>`
        );
      }
    }

    return parts.join('');
  }

  /**
   * 检查标记是否在可视区域内
   */
  isInBounds(
    marker: MarkerOptions,
    bounds: { southwest: MarkerLocation; northeast: MarkerLocation }
  ): boolean {
    return (
      marker.position.lat >= bounds.southwest.lat &&
      marker.position.lat <= bounds.northeast.lat &&
      marker.position.lng >= bounds.southwest.lng &&
      marker.position.lng <= bounds.northeast.lng
    );
  }

  /**
   * 筛选可视区域内的标记
   */
  filterInBounds(
    markers: MarkerOptions[],
    bounds: { southwest: MarkerLocation; northeast: MarkerLocation }
  ): MarkerOptions[] {
    return markers.filter((m) => this.isInBounds(m, bounds));
  }

  // ─── 私有工具方法 ─────────────────────────────

  private ensureInit(): void {
    if (!this.initialized) {
      throw new Error('[GoogleMarkerAdapter] 适配器未初始化，请先调用 initialize()');
    }
  }

  private haversineDistance(a: MarkerLocation, b: MarkerLocation): number {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const aa =
      sinLat * sinLat +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        sinLng * sinLng;
    return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (ch) => map[ch] || ch);
  }
}
