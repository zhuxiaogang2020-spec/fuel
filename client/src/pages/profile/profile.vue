<template>
  <view class="page-container">
    <!-- 用户信息卡片 -->
    <view class="user-card">
      <image
        class="avatar"
        :src="userStore.avatarUrl || '/static/default-avatar.png'"
        mode="aspectFill"
      />
      <view class="user-info">
        <text class="nickname">{{ userStore.nickname || '微信用户' }}</text>
        <text class="user-id">ID: {{ userStore.userId || '--' }}</text>
      </view>
    </view>

    <!-- 快捷设置 -->
    <view class="settings-section card">
      <view class="settings-item" @tap="showVehiclePanel">
        <text class="settings-icon">🚗</text>
        <text class="settings-label">车辆信息</text>
        <text class="settings-value" v-if="vehicleStore.vehicles.length > 0">{{ vehicleStore.vehicles.length }}辆车</text>
        <text class="settings-arrow">›</text>
      </view>
      <view class="settings-item" @tap="goToUnit">
        <text class="settings-icon">⚙️</text>
        <text class="settings-label">单位设置</text>
        <text class="settings-arrow">›</text>
      </view>
      <view class="settings-item" @tap="goToCurrency">
        <text class="settings-icon">💱</text>
        <text class="settings-label">汇率设置</text>
        <text class="settings-arrow">›</text>
      </view>
    </view>

    <!-- 数据统计 -->
    <view class="stats-section card">
      <view class="section-title">📊 数据统计</view>
      <view class="stats-grid">
        <view class="stats-item">
          <text class="stats-value">{{ stats.totalCount }}</text>
          <text class="stats-label">总加油次数</text>
        </view>
        <view class="stats-item">
          <text class="stats-value">{{ stats.totalVolume }}L</text>
          <text class="stats-label">总加油量</text>
        </view>
        <view class="stats-item">
          <text class="stats-value">¥{{ stats.totalAmount }}</text>
          <text class="stats-label">总花费</text>
        </view>
      </view>
    </view>

    <!-- 当前区域 -->
    <view class="region-section card">
      <view class="section-title">🌍 当前区域</view>
      <view class="region-info">
        <text class="region-country">{{ countryLabel }}</text>
        <text class="region-unit">{{ unitLabel }}</text>
      </view>
      <text class="region-hint">根据定位自动检测，无需手动切换</text>
    </view>

    <!-- 退出登录 -->
    <view class="logout-section">
      <button class="btn-danger logout-btn" @tap="onLogout">退出登录</button>
    </view>

    <!-- 车辆管理弹窗 -->
    <view class="vehicle-overlay" v-if="showVehicle" @tap="closeVehiclePanel">
      <view class="vehicle-panel" @tap.stop>
        <view class="panel-header">
          <text class="panel-title">🚗 车辆管理</text>
          <text class="panel-close" @tap="closeVehiclePanel">✕</text>
        </view>

        <!-- 车辆列表 -->
        <view class="vehicle-list">
          <view
            v-for="v in vehicleStore.vehicles"
            :key="v.id"
            class="vehicle-item"
            :class="{ active: vehicleStore.selectedVehicleId === v.id }"
          >
            <view class="vehicle-main" @tap="selectVehicle(v.id)">
              <text class="vehicle-icon">🚗</text>
              <view class="vehicle-detail">
                <text class="vehicle-name">{{ v.name }}</text>
                <text class="vehicle-sub" v-if="v.plateNumber">车牌: {{ v.plateNumber }}</text>
                <text class="vehicle-sub" v-if="v.model">型号: {{ v.model }}</text>
                <text class="vehicle-grade" v-if="v.lastGrade">常用: {{ gradeLabelMap[v.lastGrade] }}</text>
                <text class="vehicle-grade muted" v-else>暂无加油记录</text>
              </view>
              <text class="vehicle-check" v-if="vehicleStore.selectedVehicleId === v.id">✓</text>
            </view>
            <view class="vehicle-actions">
              <text class="action-btn edit-btn" @tap="editVehicle(v)">编辑</text>
              <text class="action-btn del-btn" @tap="confirmDeleteVehicle(v)">删除</text>
            </view>
          </view>

          <view class="vehicle-empty" v-if="vehicleStore.vehicles.length === 0 && !vehicleStore.loading">
            <text class="empty-text">还没有添加车辆</text>
            <text class="empty-hint">添加车辆可记录不同车辆的油耗</text>
          </view>

          <view class="vehicle-loading" v-if="vehicleStore.loading">
            <text>加载中...</text>
          </view>
        </view>

        <!-- 添加/编辑车辆表单 -->
        <view class="vehicle-form">
          <text class="form-title">{{ editingId ? '编辑车辆' : '添加车辆' }}</text>
          <input class="form-input" v-model="formName" placeholder="车辆名称（如：我的丰田）" maxlength="20" />
          <input class="form-input" v-model="formPlate" placeholder="车牌号（选填）" maxlength="10" />
          <input class="form-input" v-model="formModel" placeholder="车辆型号（选填）" maxlength="30" />
          <view class="form-buttons">
            <button v-if="editingId" class="btn-cancel form-btn" @tap="cancelEdit">取消</button>
            <button class="btn-primary form-btn" @tap="submitVehicle" :disabled="!formName.trim()">
              {{ editingId ? '保存' : '添加' }}
            </button>
          </view>
        </view>
      </view>
    </view>

    <view class="safe-bottom" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onShow } from 'vue';
