import { contextBridge, ipcRenderer } from 'electron'

// 通过 contextBridge 暴露给前端的安全 API
// 前端只能调用这里列出的方法，无法直接访问数据库或文件系统，保证安全
const api = {
  // ===== 分类 =====
  getCategories: (params?: { type?: string }) =>
    ipcRenderer.invoke('db:getCategories', params),
  addCategory: (params: { name: string; parent_id: number | null; type: string }) =>
    ipcRenderer.invoke('db:addCategory', params),
  updateCategory: (params: { id: number; name: string }) =>
    ipcRenderer.invoke('db:updateCategory', params),
  deleteCategory: (id: number) => ipcRenderer.invoke('db:deleteCategory', id),

  // ===== 记账记录 =====
  getRecords: (params: any) => ipcRenderer.invoke('db:getRecords', params),
  addRecord: (record: any) => ipcRenderer.invoke('db:addRecord', record),
  updateRecord: (record: any) => ipcRenderer.invoke('db:updateRecord', record),
  deleteRecord: (id: number) => ipcRenderer.invoke('db:deleteRecord', id),

  // ===== 统计 =====
  getSummaryByCategory: (params: any) =>
    ipcRenderer.invoke('db:getSummaryByCategory', params),
  getMonthlySummary: (params: any) => ipcRenderer.invoke('db:getMonthlySummary', params),

  // ===== 预算 =====
  getBudgets: (params: { month: string }) => ipcRenderer.invoke('db:getBudgets', params),
  setBudget: (params: { category_id: number; month: string; amount: number }) =>
    ipcRenderer.invoke('db:setBudget', params),
  deleteBudget: (params: { category_id: number; month: string }) =>
    ipcRenderer.invoke('db:deleteBudget', params),

  // ===== 年度预算 =====
  getYearBudgets: (params: { year: string }) =>
    ipcRenderer.invoke('db:getYearBudgets', params),
  setYearBudget: (params: { category_id: number; year: string; amount: number }) =>
    ipcRenderer.invoke('db:setYearBudget', params),
  deleteYearBudget: (params: { category_id: number; year: string }) =>
    ipcRenderer.invoke('db:deleteYearBudget', params),

  // ===== 导出 =====
  exportRecords: (params: { startDate?: string; endDate?: string; type?: string }) =>
    ipcRenderer.invoke('db:exportRecords', params),

  // ===== 设置 =====
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  saveSettings: (settings: Record<string, any>) =>
    ipcRenderer.invoke('db:saveSettings', settings),

  // ===== 数据备份 / 恢复 / 清空 =====
  exportData: () => ipcRenderer.invoke('db:exportData'),
  importData: () => ipcRenderer.invoke('db:importData'),
  clearAllData: () => ipcRenderer.invoke('db:clearAllData')
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error(error)
}

export type Api = typeof api
