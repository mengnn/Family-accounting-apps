// 安装后自动重编译 better-sqlite3 原生模块，使其匹配 Electron 的 ABI。
// better-sqlite3 是原生模块，默认按普通 Node.js 编译，在 Electron 中会报
// "NODE_MODULE_VERSION 不匹配" 错误，必须用 electron-rebuild 针对当前 Electron 版本重新编译。
import { spawnSync } from 'node:child_process'

delete process.env.ELECTRON_RUN_AS_NODE

console.log('[postinstall] 正在针对 Electron 重新编译 better-sqlite3 原生模块（首次较慢，请等待）...')

const result = spawnSync('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
})

if (result.status !== 0) {
  console.error('')
  console.error('[postinstall] better-sqlite3 重编译失败。')
  console.error('若仅本地开发，可稍后手动执行: npx electron-rebuild -f -w better-sqlite3')
  console.error('Windows 需要已安装 Visual Studio Build Tools（C++ 桌面开发）与 Python。')
}
process.exit(result.status ?? 0)
