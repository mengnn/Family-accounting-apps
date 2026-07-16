<template>
  <div class="categories-view">
    <div class="cat-header">
      <div class="header-left">
        <el-radio-group v-model="currentType" @change="loadCategories">
          <el-radio-button value="expense">支出分类</el-radio-button>
          <el-radio-button value="income">收入分类</el-radio-button>
        </el-radio-group>
      </div>
      <el-button type="primary" :icon="Plus" @click="openAddParent">新增一级分类</el-button>
    </div>

    <div class="cat-list" v-loading="loading">
      <div v-for="parent in categories" :key="parent.id" class="cat-group">
        <div class="cat-parent">
          <div class="parent-info">
            <span class="parent-name">{{ parent.name }}</span>
            <el-tag size="small" type="info" effect="plain">{{ parent.children?.length || 0 }} 个子分类</el-tag>
            <el-tag v-if="parent.is_default === 1" size="small" type="warning" effect="plain">系统</el-tag>
          </div>
          <div class="parent-actions">
            <el-button link type="primary" :icon="Plus" @click="openAddChild(parent)">加子分类</el-button>
            <template v-if="parent.is_default !== 1">
              <el-button link type="primary" @click="openEditParent(parent)">改名</el-button>
              <el-button link type="danger" @click="onDelete(parent)">删除</el-button>
            </template>
            <span v-else class="default-hint">系统分类不可改删</span>
          </div>
        </div>
        <div class="cat-children" v-if="parent.children && parent.children.length">
          <el-tag
            v-for="child in parent.children"
            :key="child.id"
            :class="['child-tag', { 'child-default': child.is_default === 1 }]"
            :closable="child.is_default !== 1"
            effect="plain"
            @close="onDelete(child)"
            @click="child.is_default !== 1 ? openEditChild(child, parent) : undefined"
          >
            {{ child.name }}
            <el-tag v-if="child.is_default === 1" size="small" type="warning" effect="dark" class="inner-default-tag">系统</el-tag>
          </el-tag>
          <span class="edit-hint">点击子分类可重命名，点 × 可删除（系统分类除外）</span>
        </div>
        <div class="cat-children empty" v-else>
          <span class="empty-text">暂无子分类</span>
        </div>
      </div>
    </div>

    <!-- 新增/编辑分类弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="400px"
      @closed="resetForm"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="所属层级">
          <el-input :value="form.parent_id ? '二级分类（' + form.parent_name + '）' : '一级分类'" disabled />
        </el-form-item>
        <el-form-item label="分类名称">
          <el-input v-model="form.name" placeholder="请输入分类名称" maxlength="20" show-word-limit @keyup.enter="onSubmit" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { type Category, type RecordType } from '@/utils/api'

const categories = ref<Category[]>([])
const loading = ref(false)
const currentType = ref<RecordType>('expense')

const dialogVisible = ref(false)
const saving = ref(false)

const form = reactive({
  id: null as number | null,
  name: '',
  parent_id: null as number | null,
  parent_name: '',
  isEdit: false
})

const dialogTitle = computed(() => {
  if (form.isEdit) return '重命名分类'
  return form.parent_id ? `在「${form.parent_name}」下新增子分类` : '新增一级分类'
})

async function loadCategories(): Promise<void> {
  loading.value = true
  try {
    const data = (await window.api.getCategories({ type: currentType.value })) as Category[]
    categories.value = data
  } catch (e) {
    ElMessage.error('加载分类失败')
    console.error(e)
  } finally {
    loading.value = false
  }
}

function openAddParent(): void {
  form.id = null
  form.name = ''
  form.parent_id = null
  form.parent_name = ''
  form.isEdit = false
  dialogVisible.value = true
}

function openAddChild(parent: Category): void {
  form.id = null
  form.name = ''
  form.parent_id = parent.id
  form.parent_name = parent.name
  form.isEdit = false
  dialogVisible.value = true
}

function openEditParent(parent: Category): void {
  form.id = parent.id
  form.name = parent.name
  form.parent_id = null
  form.parent_name = ''
  form.isEdit = true
  dialogVisible.value = true
}

function openEditChild(child: Category, parent: Category): void {
  form.id = child.id
  form.name = child.name
  form.parent_id = parent.id
  form.parent_name = parent.name
  form.isEdit = true
  dialogVisible.value = true
}

async function onSubmit(): Promise<void> {
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning('请输入分类名称')
    return
  }
  saving.value = true
  try {
    if (form.isEdit && form.id) {
      const res = (await window.api.updateCategory({ id: form.id, name })) as any
      if (res.success === false) {
        ElMessage.warning(res.reason || '无法修改')
        return
      }
      ElMessage.success('修改成功')
    } else {
      await window.api.addCategory({ name, parent_id: form.parent_id, type: currentType.value })
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    loadCategories()
  } catch (e) {
    ElMessage.error('操作失败')
    console.error(e)
  } finally {
    saving.value = false
  }
}

async function onDelete(cat: Category): Promise<void> {
  const isParent = cat.parent_id === null
  try {
    await ElMessageBox.confirm(
      `确定删除分类「${cat.name}」吗？${isParent ? '其下所有子分类也会被删除。' : ''}`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    const res = (await window.api.deleteCategory(cat.id)) as any
    if (res.success) {
      ElMessage.success('删除成功')
      loadCategories()
    } else {
      ElMessage.warning(res.reason || '无法删除')
    }
  } catch (e) {
    if (e !== 'cancel') ElMessage.error('删除失败')
  }
}

function resetForm(): void {
  form.id = null
  form.name = ''
  form.parent_id = null
  form.parent_name = ''
  form.isEdit = false
}

onMounted(() => {
  loadCategories()
})
</script>

<style scoped>
.categories-view {
  padding: 20px 24px;
}

.cat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  padding: 14px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.cat-list {
  min-height: 200px;
}

.cat-group {
  background: #fff;
  border-radius: 8px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.cat-parent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
}

.parent-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.parent-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.parent-actions {
  display: flex;
  gap: 4px;
}

.cat-children {
  padding: 14px 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.cat-children.empty {
  padding: 14px 16px;
}

.child-tag {
  cursor: pointer;
  font-size: 13px;
}

.edit-hint {
  color: #c0c4cc;
  font-size: 12px;
}

.default-hint {
  color: #c0c4cc;
  font-size: 12px;
  margin-left: 4px;
}

.child-tag.child-default {
  cursor: default;
  background: #fdf6ec;
  border-color: #f5dab1;
  color: #b88230;
}

.inner-default-tag {
  margin-left: 4px;
  transform: scale(0.85);
}

.empty-text {
  color: #c0c4cc;
  font-size: 13px;
}
</style>
