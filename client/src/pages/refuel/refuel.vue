<template>
  <view class="page-container">
    <!-- 加油站信息卡片 -->
    <view class="station-card card" @tap="onSelectStation">
      <view class="station-icon">⛽</view>
      <view class="station-info">
        <text class="station-name">{{ stationName || '选择加油站' }}</text>
        <text class="station-hint" v-if="stationName">📍 {{ stationDistance }}</text>
        <text class="station-hint" v-else>点击选择加油站</text>
      </view>
      <text class="arrow">›</text>
    </view>

    <!-- 车辆选择 -->
    <view class="vehicle-section card">
      <view class="section-title">🚗 选择车辆</view>
      <view class="vehicle-picker" v-if="vehicleStore.vehicles.length > 0">
        <view
          v-for="v in vehicleStore.vehicles"
          :key="v.id"
          class="vehicle-chip"
          :class="{ active: selectedVehicleId === v.id }"
          @tap="onSelectVehicle(v)"
        >
          <text class="chip-icon">🚗</text>
          <text class="chip-name">{{ v.name }}</text>
          <text class="chip-grade" v-if="v.lastGrade">{{ gradeLabelMap[v.lastGrade] }}</text>
        </view>
      </view>
      <view class="no-vehicle" v-else>
        <text class="hint-text">暂无车辆，请在「我的-车辆信息」中添加</text>
        <text class="link-text" @tap="goToProfile">去添加 ›</text>
      </view>
    </view>

    <!-- 加油信息表单 -->
    <view class="form-section card">
      <view class="section-title">⛽ 加油信息</view>

      <!-- 油号选择 -->
      <view class="form-row">
        <text class="form-label">油号</text>
        <view class="grade-selector">
          <view
            v-for="g in gradeOptions"
            :key="g.value"
            class="grade-option"
            :class="{ active: selectedGrade === g.value }"
            @tap="selectedGrade = g.value"
          >
            {{ g.label }}
          </view>
        </view>
      </view>

      <!-- 金额输入 -->
      <view class="form-row">
        <text class="form-label">金额</text>
        <view class="input-wrapper">
          <text class="input-prefix">{{ currencySymbol }}</text>
          <input
            class="input-field price-input"
            type="digit"
            v-model="amount"
            placeholder="0.00"
            @input="onAmountInput"
          />
        </view>
      </view>

      <!-- 油量输入 -->
      <view class="form-row">
        <text class="form-label">油量</text>
        <view class="input-wrapper">
          <input
            class="input-field"
            type="digit"
            v-model="volume"
            placeholder="自动计算"
            @input="onVolumeInput"
          />
          <text class="input-suffix">{{ volumeUnit }}</text>
        </view>
      </view>

      <!-- 里程输入 -->
      <view class="form-row">
        <text class="form-label">里程</text>
        <view class="input-wrapper">
          <input
            class="input-field"
            type="digit"
            v-model="odometer"
            placeholder="当前里程"
          />
          <text class="input-suffix">{{ distanceUnit }}</text>
        </view>
      </view>

      <!-- 加满开关 -->
      <view class="form-row switch-row">
        <text class="form-label">是否加满</text>
        <switch :checked="isFullTank" @change="onFullTankChange" color="#FF6B35" />
      </view>
    </view>

    <!-- 小票照片 -->
    <view class="photo-section card">
      <view class="section-title">📷 小票照片（可选）</view>
      <view class="photo-upload" @tap="onChooseImage">
        <text v-if="!receiptUrl" class="upload-icon">+</text>
        <image v-else class="receipt-preview" :src="receiptUrl" mode="aspectFit" />
      </view>
    </view>

    <!-- 保存按钮 -->
    <view class="bottom-bar safe-bottom">
      <button class="btn-primary save-btn" @tap="onSave" :disabled="saving">
        {{ saving ? '保存中...' : '✅ 保存记录' }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onLoad } from 'vue';
import { onLoad as uniOnLoad, onShow } from '@dcloudio/uni-app';
import { get, post } from '@/utils/request';
import { useUserStore, useVehicleStore } from '@/store/index';
import { L_PER_US_GAL } from '@/utils/unit';
import type { Vehicle } from '@/types/station';

const userStore = useUserStore();
const vehicleStore = useVehicleStore();

// 表单状态
const stationId = ref('');
const stationName = ref('');
const stationDistance = ref('');
const selectedVehicleId = ref<number | null>(null);
const selectedGrade = ref('regular');
const amount = ref('');
const volume = ref('');
const odometer = ref('');
const isFullTank = ref(true);
const receiptUrl = ref('');
const saving = ref(false);

// 自动计算相关
const stationPrices = ref<Record<string, number>>({});
let isAutoCalculating = false;