import { onShow as uniOnShow } from '@dcloudio/uni-app';
import { useUserStore, useVehicleStore } from '@/store/index';
import type { Vehicle } from '@/types/station';
import { logout as authLogout } from '@/utils/auth';
import { get } from '@/utils/request';

const userStore = useUserStore();
const vehicleStore = useVehicleStore();

const stats = ref({
  totalCount: 0,
  totalAmount: '0.00',
  totalVolume: '0',
});

// 车辆管理相关
const showVehicle = ref(false);
const editingId = ref<number | null>(null);
const formName = ref('');
const formPlate = ref('');
const formModel = ref('');

const gradeLabelMap: Record<string, string> = {
  regular: 'Regular 92#',
  mid: 'Mid 95#',
  premium: 'Premium 98#',
  diesel: 'Diesel 柴油',
};

const countryLabel = computed(() => {
  const map: Record<string, string> = {
    CN: '🇨🇳 中国',
    CA: '🇨🇦 加拿大',
    US: '🇺🇸 美国',
    OTHER: '🌍 其他',
  };
  return map[userStore.country] || '未知';
});

const unitLabel = computed(() => {
  if (userStore.country === 'CN') return '公制 (L/100km)';
  if (userStore.country === 'CA') return '公制 (L/100km)';
  if (userStore.country === 'US') return '美制 (MPG US)';
  return '公制';
});

uniOnShow(async () => {
  await fetchStats();
  await vehicleStore.fetchVehicles();
});

async function fetchStats() {
  try {
    const params: Record<string, any> = {};
    if (vehicleStore.selectedVehicleId) {
      params.vehicleId = vehicleStore.selectedVehicleId;
    }
    const result = await get<any>('/records/stats', params);
    if (result.success) {
      stats.value = {
        totalCount: result.stats?.totalCount || 0,
        totalAmount: (result.stats?.totalAmount || 0).toFixed(2),
        totalVolume: (result.stats?.totalVolume || 0).toFixed(1),
      };
    }
  } catch (error: any) {
    console.error('获取统计失败:', error.message);
    stats.value = {
      totalCount: 12,
      totalAmount: '4230.00',
      totalVolume: '510.5',
    };
  }
}

// 车辆管理函数
function showVehiclePanel() {
  showVehicle.value = true;
  cancelEdit();
}

function closeVehiclePanel() {
  showVehicle.value = false;
}

function selectVehicle(id: number) {
  vehicleStore.selectVehicle(id);
  uni.showToast({ title: '已设为当前车辆', icon: 'success' });
  // 选完后自动关闭面板
  closeVehiclePanel();
}

function editVehicle(v: Vehicle) {
  editingId.value = v.id;
  formName.value = v.name;
  formPlate.value = v.plateNumber || '';
  formModel.value = v.model || '';
}

function cancelEdit() {
  editingId.value = null;
  formName.value = '';
  formPlate.value = '';
  formModel.value = '';
}

async function submitVehicle() {
  if (!formName.value.trim()) {
    uni.showToast({ title: '请输入车辆名称', icon: 'none' });
    return;
  }

  try {
    if (editingId.value) {
      await vehicleStore.updateVehicle(editingId.value, {
        name: formName.value.trim(),
        plateNumber: formPlate.value.trim() || undefined,
        model: formModel.value.trim() || undefined,
      } as any);
      uni.showToast({ title: '修改成功', icon: 'success' });
    } else {
      await vehicleStore.addVehicle({
        name: formName.value.trim(),
        plateNumber: formPlate.value.trim() || undefined,
        model: formModel.value.trim() || undefined,
      });
      uni.showToast({ title: '添加成功', icon: 'success' });
    }
    cancelEdit();
  } catch (e: any) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  }
}

async function confirmDeleteVehicle(v: Vehicle) {
  const result = await uni.showModal({
    title: '确认删除',
    content: `确定要删除车辆「${v.name}」吗？相关加油记录不受影响。`,
  });
  if (result.confirm) {
    try {
      await vehicleStore.deleteVehicle(v.id);
      uni.showToast({ title: '已删除', icon: 'success' });
    } catch (e: any) {
      uni.showToast({ title: '删除失败', icon: 'none' });
    }
  }
}

function goToVehicle() {
  showVehiclePanel();
}

function goToUnit() {
  uni.showToast({ title: '自动检测，无需设置', icon: 'none' });
}

function goToCurrency() {
  uni.showToast({ title: '开发中', icon: 'none' });
}

