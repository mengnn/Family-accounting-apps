import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

let db: Database.Database | null = null

/**
 * 初始化本地 SQLite 数据库
 * 数据库文件保存在用户数据目录下，确保用户隐私安全（无需联网）
 */
export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'accounting.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // 注意顺序：先建表（不含依赖 type 列的索引），再做结构迁移（补 type 列），
  // 最后建依赖 type 列的索引。这样旧库升级时不会因列缺失而失败。
  createTables()
  migrateSchema()
  createDependentIndexes()
  seedCategories()
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('数据库尚未初始化')
  }
  return db
}

function createTables(): void {
  if (!db) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      type TEXT DEFAULT 'expense',
      icon TEXT,
      is_default INTEGER DEFAULT 0,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      type TEXT DEFAULT 'expense',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- 预算表：按一级分类设月预算（month 格式 YYYY-MM）
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      amount INTEGER NOT NULL,
      UNIQUE(category_id, month),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- 年度预算表：按一级分类设年预算（year 格式 YYYY）
    CREATE TABLE IF NOT EXISTS budgets_year (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      year TEXT NOT NULL,
      amount INTEGER NOT NULL,
      UNIQUE(category_id, year),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- 设置表：key-value 存储应用偏好（主题、货币符号等）
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_records_date ON records(date);
    CREATE INDEX IF NOT EXISTS idx_records_category ON records(category_id);
  `)
}

/**
 * 创建依赖 type 列的索引。必须在 migrateSchema() 之后调用，
 * 以保证旧库升级时 records/categories 表已补上 type 列。
 */
function createDependentIndexes(): void {
  if (!db) return
  db.exec(`CREATE INDEX IF NOT EXISTS idx_records_type ON records(type);`)
}

/**
 * 数据库结构迁移：兼容旧版本升级，保证已有记账数据不丢失。
 * 旧版 records 表没有 type 字段、categories 没有 type 字段，需补上。
 */
function migrateSchema(): void {
  if (!db) return
  // 给 records 表加 type 字段（若不存在）
  const recordsCols = db.prepare('PRAGMA table_info(records)').all() as Array<{ name: string }>
  if (!recordsCols.some((c) => c.name === 'type')) {
    db.exec(`ALTER TABLE records ADD COLUMN type TEXT DEFAULT 'expense'`)
  }
  // 给 categories 表加 type 字段（若不存在）
  const catCols = db.prepare('PRAGMA table_info(categories)').all() as Array<{ name: string }>
  if (!catCols.some((c) => c.name === 'type')) {
    db.exec(`ALTER TABLE categories ADD COLUMN type TEXT DEFAULT 'expense'`)
  }
  // 修复历史数据：ALTER TABLE 加列时旧行该列为 NULL，统一补成 'expense'
  db.prepare("UPDATE records SET type = 'expense' WHERE type IS NULL").run()
  db.prepare("UPDATE categories SET type = 'expense' WHERE type IS NULL").run()
  // 给 categories 表加 is_default 字段（若不存在）：用于区分系统默认分类与用户新增分类
  if (!catCols.some((c) => c.name === 'is_default')) {
    db.exec(`ALTER TABLE categories ADD COLUMN is_default INTEGER DEFAULT 0`)
  }
  // 金额从 REAL(元) 迁移为整数分：仅对仍为浮点的值生效，已迁移(整数)则跳过，
  // 避免重复迁移把已是分的金额再 ×100
  db.prepare(`UPDATE records SET amount = CAST(ROUND(amount * 100) AS INTEGER) WHERE typeof(amount) = 'real'`).run()
  db.prepare(`UPDATE budgets SET amount = CAST(ROUND(amount * 100) AS INTEGER) WHERE typeof(amount) = 'real'`).run()

  // 旧库升级：将已存在的系统默认分类按名称标记为 is_default = 1
  // （用户自建的同名分类也会被标记，但这是极小概率的边界情况，权衡后可接受）
  markDefaultCategories()
  // 预算表已由 createTables 创建（IF NOT EXISTS）
}

/**
 * 将已知的系统默认分类名标记为 is_default = 1。
 * 用于旧库升级（旧行 is_default 为 NULL/0，需补标记）以及每次启动的兜底修复。
 */
function markDefaultCategories(): void {
  if (!db) return
  const names = new Set<string>()
  defaultCategories.forEach((cat) => {
    names.add(cat.parent)
    cat.children.forEach((c) => names.add(c))
  })
  names.add('收入')
  incomeCategories.forEach((c) => names.add(c))

  if (names.size === 0) return
  const placeholders = Array.from(names).map(() => '?').join(',')
  // 名称匹配且当前未被标记为默认的，标为默认
  db.prepare(
    `UPDATE categories SET is_default = 1 WHERE name IN (${placeholders}) AND (is_default IS NULL OR is_default = 0)`
  ).run(...Array.from(names))
}

/**
 * 初始化默认分类（二级分类）
 * - 分类表为空：插入全部默认支出+收入分类
 * - 分类表非空但无 income 分类（旧库升级）：补插入收入分类
 */
function seedCategories(): void {
  if (!db) return
  const count = db.prepare('SELECT COUNT(*) AS c FROM categories').get() as { c: number }
  const incomeCount = db
    .prepare("SELECT COUNT(*) AS c FROM categories WHERE type = 'income'")
    .get() as { c: number }

  // 旧库已有支出分类但缺收入分类：仅补收入
  if (count.c > 0 && incomeCount.c === 0) {
    seedIncomeCategories()
    return
  }
  // 已有完整分类，跳过
  if (count.c > 0) return

  const insertParent = db.prepare(
    "INSERT INTO categories (name, parent_id, sort_order, type, is_default) VALUES (?, NULL, ?, ?, 1)"
  )
  const insertChild = db.prepare(
    'INSERT INTO categories (name, parent_id, sort_order, type, is_default) VALUES (?, ?, ?, ?, 1)'
  )

  const insertAll = db.transaction(() => {
    defaultCategories.forEach((cat, i) => {
      const result = insertParent.run(cat.parent, i, 'expense')
      const parentId = result.lastInsertRowid as number
      cat.children.forEach((child, j) => {
        insertChild.run(child, parentId, j, 'expense')
      })
    })
    seedIncomeCategories()
  })

  insertAll()
}

// 默认支出分类
const defaultCategories: Array<{ parent: string; children: string[] }> = [
  { parent: '餐饮美食', children: ['早餐', '午餐', '晚餐', '零食饮料', '外卖', '聚餐', '买菜'] },
  { parent: '交通出行', children: ['公交地铁', '出租网约车', '私家车油费', '停车费', '过路费', '高铁火车', '飞机'] },
  { parent: '居家生活', children: ['房租房贷', '水电燃气', '物业费', '日用品', '家具家电', '维修'] },
  { parent: '购物消费', children: ['服装鞋帽', '数码电子', '美妆护肤', '母婴用品', '宠物用品'] },
  { parent: '医疗健康', children: ['门诊看病', '药品', '住院', '保健品', '体检'] },
  { parent: '文教娱乐', children: ['教育培训', '书籍文具', '电影演出', '旅游度假', '游戏娱乐', '运动健身'] },
  { parent: '人情社交', children: ['红包礼金', '请客', '礼物', '婚丧礼金'] },
  { parent: '金融保险', children: ['保险费', '理财投资', '信用卡还款', '税费'] },
  { parent: '通讯网络', children: ['话费', '宽带', '会员订阅'] },
  { parent: '其他', children: ['杂项'] }
]

// 默认收入分类
const incomeCategories = ['工资薪酬', '奖金', '理财收益', '兼职', '红包礼金', '退款', '其他收入']

/** 插入默认收入分类（一级"收入"+若干二级） */
function seedIncomeCategories(): void {
  if (!db) return
  // 已存在则跳过
  const exists = db
    .prepare("SELECT COUNT(*) AS c FROM categories WHERE type = 'income' AND parent_id IS NULL")
    .get() as { c: number }
  if (exists.c > 0) return

  const insertParent = db.prepare(
    "INSERT INTO categories (name, parent_id, sort_order, type, is_default) VALUES (?, NULL, ?, ?, 1)"
  )
  const insertChild = db.prepare(
    'INSERT INTO categories (name, parent_id, sort_order, type, is_default) VALUES (?, ?, ?, ?, 1)'
  )
  const sortOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE parent_id IS NULL')
    .get() as { m: number }
  const incomeParent = insertParent.run('收入', sortOrder.m + 1, 'income')
  const incomeParentId = incomeParent.lastInsertRowid as number
  incomeCategories.forEach((child, j) => {
    insertChild.run(child, incomeParentId, j, 'income')
  })
}
