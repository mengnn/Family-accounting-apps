<template>
  <div class="layout">
    <!-- 侧边栏导航 -->
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-icon">📒</span>
        <span class="logo-text">家庭超级记账</span>
      </div>
      <nav class="nav-menu">
        <div
          v-for="item in menuItems"
          :key="item.key"
          :class="['nav-item', { active: activePage === item.key }]"
          @click="activePage = item.key"
        >
          <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </div>
      </nav>
      <div class="sidebar-footer">v0.2.0 · 本地存储</div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <RecordsView v-if="activePage === 'records'" />
      <StatisticsView v-else-if="activePage === 'statistics'" />
      <BudgetView v-else-if="activePage === 'budget'" />
      <CategoriesView v-else-if="activePage === 'categories'" />
      <SettingsView v-else-if="activePage === 'settings'" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, markRaw } from 'vue'
import { Wallet, PieChart, Coin, Files, Setting } from '@element-plus/icons-vue'
import RecordsView from '@/views/RecordsView.vue'
import StatisticsView from '@/views/StatisticsView.vue'
import BudgetView from '@/views/BudgetView.vue'
import CategoriesView from '@/views/CategoriesView.vue'
import SettingsView from '@/views/SettingsView.vue'

const menuItems = [
  { key: 'records', label: '记账', icon: markRaw(Wallet) },
  { key: 'statistics', label: '统计', icon: markRaw(PieChart) },
  { key: 'budget', label: '预算', icon: markRaw(Coin) },
  { key: 'categories', label: '分类管理', icon: markRaw(Files) },
  { key: 'settings', label: '设置', icon: markRaw(Setting) }
]

const activePage = ref('records')
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 200px;
  background: linear-gradient(180deg, #1f2d3d 0%, #2c3e50 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 18px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.logo-icon {
  font-size: 20px;
}

.nav-menu {
  flex: 1;
  padding: 12px 10px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.75);
  font-size: 14px;
  margin-bottom: 4px;
  transition: all 0.2s;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.active {
  background: var(--accent, #409eff);
  color: #fff;
  font-weight: 500;
}

.nav-icon {
  font-size: 18px;
}

.sidebar-footer {
  padding: 14px 18px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.main-content {
  flex: 1;
  overflow-y: auto;
  background: #f5f7fa;
}
</style>
