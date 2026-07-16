<template>
  <div class="budget-view">
    <!-- 月份选择与总览 -->
    <div class="budget-toolbar">
      <div class="toolbar-left">
        <el-radio-group v-model="mode" @change="loadBudgets">
          <el-radio-button value="month">月度</el-radio-button>
          <el-radio-button value="year">年度</el-radio-button>
        </el-radio-group>
        <span class="label">{{ mode === 'month' ? '预算月份：' : '预算年份：' }}</span>
        <el-date-picker
          v-if="mode === 'month'"
          v-model="month"
          type="month"
          value-format="YYYY-MM"
          placeholder="选择月份"
          @change="loadBudgets"
          style="width: 160px"
        />
        <el-date-picker
          v-else
          v-model="year"
          type="year"
          value-format="YYYY"
          placeholder="选择年份"
          @change="loadBudgets"
          style="width: 160px"
        />
      </div>
      <div class="toolbar-summary">
        <span class="summary-item">
          总预算：<b class="text-primary">{{ formatMoney(totalBudget) }}</b>
        </span>
        <span class="summary-item">
          已支出：<b class="text-danger">{{ formatMoney(totalSpent) }}</b>
        </span>
        <span class="summary-item">
          剩余：<b :class="totalRemain >= 0 ? 'text-success' : 'text-danger'">
            {{ formatMoney(totalRemain) }}
          </b>
        </span>
      </div>
    </div>

    <!-- 整体进度 -->
    <div class="overall-progress" v-if="totalBudget > 0">
      <div class="progress-header">
        <span>{{ periodText }} 整体预算使用情况</span>
        <span :class="overallPercent >= 100 ? 'text-danger' : 'text-primary'">
          {{ overallPercent.toFixed(1) }}%
        </span>
      </div>
      <el-progress
        :percentage="Math.min(overallPercent, 100)"
        :color="overallColor"
        :stroke-width="16"
        :show-text="false"
      />
      <div class="over-budget-tip" v-if="overallPercent >= 100">
        ⚠️ 本月总支出已超出预算！
      </div>
    </div>

    <!-- 各分类预算表 -->
    <el-table :data="budgets" v-loading="loading" empty-text="暂无数据">
      <el-table-column prop="category_name" label="一级分类" width="160" />
      <el-table-column label="本月预算" width="160">
        <template #default="{ row }">
          <el-input-number
            v-model="row.budget_amount"
            :min="0"
            :precision="2"
            :step="100"
            size="small"
            controls-position="right"
            placeholder="未设置"
            style="width: 130px"
            @change="(v: number) => onBudgetChange(row, v)"
          />
        </template>
      </el-table-column>
      <el-table-column label="已支出" width="140" align="right">
        <template #default="{ row }">
          <span :class="isOverBudget(row) ? 'text-danger' : ''">
            {{ formatMoney(row.spent) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="剩余" width="120" align="right">
        <template #default="{ row }">
          <span :class="(row.budget_amount ?? 0) - row.spent < 0 ? 'text-danger' : 'text-success'">
            {{ formatMoney((row.budget_amount ?? 0) - row.spent) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="使用进度" min-width="240">
        <template #default="{ row }">
          <el-progress
            :percentage="(row.budget_amount ?? 0) > 0 ? Math.round((row.spent / row.budget_amount) * 100) : 0"
            :color="getProgressColor(row)"
            :stroke-width="12"
          />
          <span class="over-tip" v-if="isOverBudget(row)">⚠️ 超支</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" align="center">
        <template #default="{ row }">
          <el-button
            link
            type="danger"
            :disabled="!row.budget_amount"
            @click="onClearBudget(row)"
          >清除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="tip-box">
      💡 提示：在「本月预算 / 本年预算」一栏直接输入数字即可设置或修改预算，输入后自动保存。留空等同于未设预算。切换上方「月度 / 年度」可分别管理月预算与年预算。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { type BudgetItem, type YearBudgetItem } from '@/utils/api'
import { formatMoney } from '@/composables/useSettings'

const mode = ref<'month' | 'year'>('month')
const month = ref(new Date().toISOString().slice(0, 7))
const year = ref(new Date().toISOString().slice(0, 4))
const budgets = ref<BudgetItem[]>([])
const loading = ref(false)

const totalBudget = computed(() =>
  budgets.value.reduce((s, b) => s + (b.budget_amount ?? 0), 0)
)
const totalSpent = computed(() => budgets.value.reduce((s, b) => s + b.spent, 0))
const totalRemain = computed(() => totalBudget.value - totalSpent.value)
const overallPercent = computed(() =>
  totalBudget.value > 0 ? (totalSpent.value / totalBudget.value) * 100 : 0
)
const overallColor = computed(() => {
  if (overallPercent.value >= 100) return '#f56c6c'
  if (overallPercent.value >= 80) return '#e6a23c'
  return '#67c23a'
})

// 当前统计周期文案（月度显示 YYYY-MM，年度显示 YYYY）
const periodText = computed(() => (mode.value === 'month' ? month.value : year.value))

function isOverBudget(row: BudgetItem): boolean {
  return (row.budget_amount ?? 0) > 0 && row.spent > row.budget_amount!
}

function getProgressColor(row: BudgetItem): string {
  if (!row.budget_amount) return '#e4e7ed'
  const pct = row.spent / row.budget_amount
  if (pct >= 1) return '#f56c6c'
  if (pct >= 0.8) return '#e6a23c'
  return '#67c23a'
}

async function loadBudgets(): Promise<void> {
  loading.value = true
  try {
    const list =
      mode.value === 'month'
        ? ((await window.api.getBudgets({ month: month.value })) as BudgetItem[])
        : ((await window.api.getYearBudgets({ year: year.value })) as YearBudgetItem[])
    // 将未设置预算(0)转为 undefined，使 el-input-number 显示 placeholder
    budgets.value = list.map((b) => ({ ...b, budget_amount: b.budget_amount || undefined }))
  } catch (e) {
    ElMessage.error('加载预算失败')
    console.error(e)
  } finally {
    loading.value = false
  }
}

let saveTimer: any = null
function onBudgetChange(row: BudgetItem, value: number): void {
  // 防抖保存：避免连续输入时频繁写库
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      if (value > 0) {
        if (mode.value === 'month') {
          await window.api.setBudget({
            category_id: row.category_id,
            month: month.value,
            amount: value
          })
        } else {
          await window.api.setYearBudget({
            category_id: row.category_id,
            year: year.value,
            amount: value
          })
        }
      } else {
        if (mode.value === 'month') {
          await window.api.deleteBudget({
            category_id: row.category_id,
            month: month.value
          })
        } else {
          await window.api.deleteYearBudget({
            category_id: row.category_id,
            year: year.value
          })
        }
      }
    } catch (e) {
      ElMessage.error('保存预算失败')
      console.error(e)
    }
  }, 400)
}

async function onClearBudget(row: BudgetItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定清除「${row.category_name}」在 ${periodText.value} 的预算吗？`, '清除预算', {
      type: 'warning',
      confirmButtonText: '清除',
      cancelButtonText: '取消'
    })
    if (mode.value === 'month') {
      await window.api.deleteBudget({ category_id: row.category_id, month: month.value })
    } else {
      await window.api.deleteYearBudget({ category_id: row.category_id, year: year.value })
    }
    row.budget_amount = undefined
    ElMessage.success('已清除预算')
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('操作失败')
  }
}

onMounted(() => {
  loadBudgets()
})
</script>

<style scoped>
.budget-view {
  padding: 20px 24px;
}

.budget-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 14px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  flex-wrap: wrap;
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-size: 14px;
  color: #606266;
}

.toolbar-summary {
  display: flex;
  gap: 24px;
}

.summary-item {
  font-size: 14px;
  color: #606266;
}

.text-primary {
  color: #409eff;
}
.text-danger {
  color: #f56c6c;
}
.text-success {
  color: #67c23a;
}

.overall-progress {
  background: #fff;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
}

.over-budget-tip {
  color: #f56c6c;
  font-size: 13px;
  margin-top: 8px;
}

.tip-box {
  margin-top: 16px;
  padding: 12px 16px;
  background: #ecf5ff;
  border-radius: 6px;
  color: #409eff;
  font-size: 13px;
}

.over-tip {
  color: #f56c6c;
  font-size: 12px;
  margin-left: 8px;
}

:deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}
</style>
