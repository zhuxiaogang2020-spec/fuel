/**
 * MapAdapterFactory — 地图适配器工厂
 *
 * 设计模式：工厂模式 + 单例模式 + 策略模式
 *
 * 核心职责：
 * 1. 适配器注册 — register() 允许动态注册新适配器类型
 * 2. 适配器创建 — create() / getOrCreate() 根据类型参数实例化适配器
 * 3. 适配器获取 — get() 获取已创建的适配器实例
 * 4. 生命周期管理 — destroy() 销毁某个 / destroyAll() 销毁全部
 * 5. 链式初始化 — initAll() 一键初始化所有已注册适配器
 *
 * 使用示例：
 * ```typescript
 * import { MapAdapterFactory } from './services/map';
 *
 * const factory = MapAdapterFactory.getInstance();
 *
 * // 获取或创建 Marker 适配器
 * const markers = factory.getOrCreate(MapAdapterType.MARKER, GoogleMarkerAdapter, {
 *   apiKey: 'YOUR_KEY',
 * });
 *
 * // 使用
 * const result = markers.createMarker({ id: '1', position: { lat: 43.6, lng: -79.4 } });
 *
 * // 清理
 * factory.destroyAll();
 * ```
 */
import { IMapAdapter } from './IMapAdapter';
import { MapAdapterType, MapConfig } from './types';
import { GoogleMarkerAdapter } from './adapters/GoogleMarkerAdapter';
import { GoogleRouteAdapter } from './adapters/GoogleRouteAdapter';
import { GoogleLayerAdapter } from './adapters/GoogleLayerAdapter';

/** 适配器构造函数类型 */
type AdapterConstructor<T extends IMapAdapter = IMapAdapter> = new () => T;

/** 适配器注册项 */
interface AdapterRegistryEntry {
  type: MapAdapterType;
  ctor: AdapterConstructor;
  instance: IMapAdapter | null;
}

export class MapAdapterFactory {
  private static instance: MapAdapterFactory | null = null;

  /**
   * 适配器注册表
   * key = MapAdapterType.enum value
   */
  private registry = new Map<string, AdapterRegistryEntry>();

  /**
   * 全局配置（用于 initAll 时传递给所有适配器）
   */
  private globalConfig: MapConfig | null = null;

  private constructor() {}

  // ═══════════════════════════════════════════════
  //  单例
  // ═══════════════════════════════════════════════

  /**
   * 获取工厂单例
   */
  static getInstance(): MapAdapterFactory {
    if (!MapAdapterFactory.instance) {
      MapAdapterFactory.instance = new MapAdapterFactory();
    }
    return MapAdapterFactory.instance;
  }

  /**
   * 重置单例（仅用于测试）
   */
  static resetInstance(): void {
    if (MapAdapterFactory.instance) {
      MapAdapterFactory.instance.destroyAll();
      MapAdapterFactory.instance = null;
    }
  }

  // ═══════════════════════════════════════════════
  //  注册机制
  // ═══════════════════════════════════════════════

  /**
   * 注册适配器类型
   *
   * @param type 适配器类型枚举值
   * @param ctor 适配器构造函数
   * @throws 重复注册同一类型时抛出异常
   *
   * 扩展新适配器只需：
   * ```typescript
   * factory.register(MapAdapterType.CUSTOM, MyCustomAdapter);
   * ```
   */
  register<T extends IMapAdapter>(
    type: MapAdapterType,
    ctor: AdapterConstructor<T>
  ): void {
    if (this.registry.has(type)) {
      throw new Error(
        `[MapAdapterFactory] 适配器类型 "${type}" 已注册，请先调用 deregister()`
      );
    }

    this.registry.set(type, {
      type,
      ctor,
      instance: null,
    });

    console.log(`[MapAdapterFactory] 已注册适配器: ${type}`);
  }

  /**
   * 批量注册多个适配器
   */
  registerAll(entries: Array<{ type: MapAdapterType; ctor: AdapterConstructor }>): void {
    for (const { type, ctor } of entries) {
      this.register(type, ctor);
    }
  }

  /**
   * 取消注册
   *
   * 如果该类型已有实例，会先销毁实例再移除注册项。
   */
  deregister(type: MapAdapterType): boolean {
    const entry = this.registry.get(type);
    if (!entry) return false;

    if (entry.instance) {
      entry.instance.destroy();
    }

    this.registry.delete(type);
    console.log(`[MapAdapterFactory] 已取消注册: ${type}`);
    return true;
  }

  /**
   * 检查是否已注册
   */
  isRegistered(type: MapAdapterType): boolean {
    return this.registry.has(type);
  }

  /**
   * 获取所有已注册的适配器类型
   */
  getRegisteredTypes(): MapAdapterType[] {
    return Array.from(this.registry.values()).map((e) => e.type);
  }

  // ═══════════════════════════════════════════════
  //  创建 / 获取
  // ═══════════════════════════════════════════════

