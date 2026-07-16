// 应用设置：响应式单例 + 主题/强调色应用 + 货币格式化
import { reactive } from 'vue'
import type { AppSettings, AccentKey, ThemeMode } from '@/utils/api'

// 4 套强调色预设（含 Element Plus 主色各档明暗变体）
export interface AccentPreset {
  label: string
  primary: string
  light3: string
  light5: string
  light7: string
  light8: string
  light9: string
  dark2: string
}

export const ACCENTS: Record<AccentKey, AccentPreset> = {
  blue: {
    label: '经典蓝',
    primary: '#409eff',
    light3: '#79bbff',
    light5: '#a0cfff',
    light7: '#c6e2ff',
    light8: '#d9ecff',
    light9: '#ecf5ff',
    dark2: '#337ecc'
  },
  green: {
    label: '清新绿',
    primary: '#18a058',
    light3: '#4fb37e',
    light5: '#7fc99f',
    light7: '#b3e3c6',
    light8: '#cdeede',
    light9: '#eafaf1',
    dark2: '#138a4a'
  },
  orange: {
    label: '温暖橙',
    primary: '#f0883e',
    light3: '#f4a86b',
    light5: '#f8c398',
    light7: '#fbdcc4',
    light8: '#fce8d6',
    light9: '#fef4ec',
    dark2: '#c96a26'
  },
  purple: {
    label: '优雅紫',
    primary: '#7c5cff',
    light3: '#9d84ff',
    light5: '#bcaaff',
    light7: '#d8ccff',
    light8: '#e6ddff',
    light9: '#f2eeff',
    dark2: '#6347cc'
  }
}

export const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '跟随系统', value: 'system' }
]

const DEFAULTS: AppSettings = {
  theme: 'light',
  accent: 'blue',
  currencySymbol: '¥',
  decimalPlaces: 2,
  defaultType: 'expense',
  defaultDateMode: 'today'
}

export const settings = reactive<AppSettings>({ ...DEFAULTS })

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

// 将当前主题/强调色应用到 <html>
export function applyTheme(): void {
  const root = document.documentElement
  const isDark =
    settings.theme === 'dark' || (settings.theme === 'system' && systemPrefersDark())
  root.classList.toggle('dark', isDark)

  const a = ACCENTS[settings.accent] || ACCENTS.blue
  root.style.setProperty('--el-color-primary', a.primary)
  root.style.setProperty('--el-color-primary-light-3', a.light3)
  root.style.setProperty('--el-color-primary-light-5', a.light5)
  root.style.setProperty('--el-color-primary-light-7', a.light7)
  root.style.setProperty('--el-color-primary-light-8', a.light8)
  root.style.setProperty('--el-color-primary-light-9', a.light9)
  root.style.setProperty('--el-color-primary-dark-2', a.dark2)
  root.style.setProperty('--accent', a.primary)
}

// 启动时从后端加载设置并应用主题
export async function loadSettings(): Promise<void> {
  try {
    const s = (await window.api.getSettings()) as Partial<AppSettings>
    Object.assign(settings, { ...DEFAULTS, ...s })
  } catch (e) {
    // 读取失败则保留默认值
    console.warn('loadSettings failed, use defaults', e)
  }
  applyTheme()

  if (typeof window !== 'undefined' && window.matchMedia) {
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (settings.theme === 'system') applyTheme()
      })
  }
}

// 保存当前设置到后端
export function saveSettings(): void {
  window.api
    .saveSettings({ ...settings } as unknown as Record<string, unknown>)
    .catch((e) => console.error('saveSettings failed', e))
}

// 货币格式化：按设置的符号 + 小数位
export function formatMoney(amount: number): string {
  const fixed = Number(amount || 0).toFixed(settings.decimalPlaces)
  return `${settings.currencySymbol}${fixed}`
}
