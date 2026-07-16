<template>
  <div class="settings-page">
    <h2 class="page-title">设置</h2>

    <!-- 外观 -->
    <el-card class="section" shadow="never">
      <template #header><span class="section-title">🎨 外观</span></template>

      <div class="field">
        <div class="field-label">主题模式</div>
        <el-radio-group :model-value="settings.theme" @change="onThemeChange">
          <el-radio-button v-for="t in THEME_OPTIONS" :key="t.value" :value="t.value">
            {{ t.label }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <div class="field">
        <div class="field-label">强调色</div>
        <div class="accent-row">
          <button
            v-for="(a, key) in ACCENTS"
            :key="key"
            class="accent-swatch"
            :class="{ active: settings.accent === key }"
            :style="{ background: a.primary }"
            :title="a.label"
            @click="onAccentChange(key as AccentKey)"
          ></button>
        </div>
      </div>
    </el-card>

    <!-- 通用偏好 -->
    <el-card class="section" shadow="never">
      <template #header><span class="section-title">⚙️ 通用偏好</span></template>

      <div class="field">
        <div class="field-label">货币符号</div>
        <el-input
          v-model="settings.currencySymbol"
          maxlength="3"
          style="width: 140px"
          @blur="saveSettings"
        />
        <span class="field-hint">示例金额显示：{{ formatMoney(previewAmount) }}</span>
      </div>

      <div class="field">
        <div class="field-label">金额小数位</div>
        <el-radio-group :model-value="settings.decimalPlaces" @change="onDecimalChange">
          <el-radio-button :value="0">0 位</el-radio-button>
          <el-radio-button :value="1">1 位</el-radio-button>
          <el-radio-button :value="2">2 位</el-radio-button>
        </el-radio-group>
      </div>

      <div class="field">
        <div class="field-label">默认记账类型</div>
        <el-radio-group :model-value="settings.defaultType" @change="onDefaultTypeChange">
          <el-radio-button value="expense">支出</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
        </el-radio-group>
      </div>

      <div class="field">
        <div class="field-label">默认日期</div>
        <el-radio-group :model-value="settings.defaultDateMode" @change="onDateModeChange">
          <el-radio-button value="today">当天</el-radio-button>
          <el-radio-button value="manual">手动选择</el-radio-button>
        </el-radio-group>
      </div>
    </el-card>

    <!-- 数据 -->
    <el-card class="section" shadow="never">
      <template #header><span class="section-title">💾 数据（本地存储）</span></template>

      <div class="field">
        <div class="field-label">备份与恢复</div>
        <div class="btn-row">
          <el-button type="primary" :icon="Download" @click="onExport">导出备份</el-button>
          <el-button :icon="Upload" @click="onImport">导入备份</el-button>
        </div>
        <div class="field-hint">
          备份为单个 JSON 文件（含分类/记账/预算/设置），可在其他电脑或重装后导入还原。
        </div>
      </div>

      <el-divider />

      <div class="field">
        <div class="field-label">危险操作</div>
        <el-button type="danger" plain :icon="Delete" @click="onClear">清空所有记账数据</el-button>
        <div class="field-hint">仅删除记账记录与预算，保留分类与设置。操作不可恢复，请先导出备份。</div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Upload, Delete } from '@element-plus/icons-vue'
import {
  settings,
  ACCENTS,
  THEME_OPTIONS,
  applyTheme,
  saveSettings,
  formatMoney
} from '@/composables/useSettings'
import type { AccentKey, ThemeMode } from '@/utils/api'

const previewAmount = 1234.5

function onThemeChange(val: ThemeMode): void {
  settings.theme = val
  applyTheme()
  saveSettings()
}

function onAccentChange(key: AccentKey): void {
  settings.accent = key
  applyTheme()
  saveSettings()
}

function onDecimalChange(val: number): void {
  settings.decimalPlaces = val
  saveSettings()
}

function onDefaultTypeChange(val: 'expense' | 'income'): void {
  settings.defaultType = val
  saveSettings()
}

function onDateModeChange(val: 'today' | 'manual'): void {
  settings.defaultDateMode = val
  saveSettings()
}

async function onExport(): Promise<void> {
  try {
    const res = (await window.api.exportData()) as { ok: boolean; cancelled?: boolean; error?: string }
    if (res.cancelled) return
    if (res.ok) ElMessage.success('备份已导出')
    else ElMessage.error('导出失败：' + (res.error || '未知错误'))
  } catch (e) {
    ElMessage.error('导出失败：' + String(e))
  }
}

async function onImport(): Promise<void> {
  try {
    const res = (await window.api.importData()) as { ok: boolean; cancelled?: boolean; error?: string }
    if (res.cancelled) return
    if (res.ok) {
      ElMessage.success('导入成功，正在刷新…')
      setTimeout(() => location.reload(), 600)
    } else {
      ElMessage.error('导入失败：' + (res.error || '未知错误'))
    }
  } catch (e) {
    ElMessage.error('导入失败：' + String(e))
  }
}

async function onClear(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '确定清空所有记账记录与预算吗？此操作不可恢复，建议先导出备份。',
      '清空数据',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' }
    )
    const res = (await window.api.clearAllData()) as { ok: boolean; error?: string }
    if (res.ok) {
      ElMessage.success('已清空，正在刷新…')
      setTimeout(() => location.reload(), 600)
    } else {
      ElMessage.error('清空失败：' + (res.error || '未知错误'))
    }
  } catch (e) {
    // 用户取消
  }
}
</script>

<style scoped>
.settings-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 24px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}
.section {
  margin-bottom: 18px;
  border-radius: 10px;
}
.section-title {
  font-weight: 600;
  font-size: 15px;
}
.field {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 0;
}
.field-label {
  width: 110px;
  color: #606266;
  font-size: 14px;
  flex-shrink: 0;
}
.field-hint {
  width: 100%;
  margin-left: 122px;
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
}
.accent-row {
  display: flex;
  gap: 12px;
}
.accent-swatch {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s;
}
.accent-swatch:hover {
  transform: scale(1.1);
}
.accent-swatch.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px var(--accent, #409eff);
}
.btn-row {
  display: flex;
  gap: 12px;
}
</style>
