<template>
  <view class="station-card" @tap="$emit('tap')">
    <!-- 品牌图标 -->
    <view class="brand-icon" :style="{ background: brandColor }">
      <text>{{ brandInitial }}</text>
    </view>

    <!-- 信息区 -->
    <view class="station-info">
      <view class="station-name-row">
        <text class="station-name">{{ station.name }}</text>
        <view v-if="isCheapest" class="cheapest-tag">🏆 最低价</view>
      </view>
      <view class="station-brand">
        <text>{{ station.brand || '未知品牌' }}</text>
      </view>
      <view class="station-meta">
        <text class="rating" v-if="station.rating">⭐ {{ station.rating }}</text>
        <text class="distance" v-if="station.distance != null">▸ {{ formatDistance(station.distance) }}</text>
      </view>
    </view>

    <!-- 价格区 -->
    <view class="price-section">
      <view v-if="priceDisplay" class="price-main">
        <text class="price-value">{{ priceDisplay.primary }}</text>
      </view>
      <view v-if="priceDisplay?.secondary" class="price-secondary">
        <text>{{ priceDisplay.secondary }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Station } from '@/types/station';

const props = defineProps<{
  station: any;
  isCheapest?: boolean;
  selectedGrade?: string;
  country?: string;
  currencySymbol?: string;
}>();

defineEmits<{
  tap: [];
}>();

const brandInitial = computed(() => {
  const brand = props.station?.brand || '';
  return brand.charAt(0);
});

const brandColor = computed(() => {
  const brand = (props.station?.brand || '').toLowerCase();
  if (brand.includes('shell') || brand.includes('壳牌')) return '#D71921';
  if (brand.includes('petro') || brand.includes('中石化')) return '#FF0000';
  if (brand.includes('esso') || brand.includes('中石油')) return '#003399';
  if (brand.includes('canadian tire')) return '#CC0000';
  return '#FF6B35';
});

const priceDisplay = computed(() => {
  const prices = props.station?.prices;
  if (!prices) return null;

  // 根据当前选中的油号显示对应价格
  const gradeKey = props.selectedGrade || 'regular';
  const price = prices[gradeKey];
  const gradeLabel = props.station?.localGradeLabel || gradeKey;

  if (price == null) return null;

  const country = props.country || 'CN';
  const symbol = props.currencySymbol || '¥';

  if (country === 'US') {
    const pricePerGal = price * 3.785;
    return {
      primary: `$${pricePerGal.toFixed(3)}/gal`,
      secondary: `($${price.toFixed(3)}/L)`,
    };
  }

  const sym = country === 'CN' ? '¥' : symbol;
  return {
    primary: `${sym}${price.toFixed(2)}/L`,
  };
});

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
</script>

<style lang="scss" scoped>
.station-card {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  background: var(--color-card);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  margin-bottom: var(--spacing-sm);
  transition: transform 0.15s ease;
}

.station-card:active {
  transform: scale(0.98);
}

.brand-icon {
  width: 72rpx;
  height: 72rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 28rpx;
  font-weight: 700;
  flex-shrink: 0;
  margin-right: 20rpx;
}

.station-info {
  flex: 1;
  min-width: 0;
}

.station-name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 4rpx;
}

.station-name {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cheapest-tag {
  background: var(--color-success);
  color: white;
  font-size: var(--font-size-xs);
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.station-brand {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-bottom: 4rpx;
}

.station-meta {
  display: flex;
  align-items: center;
  gap: 16rpx;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.rating {
  color: var(--color-warning);
  font-weight: 500;
}

.price-section {
  flex-shrink: 0;
  text-align: right;
  margin-left: 16rpx;
}

.price-main {
  .price-value {
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--color-warning);
  }
}

.price-secondary {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-top: 4rpx;
}
</style>
