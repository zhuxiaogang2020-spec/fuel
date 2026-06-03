<template>
  <view class="page-container">
    <!-- 顶部搜索栏 -->
    <view class="search-bar">
      <view class="location-text">
        <text class="icon-location">📍</text>
        <text>{{ location.address || '定位中...' }}</text>
      </view>
      <view class="search-btn" @tap="onSearchTap">
        <text>🔍</text>
      </view>
    </view>

    <!-- 全屏地图 -->
    <template v-if="!isDevtools">
      <map
        id="mainMap"
        class="map-view"
        style="width:100%;height:100vh"
        :latitude="location.lat"
        :longitude="location.lng"
        :scale="14"
        :markers="markers"
        :show-location="false"
        :enable-scroll="true"
        @error="onMapError"
        @updated="onMapUpdated"
        @markertap="onMarkerTap"
      />
    </template>
    <view v-else class="map-placeholder">
      <text class="placeholder-text">📍 开发者工具不支持海外地图\n请在真机上预览</text>
    </view>

    <!-- 底部抽屉 -->
    <BottomDrawer
      @toggle="toggleDrawer"
      @state-change="onDrawerStateChange"
    >
      <!-- 排序切换 -->
      <view class="sort-bar">
        <view
          v-for="opt in sortOptions"
          :key="opt.value"
          class="sort-item"
          :class="{ active: sortBy === opt.value }"
          @tap="onSortChange(opt.value)"
        >
          {{ opt.label }}
        </view>
      </view>

      <!-- 油号筛选 -->
      <view class="grade-bar">
        <view
          v-for="g in gradeOptions"
          :key="g.value"
          class="grade-item"
          :class="{ active: selectedGrade === g.value }"
          @tap="onGradeChange(g.value)"
        >
          {{ g.label }}
        </view>
      </view>

      <!-- 半径切换 -->
      <view class="radius-bar">
        <view
          v-for="r in radiusOptions"
          :key="r.value"
          class="radius-item"
          :class="{ active: selectedRadius === r.value }"
          @tap="onRadiusChange(r.value)"
        >
          {{ r.label }}
        </view>
      </view>

      <!-- 加油站列表 -->
      <view class="station-list">
        <StationCard
          v-for="s in sortedStations"
          :key="s.externalId"
          :station="s"
          :is-cheapest="s.isCheapest"
          :selected-grade="selectedGrade"
          :country="country"
          :currency-symbol="currencySymbol"
          @tap="onStationTap(s)"
        />
        <view v-if="sortedStations.length === 0" class="empty-tip">
          <text>📭 附近暂无加油站数据</text>
        </view>
      </view>
    </BottomDrawer>

    <!-- 加载提示 -->
    <view v-if="loading" class="loading-mask">
      <view class="loading-content">
        <view class="loading-spinner" />
        <text>正在查找附近加油站...</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import StationCard from '@/components/StationCard.vue';
import BottomDrawer from '@/components/BottomDrawer.vue';
import { useUserStore } from '@/store/index';
import { useLocationStore } from '@/store/index';
import { get, post } from '@/utils/request';
import { wechatLogin } from '@/utils/auth';
import { fetchGasPrices } from '@/utils/gasbuddy';
import type { CountryInfo } from '@/utils/country';

const userStore = useUserStore();
const locationStore = useLocationStore();
const location = locationStore;

// DevTools 检测（开发者工具不支持海外地图瓦片）
let isDevtools = false;
try {
  // #ifdef MP-WEIXIN
  const sysInfo = uni.getDeviceInfo();
  isDevtools = sysInfo.platform === 'devtools';
  console.log('[DevTools] platform:', sysInfo.platform, 'isDevtools:', isDevtools);
  // #endif
} catch (_) {}

// 状态
const loading = ref(false);
const stations = ref<any[]>([]);
const markers = ref<any[]>([]);
const countryInfo = ref<CountryInfo | null>(null);