// 当前选中油号的单价
const unitPrice = computed(() => {
  const price = stationPrices.value[selectedGrade.value];
  if (!price || price <= 0) return null;
  return price;
});

const gradeLabelMap: Record<string, string> = {
  regular: '92#',
  mid: '95#',
  premium: '98#',
  diesel: '柴油',
};

// 单位
const currencySymbol = computed(() => userStore.currencySymbol || '¥');
const distanceUnit = computed(() => userStore.distanceUnit === 'miles' ? 'miles' : 'km');
const volumeUnit = computed(() => {
  if (userStore.distanceUnit === 'miles') return 'gal';
  return 'L';
});
const gradeOptions = computed(() => {
  const isCN = userStore.country === 'CN';
  if (isCN) {
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

uniOnLoad((options: any) => {
  if (options.stationId) {
    stationId.value = options.stationId;
  }
  if (options.stationName) {
    stationName.value = decodeURIComponent(options.stationName);
  }
  fetchStationPrices();
});

// 每次进入页面时刷新车辆列表并自动选择
onShow(async () => {
  await vehicleStore.fetchVehicles();
  // 如果有已选车辆，恢复选中
  if (vehicleStore.selectedVehicleId) {
    selectedVehicleId.value = vehicleStore.selectedVehicleId;
    const v = vehicleStore.selectedVehicle;
    if (v?.lastGrade) {
      selectedGrade.value = v.lastGrade;
    }
  } else if (vehicleStore.vehicles.length === 1) {
    // 只有一个车，自动选中
    const v = vehicleStore.vehicles[0];
    selectedVehicleId.value = v.id;
    if (v.lastGrade) {
      selectedGrade.value = v.lastGrade;
    }
  }
});

// 选择车辆
function onSelectVehicle(v: Vehicle) {
  selectedVehicleId.value = v.id;
  vehicleStore.selectVehicle(v.id);
  // 如果该车辆上次加过油，默认选择上次的油号
  if (v.lastGrade) {
    selectedGrade.value = v.lastGrade;
  }
}

// 跳转到个人中心添加车辆
function goToProfile() {
  uni.switchTab({ url: '/pages/profile/profile' });
}

// 获取加油站油价
async function fetchStationPrices() {
  if (!stationId.value) {
    console.warn('[Refuel] stationId 为空，无法获取油价');
    return;
  }
  // 优先从全局缓存读取（station-detail 跳转时注入）
  const app = getApp();
  if (app.globalData?.__selectedStation?.externalId === stationId.value) {
    const prices = app.globalData.__selectedStation.prices;
    stationPrices.value = prices || {};
    console.log('[Refuel] 从全局缓存获取油价:', JSON.stringify(stationPrices.value));
    return;
  }
  // 缓存未命中，调接口获取
  try {
    const result = await get<any>(`/stations/${stationId.value}`);
    if (result.success && result.station?.prices) {
      stationPrices.value = result.station.prices;
      console.log('[Refuel] API 获取油价成功:', JSON.stringify(stationPrices.value));
    } else {
      console.warn('[Refuel] API 返回数据中无 prices:', JSON.stringify(result));
    }
  } catch (e: any) {
    console.error('[Refuel] 获取油价失败:', e.message);
  }
}

// 金额输入 → 自动计算油量
function onAmountInput() {
  if (isAutoCalculating) return;
  const price = unitPrice.value;
  if (!price || !amount.value) return;

  isAutoCalculating = true;
  const amt = parseFloat(amount.value);
  if (!isNaN(amt) && amt > 0) {
    let vol: number;
    if (volumeUnit.value === 'gal') {
      // 价格按升存储，油量单位是加仑，需转换
      vol = amt / (price * L_PER_US_GAL);
    } else {
      vol = amt / price;
    }
    volume.value = vol.toFixed(2);
  }
  isAutoCalculating = false;
}

// 油量输入 → 自动计算金额
function onVolumeInput() {
  if (isAutoCalculating) return;
  const price = unitPrice.value;
  if (!price || !volume.value) return;

  isAutoCalculating = true;
  const vol = parseFloat(volume.value);
  if (!isNaN(vol) && vol > 0) {
    let amt: number;
    if (volumeUnit.value === 'gal') {
      amt = vol * price * L_PER_US_GAL;
    } else {
      amt = vol * price;
    }
    amount.value = amt.toFixed(2);
  }
  isAutoCalculating = false;
}

// 加满开关
function onFullTankChange(e: any) {
  isFullTank.value = e.detail.value;
}

// 选择加油站
function onSelectStation() {
  uni.navigateBack();
}

// 上传小票
async function onChooseImage() {
  try {
    const res = await uni.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    });
    const tempFilePath = res.tempFilePaths[0];
    // 简化版：直接显示本地路径
    receiptUrl.value = tempFilePath;
    uni.showToast({ title: '照片已添加', icon: 'success' });
  } catch (error) {
    console.log('取消选择照片');
  }
}

// 保存记录
async function onSave() {
  if (!stationId.value) {
    uni.showToast({ title: '请选择加油站', icon: 'none' });
    return;
  }
  if (!amount.value || parseFloat(amount.value) <= 0) {
    uni.showToast({ title: '请输入有效金额', icon: 'none' });
    return;
  }
  if (!odometer.value || parseFloat(odometer.value) <= 0) {
    uni.showToast({ title: '请输入有效里程', icon: 'none' });
    return;
  }

  // 如果有车辆列表但没选车，要求选择
  if (vehicleStore.vehicles.length > 0 && !selectedVehicleId.value) {
    uni.showToast({ title: '请选择车辆', icon: 'none' });
    return;
  }

  saving.value = true;
  try {
    const result = await post<any>('/records', {
      stationId: stationId.value,
      grade: selectedGrade.value,
      amount: parseFloat(amount.value),
      volume: volume.value ? parseFloat(volume.value) : null,
      odometer: parseFloat(odometer.value),
      vehicleId: selectedVehicleId.value,
      isFullTank: isFullTank.value,
      receiptUrl: receiptUrl.value || null,
    });

    if (result.success) {
      uni.showToast({ title: '保存成功！', icon: 'success' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    }
  } catch (error: any) {
    console.error('保存失败:', error.message);
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.page-container {
  padding: 24rpx;
  padding-bottom: 180rpx;
  background: var(--color-bg);
  min-height: 100vh;
}

.station-card {
  display: flex;
  align-items: center;
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.station-icon {
  font-size: 48rpx;
  margin-right: 20rpx;
}

.station-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.station-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
}

.station-hint {
  font-size: 22rpx;
  color: var(--color-text-secondary);
}

.arrow {
  font-size: 36rpx;
  color: var(--color-text-secondary);
}

.form-section {
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 24rpx;
}

.form-row {
  margin-bottom: 32rpx;
}

.form-row:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 24rpx;
  color: var(--color-text-secondary);
  margin-bottom: 16rpx;
  font-weight: 500;
}

.grade-selector {
  display: flex;
  gap: 12rpx;
}

.grade-option {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 16rpx;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: 24rpx;
  font-weight: 500;
  transition: all 0.2s ease;
}

.grade-option.active {
  background: var(--btn-primary-bg);
  color: white;
}

.input-wrapper {
  display: flex;
  align-items: center;
  background: var(--color-bg);
  border-radius: 16rpx;
  padding: 0 24rpx;
  border: 2rpx solid transparent;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  height: 88rpx;
  box-sizing: border-box;
}

.input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4rpx rgba(255, 107, 53, 0.15);
}

.input-wrapper .input-field {
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  height: 100%;
  box-sizing: border-box;
}

.input-prefix,
.input-suffix {
  font-size: 28rpx;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.input-prefix {
  margin-right: 12rpx;
}

.input-suffix {
  margin-left: 12rpx;
}

.price-input {
  font-size: 36rpx !important;
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.photo-section {
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.photo-upload {
  width: 160rpx;
  height: 160rpx;
  border: 2rpx dashed #D1D5DB;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.upload-icon {
  font-size: 64rpx;
  color: #9CA3AF;
}

.receipt-preview {
  width: 100%;
  height: 100%;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 24rpx;
  background: white;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.05);
}

.save-btn {
  width: 100%;
  border: none;
}

// ---- 车辆选择 ----
.vehicle-section {
  padding: 24rpx;
  margin-bottom: 24rpx;
}

.vehicle-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.vehicle-chip {
  display: flex;
  align-items: center;
  padding: 12rpx 20rpx;
  background: var(--color-bg);
  border-radius: 32rpx;
  border: 2rpx solid transparent;
  font-size: 24rpx;
}

.vehicle-chip.active {
  border-color: var(--color-primary);
  background: #FFF5F0;
}

.chip-icon {
  font-size: 28rpx;
  margin-right: 8rpx;
}

.chip-name {
  font-weight: 500;
  color: var(--color-text);
  margin-right: 8rpx;
}

.chip-grade {
  color: var(--color-primary);
  font-size: 20rpx;
  background: rgba(255, 107, 53, 0.15);
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
}

.no-vehicle {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 0;
}

.hint-text {
  font-size: 24rpx;
  color: var(--color-text-secondary);
  margin-bottom: 8rpx;
}

.link-text {
  font-size: 24rpx;
  color: var(--color-primary);
  font-weight: 600;
}
</style>
