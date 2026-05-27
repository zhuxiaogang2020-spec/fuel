/**
 * 地图适配器统一接口
 *
 * 所有 Map 适配器（Marker、Route、Layer 等）必须实现此接口。
 * 泛型 TConfig 允许各适配器定义自己的初始化配置类型。
 */
import { MapAdapterType, MapConfig } from './types';

export interface IMapAdapter {
  /** 适配器类型标识 */
  readonly adapterType: MapAdapterType;

  /**
   * 初始化适配器
   * @param config 地图配置（API Key 等）
   * @throws 初始化失败时抛出异常
   */
  initialize(config: MapConfig): Promise<void>;

  /** 是否已初始化 */
  isInitialized(): boolean;

  /** 销毁适配器，释放资源 */
  destroy(): void;
}
