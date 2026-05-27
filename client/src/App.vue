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
</style>
