<template>
  <div class="stats-view">
    <!-- 时间范围选择 -->
    <div class="stats-toolbar">
      <div class="toolbar-left">
        <el-radio-group v-model="rangeType" @change="onRangeTypeChange">
          <el-radio-button value="month">本月</el-radio-button>
          <el-radio-button value="year">本年</el-radio-button>
          <el-radio-button value="custom">自定义</el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-if="rangeType === 'custom'"
          v-model="customRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          @change="loadAll"
        />
      </div>
      <div class="range-text">{{ rangeLabel }}</div>
    </div>

    <!-- 概览卡片 -->
    <div class="overview-cards">
      <div class="ov-card expense">
        <div class="ov-label">总支出</div>
        <div class="ov-value">{{ formatMoney(totalExpense) }}</div>
      </div>
      <div class="ov-card income">
        <div class="ov-label">总收入</div>
        <div class="ov-value">{{ formatMoney(totalIncome) }}</div>
      </div>
      <div class="ov-card balance">
        <div class="ov-label">结余</div>
        <div class="ov-value">{{ formatMoney(totalIncome - totalExpense) }}</div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="charts-grid">
      <div class="chart-box">
        <div class="chart-title">支出分类占比</div>
        <div ref="pieChartRef" class="chart-canvas"></div>
      </div>
      <div class="chart-box">
        <div class="chart-title">月度收支趋势</div>
        <div ref="barChartRef" class="chart-canvas"></div>
      </div>
    </div>

    <!-- 分类明细排行 -->
    <div class="ranking-box">
      <div class="chart-title">支出分类排行 TOP 10</div>
      <el-table :data="expenseRanking" size="small" empty-text="暂无支出数据">
        <el-table-column type="index" label="排名" width="70" align="center" />
        <el-table-column prop="parent_name" label="一级分类" width="140" />
        <el-table-column prop="category_name" label="二级分类" min-width="140" />
        <el-table-column prop="count" label="笔数" width="100" align="center" />
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }">
            <span class="expense-amount">{{ formatMoney(row.total) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="占比" width="200">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.round((row.total / totalExpense) * 100) || 0"
              :color="'#f56c6c'"
              :stroke-width="10"
            />
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import { type SummaryItem, type MonthlySummaryItem } from '@/utils/api'
import { formatMoney } from '@/composables/useSettings'

const rangeType = ref<'month' | 'year' | 'custom'>('month')
const customRange = ref<[string, string] | null>(null)
const rangeLabel = ref('')

const pieChartRef = ref<HTMLElement>()
const barChartRef = ref<HTMLElement>()
let pieChart: echarts.ECharts | null = null
let barChart: echarts.ECharts | null = null

const summaryData = ref<SummaryItem[]>([])
const monthlyData = ref<MonthlySummaryItem[]>([])

const totalExpense = ref(0)
const totalIncome = ref(0)

const expenseRanking = ref<SummaryItem[]>([])

// 配色方案
const PIE_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#c0c4cc'
]

function computeRange(): { start?: string; end?: string } {
  const now = new Date()
  if (rangeType.value === 'month') {
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const start = `${ym}-01`
    const end = `${ym}-31`
    rangeLabel.value = `${ym}（本月）`
    return { start, end }
  } else if (rangeType.value === 'year') {
    const y = now.getFullYear()
    rangeLabel.value = `${y}年（本年）`
    return { start: `${y}-01-01`, end: `${y}-12-31` }
  } else {
    if (customRange.value) {
      rangeLabel.value = `${customRange.value[0]} 至 ${customRange.value[1]}`
      return { start: customRange.value[0], end: customRange.value[1] }
    }
    rangeLabel.value = '全部记录'
    return {}
  }
}

function onRangeTypeChange(): void {
  if (rangeType.value === 'custom' && !customRange.value) {
    const now = new Date().toISOString().slice(0, 10)
    customRange.value = [now, now]
  }
  loadAll()
}

async function loadAll(): Promise<void> {
  const range = computeRange()
  try {
    const [summary, monthly] = await Promise.all([
      window.api.getSummaryByCategory(range),
      window.api.getMonthlySummary(range)
    ])
    summaryData.value = summary as SummaryItem[]
    monthlyData.value = monthly as MonthlySummaryItem[]

    totalExpense.value = summaryData.value
      .filter((d) => d.type === 'expense')
      .reduce((s, d) => s + d.total, 0)
    totalIncome.value = summaryData.value
      .filter((d) => d.type === 'income')
      .reduce((s, d) => s + d.total, 0)

    expenseRanking.value = summaryData.value
      .filter((d) => d.type === 'expense')
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    await nextTick()
    renderPie()
    renderBar()
  } catch (e) {
    console.error('加载统计数据失败', e)
  }
}

function renderPie(): void {
  if (!pieChartRef.value) return
  if (!pieChart) pieChart = echarts.init(pieChartRef.value)

  // 按一级分类汇总支出
  const parentMap = new Map<string, number>()
  summaryData.value
    .filter((d) => d.type === 'expense')
    .forEach((d) => {
      parentMap.set(d.parent_name, (parentMap.get(d.parent_name) || 0) + d.total)
    })
  const pieData = Array.from(parentMap.entries())
    .map(([name, value], idx) => ({
      name,
      value,
      itemStyle: { color: PIE_COLORS[idx % PIE_COLORS.length] }
    }))
    .sort((a, b) => b.value - a.value)

  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: ${formatMoney(p.value)} (${p.percent}%)` },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        name: '支出占比',
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{d}%' },
        emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' } },
        data: pieData.length ? pieData : [{ name: '暂无数据', value: 0 }]
      }
    ]
  })
}

function renderBar(): void {
  if (!barChartRef.value) return
  if (!barChart) barChart = echarts.init(barChartRef.value)

  // 聚合月度数据
  const monthMap = new Map<string, { expense: number; income: number }>()
  monthlyData.value.forEach((d) => {
    if (!monthMap.has(d.month)) monthMap.set(d.month, { expense: 0, income: 0 })
    const item = monthMap.get(d.month)!
    if (d.type === 'expense') item.expense = d.total
    else item.income = d.total
  })
  const months = Array.from(monthMap.keys()).sort()
  const expenses = months.map((m) => monthMap.get(m)!.expense)
  const incomes = months.map((m) => monthMap.get(m)!.income)

  barChart.setOption({
    tooltip: { trigger: 'axis', formatter: (params: any) => {
      let html = params[0].axisValue + '<br/>'
      params.forEach((p: any) => {
        html += `${p.marker}${p.seriesName}: ${formatMoney(p.value)}<br/>`
      })
      return html
    }},
    legend: { data: ['支出', '收入'], bottom: 0 },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${v}` } },
    series: [
      {
        name: '支出',
        type: 'bar',
        data: expenses,
        itemStyle: { color: '#f56c6c', borderRadius: [4, 4, 0, 0] }
      },
      {
        name: '收入',
        type: 'bar',
        data: incomes,
        itemStyle: { color: '#67c23a', borderRadius: [4, 4, 0, 0] }
      }
    ]
  })
}

