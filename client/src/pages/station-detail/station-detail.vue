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

    <!-- 距离 & 价格走势 -->
    <view v-if="station.distance" class="distance-card card">
      <view class="distance-row">
        <text class="distance-icon">📏</text>
        <text class="distance-label">距您</text>
        <text class="distance-value">{{ formatDistance(station.distance) }}</text>
      </view>
    </view>

    <!-- 价格对比分析 -->
    <view v-if="priceList.length >= 2" class="price-analysis card">
      <view class="section-title">📊 价格对比</view>
      <view class="analysis-bars">
        <view
          v-for="p in priceAnalysis"
          :key="p.label"
          class="analysis-item"
        >
          <text class="analysis-label">{{ p.label }}</text>
          <view class="analysis-bar-track">
            <view
              class="analysis-bar-fill"
              :class="{ cheapest: p.isCheapest }"
              :style="{ width: p.percent + '%' }"
            />
          </view>
          <text class="analysis-price" :class="{ cheapest: p.isCheapest }">{{ p.displayPrice }}</text>
        </view>
      </view>
      <view v-if="cheapestGrade" class="analysis-tip">
        💡 <text class="tip-text">{{ cheapestGrade.label }} 当前最低，每升可省 {{ cheapestGrade.save }}</text>
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

    <!-- 设施标签 -->
    <view class="amenities-section card">
      <view class="section-title">🏪 设施服务</view>
      <view class="amenity-tags">
        <text class="amenity-tag">🛒 便利店</text>
        <text class="amenity-tag">🚗 洗车</text>
        <text class="amenity-tag">🛞 轮胎充气</text>
        <text class="amenity-tag">💳 支持刷卡</text>
        <text class="amenity-tag">♿ 无障碍</text>
      </view>
    </view>

    <!-- 油品小贴士 -->
    <view class="tips-section card">
      <view class="section-title">💡 加油小贴士</view>
      <view class="tip-item">
        <text class="tip-dot">•</text>
        <text class="tip-text">一般家用车加推荐标号即可，不是标号越高越好</text>
      </view>
      <view class="tip-item">
        <text class="tip-dot">•</text>
        <text class="tip-text">早晚加油更划算，中午气温高油品密度低</text>
      </view>
      <view class="tip-item">
        <text class="tip-dot">•</text>
        <text class="tip-text">油表剩 1/4 时加油，可保护油泵延长寿命</text>
      </view>
    </view>

    <!-- 本站加油记录预览 -->
    <view class="recent-section card" @tap="onGoToRecords">
      <view class="section-title">📝 本站记录</view>
      <view v-if="stationRecords.length > 0" class="record-mini-list">
        <view v-for="r in stationRecords.slice(0, 3)" :key="r.id" class="record-mini">
          <text class="record-date">{{ r.date }}</text>
          <text class="record-grade">{{ gradeLabelMap[r.grade] || r.grade }}</text>
          <text class="record-amount">{{ currencySymbol }}{{ r.amount }}</text>
        </view>
      </view>
      <view v-else class="record-empty">
        <text class="empty-icon">📭</text>
        <text class="empty-text">在这里还没有加油记录</text>
        <text class="empty-action">点击「去加油」开始记录 →</text>
      </view>
    </view>

    <!-- 用户评价（待接入真实数据后启用） -->
    <!--
    <view class="review-section card">
      <view class="section-title">💬 用户评价</view>
      <view v-for="r in reviews" :key="r.id" class="review-item">
        <view class="review-header">
          <text class="review-author">{{ r.author }}</text>
          <text class="review-rating">⭐ {{ r.rating }}</text>
        </view>
        <text class="review-content">{{ r.content }}</text>
      </view>
    </view>
    -->

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
const stationRecords = ref<any[]>([]);

const gradeLabelMap: Record<string, string> = {
  regular: '92#',
  mid: '95#',
  premium: '98#',
  diesel: '柴油',
};

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

// 价格对比分析
const priceAnalysis = computed(() => {
  const list = priceList.value;
  if (list.length === 0) return [];
  const maxPrice = Math.max(...list.map(p => p.price || 0));
  if (maxPrice === 0) return list.map(p => ({ ...p, percent: 0, isCheapest: true, displayPrice: '--' }));
  const minPrice = Math.min(...list.filter(p => p.price != null).map(p => p.price!));
  return list.map(p => {
    const price = p.price || 0;
    const percent = price > 0 ? Math.round((price / maxPrice) * 100) : 0;
    const isCheapest = price === minPrice && price > 0;
    let displayPrice = formatPriceValue(price);
    return { ...p, percent, isCheapest, displayPrice };
  });
});

const cheapestGrade = computed(() => {
  const all = priceAnalysis.value;
  const cheapest = all.find(p => p.isCheapest);
  if (!cheapest || all.length < 2) return null;
  const other = all.find(p => !p.isCheapest);
  if (!other || !other.price && other.price !== 0) return null;
  const save = (other.price! - cheapest.price!).toFixed(2);
  if (Number(save) <= 0) return null;
  return { label: cheapest.label, save: `${currencySymbol.value}${save}` };
});

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function onGoToRecords() {
  uni.switchTab({ url: '/pages/stats/stats' });
}

uniOnLoad((options: any) => {
  if (options.id) {
    fetchStationDetail(options.id);
  }
});