  /**
   * 创建新实例（不检查是否已存在，强制新建）
   *
   * @param type 适配器类型
   * @param ctor 构造函数（若已注册可省略）
   * @param config 初始化配置
   */
  async create<T extends IMapAdapter>(
    type: MapAdapterType,
    ctor: AdapterConstructor<T>,
    config: MapConfig
  ): Promise<T> {
    // 若该类型已注册但构造函数不同，以传入的为准
    if (!this.registry.has(type)) {
      this.register(type, ctor);
    }

    const entry = this.registry.get(type)!;
    const adapter = new entry.ctor() as T;
    await adapter.initialize(config);
    entry.instance = adapter;

    console.log(`[MapAdapterFactory] 已创建适配器实例: ${type}`);
    return adapter;
  }

  /**
   * 获取或创建适配器实例
   *
   * - 已存在实例且未销毁 → 直接返回
   * - 不存在或已销毁 → 创建新实例
   *
   * @param type 适配器类型
   * @param ctor 构造函数（首次创建时必须提供，后续可省略）
   * @param config 初始化配置（首次创建时必须提供，后续可省略）
   */
  async getOrCreate<T extends IMapAdapter>(
    type: MapAdapterType,
    ctor?: AdapterConstructor<T>,
    config?: MapConfig
  ): Promise<T> {
    const entry = this.registry.get(type);

    // 已有可用实例
    if (entry && entry.instance && entry.instance.isInitialized()) {
      return entry.instance as T;
    }

    // 需要创建
    const resolvedCtor = ctor || (entry?.ctor as AdapterConstructor<T> | undefined);
    if (!resolvedCtor) {
      throw new Error(
        `[MapAdapterFactory] 无法创建 "${type}"：未提供构造函数且该类型未注册`
      );
    }

    const resolvedConfig = config || this.globalConfig;
    if (!resolvedConfig) {
      throw new Error(
        `[MapAdapterFactory] 无法创建 "${type}"：未提供配置且未设置全局配置`
      );
    }

    return this.create(type, resolvedCtor, resolvedConfig);
  }

  /**
   * 按类型获取现有实例（不创建）
   */
  get<T extends IMapAdapter = IMapAdapter>(type: MapAdapterType): T | null {
    const entry = this.registry.get(type);
    if (!entry || !entry.instance) return null;
    return entry.instance as T;
  }

  /**
   * 获取所有已创建的适配器实例
   */
  getAllInstances(): IMapAdapter[] {
    const result: IMapAdapter[] = [];
    for (const entry of this.registry.values()) {
      if (entry.instance) {
        result.push(entry.instance);
      }
    }
    return result;
  }

  // ═══════════════════════════════════════════════
  //  全局配置
  // ═══════════════════════════════════════════════

  /**
   * 设置全局配置（所有适配器共享）
   */
  setGlobalConfig(config: MapConfig): void {
    this.globalConfig = config;
  }

  /**
   * 获取全局配置
   */
  getGlobalConfig(): MapConfig | null {
    return this.globalConfig;
  }

  // ═══════════════════════════════════════════════
  //  生命周期
  // ═══════════════════════════════════════════════

  /**
   * 销毁指定适配器实例
   */
  destroy(type: MapAdapterType): boolean {
    const entry = this.registry.get(type);
    if (!entry || !entry.instance) return false;

    entry.instance.destroy();
    entry.instance = null;
    console.log(`[MapAdapterFactory] 已销毁适配器实例: ${type}`);
    return true;
  }

  /**
   * 销毁所有适配器实例（注册项保留）
   */
  destroyAll(): void {
    let count = 0;
    for (const entry of this.registry.values()) {
      if (entry.instance) {
        entry.instance.destroy();
        entry.instance = null;
        count++;
      }
    }
    if (count > 0) {
      console.log(`[MapAdapterFactory] 已销毁 ${count} 个适配器实例`);
    }
  }

  /**
   * 完全重置：销毁所有实例 + 清空注册表 + 清空全局配置
   */
  reset(): void {
    this.destroyAll();
    this.registry.clear();
    this.globalConfig = null;
    console.log('[MapAdapterFactory] 工厂已完全重置');
  }

  // ═══════════════════════════════════════════════
  //  便捷方法
  // ═══════════════════════════════════════════════

  /**
   * 一键初始化：注册默认适配器 + 设置全局配置 + 创建全部实例
   *
   * 适用于应用启动时的标准初始化流程。
   */
  async initAll(config: MapConfig): Promise<{
    marker: GoogleMarkerAdapter;
    route: GoogleRouteAdapter;
    layer: GoogleLayerAdapter;
  }> {
    this.setGlobalConfig(config);

    // 注册内置适配器
    this.register(MapAdapterType.MARKER, GoogleMarkerAdapter);
    this.register(MapAdapterType.ROUTE, GoogleRouteAdapter);
    this.register(MapAdapterType.LAYER, GoogleLayerAdapter);

    // 并行创建所有实例
    const [marker, route, layer] = await Promise.all([
      this.create(MapAdapterType.MARKER, GoogleMarkerAdapter, config),
      this.create(MapAdapterType.ROUTE, GoogleRouteAdapter, config),
      this.create(MapAdapterType.LAYER, GoogleLayerAdapter, config),
    ]);

    console.log('[MapAdapterFactory] 所有适配器已就绪');
    return { marker, route, layer };
  }
}
