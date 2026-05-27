<template>
  <view class="chart-container">
    <canvas
      v-if="history.length > 0"
      type="2d"
      id="fuelChart"
      class="chart-canvas"
      :style="{ width: '100%', height: canvasHeight + 'px' }"
    />
    <view v-else class="chart-empty">
      <text>📊 暂无数据</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, getCurrentInstance } from 'vue';

const props = defineProps<{
  history: Array<{ value: number; unit: string }>;
  unit?: 'L/100km' | 'MPG';
}>();

const { proxy } = getCurrentInstance()!;

const canvasHeight = ref(200);
const history = ref(props.history || []);

// 监听数据变化
watch(
  () => props.history,
  (newVal) => {
    history.value = newVal || [];
    nextTick(() => {
      if (history.value.length > 0) {
        drawChart();
      }
    });
  },
  { immediate: true }
);

onMounted(() => {
  if (history.value.length > 0) {
    nextTick(() => {
      drawChart();
    });
  }
});

function drawChart() {
  const query = uni.createSelectorQuery().in(proxy);
  query
    .select('#fuelChart')
    .fields({ node: true, size: true })
    .exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        // canvas 可能还没准备好，重试一次
        setTimeout(() => drawChart(), 300);
        return;
      }

      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = uni.getSystemInfoSync().pixelRatio || 2;
      const width = res[0].width;
      const height = res[0].height;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      renderChart(ctx, width, height, history.value);
    });
}

function renderChart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Array<{ value: number; unit: string }>
) {
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 清除画布
  ctx.clearRect(0, 0, width, height);

  // 计算数据范围
  const values = data.map((d) => d.value).filter((v) => v > 0);
  if (values.length === 0) return;

  const isMPG = props.unit === 'MPG';
  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);
  const valRange = maxVal - minVal || 1;

  // 背景网格
  ctx.strokeStyle = '#F0F4F8';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  // 绘制折线
  ctx.beginPath();
  ctx.strokeStyle = isMPG ? '#00C9A7' : '#FF6B35';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const points: { x: number; y: number }[] = [];

  data.forEach((d, i) => {
    const x = padding.left + (chartWidth / (data.length - 1 || 1)) * i;
    const y =
      padding.top +
      chartHeight -
      ((d.value - minVal) / valRange) * chartHeight;
    points.push({ x, y });

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.stroke();

  // 绘制数据点
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = isMPG ? '#00C9A7' : '#FF6B35';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Y轴标签
  ctx.fillStyle = '#6B7280';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const val = minVal + ((maxVal - minVal) / 4) * (4 - i);
    const y = padding.top + (chartHeight / 4) * i;
    ctx.fillText(isMPG ? Math.round(val).toString() : val.toFixed(1), padding.left - 6, y + 4);
  }
}
</script>

<style lang="scss" scoped>
.chart-container {
  width: 100%;
  .chart-canvas {
    width: 100%;
    height: 400rpx;
  }
  .chart-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 400rpx;
    color: #6b7280;
    font-size: 24rpx;
  }
}
</style>