async function fetchStationDetail(externalId: string) {
  const app = getApp();
  const cached = app.globalData?.__selectedStation;

  // 优先使用首页传来的已清洗 FastAPI 数据
  if (cached && String(cached.externalId) === String(externalId)) {
    console.log('[StationDetail] 命中缓存:', cached.name);
    station.value = cached;
    delete app.globalData.__selectedStation;
    fetchStationRecords(externalId);
    return;
  }

  // 缓存不匹配或不存在，调 API
  try {
    const result = await get<any>(`/stations/${externalId}`);
    if (result.success) {
      station.value = result.station;
      if (station.value.name) {
        station.value.name = cleanStationName(station.value.name);
      }
      console.log('[StationDetail] API 获取成功:', station.value.name);
      fetchStationRecords(externalId);
      return;
    }
  } catch (error: any) {
    console.error('[StationDetail] API 获取失败:', error.message);
  }

  // API 也失败时，如果有缓存数据就用它兜底（ID 比较虽未命中但数据是用户点的那个站）
  if (cached) {
    console.warn('[StationDetail] 使用缓存数据作为兜底:', cached.name);
    station.value = cached;
    delete app.globalData.__selectedStation;
    fetchStationRecords(externalId);
    return;
  }

  uni.showToast({ title: '获取加油站详情失败', icon: 'none' });
}

// 获取本站加油记录
async function fetchStationRecords(externalId: string) {
  try {
    const result = await get<any>('/records', { limit: 5 });
    if (result.success && result.records) {
      stationRecords.value = result.records
        .filter((r: any) => {
          const sid = String(r.station_id || '');
          return sid === externalId || sid.includes(externalId) || externalId.includes(sid);
        })
        .map((r: any) => ({
          ...r,
          date: r.created_at ? r.created_at.split('T')[0] : '',
        }));
    }
  } catch (error: any) {
    console.log('[StationDetail] 获取本站记录失败:', error.message);
    stationRecords.value = [];
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

/* 距离卡片 */
.distance-card {
  margin: 0 24rpx 16rpx;
  padding: 24rpx;
}

.distance-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}

.distance-icon {
  font-size: 36rpx;
}

.distance-label {
  font-size: 24rpx;
  color: var(--color-text-secondary);
}

.distance-value {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-primary);
}

/* 价格对比分析 */
.price-analysis {
  margin: 0 24rpx 16rpx;
  padding: 24rpx;

  .section-title {
    font-size: 28rpx;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 20rpx;
  }
}

.analysis-bars {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.analysis-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.analysis-label {
  width: 80rpx;
  font-size: 22rpx;
  color: var(--color-text-secondary);
  text-align: right;
  flex-shrink: 0;
}

.analysis-bar-track {
  flex: 1;
  height: 14rpx;
  background: #F0F4F8;
  border-radius: 7rpx;
  overflow: hidden;
}

.analysis-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #FFA940, #FF6B35);
  border-radius: 7rpx;
  transition: width 0.4s ease;

  &.cheapest {
    background: linear-gradient(90deg, #52C41A, #389E0D);
  }
}

.analysis-price {
  width: 100rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: var(--color-text);
  text-align: left;
  flex-shrink: 0;

  &.cheapest {
    color: #52C41A;
  }
}

.analysis-tip {
  margin-top: 16rpx;
  padding: 12rpx 16rpx;
  background: #F6FFED;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;

  .tip-text {
    font-size: 22rpx;
    color: #52C41A;
    font-weight: 500;
  }
}

/* 设施标签 */
.amenities-section {
  margin: 0 24rpx 16rpx;
  padding: 24rpx;

  .section-title {
    font-size: 28rpx;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 16rpx;
  }
}

.amenity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.amenity-tag {
  padding: 8rpx 20rpx;
  background: #F0F4F8;
  border-radius: 24rpx;
  font-size: 22rpx;
  color: var(--color-text-secondary);
}

/* 小贴士 */
.tips-section {
  margin: 0 24rpx 16rpx;
  padding: 24rpx;

  .section-title {
    font-size: 28rpx;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 16rpx;
  }
}

.tip-item {
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
  margin-bottom: 12rpx;

  &:last-child {
    margin-bottom: 0;
  }
}

.tip-dot {
  color: var(--color-primary);
  font-weight: 700;
  line-height: 1.6;
}

.tip-text {
  font-size: 24rpx;
  color: var(--color-text-secondary);
  line-height: 1.6;
  flex: 1;
}

/* 本站记录 */
.recent-section {
  margin: 0 24rpx 16rpx;
  padding: 24rpx;

  .section-title {
    font-size: 28rpx;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 16rpx;
  }
}

.record-mini-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.record-mini {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #F0F4F8;

  &:last-child {
    border-bottom: none;
  }
}

.record-date {
  font-size: 22rpx;
  color: var(--color-text-secondary);
  flex: 1;
}

.record-grade {
  font-size: 22rpx;
  color: var(--color-primary);
  margin: 0 16rpx;
}

.record-amount {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--color-text);
}

.record-empty {
  text-align: center;
  padding: 32rpx 0 16rpx;

  .empty-icon {
    font-size: 48rpx;
    display: block;
    margin-bottom: 12rpx;
  }

  .empty-text {
    display: block;
    font-size: 24rpx;
    color: var(--color-text-secondary);
    margin-bottom: 8rpx;
  }

  .empty-action {
    display: block;
    font-size: 22rpx;
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