// 筛选状态
const sortBy = ref<'distance' | 'price'>('distance');
const selectedGrade = ref('regular');
const selectedRadius = ref(5000); // 默认 5km

// 用户 Store 计算属性
const isCN = computed(() => userStore.country === 'CN');

// 排序选项
const sortOptions = computed(() => {
  const base = [
    { label: '最近', value: 'distance' },
    { label: '最便宜', value: 'price' },
  ];
  return base;
});

// 油号选项
const gradeOptions = computed(() => {
  if (isCN.value) {
    return [
      { label: '92#', value: 'regular' },
      { label: '95#', value: 'mid' },
      { label: '98#', value: 'premium' },
      { label: '柴油', value: 'diesel' },
    ];
  }
  return [
    { label: 'Regular', value: 'regular' },
    { label: 'Mid', value: 'mid' },
    { label: 'Premium', value: 'premium' },
    { label: 'Diesel', value: 'diesel' },
  ];
});

// 半径选项（非中国显示）
const radiusOptions = [
  { label: '3km', value: 3000 },
  { label: '5km', value: 5000 },
  { label: '10km', value: 10000 },
  { label: '20km', value: 20000 },
];

// 国家/货币信息
const country = computed(() => userStore.country || 'CN');
const currencySymbol = computed(() => userStore.currencySymbol || '¥');

// 排序后的加油站列表
const sortedStations = computed(() => {
  const list = [...(stations.value || [])];
  if (sortBy.value === 'price') {
    return list.sort((a, b) => {
      const pa = a.prices?.[selectedGrade.value] ?? Infinity;
      const pb = b.prices?.[selectedGrade.value] ?? Infinity;
      return pa - pb;
    });
  }
  return list.sort((a, b) => (a.distance || 0) - (b.distance || 0));
});

// 页面加载
onLoad(async () => {
  // 先登录
  try {
    await wechatLogin();
  } catch (e) {
    console.error('登录失败:', e);
  }
  await initLocation();
  await fetchStations();
});

// 初始化位置
async function initLocation() {
  try {
    const res = await uni.getLocation({ type: 'gcj02' });
    const lat = res.latitude;
    const lng = res.longitude;
    console.log('[Location] 定位结果:', lat, lng);
    // 检测是否为开发者工具默认模拟定位（北京天安门附近）
    // 如果是则降级到中国测试坐标（重庆），避免搜不到数据
    const isDevDefaultMock = Math.abs(lat - 39.9) < 0.5 && Math.abs(lng - 116.4) < 0.5;
    if (isDevDefaultMock) {
      console.warn('[Location] 检测到开发者工具默认定位，切换到测试坐标（重庆）');
      locationStore.setLocation(29.5647, 106.5507, '重庆市');
      // 根据坐标设置国家为中国
      userStore.setCountryInfo({
        country: 'CN',
        unitSystem: 'metric',
        currencySymbol: '¥',
        priceUnit: '¥/L',
        distanceUnit: 'km',
        efficiencyUnit: 'L/100km',
      });
      return;
    }
    locationStore.setLocation(lat, lng, '');
    updateLocationAddress(lat, lng);
    // 根据坐标检测国家，更新 store
    const detected = detectCountryFromCoords(lat, lng);
    if (detected && userStore.country !== detected) {
      setCountryDefaults(detected);
    }
    console.log('[Map] 地图中心坐标已设置: lat=' + locationStore.lat + ', lng=' + locationStore.lng);
  } catch (error) {
    console.error('获取位置失败:', error);
    // 使用 Mock 位置（重庆）
    locationStore.setLocation(29.5647, 106.5507, '重庆市');
    userStore.setCountryInfo({
      country: 'CN',
      unitSystem: 'metric',
      currencySymbol: '¥',
      priceUnit: '¥/L',
      distanceUnit: 'km',
      efficiencyUnit: 'L/100km',
    });
  }
}

