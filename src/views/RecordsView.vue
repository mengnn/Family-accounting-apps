<template>
  <div class="records-view">
    <!-- 顶部统计卡 -->
    <div class="stat-cards">
      <div class="stat-card expense">
        <div class="stat-label">本月支出</div>
        <div class="stat-value">{{ formatMoney(monthExpense) }}</div>
      </div>
      <div class="stat-card income">
        <div class="stat-label">本月收入</div>
        <div class="stat-value">{{ formatMoney(monthIncome) }}</div>
      </div>
      <div class="stat-card balance">
        <div class="stat-label">本月结余</div>
        <div class="stat-value">{{ formatMoney(monthIncome - monthExpense) }}</div>
      </div>
      <div class="stat-card page-sum">
        <div class="stat-label">本页合计</div>
        <div class="stat-value">{{ formatMoney(pageTotal) }}</div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-radio-group v-model="filterType" @change="loadRecords" size="default">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="expense">支出</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          size="default"
          @change="loadRecords"
        />
        <el-cascader
          v-model="filterCategory"
          :options="categoryOptions"
          :props="cascaderProps"
          placeholder="全部分类"
          clearable
          @change="loadRecords"
          style="width: 180px"
        />
        <el-input
          v-model="keyword"
          placeholder="搜备注"
          clearable
          style="width: 140px"
          @change="loadRecords"
        />
        <el-button @click="resetFilter">重置</el-button>
      </div>
      <div class="toolbar-right">
        <el-button :icon="Download" @click="onExport">导出</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">记一笔</el-button>
      </div>
    </div>

    <!-- 记账列表 -->
    <el-table
      :data="records"
      v-loading="loading"
      style="width: 100%"
      :row-class-name="rowClassName"
      empty-text="暂无记账记录，点击右上角“记一笔”开始吧"
    >
      <el-table-column prop="date" label="日期" width="120" />
      <el-table-column label="类型" width="80">
        <template #default="{ row }">
          <el-tag :type="row.type === 'income' ? 'success' : 'danger'" effect="light" size="small">
            {{ row.type === 'income' ? '收入' : '支出' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="分类" width="180">
        <template #default="{ row }">
          <el-tag type="info" effect="plain">
            {{ row.parent_category_name }} / {{ row.category_name }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="金额" width="140" align="right">
        <template #default="{ row }">
          <span :class="['amount', row.type === 'income' ? 'income-amount' : 'expense-amount']">
            {{ row.type === 'income' ? '+' : '-' }}{{ formatMoney(row.amount) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="note" label="备注" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑弹窗 -->
    <RecordDialog v-model="dialogVisible" :record="editingRecord" @saved="onSaved" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Download } from '@element-plus/icons-vue'
import RecordDialog from '@/components/RecordDialog.vue'
import { type RecordItem, type Category, type RecordType } from '@/utils/api'
import { formatMoney } from '@/composables/useSettings'

const records = ref<RecordItem[]>([])
const categoryOptions = ref<Category[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editingRecord = ref<any>(null)

const dateRange = ref<[string, string] | null>(null)
const filterCategory = ref<number | null>(null)
const filterType = ref<'' | RecordType>('')
const keyword = ref('')

const cascaderProps = {
  expandTrigger: 'hover' as const,
  emitPath: false,
  checkStrictly: false
}

const pageTotal = computed(() =>
  records.value.reduce((sum, r) => (r.type === 'expense' ? sum - r.amount : sum + r.amount), 0)
)

function currentMonthStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const monthExpense = ref(0)
const monthIncome = ref(0)

async function loadMonthSummary(): Promise<void> {
  const ym = currentMonthStr()
  const start = `${ym}-01`
  // 计算当月最后一天作为结束日，避免把录入的"未来日期"记录误计入本月
  const [y, m] = ym.split('-').map(Number)
  const end = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  const data = (await window.api.getSummaryByCategory({ startDate: start, endDate: end })) as any[]
  monthExpense.value = data
    .filter((d) => d.type === 'expense')
    .reduce((s, d) => s + d.total, 0)
  monthIncome.value = data
    .filter((d) => d.type === 'income')
    .reduce((s, d) => s + d.total, 0)
}

function rowClassName({ rowIndex }: { rowIndex: number }): string {
  return rowIndex % 2 === 0 ? 'row-even' : 'row-odd'
}

async function loadRecords(): Promise<void> {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) {
      params.startDate = dateRange.value[0]
      params.endDate = dateRange.value[1]
    }
    if (filterCategory.value) params.categoryId = filterCategory.value
    if (filterType.value) params.type = filterType.value
    if (keyword.value) params.keyword = keyword.value
    records.value = (await window.api.getRecords(params)) as RecordItem[]
  } catch (e) {
    ElMessage.error('加载记账记录失败')
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function loadCategories(): Promise<void> {
  const data = (await window.api.getCategories()) as Category[]
  categoryOptions.value = data.map((item) => ({
    ...item,
    value: item.id,
    label: item.name,
    children: item.children
      ?.map((child) => ({
        ...child,
        value: child.id,
        label: child.name,
        children: undefined
      }))
  }))
}

function openAdd(): void {
  editingRecord.value = null
  dialogVisible.value = true
}

function openEdit(row: RecordItem): void {
  editingRecord.value = { ...row }
  dialogVisible.value = true
}

function onSaved(): void {
  loadRecords()
  loadMonthSummary()
}

async function onDelete(row: RecordItem): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除这笔 ${formatMoney(row.amount)} 的记账记录吗？`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    await window.api.deleteRecord(row.id)
    ElMessage.success('删除成功')
    loadRecords()
    loadMonthSummary()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
      console.error(e)
    }
  }
}

async function onExport(): Promise<void> {
  const params: any = {}
  if (dateRange.value) {
    params.startDate = dateRange.value[0]
    params.endDate = dateRange.value[1]
  }
  if (filterType.value) params.type = filterType.value
  try {
    const res = (await window.api.exportRecords(params)) as any
    if (res.success) {
      ElMessage.success(`成功导出 ${res.count} 条记录`)
    } else if (res.reason !== '取消导出') {
      ElMessage.warning(res.reason)
    }
  } catch (e) {
    ElMessage.error('导出失败')
    console.error(e)
  }
}

function resetFilter(): void {
  dateRange.value = null
  filterCategory.value = null
  filterType.value = ''
  keyword.value = ''
  loadRecords()
}

onMounted(async () => {
  await loadCategories()
  await loadRecords()
  await loadMonthSummary()
})
</script>

<style scoped>
.records-view {
  padding: 20px 24px;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 10px;
  padding: 16px 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
  border-left: 4px solid #409eff;
}

.stat-card.expense {
  border-left-color: #f56c6c;
}
.stat-card.income {
  border-left-color: #67c23a;
}
.stat-card.balance {
  border-left-color: #e6a23c;
}
.stat-card.page-sum {
  border-left-color: #409eff;
}

.stat-label {
  font-size: 13px;
  color: #909399;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  margin-top: 6px;
  color: #303133;
}

.stat-card.expense .stat-value {
  color: #f56c6c;
}
.stat-card.income .stat-value {
  color: #67c23a;
}
.stat-card.balance .stat-value {
  color: #e6a23c;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #fff;
  margin-bottom: 16px;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  flex-wrap: wrap;
  gap: 10px;
}

.toolbar-left {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  gap: 10px;
}

:deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}

:deep(.row-odd) {
  background-color: #fafafa;
}

.amount {
  font-weight: 600;
}

.expense-amount {
  color: #f56c6c;
}

.income-amount {
  color: #67c23a;
}
</style>
