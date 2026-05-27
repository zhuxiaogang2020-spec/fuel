<template>
  <view class="price-tag" :class="{ cheapest: isCheapest }">
    <text v-if="isCheapest" class="cheapest-badge">🏆 最低</text>
    <text class="price-value">{{ displayPrice }}</text>
    <text class="price-unit">{{ unit }}</text>
  </view>
</template>

<script setup lang="ts">
const props = defineProps<{
  price: number;
  grade?: string;
  country?: string;
  currencySymbol?: string;
  isCheapest?: boolean;
}>();

const isCheapest = computed(() => props.isCheapest || false);
const unit = computed(() => {
  if (props.country === 'US') return '/gal';
  return '/L';
});

const displayPrice = computed(() => {
  if (props.price == null) return '--';
  const p = props.price;
  if (props.country === 'US') {
    return `$${(p * 3.785).toFixed(3)}`;
  }
  const sym = props.currencySymbol || '¥';
  return `${sym}${p.toFixed(2)}`;
});
</script>

<style lang="scss" scoped>
.price-tag {
  display: inline-flex;
  align-items: baseline;
  gap: 4rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  background: #FFF5F0;
}

.price-tag.cheapest {
  background: #00C9A715;
}

.cheapest-badge {
  font-size: 18rpx;
  color: #00C9A7;
  font-weight: 700;
  margin-right: 4rpx;
}

.price-value {
  font-size: 28rpx;
  font-weight: 700;
  color: #FFD93D;
}

.price-tag.cheapest .price-value {
  color: #00C9A7;
}

.price-unit {
  font-size: 18rpx;
  color: #6B7280;
}
</style>
