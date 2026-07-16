import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { readFileSync, writeFileSync } from 'fs'
import { initDatabase, getDb } from './database'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: '家庭超级记账',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.family.super-accounting')
  initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ===== IPC 通信处理（前端调用数据库的桥梁）=====

function registerIpcHandlers(): void {
  // ---------- 分类 ----------
  // 查询所有分类（含两级），组装成树形结构
  ipcMain.handle('db:getCategories', (_event, params?: { type?: string }) => {
    const db = getDb()
    let sql = 'SELECT * FROM categories ORDER BY type DESC, sort_order, id'
    let categories: any[]
    if (params?.type) {
      categories = db
        .prepare('SELECT * FROM categories WHERE type = ? ORDER BY sort_order, id')
        .all(params.type) as any[]
    } else {
      categories = db.prepare(sql).all() as any[]
    }
    const tree: any[] = []
    const map = new Map<number, any>()
    categories
      .filter((c) => c.parent_id === null)
      .forEach((c) => {
        const node = { ...c, children: [] }
        map.set(c.id, node)
        tree.push(node)
      })
    categories
      .filter((c) => c.parent_id !== null)
      .forEach((c) => {
        const parent = map.get(c.parent_id)
        if (parent) parent.children.push(c)
      })
    return tree
  })

  // 新增分类
  ipcMain.handle(
    'db:addCategory',
    (_event, params: { name: string; parent_id: number | null; type: string }) => {
      const db = getDb()
      // 计算 sort_order
      const orderRow = db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE parent_id IS ?')
        .get(params.parent_id ?? null) as { m: number }
      const result = db
        .prepare(
          'INSERT INTO categories (name, parent_id, sort_order, type) VALUES (?, ?, ?, ?)'
        )
        .run(params.name, params.parent_id, orderRow.m + 1, params.type || 'expense')
      return { id: result.lastInsertRowid }
    }
  )

  // 重命名分类（系统默认分类不允许修改）
  ipcMain.handle('db:updateCategory', (_event, params: { id: number; name: string }) => {
    const db = getDb()
    const row = db
      .prepare('SELECT is_default FROM categories WHERE id = ?')
      .get(params.id) as { is_default: number } | undefined
    if (row && row.is_default === 1) {
      return { success: false, reason: '系统默认分类不支持修改' }
    }
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(params.name, params.id)
    return { success: true }
  })

  // 删除分类（系统默认分类不允许删除；有记账记录的需先处理）
  ipcMain.handle('db:deleteCategory', (_event, id: number) => {
    const db = getDb()
    const row = db
      .prepare('SELECT is_default FROM categories WHERE id = ?')
      .get(id) as { is_default: number } | undefined
    if (row && row.is_default === 1) {
      return { success: false, reason: '系统默认分类不支持删除' }
    }
    // 检查是否有关联的记账记录
    const usedCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM records WHERE category_id = ?
         OR category_id IN (SELECT id FROM categories WHERE parent_id = ?)`
      )
      .get(id, id) as { c: number }
    if (usedCount.c > 0) {
      return { success: false, reason: '该分类下有记账记录，请先删除或转移相关记录' }
    }
    // 先删子分类，再删自身
    db.prepare('DELETE FROM categories WHERE parent_id = ?').run(id)
    db.prepare('DELETE FROM categories WHERE id = ?').run(id)
    return { success: true }
  })

  // ---------- 记账记录 ----------
  ipcMain.handle(
    'db:getRecords',
    (
      _event,
      params: {
        categoryId?: number
        startDate?: string
        endDate?: string
        type?: string
        keyword?: string
      }
    ) => {
      const db = getDb()
      let sql = `
        SELECT r.*, c2.name AS category_name, c1.name AS parent_category_name, c1.type AS category_type
        FROM records r
        LEFT JOIN categories c2 ON r.category_id = c2.id
        LEFT JOIN categories c1 ON c2.parent_id = c1.id
        WHERE 1=1
      `
      const args: any[] = []
      if (params.categoryId) {
        sql += ` AND (c2.id = ? OR c1.id = ?)`
        args.push(params.categoryId, params.categoryId)
      }
      if (params.startDate) {
        sql += ` AND r.date >= ?`
        args.push(params.startDate)
      }
      if (params.endDate) {
        sql += ` AND r.date <= ?`
        args.push(params.endDate)
      }
      if (params.type) {
        sql += ` AND r.type = ?`
        args.push(params.type)
      }
      if (params.keyword) {
        sql += ` AND r.note LIKE ?`
        args.push(`%${params.keyword}%`)
      }
      sql += ` ORDER BY r.date DESC, r.id DESC`
      const rows = db.prepare(sql).all(...args) as any[]
      rows.forEach((r: any) => { r.amount = r.amount / 100 })
      return rows
    }
  )

  ipcMain.handle(
    'db:addRecord',
    (_event, record: {
      amount: number
      category_id: number
      date: string
      note?: string
      type: string
    }) => {
      const db = getDb()
      const result = db
        .prepare(
          `INSERT INTO records (amount, category_id, date, note, type) VALUES (?, ?, ?, ?, ?)`
        )
        .run(Math.round(record.amount * 100), record.category_id, record.date, record.note || '', record.type)
      return { id: result.lastInsertRowid }
    }
  )

  ipcMain.handle(
    'db:updateRecord',
    (_event, record: {
      id: number
      amount: number
      category_id: number
      date: string
      note?: string
      type: string
    }) => {
      const db = getDb()
      db.prepare(
        `UPDATE records SET amount = ?, category_id = ?, date = ?, note = ?, type = ? WHERE id = ?`
      ).run(
        Math.round(record.amount * 100),
        record.category_id,
        record.date,
        record.note || '',
        record.type,
        record.id
      )
      return { success: true }
    }
  )

  ipcMain.handle('db:deleteRecord', (_event, id: number) => {
    const db = getDb()
    db.prepare(`DELETE FROM records WHERE id = ?`).run(id)
    return { success: true }
  })

  // ---------- 统计 ----------
  // 按分类汇总金额（区分收支）
  ipcMain.handle(
    'db:getSummaryByCategory',
    (_event, params: { startDate?: string; endDate?: string; type?: string }) => {
      const db = getDb()
      let sql = `
        SELECT c1.id AS parent_id, c1.name AS parent_name, c1.type AS type,
               c2.name AS category_name, SUM(r.amount) AS total, COUNT(*) AS count
        FROM records r
        LEFT JOIN categories c2 ON r.category_id = c2.id
        LEFT JOIN categories c1 ON c2.parent_id = c1.id
        WHERE 1=1
      `
      const args: any[] = []
      if (params.startDate) {
        sql += ` AND r.date >= ?`
        args.push(params.startDate)
      }
      if (params.endDate) {
        sql += ` AND r.date <= ?`
        args.push(params.endDate)
      }
      if (params.type) {
        sql += ` AND r.type = ?`
        args.push(params.type)
      }
      sql += ` GROUP BY c1.id, c2.id ORDER BY total DESC`
      const rows = db.prepare(sql).all(...args) as any[]
      rows.forEach((r: any) => { r.total = r.total / 100 })
      return rows
    }
  )

  // 按月汇总（用于柱状图/趋势）
  ipcMain.handle(
    'db:getMonthlySummary',
    (_event, params: { startDate?: string; endDate?: string }) => {
      const db = getDb()
      let sql = `
        SELECT
          strftime('%Y-%m', r.date) AS month,
          r.type AS type,
          SUM(r.amount) AS total,
          COUNT(*) AS count
        FROM records r
        WHERE 1=1
      `
      const args: any[] = []
      if (params.startDate) {
        sql += ` AND r.date >= ?`
        args.push(params.startDate)
      }
      if (params.endDate) {
        sql += ` AND r.date <= ?`
        args.push(params.endDate)
      }
      sql += ` GROUP BY month, r.type ORDER BY month`
      const rows = db.prepare(sql).all(...args) as any[]
      rows.forEach((r: any) => { r.total = r.total / 100 })
      return rows
    }
  )

  // ---------- 预算 ----------
  // 查询某月所有一级分类的预算及实际支出
  ipcMain.handle('db:getBudgets', (_event, params: { month: string }) => {
    const db = getDb()
    const sql = `
      SELECT c.id AS category_id, c.name AS category_name,
             COALESCE(b.amount, 0) AS budget_amount,
             COALESCE(s.spent, 0) AS spent
      FROM categories c
      LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ?
      LEFT JOIN (
        SELECT c1.id AS pid, SUM(r.amount) AS spent
        FROM records r
        LEFT JOIN categories c2 ON r.category_id = c2.id
        LEFT JOIN categories c1 ON c2.parent_id = c1.id
        WHERE r.type = 'expense' AND strftime('%Y-%m', r.date) = ?
        GROUP BY c1.id
      ) s ON s.pid = c.id
      WHERE c.parent_id IS NULL AND c.type = 'expense'
      ORDER BY c.sort_order
    `
    const rows = db.prepare(sql).all(params.month, params.month) as any[]
    rows.forEach((r: any) => {
      r.budget_amount = r.budget_amount / 100
      r.spent = r.spent / 100
    })
    return rows
  })

  // 设置/更新某分类某月预算
  ipcMain.handle(
    'db:setBudget',
    (_event, params: { category_id: number; month: string; amount: number }) => {
      const db = getDb()
      db.prepare(
        `INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?)
         ON CONFLICT(category_id, month) DO UPDATE SET amount = excluded.amount`
      ).run(params.category_id, params.month, Math.round(params.amount * 100))
      return { success: true }
    }
  )

  // 删除某分类某月预算
  ipcMain.handle(
    'db:deleteBudget',
    (_event, params: { category_id: number; month: string }) => {
      const db = getDb()
      db.prepare('DELETE FROM budgets WHERE category_id = ? AND month = ?').run(
        params.category_id,
        params.month
      )
      return { success: true }
    }
  )

  // 查询某年所有一级分类的预算及实际支出（年度）
  ipcMain.handle('db:getYearBudgets', (_event, params: { year: string }) => {
    const db = getDb()
    const sql = `
      SELECT c.id AS category_id, c.name AS category_name,
             COALESCE(b.amount, 0) AS budget_amount,
             COALESCE(s.spent, 0) AS spent
      FROM categories c
      LEFT JOIN budgets_year b ON b.category_id = c.id AND b.year = ?
      LEFT JOIN (
        SELECT c1.id AS pid, SUM(r.amount) AS spent
        FROM records r
        LEFT JOIN categories c2 ON r.category_id = c2.id
        LEFT JOIN categories c1 ON c2.parent_id = c1.id
        WHERE r.type = 'expense' AND strftime('%Y', r.date) = ?
        GROUP BY c1.id
      ) s ON s.pid = c.id
      WHERE c.parent_id IS NULL AND c.type = 'expense'
      ORDER BY c.sort_order
    `
    const rows = db.prepare(sql).all(params.year, params.year) as any[]
    rows.forEach((r: any) => {
      r.budget_amount = r.budget_amount / 100
      r.spent = r.spent / 100
    })
    return rows
  })

  // 设置/更新某分类某年预算
  ipcMain.handle(
    'db:setYearBudget',
    (_event, params: { category_id: number; year: string; amount: number }) => {
      const db = getDb()
      db.prepare(
        `INSERT INTO budgets_year (category_id, year, amount) VALUES (?, ?, ?)
         ON CONFLICT(category_id, year) DO UPDATE SET amount = excluded.amount`
      ).run(params.category_id, params.year, Math.round(params.amount * 100))
      return { success: true }
    }
  )

  // 删除某分类某年预算
  ipcMain.handle(
    'db:deleteYearBudget',
    (_event, params: { category_id: number; year: string }) => {
      const db = getDb()
      db.prepare('DELETE FROM budgets_year WHERE category_id = ? AND year = ?').run(
        params.category_id,
        params.year
      )
      return { success: true }
    }
  )

  // ---------- 导出 Excel/CSV ----------
  ipcMain.handle(
    'db:exportRecords',
    async (
      _event,
      params: { startDate?: string; endDate?: string; type?: string }
    ) => {
      const db = getDb()
      let sql = `
        SELECT r.date AS 日期, r.type AS 类型, c1.name AS 一级分类, c2.name AS 二级分类,
               r.amount AS 金额, r.note AS 备注, r.created_at AS 记录时间
        FROM records r
        LEFT JOIN categories c2 ON r.category_id = c2.id
        LEFT JOIN categories c1 ON c2.parent_id = c1.id
        WHERE 1=1
      `
      const args: any[] = []
      if (params.startDate) {
        sql += ` AND r.date >= ?`
        args.push(params.startDate)
      }
      if (params.endDate) {
        sql += ` AND r.date <= ?`
        args.push(params.endDate)
      }
      if (params.type) {
        sql += ` AND r.type = ?`
        args.push(params.type)
      }
      sql += ` ORDER BY r.date DESC, r.id DESC`
      const rows = db.prepare(sql).all(...args) as any[]

      // 类型中文化
      const typeMap: Record<string, string> = { expense: '支出', income: '收入' }
      rows.forEach((r) => {
        r.类型 = typeMap[r.类型] || r.类型
        r.金额 = Number(r.金额) / 100
      })

      // 生成 CSV（带 BOM，Excel 能正确识别中文）
      if (rows.length === 0) {
        return { success: false, reason: '没有可导出的记录' }
      }
      const headers = Object.keys(rows[0])
      const escapeCsv = (val: any): string => {
        const s = val === null || val === undefined ? '' : String(val)
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`
        }
        return s
      }
      const csvLines = [headers.join(',')]
      rows.forEach((row) => {
        csvLines.push(headers.map((h) => escapeCsv(row[h])).join(','))
      })
      const csvContent = '﻿' + csvLines.join('\r\n')

      // 让用户选择保存位置
      const defaultName = `记账记录_${new Date().toISOString().slice(0, 10)}.csv`
      const result = await dialog.showSaveDialog({
        title: '导出记账记录',
        defaultPath: defaultName,
        filters: [
          { name: 'CSV 文件（Excel 可打开）', extensions: ['csv'] }
        ]
      })
      if (result.canceled || !result.filePath) {
        return { success: false, reason: '取消导出' }
      }
      await writeFile(result.filePath, csvContent, 'utf-8')
      return { success: true, path: result.filePath, count: rows.length }
    }
  )
}

