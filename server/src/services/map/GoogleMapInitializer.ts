/**
 * Google Maps 初始化管理器
 *
 * 统一封装 Google Maps API 的初始化逻辑：
 * - API Key 校验
 * - HTTP 请求头/超时配置
 * - 基础 URL 管理
 * - 各子适配器共享的 axios 实例
 */
import axios, { AxiosInstance } from 'axios';
import { MapConfig } from './types';
import config from '../../config/index';

export class GoogleMapInitializer {
  /** 共享的 HTTP 客户端实例 */
  private static httpInstance: AxiosInstance | null = null;

  /** 当前初始化配置 */
  private static currentConfig: MapConfig | null = null;

  /** 初始化状态 */
  private static initialized = false;

  /**
   * 初始化 Google Maps HTTP 客户端
   * @param customConfig 可选的局部配置（不传则使用全局 config）
   */
  static init(customConfig?: Partial<MapConfig>): void {
    const merged: MapConfig = {
      apiKey: customConfig?.apiKey || config.googleMaps.key || '',
      language: customConfig?.language || 'en',
      region: customConfig?.region || 'ca',
      timeout: customConfig?.timeout || 10000,
    };

    if (!merged.apiKey) {
      throw new Error(
        '[GoogleMapInitializer] Google Maps API Key 未配置。' +
        '请在 .env 中设置 GOOGLE_MAPS_KEY'
      );
    }

    GoogleMapInitializer.httpInstance = axios.create({
      timeout: merged.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': merged.apiKey,
      },
    });

    GoogleMapInitializer.currentConfig = merged;
    GoogleMapInitializer.initialized = true;

    console.log(
      `[GoogleMapInitializer] 已初始化 (language=${merged.language}, region=${merged.region})`
    );
  }

  /** 获取共享 HTTP 客户端 */
  static getHttp(): AxiosInstance {
    if (!GoogleMapInitializer.httpInstance) {
      GoogleMapInitializer.init();
    }
    return GoogleMapInitializer.httpInstance!;
  }

  /** 获取当前配置 */
  static getConfig(): MapConfig {
    if (!GoogleMapInitializer.currentConfig) {
      GoogleMapInitializer.init();
    }
    return GoogleMapInitializer.currentConfig!;
  }

  /** 获取 API Key */
  static getApiKey(): string {
    return GoogleMapInitializer.getConfig().apiKey;
  }

  /** 是否已初始化 */
  static isInitialized(): boolean {
    return GoogleMapInitializer.initialized;
  }

  /** 重置（用于测试或重新配置） */
  static reset(): void {
    GoogleMapInitializer.httpInstance = null;
    GoogleMapInitializer.currentConfig = null;
    GoogleMapInitializer.initialized = false;
  }
}

export default GoogleMapInitializer;
