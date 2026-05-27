import { getOpenId } from './auth';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://192.168.8.170:3000/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: any;
  header?: Record<string, string>;
  showLoading?: boolean;
  loadingText?: string;
}

/**
 * 统一请求封装
 * 自动携带 openid，统一错误处理
 */
export async function request<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    data,
    header = {},
    showLoading = false,
    loadingText = '加载中...',
  } = options;

  if (showLoading) {
    uni.showLoading({ title: loadingText, mask: true });
  }

  try {
    // 获取 openid
    const openid = getOpenId();

    const res = await uni.request({
      url: `${BASE_URL}${url}`,
      method: method as any,
      data,
      header: {
        'Content-Type': 'application/json',
        'X-WX-OpenID': openid || '',
        ...header,
      },
    });

    if (showLoading) {
      uni.hideLoading();
    }

    const result = res.data as any;

    if (res.statusCode !== 200) {
      const errorMsg = result?.error || `请求失败(${res.statusCode})`;
      throw new Error(errorMsg);
    }

    if (!result.success && result.error) {
      throw new Error(result.error);
    }

    return result as T;
  } catch (error: any) {
    if (showLoading) {
      uni.hideLoading();
    }

    // uni.request 失败时错误信息在 errMsg 字段，不在 message
    const message = error.message || error.errMsg || '网络错误，请稍后重试';
    console.error('[Request] 请求失败:', message);
    uni.showToast({ title: message, icon: 'none', duration: 2500 });
    throw error;
  }
}

/**
 * GET 请求
 */
export function get<T = any>(url: string, params?: Record<string, any>): Promise<T> {
  const query = params ? '?' + Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&') : '';
  return request<T>(`${url}${query}`, { method: 'GET' });
}

/**
 * POST 请求
 */
export function post<T = any>(url: string, data?: any): Promise<T> {
  return request<T>(url, { method: 'POST', data });
}

/**
 * PUT 请求
 */
export function put<T = any>(url: string, data?: any): Promise<T> {
  return request<T>(url, { method: 'PUT', data });
}

/**
 * DELETE 请求
 */
export function del<T = any>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' });
}
