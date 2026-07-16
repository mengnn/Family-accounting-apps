# 家庭超级记账 (Family Super Accounting)

一个**纯本地、不上云**的跨平台桌面记账应用，帮助你轻松记录家庭日常收支、统计消费结构、管理月度与年度预算。

> 数据全部保存在你自己的电脑上（SQLite 单文件），无需联网注册，隐私完全掌握在自己手里。

---

## 功能特性

- **记账**：支持收入 / 支出，二级分类体系，可按类型、日期范围、分类、备注筛选，一键导出 CSV（带 BOM，Excel 直接打开中文不乱码）。
- **统计**：支出占比饼图、月度收支趋势柱状图、TOP10 消费排行，支持本月 / 本年 / 自定义时间范围。
- **预算**：
  - 月度预算：按一级分类设置月预算，进度条 + 超支红色预警，输入即自动保存（防抖）。
  - 年度预算：与月度预算独立管理，按全年累计支出计算进度。
- **分类管理**：自定义一级 / 二级分类，系统内置分类受保护（不可误删改），有记录引用的分类禁止删除。
- **设置**：
  - 外观：浅色 / 深色 / 跟随系统 + 4 套强调色（经典蓝 / 清新绿 / 温暖橙 / 优雅紫）。
  - 数据：JSON 全量备份导出、导入还原、清空数据（二次确认）。
  - 通用偏好：货币符号、金额小数位、默认记账类型、默认记账日期。

---

## 技术栈

| 层面 | 选型 |
| --- | --- |
| 桌面框架 | Electron 32 |
| 前端 | Vue 3.5 + TypeScript + Vite (electron-vite) |
| UI 组件库 | Element Plus 2.8 |
| 图表 | ECharts 6 |
| 数据库 | better-sqlite3（SQLite，WAL 模式） |
| 打包 | electron-builder（Windows = NSIS，macOS = DMG） |

### 架构

```
主进程 (Node.js)  ──→  数据库 / 文件 / IPC 通信
   ↑  preload.ts 通过 contextBridge 仅暴露白名单 API（window.api）
渲染进程 (Vue)    ──→  只通过 window.api.xxx() 调用后端
```

- 启用 `contextIsolation`，前端无法直接访问 Node / 数据库，只能调用白名单接口，安全性更高。
- 金额在数据库层以**整数“分”**存储，避免浮点累加误差；前后端在 IPC 边界做“元 ⇄ 分”换算，界面显示仍为 `¥xx.xx`。

---

## 环境要求

- **Node.js 18+**（推荐 20+，用于重编译原生模块 `better-sqlite3`）
- **npm 9+**
- Windows 或 macOS 操作系统

---

## 安装与运行

```bash
# 1. 克隆仓库
git clone git@github.com:mengnn/Family-accounting-apps.git
cd Family-accounting-apps

# 2. 安装依赖（postinstall 会自动重编译 better-sqlite3 原生模块）
npm install

# 3. 启动开发模式（带热更新）
npm run dev
```

> 说明：`npm run dev` 已内置兼容处理，可正常启动开发窗口。若在你本机原生终端（CMD / PowerShell）运行遇到 `ELECTRON_RUN_AS_NODE` 或 `NODE_OPTIONS` 相关报错，请在本机干净终端重新执行 `npm run dev` 即可。

---

## 构建打包

```bash
# Windows 安装包（生成 NSIS 安装程序）
npm run build:win

# macOS 安装包（生成 DMG）
npm run build:mac
```

打包流程：先 `electron-vite build` 构建，再用 electron-builder 打包；原生模块会从 asar 中解包以确保可加载。

---

## 数据说明

- **存储位置**：SQLite 单文件，位于系统用户数据目录 `family-super-accounting/accounting.db`
  - Windows：`%APPDATA%/family-super-accounting/accounting.db`
  - macOS：`~/Library/Application Support/family-super-accounting/accounting.db`
- **备份与恢复**：进入「设置 → 数据」，可导出全量 JSON 备份（含分类 / 记账 / 预算 / 年预算 / 设置），也可导入还原或进行清空数据操作。
- **升级兼容**：应用启动时会自动进行**幂等数据库迁移**，老版本数据（含旧版浮点金额）会无损转换为新结构，重复启动不会重复迁移或放大金额。

---

## 项目结构

```
family-super-accounting/
├── electron/                 # 主进程代码
│   ├── main.ts               # 窗口创建 + 所有 IPC handler（含金额元⇄分换算）
│   ├── database.ts           # SQLite 建表、迁移、查询封装
│   ├── preload.ts            # 白名单 API 注入（contextBridge）
│   └── preload.d.ts          # 前端类型声明
├── src/                      # 渲染进程（Vue 前端）
│   ├── main.ts               # 入口（引入暗色样式、启动加载设置）
│   ├── App.vue               # 布局 + 侧边栏导航
│   ├── index.css             # 全局样式
│   ├── utils/api.ts          # 类型定义与 window.api 封装
│   ├── composables/
│   │   └── useSettings.ts    # 设置响应式单例 + 主题应用 + 货币格式化
│   ├── components/
│   │   └── RecordDialog.vue  # 记一笔弹窗
│   └── views/
│       ├── RecordsView.vue   # 记账页
│       ├── StatisticsView.vue# 统计页
│       ├── BudgetView.vue    # 预算页（月度 / 年度切换）
│       ├── CategoriesView.vue# 分类管理页
│       └── SettingsView.vue  # 设置页
├── scripts/                  # 构建与开发脚本
│   ├── dev.mjs               # 开发启动（剥离冲突环境变量）
│   ├── rebuild.mjs           # 重编译原生模块
│   └── build.mjs             # 打包入口
├── electron.vite.config.ts   # electron-vite 配置
├── electron-builder.yml      # 打包配置
├── index.html                # 渲染进程入口 HTML
├── package.json
└── tsconfig*.json
```

---

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发环境（热更新） |
| `npm run rebuild` | 重编译 better-sqlite3 原生模块（Electron ABI） |
| `npm run build` | 仅构建，不打包 |
| `npm run build:win` | 打包 Windows 安装程序 |
| `npm run build:mac` | 打包 macOS 安装程序 |

---

## 常见问题

**Q：开发模式窗口没有弹出？**
A：通常是运行环境向 `NODE_OPTIONS` 注入了 Electron 不支持的参数（如 `--use-system-ca`）导致 Electron 拒绝启动。当前 `dev.mjs` 已内置剥离逻辑，在本机原生终端执行 `npm run dev` 即可正常弹出。

**Q：金额显示异常 / 出现很多小数位？**
A：应用内部以“分”存储，显示时统一格式化。若看到异常，请确认 `npm install` 时 `better-sqlite3` 原生模块已成功重编译（安装日志无 `gyp ERR`）。

**Q：之前的记账数据会丢吗？**
A：不会。启动时自动执行幂等迁移，把旧数据无损转换为新结构；建议重大版本升级前在「设置 → 数据」导出一份 JSON 备份。

---

## 许可证

本项目尚未声明开源许可证。如需使用、修改或分发，请先与作者联系确认。
