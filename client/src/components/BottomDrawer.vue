<template>
  <view class="drawer-container" :class="{ open: isOpen }">
    <!-- 抽屉主体 -->
    <view
      class="drawer-body"
      :style="{ height: drawerHeight + 'px', transition: isDragging ? 'none' : 'height 0.3s ease' }"
    >
      <!-- 拖拽手柄 -->
      <view class="drag-handle" @touchstart="onDragStart" @touchmove="onDragMove" @touchend="onDragEnd">
        <view class="handle-bar" />
      </view>

      <!-- 抽屉内容 -->
      <scroll-view
        class="drawer-content"
        scroll-y
        :style="{ height: (drawerHeight - dragHandleHeight) + 'px' }"
      >
        <slot />
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const winHeight = ref(0);
try { winHeight.value = uni.getWindowInfo().windowHeight; } catch (e) { winHeight.value = 667; }

const props = defineProps<{
  isOpen?: boolean;
  stationCount?: number;
}>();

const emit = defineEmits<{
  toggle: [];
  stateChange: [state: 'collapsed' | 'half' | 'full'];
}>();

// 三档高度：最小、半屏、全屏
const SNAP_COLLAPSED = 0.3;   // 30% 屏幕高度
const SNAP_HALF = 0.55;       // 55% 屏幕高度
const SNAP_FULL = 0.92;       // 92% 屏幕高度（留顶部状态栏）

const snapPoints = computed(() => ({
  collapsed: winHeight.value * SNAP_COLLAPSED,
  half: winHeight.value * SNAP_HALF,
  full: winHeight.value * SNAP_FULL,
}));

const dragHandleHeight = 44; // rpx drag handle area height in px

const isOpen = ref(props.isOpen ?? true);
const drawerHeight = ref(winHeight.value * SNAP_HALF);
const isDragging = ref(false);
const dragStartY = ref(0);
const startHeight = ref(0);
const currentState = ref<'collapsed' | 'half' | 'full'>('half');

// 找到最近的吸附点
function findNearestSnap(h: number): 'collapsed' | 'half' | 'full' {
  const snaps = snapPoints.value;
  const distances = [
    { key: 'collapsed' as const, d: Math.abs(h - snaps.collapsed) },
    { key: 'half' as const, d: Math.abs(h - snaps.half) },
    { key: 'full' as const, d: Math.abs(h - snaps.full) },
  ];
  distances.sort((a, b) => a.d - b.d);
  return distances[0].key;
}

function onDragStart(e: TouchEvent) {
  isDragging.value = true;
  dragStartY.value = e.touches[0].clientY;
  startHeight.value = drawerHeight.value;
}

function onDragMove(e: TouchEvent) {
  const delta = dragStartY.value - e.touches[0].clientY;
  const newHeight = Math.max(
    snapPoints.value.collapsed,
    Math.min(startHeight.value + delta, snapPoints.value.full)
  );
  drawerHeight.value = newHeight;
}

function onDragEnd() {
  isDragging.value = false;
  const snapped = findNearestSnap(drawerHeight.value);
  currentState.value = snapped;
  drawerHeight.value = snapPoints.value[snapped];
  emit('stateChange', snapped);
}

function toggle() {
  isOpen.value = !isOpen.value;
  emit('toggle');
}

function open() {
  isOpen.value = true;
  currentState.value = 'half';
  drawerHeight.value = snapPoints.value.half;
  emit('stateChange', 'half');
}

function close() {
  isOpen.value = false;
  currentState.value = 'collapsed';
  drawerHeight.value = snapPoints.value.collapsed;
  emit('stateChange', 'collapsed');
}

defineExpose({ toggle, open, close });

onMounted(() => {
  drawerHeight.value = snapPoints.value.half;
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.drag-handle {
  display: flex;
  justify-content: center;
  padding: 16rpx 0 8rpx;
  cursor: grab;
  flex-shrink: 0;
}

.handle-bar {
  width: 64rpx;
  height: 8rpx;
  background: #D1D5DB;
  border-radius: 4rpx;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 24rpx 24rpx;
}
</style>
