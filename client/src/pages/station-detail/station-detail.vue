<template>
  <view class="page-container">
    <!-- 顶部信息区 -->
    <view class="header-section" :style="{ background: headerGradient }">
      <view class="station-name">{{ station.name }}</view>
      <view class="station-brand">{{ station.brand }}</view>
      <view class="station-address">
        <text class="icon">📍</text>
        <text>{{ station.address || '地址未知' }}</text>
      </view>
      <view v-if="station.rating" class="station-rating">
        <text class="star">⭐</text>
        <text>{{ station.rating }}</text>
      </view>
    </view>

    <!-- 油价卡片 -->
    <view class="price-cards">
      <view
        v-for="p in priceList"
        :key="p.label"
        class="price-card"
        :class="{ active: selectedGrade === p.grade }"
        @tap="selectedGrade = p.grade"
      >
        <text class="price-label">{{ p.label }}</text>
        <text class="price-value">{{ formatPriceValue(p.price) }}</text>
        <text class="price-unit">{{ priceUnit }}</text>
      </view>
    </view>

    <!-- 操作按钮 -->
    <view class="action-buttons">
      <button class="btn-secondary" @tap="onNavigate">🗺️ 导航</button>
      <button class="btn-primary" @tap="onGoRefuel">⛽ 去加油</button>
    </view>

    <!-- 详细信息 -->
    <view v-if="station.openTime || station.phone" class="info-section card">
      <view v-if="station.openTime" class="info-row">
        <text class="info-label">🕐 营业时间</text>
        <text class="info-value">{{ station.openTime }}</text>
      </view>
      <view v-if="station.phone" class="info-row">
        <text class="info-label">📞 电话</text>
        <text class="info-value" @tap="onCallPhone">{{ station.phone }}</text>
      </view>
    </view>

    <!-- 用户评价（Mock） -->
    <view class="review-section card">
      <view class="section-title">💬 用户评价</view>
      <view v-for="r in mockReviews" :key="r.id" class="review-item">
        <view class="review-header">
          <text class="review-author">{{ r.author }}</text>
          <text class="review-rating">⭐ {{ r.rating }}</text>
        </view>
        <text class="review-content">{{ r.content }}</text>
      </view>
    </view>

    <!-- 底部安全区 -->
    <view class="safe-bottom" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onLoad } from 'vue';
import { onLoad as uniOnLoad } from '@dcloudio/uni-app';
import { get } from '@/utils/request';
import { formatPrice } from '@/utils/unit';
import { useUserStore } from '@/store/index';
import { cleanStationName } from '@/utils/gasbuddy';

const userStore = useUserStore();
const station = ref<any>({});
const selectedGrade = ref('regular');
const country = ref(userStore.country || 'CN');
const currencySymbol = ref(userStore.currencySymbol || '¥');
const priceUnit = ref(userStore.priceUnit || '¥/L');

const headerGradient = computed(() => {
  const brand = (station.value.brand || '').toLowerCase();
  if (brand.includes('shell') || brand.includes('壳牌')) {
    return 'linear-gradient(135deg, #D71921, #8B0000)'; // Shell 红
  }
  if (brand.includes('petro')) {
    return 'linear-gradient(135deg, #FF0000, #CC0000)'; // Petro 红
  }
  if (brand.includes('esso') || brand.includes('exxon')) {
    return 'linear-gradient(135deg, #003399, #001166)'; // Esso 蓝
  }
  return 'linear-gradient(135deg, #FF6B35, #E55A2B)'; // 默认橙红
});

const priceList = computed(() => {
  const prices = station.value.prices || {};
  const isCN = country.value === 'CN';
  return [
    { label: isCN ? '92#' : 'Regular', grade: 'regular', price: prices.regular },
    { label: isCN ? '95#' : 'Mid', grade: 'mid', price: prices.mid },
    { label: isCN ? '98#' : 'Premium', grade: 'premium', price: prices.premium },
    { label: isCN ? '柴油' : 'Diesel', grade: 'diesel', price: prices.diesel },
  ].filter(p => p.price != null);
});

function formatPriceValue(price: number): string {
  if (price == null) return '--';
  if (country.value === 'US') {
    return formatPrice(price, 'US', currencySymbol.value).primary;
  }
  return `${currencySymbol.value}${price.toFixed(2)}`;
}

const mockReviews = [
  { id: 1, author: '张***', rating: 5, content: '价格实惠，服务态度好！' },
  { id: 2, author: '李***', rating: 4, content: '排队时间有点长，但油品质量不错。' },
];

uniOnLoad((options: any) => {
  if (options.id) {
    fetchStationDetail(options.id);
  }
});

