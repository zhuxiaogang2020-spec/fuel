<template>
  <view id="app">
    <router-view />
  </view>
</template>

<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app';
import { useUserStore } from '@/store/index';
import { BASE_URL } from '@/utils/request';

const userStore = useUserStore();

onLaunch(async () => {
  console.log('[App] Launch');

  // 尝试从本地缓存恢复登录状态
  const openid = uni.getStorageSync('fuel2_openid');
  if (openid) {
    userStore.openid = openid;
    // 获取用户信息
    try {
      const res = await uni.request({
        url: `${BASE_URL}/auth/userinfo`,
        method: 'GET',
        data: { openid },
      });
      if (res.statusCode === 200 && res.data?.success) {
        userStore.setUser({
          userId: res.data.user?.id,
          nickname: res.data.user?.nickname,
          avatarUrl: res.data.user?.avatar_url,
          country: res.data.user?.country || 'CN',
        });
      }
    } catch (error) {
      console.error('[App] 获取用户信息失败:', error);
    }
  }
});

onShow(() => {
  console.log('[App] Show');
});
</script>

<style lang="scss">
/* stylelint-disable-next-line import-notation */
@import './uni.scss';

/* 全局样式 — page 在 app.wxss 中允许使用标签选择器 */
page {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--font-size-base);
  -webkit-font-smoothing: antialiased;
}

/* 卡片基础样式 */
.card {
  background: var(--color-card);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

/* 主按钮 */
.btn-primary {
  background: var(--btn-primary-bg);
  color: white;
  border: none;
  border-radius: var(--btn-radius);
  padding: 24rpx 48rpx;
  font-size: var(--font-size-lg);
  font-weight: 600;
  text-align: center;
  transition: transform 0.2s ease;
  line-height: 1.5;
}
.btn-primary:active {
  transform: scale(0.96);
}

/* 危险按钮 */
.btn-danger {
  background: var(--btn-danger-bg);
  color: white;
  border: none;
  border-radius: var(--btn-radius);
  padding: 24rpx 48rpx;
  font-size: var(--font-size-lg);
  font-weight: 600;
}

/* 输入框 */
.input-field {
  background: var(--color-bg);
  border: 2rpx solid transparent;
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  font-size: var(--font-size-lg);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  width: 100%;
  box-sizing: border-box;
}
.input-field:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4rpx rgba(255, 107, 53, 0.15);
  outline: none;
}

/* 价格高亮 */
.price-highlight {
  color: var(--color-warning);
  font-weight: 700;
  font-size: var(--font-size-xl);
}

/* 最低价标签 */
.cheapest-tag {
  background: var(--color-success);
  color: white;
  font-size: var(--font-size-xs);
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  font-weight: 600;
}

/* 安全区适配 */
.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
