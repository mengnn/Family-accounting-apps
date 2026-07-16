// 打包脚本：清除环境变量后，先构建应用，再用 electron-builder 打包指定平台。
// 用法：node scripts/build.mjs win | mac
import { spawn } from 'node:child_process'

const target = process.argv[2]
if (!target || !['win', 'mac'].includes(target)) {
  console.error('用法: node scripts/build.mjs win 或 node scripts/build.mjs mac')
  process.exit(1)
}

delete process.env.ELECTRON_RUN_AS_NODE
const env = { ...process.env }

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, env })
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} 退出码 ${code}`))
    )
  })
}

try {
  console.log(`[build] 1/2 构建应用代码 (electron-vite build)...`)
  await run('npx', ['electron-vite', 'build'])
  console.log(`[build] 2/2 打包 ${target} 安装包 (electron-builder --${target})...`)
  await run('npx', ['electron-builder', `--${target}`])
  console.log(`[build] 打包完成！输出在 dist 目录。`)
} catch (e) {
  console.error(`\n${e.message}`)
  process.exit(1)
}
