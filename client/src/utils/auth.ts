
import { post } from './request';

const STORAGE_KEY_OPENID = 'fuel2_openid';
const STORAGE_KEY_USER = 'fuel2_user';

/**
 * 微信登录
 * 获取 code，调用后端换取 openid
 */
export async function wechatLogin(): Promise<{ openid: string; userId: number }> {
  try {
    // 检查本地是否有缓存的 openid
    const cachedOpenId = uni.getStorageSync(STORAGE_KEY_OPENID);
    if (cachedOpenId) {
      console.log('[Auth] 使用缓存 openid:', cachedOpenId);
      return { openid: cachedOpenId, userId: 0 };
    }

    // 获取 login code
    const loginRes = await uni.login({ provider: 'weixin' });

    if (!loginRes || !loginRes.code) {
      throw new Error('获取登录凭证失败');
    }

    const code = loginRes.code;
    console.log('[Auth] 微信登录 code:', code.substring(0, 10) + '...');

    // 调用后端登录接口
    const res = await post<{ openid: string; userId: number; user?: any }>(
      '/auth/login',
      { code }
    );

    console.log('[Auth] 登录成功, openid:', res.openid);

    // 缓存 openid
    uni.setStorageSync(STORAGE_KEY_OPENID, res.openid);
    uni.setStorageSync(STORAGE_KEY_USER, res.user || {});

    return { openid: res.openid, userId: res.userId };
  } catch (error: any) {
    console.error('[Auth] 微信登录错误:', error.message);
    // 开发模式下不阻塞页面加载
    // throw error;  // 注释掉，允许未登录状态继续使用
    return { openid: '', userId: 0 };
  }
}

/**
 * 获取缓存的 openid
 */
export function getOpenId(): string | null {
  return uni.getStorageSync(STORAGE_KEY_OPENID) || null;
}

/**
 * 清除登录状态
 */
export function logout(): void {
  uni.removeStorageSync(STORAGE_KEY_OPENID);
  uni.removeStorageSync(STORAGE_KEY_USER);
}

/**
 * 强制重新登录（清除缓存后重新获取 code）
 */
export async function forceReLogin(): Promise<{ openid: string; userId: number }> {
  uni.removeStorageSync(STORAGE_KEY_OPENID);
  uni.removeStorageSync(STORAGE_KEY_USER);
  return wechatLogin();
}

/**
 * 检查是否已登录
 */
export function isLoggedIn(): boolean {
  return !!getOpenId();
}