async function fetchStationDetail(externalId: string) {
  // 优先使用首页传来的已清洗 FastAPI 数据
  const app = getApp();
  if (app.globalData?.__selectedStation?.externalId === externalId) {
    station.value = app.globalData.__selectedStation;
    delete app.globalData.__selectedStation;
    return;
  }

  try {
    const result = await get<any>(`/stations/${externalId}`);
    if (result.success) {
      station.value = result.station;
      // 兜底清洗：首站走数据库时也要去掉邮编
      if (station.value.name) {
        station.value.name = cleanStationName(station.value.name);
      }
    }
  } catch (error: any) {
    console.error('获取加油站详情失败:', error.message);
    // Mock 数据
    station.value = {
      externalId,
      name: '中石化人民路站',
      brand: '中石化',
      address: '重庆市渝中区人民路123号',
      prices: { regular: 7.82, mid: 8.31, premium: 9.05, diesel: 7.52 },
      rating: 4.8,
      openTime: '24小时营业',
      phone: '023-12345678',
    };
  }
}

function onNavigate() {
  if (!station.value.lat || !station.value.lng) {
    uni.showToast({ title: '位置信息缺失', icon: 'none' });
    return;
  }
  uni.openLocation({
    latitude: station.value.lat,
    longitude: station.value.lng,
    name: station.value.name,
    address: station.value.address || '',
    scale: 18,
  });
}

function onGoRefuel() {
  // 重新写入全局缓存，确保 refuel 页面能读取到价格数据
  getApp().globalData.__selectedStation = JSON.parse(JSON.stringify(station.value));
  uni.navigateTo({
    url: `/pages/refuel/refuel?stationId=${station.value.externalId || ''}&stationName=${encodeURIComponent(station.value.name || '')}`,
  });
}

function onCallPhone() {
  if (station.value.phone) {
    uni.makePhoneCall({ phoneNumber: station.value.phone });
  }
}
</script>

<style lang="scss" scoped>
.page-container {
  background: var(--color-bg);
  min-height: 100vh;
}

.header-section {
  padding: 32rpx 32rpx 48rpx;
  color: white;
}

.station-name {
  font-size: 40rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
}

.station-brand {
  font-size: 24rpx;
  opacity: 0.85;
  margin-bottom: 16rpx;
}

.station-address {
  display: flex;
  align-items: center;
  font-size: 24rpx;
  opacity: 0.9;
  margin-bottom: 8rpx;
}

.icon {
  margin-right: 8rpx;
}

.station-rating {
  font-size: 24rpx;
  opacity: 0.9;
}

.price-cards {
  display: flex;
  gap: 12rpx;
  padding: 0 24rpx;
  margin-top: -24rpx;
  margin-bottom: 32rpx;
}

.price-card {
  flex: 1;
  background: var(--color-card);
  border-radius: 16rpx;
  padding: 20rpx 12rpx;
  text-align: center;
  box-shadow: var(--card-shadow);
  border: 2rpx solid transparent;
  transition: all 0.2s ease;
}

.price-card.active {
  border-color: var(--color-primary);
  background: linear-gradient(135deg, #FFF5F0, #FFFFFF);
}

.price-label {
  display: block;
  font-size: 20rpx;
  color: var(--color-text-secondary);
  margin-bottom: 8rpx;
}

.price-value {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-warning);
}

.price-unit {
  display: block;
  font-size: 18rpx;
  color: var(--color-text-secondary);
  margin-top: 4rpx;
}

.action-buttons {
  display: flex;
  gap: 24rpx;
  padding: 0 24rpx;
  margin-bottom: 32rpx;
}

.btn-secondary,
.btn-primary {
  flex: 1;
  border: none;
  border-radius: var(--btn-radius);
  padding: 24rpx 0;
  font-size: var(--font-size-lg);
  font-weight: 600;
  text-align: center;
}

.btn-secondary {
  background: var(--color-bg);
  color: var(--color-text);
}

.btn-primary {
  background: var(--btn-primary-bg);
  color: white;
}

.card {
  background: var(--color-card);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  padding: var(--spacing-md);
  margin: 0 24rpx 24rpx;
}

.info-section {
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16rpx 0;
    border-bottom: 1rpx solid #F0F4F8;
  }
  .info-row:last-child {
    border-bottom: none;
  }
  .info-label {
    font-size: 24rpx;
    color: var(--color-text-secondary);
  }
  .info-value {
    font-size: 24rpx;
    color: var(--color-primary);
  }
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16rpx;
}

.review-item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F0F4F8;
}
.review-item:last-child {
  border-bottom: none;
}

.review-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.review-author {
  font-size: 24rpx;
  color: var(--color-text);
  font-weight: 500;
}

.review-rating {
  font-size: 22rpx;
  color: var(--color-warning);
}

.review-content {
  font-size: 24rpx;
  color: var(--color-text-secondary);
}

.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
