<template>
  <view class="drawer-container" :class="{ open: isOpen }">
    <!-- 遮罩 -->
    <view
      v-if="isOpen"
      class="drawer-mask"
      @tap="onMaskTap"
    />

    <!-- 抽屉主体 -->
    <view class="drawer-body" :style="{ height: drawerHeight + 'px' }">
      <!-- 拖拽手柄 -->
      <view class="drag-handle" @touchstart="onDragStart" @touchmove="onDragMove" @touchend="onDragEnd">
        <view class="handle-bar" />
      </view>

      <!-- 折叠时显示摘要 -->
      <view v-if="!isFullyOpen" class="drawer-summary">
        <text class="summary-text">{{ summaryText }}</text>
        <text class="expand-hint">上拉展开 ▴</text>
      </view>

      <!-- 抽屉内容 -->
      <scroll-view
        v-show="isFullyOpen"
        class="drawer-content"
        scroll-y
      >
        <slot />
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

// 微信小程序中 window.innerHeight 不存在，用 uni.getSystemInfoSync
const winHeight = ref(0);
try { winHeight.value = uni.getSystemInfoSync().windowHeight; } catch (e) { winHeight.value = 667; }

const props = defineProps<{
  isOpen?: boolean;
  stationCount?: number;
  minHeight?: number;  // 折叠高度（px）
  maxHeight?: number;  // 展开高度比例（0-1）
}>();

const emit = defineEmits<{
  toggle: [];
  stateChange: [state: 'collapsed' | 'half' | 'full'];
}>();

const isOpen = ref(props.isOpen || false);
const drawerHeight = ref(props.minHeight || 200);
const isFullyOpen = ref(true);
const dragStartY = ref(0);
const startHeight = ref(0);

const summaryText = computed(() => {
  const count = props.stationCount || 0;
  return `附近找到 ${count} 个加油站`;
});

function onMaskTap() {
  close();
}

function toggle() {
  isOpen.value = !isOpen.value;
  emit('toggle');
}

function open() {
  isOpen.value = true;
  drawerHeight.value = winHeight.value * 0.5;
  isFullyOpen.value = true;
  emit('stateChange', 'full');
}

function close() {
  isOpen.value = false;
  isFullyOpen.value = false;
  drawerHeight.value = props.minHeight || 200;
  emit('stateChange', 'collapsed');
}

function onDragStart(e: TouchEvent) {
  dragStartY.value = e.touches[0].clientY;
  startHeight.value = drawerHeight.value;
}

function onDragMove(e: TouchEvent) {
  const delta = dragStartY.value - e.touches[0].clientY;
  const newHeight = Math.max(
    props.minHeight || 200,
    Math.min(startHeight.value + delta, winHeight.value * (props.maxHeight || 0.8))
  );
  drawerHeight.value = newHeight;
}

function onDragEnd() {
  const threshold = (props.minHeight || 200) * 1.5;
  if (drawerHeight.value > threshold) {
    isFullyOpen.value = true;
    drawerHeight.value = winHeight.value * 0.6;
    emit('stateChange', 'full');
  } else {
    isFullyOpen.value = false;
    drawerHeight.value = props.minHeight || 200;
    emit('stateChange', 'half');
  }
}

// 暴露方法给父组件
defineExpose({ toggle, open, close });

onMounted(() => {
  drawerHeight.value = winHeight.value * 0.5;
});
</script>

<style lang="scss" scoped>
.drawer-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  pointer-events: none;
}

.drawer-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  pointer-events: auto;
}

.drawer-body {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20rpx);
  border-radius: 32rpx 32rpx 0 0;
  box-shadow: 0 -8rpx 32rpx rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  transition: height 0.3s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drag-handle {
  display: flex;
  justify-content: center;
  padding: 16rpx 0 8rpx;
  cursor: grab;
}

.handle-bar {
  width: 64rpx;
  height: 8rpx;
  background: #D1D5DB;
  border-radius: 4rpx;
}

.drawer-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32rpx 16rpx;
}

.summary-text {
  font-size: 24rpx;
  color: #6B7280;
  font-weight: 500;
}

.expand-hint {
  font-size: 20rpx;
  color: #9CA3AF;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 24rpx 24rpx;
}
</style>