function handleResize(): void {
  pieChart?.resize()
  barChart?.resize()
}

watch(() => expenseRanking.value, () => {}, { deep: true })

onMounted(() => {
  loadAll()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  pieChart?.dispose()
  barChart?.dispose()
})
</script>

<style scoped>
.stats-view {
  padding: 20px 24px;
}

.stats-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  background: #fff;
  padding: 14px 16px;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.toolbar-left {
  display: flex;
  gap: 12px;
  align-items: center;
}

.range-text {
  color: #909399;
  font-size: 14px;
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.ov-card {
  background: #fff;
  border-radius: 10px;
  padding: 18px 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  border-left: 4px solid #409eff;
}

.ov-card.expense {
  border-left-color: #f56c6c;
}
.ov-card.income {
  border-left-color: #67c23a;
}
.ov-card.balance {
  border-left-color: #e6a23c;
}

.ov-label {
  font-size: 13px;
  color: #909399;
}

.ov-value {
  font-size: 26px;
  font-weight: 600;
  margin-top: 6px;
}

.ov-card.expense .ov-value {
  color: #f56c6c;
}
.ov-card.income .ov-value {
  color: #67c23a;
}
.ov-card.balance .ov-value {
  color: #e6a23c;
}

.charts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.chart-box {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.chart-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #303133;
}

.chart-canvas {
  height: 320px;
  width: 100%;
}

.ranking-box {
  background: #fff;
  border-radius: 10px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.expense-amount {
  color: #f56c6c;
  font-weight: 600;
}
</style>
