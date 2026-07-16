// 开发模式启动脚本
// 作用：清除可能存在的 ELECTRON_RUN_AS_NODE 环境变量后启动 electron-vite dev。
// 原因：该变量会让 Electron 被当作纯 Node.js 运行，导致应用无法打开窗口
//      （报错 "Cannot read properties of undefined (reading 'whenReady')"）。
//      某些工具（如 VSCode/Claude Code 的进程环境）会设置该变量，故在此统一清除。
import { spawn } from 'node:child_process'

delete process.env.ELECTRON_RUN_AS_NODE

// Electron 自带的 Node 运行时不允许 NODE_OPTIONS 包含 --use-system-ca 等参数，
// 否则启动会直接失败（"--use-system-ca is not allowed in NODE_OPTIONS"）。
// 某些工具（如代理/沙箱环境）会注入该参数，故在此将其剥离，其余配置原样保留。
if (process.env.NODE_OPTIONS) {
  const cleaned = process.env.NODE_OPTIONS
    .split(/\s+/)
    .filter((opt) => opt !== '--use-system-ca' && !opt.startsWith('--use-system-ca='))
    .join(' ')
  if (cleaned.trim()) {
    process.env.NODE_OPTIONS = cleaned
  } else {
    delete process.env.NODE_OPTIONS
  }
}

const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env }
})

child.on('close', (code) => process.exit(code ?? 0))