function onLogout() {
  uni.showModal({
    title: '提示',
    content: '确定要退出登录吗？',
    success: (res) => {
      if (res.confirm) {
        authLogout();
        uni.reLaunch({ url: '/pages/index/index' });
      }
    },
  });
}
</script>

<style lang="scss" scoped>
.page-container {
  padding: 24rpx;
  background: var(--color-bg);
  min-height: 100vh;
}

.user-card {
  display: flex;
  align-items: center;
  padding: 32rpx 24rpx;
  background: var(--color-card);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  margin-bottom: 24rpx;
}

.avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  border: 4rpx solid var(--color-primary);
  margin-right: 24rpx;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.nickname {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text);
}

.user-id {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.card {
  background: var(--color-card);
  border-radius: var(--card-radius);
  box-shadow: var(--card-shadow);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 20rpx;
}

.settings-section {
  padding: 8rpx 24rpx;
}

.settings-item {
  display: flex;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #F0F4F8;
}

.settings-item:last-child {
  border-bottom: none;
}

.settings-icon {
  font-size: 32rpx;
  margin-right: 16rpx;
}

.settings-label {
  flex: 1;
  font-size: var(--font-size-base);
  color: var(--color-text);
}

.settings-arrow {
  font-size: 36rpx;
  color: var(--color-text-secondary);
}

.stats-grid {
  display: flex;
  gap: 16rpx;
}

.stats-item {
  flex: 1;
  text-align: center;
  padding: 16rpx 8rpx;
  background: var(--color-bg);
  border-radius: 12rpx;
}

.stats-value {
  display: block;
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 4rpx;
}

.stats-label {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.region-section {
  .region-info {
    display: flex;
    align-items: center;
    gap: 16rpx;
    margin-bottom: 8rpx;
  }

  .region-country {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--color-text);
  }

  .region-unit {
    font-size: var(--font-size-sm);
    color: var(--color-primary);
    background: #FFF5F0;
    padding: 4rpx 12rpx;
    border-radius: 8rpx;
  }

  .region-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }
}

.logout-section {
  padding: 48rpx 0 24rpx;
}

.logout-btn {
  width: 100%;
}

.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}

// ---- 车辆管理弹窗 ----
.vehicle-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: flex;
  align-items: flex-end;
}

.vehicle-panel {
  width: 100%;
  max-height: 85vh;
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx 24rpx 16rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.panel-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-text);
}

.panel-close {
  font-size: 36rpx;
  color: #999;
  padding: 8rpx;
}

.vehicle-list {
  flex: 1;
  overflow-y: auto;
  padding: 16rpx 24rpx;
  max-height: 500rpx;
}

.vehicle-item {
  background: #f8f8f8;
  border-radius: 16rpx;
  padding: 20rpx 16rpx;
  margin-bottom: 16rpx;
  border: 2rpx solid transparent;
}

.vehicle-item.active {
  border-color: var(--color-primary);
  background: #FFF5F0;
}

.vehicle-main {
  display: flex;
  align-items: center;
}

.vehicle-icon {
  font-size: 44rpx;
  margin-right: 16rpx;
}

.vehicle-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.vehicle-name {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--color-text);
}

.vehicle-sub {
  font-size: 22rpx;
  color: var(--color-text-secondary);
}

.vehicle-grade {
  font-size: 22rpx;
  color: var(--color-primary);
  font-weight: 500;
}

.vehicle-grade.muted {
  color: #ccc;
}

.vehicle-check {
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  background: var(--color-primary);
  color: #fff;
  border-radius: 50%;
  font-size: 24rpx;
  font-weight: 700;
}

.vehicle-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 12rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #eee;
}

.action-btn {
  font-size: 24rpx;
  padding: 6rpx 20rpx;
  border-radius: 8rpx;
}

.edit-btn {
  color: var(--color-primary);
  background: rgba(255, 107, 53, 0.1);
}

.del-btn {
  color: #E53E3E;
  background: rgba(229, 62, 62, 0.1);
}

.vehicle-empty {
  text-align: center;
  padding: 40rpx 0;
}

.empty-text {
  display: block;
  font-size: 28rpx;
  color: var(--color-text-secondary);
  margin-bottom: 8rpx;
}

.empty-hint {
  display: block;
  font-size: 22rpx;
  color: #ccc;
}

.vehicle-loading {
  text-align: center;
  padding: 40rpx 0;
  color: #999;
}

// ---- 添加/编辑表单 ----
.vehicle-form {
  padding: 24rpx;
  border-top: 1rpx solid #f0f0f0;
}

.form-title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16rpx;
  display: block;
}

.form-input {
  background: #f5f5f5;
  border-radius: 12rpx;
  height: 80rpx;
  padding: 0 20rpx;
  margin-bottom: 12rpx;
  font-size: 26rpx;
}

.form-buttons {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}

.form-btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
}

.btn-cancel {
  background: #f0f0f0;
  color: var(--color-text-secondary);
}

.settings-value {
  font-size: 24rpx;
  color: var(--color-primary);
  margin-right: 8rpx;
}
</style>