// ===== 设置 =====
ipcMain.handle('db:getSettings', () => {
    const db = getDb()
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all() as any[]
    const obj: Record<string, any> = {}
    for (const r of rows) {
      try {
        obj[r.key] = JSON.parse(r.value)
      } catch {
        obj[r.key] = r.value
      }
    }
    return obj
  } catch (e) {
    console.error('getSettings error', e)
    return {}
  }
})

ipcMain.handle('db:saveSettings', (_e, s: Record<string, any>) => {
    const db = getDb()
  try {
    const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    const tx = db.transaction((obj: Record<string, any>) => {
      for (const [k, v] of Object.entries(obj)) {
        upsert.run(k, JSON.stringify(v))
      }
    })
    tx(s)
    return { ok: true }
  } catch (e) {
    console.error('saveSettings error', e)
    return { ok: false, error: String(e) }
  }
})

// ===== 数据备份 / 恢复 / 清空 =====
ipcMain.handle('db:exportData', async () => {
    const db = getDb()
  try {
    const win = BrowserWindow.getFocusedWindow() || undefined
    const defaultName = `家庭记账备份_${new Date().toISOString().slice(0, 10)}.json`
    const result = await dialog.showSaveDialog(win!, {
      title: '导出数据备份',
      defaultPath: defaultName,
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) {
      return { ok: false, cancelled: true }
    }
    const settingsRows = db.prepare('SELECT key, value FROM settings').all() as any[]
    const settingsObj: Record<string, any> = {}
    for (const r of settingsRows) {
      try {
        settingsObj[r.key] = JSON.parse(r.value)
      } catch {
        settingsObj[r.key] = r.value
      }
    }
    const data = {
      app: 'family-super-accounting',
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: db.prepare('SELECT id, name, parent_id, type, sort_order, is_default FROM categories').all(),
      records: db.prepare('SELECT * FROM records').all(),
      budgets: db.prepare('SELECT * FROM budgets').all(),
      budgets_year: db.prepare('SELECT * FROM budgets_year').all(),
      settings: settingsObj
    }
    writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
    return { ok: true, path: result.filePath }
  } catch (e) {
    console.error('exportData error', e)
    return { ok: false, error: String(e) }
  }
})

ipcMain.handle('db:importData', async () => {
    const db = getDb()
  try {
    const win = BrowserWindow.getFocusedWindow() || undefined
    const result = await dialog.showOpenDialog(win!, {
      title: '导入数据备份',
      filters: [{ name: 'JSON 备份', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) {
      return { ok: false, cancelled: true }
    }
    const raw = readFileSync(result.filePaths[0], 'utf-8')
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.records) || !Array.isArray(data.categories)) {
      return { ok: false, error: '备份文件格式不正确' }
    }
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM records').run()
      db.prepare('DELETE FROM budgets').run()
      db.prepare('DELETE FROM budgets_year').run()
      db.prepare('DELETE FROM categories').run()
      const insCat = db.prepare(
        'INSERT INTO categories (id, name, parent_id, type, sort_order, is_default) VALUES (?, ?, ?, ?, ?, ?)'
      )
      for (const c of data.categories) {
        insCat.run(c.id, c.name, c.parent_id, c.type, c.sort_order, c.is_default ?? 0)
      }
      if (Array.isArray(data.records) && data.records.length) {
        const cols = Object.keys(data.records[0])
        const ph = cols.map(() => '?').join(',')
        const insRec = db.prepare(`INSERT INTO records (${cols.join(',')}) VALUES (${ph})`)
        for (const r of data.records) insRec.run(...cols.map((k: string) => r[k]))
      }
      if (Array.isArray(data.budgets) && data.budgets.length) {
        const cols = Object.keys(data.budgets[0])
        const ph = cols.map(() => '?').join(',')
        const insB = db.prepare(`INSERT INTO budgets (${cols.join(',')}) VALUES (${ph})`)
        for (const b of data.budgets) insB.run(...cols.map((k: string) => b[k]))
      }
      if (Array.isArray(data.budgets_year) && data.budgets_year.length) {
        const cols = Object.keys(data.budgets_year[0])
        const ph = cols.map(() => '?').join(',')
        const insBY = db.prepare(`INSERT INTO budgets_year (${cols.join(',')}) VALUES (${ph})`)
        for (const b of data.budgets_year) insBY.run(...cols.map((k: string) => b[k]))
      }
      db.prepare('DELETE FROM settings').run()
      const insSet = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      for (const [k, v] of Object.entries(data.settings || {})) {
        insSet.run(k, JSON.stringify(v))
      }
    })
    tx()
    return { ok: true }
  } catch (e) {
    console.error('importData error', e)
    return { ok: false, error: String(e) }
  }
})

ipcMain.handle('db:clearAllData', () => {
    const db = getDb()
  try {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM records').run()
      db.prepare('DELETE FROM budgets').run()
      db.prepare('DELETE FROM budgets_year').run()
    })
    tx()
    return { ok: true }
  } catch (e) {
    console.error('clearAllData error', e)
    return { ok: false, error: String(e) }
  }
})

