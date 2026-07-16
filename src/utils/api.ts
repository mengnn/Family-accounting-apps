// 记账应用前端类型定义
// window.api 由 preload 脚本通过 contextBridge 注入（见 electron/preload.ts）
// 其类型定义在 electron/preload.d.ts 中，这里仅导出业务数据类型

export type RecordType = 'expense' | 'income'

export interface RecordItem {
  id: number
  amount: number
  category_id: number
  date: string
  note: string
  type: RecordType
  category_name?: string
  parent_category_name?: string
  category_type?: string
  created_at?: string
}

export interface Category {
  id: number
  name: string
  parent_id: number | null
  type: RecordType
  sort_order: number
  is_default?: number
  children?: Category[]
  value?: number
  label?: string
}

export interface SummaryItem {
  parent_id: number
  parent_name: string
  type: RecordType
  category_name: string
  total: number
  count: number
}

export interface MonthlySummaryItem {
  month: string
  type: RecordType
  total: number
  count: number
}

export interface BudgetItem {
  category_id: number
  category_name: string
  budget_amount?: number
  spent: number
}

export interface YearBudgetItem {
  category_id: number
  category_name: string
  budget_amount?: number
  spent: number
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentKey = 'blue' | 'green' | 'orange' | 'purple'

export interface AppSettings {
  theme: ThemeMode
  accent: AccentKey
  currencySymbol: string
  decimalPlaces: number
  defaultType: 'expense' | 'income'
  defaultDateMode: 'today' | 'manual'
}
