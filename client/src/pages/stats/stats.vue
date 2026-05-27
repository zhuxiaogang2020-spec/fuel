<template>
  <view class="page-container">
    <!-- 本次油耗核心数据 -->
    <view class="efficiency-hero card" :style="{ background: heroBg }">
      <text class="hero-label">⛽ 本次油耗</text>
      <text class="hero-value">{{ efficiencyDisplay }}</text>
      <text class="hero-unit">{{ efficiencyUnit }}</text>
      <view class="hero-badge" :style="{ background: efficiencyColor }">
        {{ efficiencyBadge }}
      </view>
    </view>

    <!-- 油耗趋势图 -->
    <view class="chart-section card">
      <view class="section-title">📈 油耗趋势</view>
      <FuelChart :history="history" :unit="efficiencyUnit" />
    </view>

    <!-- 历史记录列表 -->
    <view class="history-section">
      <view class="section-title">📋 历史记录</view>
      <view
        v-for="(r, idx) in history"
        :key="idx"
        class="history-item card"
      >
        <view class="history-header">
          <text class="history-date">{{ r.date || `--` }}</text>
          <text class="history-efficiency" :style="{ color: getColor(r.value) }">
            {{ formatValue(r.value) }} {{ efficiencyUnit }}
          </text>
        </view>
        <view class="history-detail">
          <text>📍 {{ r.stationName || '未知加油站' }}</text>
          <text>💰 {{ r.amount ? r.amount.toFixed(2) : '--' }}</text>
        </view>
      </view>
      <view v-if="history.length === 0" class="empty-tip">
        <text>📭 暂无加油记录</text>
        <text class="empty-hint">快去添加第一条加油记录吧！</text>
      </view>
    </view>

    <view class="safe-bottom" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import FuelChart from '@/components/FuelChart.vue';
import { get, post } from '@/utils/request';
import { useUserStore } from '@/store/index';
import { getEfficiencyColor } from '@/utils/unit';

const userStore = useUserStore();

const history = ref<any[]>([]);
const efficiencyUnit = computed(() => userStore.efficiencyUnit || 'L/100km');

// 本次油耗显示
const efficiencyDisplay = computed(() => {
  if (history.value.length === 0) return '--';
  const latest = history.value[0];
  return formatValue(latest.value);
});

// 油耗颜色
const efficiencyColor = computed(() => {
  if (history.value.length === 0) return '#6B7280';
  const latest = history.value[0];
  return getColor(latest.value);
});

// 背景渐变
const heroBg = computed(() => {
  const color = efficiencyColor.value;
  return `linear-gradient(135deg, ${color}15, ${color}08)`;
});

// 油耗评价标签
const efficiencyBadge = computed(() => {
  if (history.value.length === 0) return '暂无数据';
  const val = history.value[0].value;
  if (efficiencyUnit.value === 'MPG') {
    if (val >= 35) return '🏆 非常省油';
    if (val >= 25) return '✅ 正常';
    return '⚠️ 油耗偏高';
  } else {
    if (val <= 6) return '🏆 非常省油';
    if (val <= 8) return '✅ 正常';
    return '⚠️ 油耗偏高';
  }
});

function formatValue(val: number): string {
  if (efficiencyUnit.value === 'MPG') {
    return Math.round(val).toString();
  }
  return val.toFixed(1);
}

function getColor(val: number): string {
  return getEfficiencyColor(val, efficiencyUnit.value);
}

onShow(async () => {
  await fetchStats();
});

async function fetchStats() {
  try {
    const result = await get<any>('/records/stats');
    if (result.success && result.history) {
      history.value = result.history.map((h: any) => ({
        ...h,
        date: h.created_at ? h.created_at.split('T')[0] : '',
      }));
    }
  } catch (error: any) {
    console.error('获取统计失败:', error.message);
    // Mock 数据
    history.value = [
      { value: 8.2, unit: 'L/100km', date: '2026-05-20', stationName: '中石化人民路站', amount: 350 },
      { value: 7.9, unit: 'L/100km', date: '2026-05-10', stationName: '壳牌解放路站', amount: 320 },
      { value: 8.5, unit: 'L/100km', date: '2026-04-28', stationName: '中石化人民路站', amount: 360 },
    ];
  }
}
</script>

<style lang="scss" scoped>
.page-container {
  padding: 24rpx;
  background: var(--color-bg);
  min-height: 100vh;
}

.efficiency-hero {
  text-align: center;
  padding: 48rpx 32rpx;
  margin-bottom: 24rpx;
  border-radius: var(--card-radius);
  position: relative;
  overflow: hidden;
}

.hero-label {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: 12rpx;
}

.hero-value {
  display: block;
  font-size: 96rpx;
  font-weight: 800;
  color: var(--color-text);
  line-height: 1;
}

.hero-unit {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-top: 8rpx;
}

.hero-badge {
  display: inline-block;
  padding: 8rpx 24rpx;
  border-radius: 20rpx;
  color: white;
  font-size: var(--font-size-xs);
  font-weight: 600;
  margin-top: 20rpx;
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 20rpx;
}

.chart-section {
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.history-section {
  .section-title {
    padding: 0 8rpx;
    margin-bottom: 16rpx;
  }
}

.history-item {
  padding: 20rpx 24rpx;
  margin-bottom: 12rpx;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.history-date {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.history-efficiency {
  font-size: var(--font-size-lg);
  font-weight: 700;
}

.history-detail {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.empty-tip {
  text-align: center;
  padding: 80rpx 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);

  .empty-hint {
    display: block;
    margin-top: 12rpx;
    font-size: var(--font-size-sm);
  }
}

.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