// 计算两点距离（米）
function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 更新地址显示
function updateLocationAddress(lat: number, lng: number) {
  // 简化版：直接显示经纬度
  locationStore.address = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

/** 根据坐标检测国家（客户端简化版） */
function detectCountryFromCoords(lat: number, lng: number): string {
  if (lat >= 18 && lat <= 54 && lng >= 73 && lng <= 135) return 'CN';
  if (lat >= 42 && lat <= 83 && lng >= -141 && lng <= -52) return 'CA';
  if (lat >= 18 && lat <= 72 && lng >= -180 && lng <= -52) return 'US';
  return 'OTHER';
}

/** 根据国家代码设置默认显示单位 */
function setCountryDefaults(country: string) {
  const map: Record<string, any> = {
    CN: { country: 'CN', unitSystem: 'metric', currencySymbol: '¥', priceUnit: '¥/L', distanceUnit: 'km', efficiencyUnit: 'L/100km' },
    CA: { country: 'CA', unitSystem: 'metric', currencySymbol: 'C$', priceUnit: 'C$/L', distanceUnit: 'km', efficiencyUnit: 'L/100km' },
    US: { country: 'US', unitSystem: 'imperial', currencySymbol: '$', priceUnit: '$/gal', distanceUnit: 'miles', efficiencyUnit: 'MPG' },
  };
  const info = map[country];
  if (info) userStore.setCountryInfo(info);
}

// 获取加油站数据
async function fetchStations() {
  loading.value = true;
  try {
    const radiusM = selectedRadius.value;
    const lat = locationStore.lat;
    const lng = locationStore.lng;

    if (isCN.value) {
      // 中国用户 → 调用后端 compare 接口（走腾讯地图适配器）
      console.log(`[Index] 中国用户，调用 /prices/compare: lat=${lat}, lng=${lng}, radius=${radiusM}m`);
      const result: any = await get('/prices/compare', {
        lat,
        lng,
        radius: radiusM,
        grade: selectedGrade.value,
        sort: sortBy.value,
      });
      console.log('[Index] compare 响应:', JSON.stringify(result));

      stations.value = result.stations || [];
      countryInfo.value = result.country;

      if (result.country) {
        userStore.setCountryInfo({
          country: result.country.country,
          unitSystem: result.country.unitSystem,
          currencySymbol: result.country.currencySymbol,
          priceUnit: result.country.priceUnit,
          distanceUnit: result.country.distanceUnit,
          efficiencyUnit: result.country.efficiencyUnit,
        });
      }

      updateMarkers();

      if (stations.value.length === 0) {
        console.warn('[Index] 加油站列表为空');
        uni.showToast({ title: '附近暂无加油站', icon: 'none' });
      }
    } else {
      // 非中国用户 → 直连 GasBuddy（传入选中半径，单位 km）
      const radiusKm = radiusM / 1000;
      let result: any = await fetchGasPrices(lat, lng, radiusKm);
      console.log(`[Index] GasBuddy 直连结果 (radius=${radiusKm}km):`, JSON.stringify(result));

      console.log('[Index] 加油站响应:', JSON.stringify(result));
      console.log('[Index] stations数量:', (result.stations || []).length);
      stations.value = result.stations || [];
      countryInfo.value = result.country;

      // 更新用户 Store 中的国家信息
      if (result.country) {
        userStore.setCountryInfo({
          country: result.country.country,
          unitSystem: result.country.unitSystem,
          currencySymbol: result.country.currencySymbol,
          priceUnit: result.country.priceUnit,
          distanceUnit: result.country.distanceUnit,
          efficiencyUnit: result.country.efficiencyUnit,
        });
      }

      // 更新地图标记
      updateMarkers();

      if (stations.value.length === 0) {
        console.warn('[Index] 加油站列表为空');
        uni.showToast({ title: '附近暂无加油站', icon: 'none' });
      }
    }
  } catch (error: any) {
    // request.js 已统一显示 toast，这里只记录日志，避免重复提示
    const errMsg = error.message || error.errMsg || '未知错误';
    console.error('[Index] 获取加油站失败:', errMsg, error);
    // 仅当 error 没有 message/errMsg 时（异常情况）才显示兜底提示
    if (!error.message && !error.errMsg) {
      uni.showToast({ title: '网络错误，请检查后端服务', icon: 'none', duration: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

// 更新地图标记
function updateMarkers() {
  markers.value = stations.value.map((s, index) => ({
    id: index,
    latitude: s.lat,
    longitude: s.lng,
    title: s.name,
    width: 30,
    height: 30,
    iconPath: '/static/marker.png',
    callout: {
      content: s.name,
      display: 'BYCLICK',
    },
  }));
}

// 切换抽屉
function toggleDrawer() {
  // 由 BottomDrawer 内部处理
}

// 抽屉状态变化
function onDrawerStateChange(state: 'collapsed' | 'half' | 'full') {
  console.log('[Drawer] state:', state);
}

// 排序切换
function onSortChange(value: 'distance' | 'price') {
  sortBy.value = value;
}

// 油号切换
function onGradeChange(value: string) {
  selectedGrade.value = value;
  fetchStations();
}

// 半径切换
function onRadiusChange(value: number) {
  selectedRadius.value = value;
  fetchStations();
}

// 点击加油站卡片
function onStationTap(station: any) {
  // 把已清洗的 FastAPI 数据直接传给详情页，不走数据库
  const app = getApp();
  app.globalData = app.globalData || {};
  app.globalData.__selectedStation = station;
  uni.navigateTo({
    url: `/pages/station-detail/station-detail?id=${station.externalId}`,
  });
}

// 点击地图标记
function onMarkerTap(e: any) {
  const index = e.detail.markerId;
  const station = stations.value[index];
  if (station) {
    onStationTap(station);
  }
}

function onSearchTap() {
  uni.showToast({ title: '搜索功能开发中', icon: 'none' });
}

function onMapError(e: any) {
  console.error('[Map] 地图组件异常:', JSON.stringify(e.detail));
}

function onMapUpdated(e: any) {
  console.log('[Map] 地图渲染完成:', e.detail);
}
</script>

<style lang="scss" scoped>
.page-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.search-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 60rpx 24rpx 16rpx;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20rpx);
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.05);
}

.location-text {
  display: flex;
  align-items: center;
  font-size: 28rpx;
  color: #1A1A2E;
  font-weight: 500;
}

.icon-location {
  margin-right: 8rpx;
  font-size: 32rpx;
}

.search-btn {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F0F4F8;
  border-radius: 50%;
  font-size: 32rpx;
}

.map-view {
  width: 100%;
  height: 100vh;
  position: absolute;
  top: 0;
  left: 0;
}

.sort-bar,
.grade-bar,
.radius-bar {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 24rpx;
  overflow-x: auto;
  white-space: nowrap;
}

.sort-item,
.grade-item,
.radius-item {
  padding: 8rpx 24rpx;
  border-radius: 32rpx;
  font-size: 24rpx;
  background: #F0F4F8;
  color: #6B7280;
  white-space: nowrap;
}

.sort-item.active,
.grade-item.active,
.radius-item.active {
  background: #FF6B35;
  color: white;
  font-weight: 600;
}

.station-list {
  padding: 0 24rpx;
}

.empty-tip {
  text-align: center;
  padding: 80rpx 0;
  color: #6B7280;
  font-size: 28rpx;
}

.loading-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.loading-content {
  background: white;
  padding: 48rpx 64rpx;
  border-radius: 20rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  font-size: 28rpx;
  color: #1A1A2E;
}

.loading-spinner {
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid #F0F4F8;
  border-top-color: #FF6B35;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.map-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;
  background: #F0F4F8;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.placeholder-text {
  font-size: 32rpx;
  color: #9CA3AF;
  text-align: center;
  line-height: 1.8;
}
</style>
