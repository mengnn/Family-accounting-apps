<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑记账' : '记一笔'"
    width="480px"
    @closed="onClosed"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <!-- 收支类型切换 -->
      <el-form-item label="类型">
        <el-radio-group v-model="form.type" @change="onTypeChange">
          <el-radio-button value="expense">支出</el-radio-button>
          <el-radio-button value="income">收入</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="金额" prop="amount">
        <el-input-number
          v-model="form.amount"
          :min="0"
          :precision="settings.decimalPlaces"
          :step="1"
          controls-position="right"
          placeholder="请输入金额"
          style="width: 100%"
        >
          <template #prefix>{{ settings.currencySymbol }}</template>
        </el-input-number>
      </el-form-item>

      <el-form-item label="分类" prop="category_id">
        <el-cascader
          v-model="form.category_id"
          :options="categoryOptions"
          :props="cascaderProps"
          :placeholder="`请选择${form.type === 'expense' ? '支出' : '收入'}分类`"
          style="width: 100%"
          clearable
        />
      </el-form-item>

      <el-form-item label="日期" prop="date">
        <el-date-picker
          v-model="form.date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择日期"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="备注">
        <el-input
          v-model="form.note"
          type="textarea"
          :rows="2"
          maxlength="100"
          show-word-limit
          placeholder="选填，例如：和朋友聚餐"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { type Category, type RecordType } from '@/utils/api'
import { settings } from '@/composables/useSettings'

const props = defineProps<{
  modelValue: boolean
  record?: any
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const isEdit = computed(() => !!props.record?.id)
const formRef = ref<FormInstance>()
const saving = ref(false)
const allCategories = ref<Category[]>([])
const categoryOptions = ref<Category[]>([])

const cascaderProps = {
  expandTrigger: 'hover' as const,
  emitPath: false,
  checkStrictly: false
}

const form = reactive({
  amount: undefined as number | undefined,
  category_id: null as number | null,
  date: new Date().toISOString().slice(0, 10),
  note: '',
  type: 'expense' as RecordType
})

const rules: FormRules = {
  amount: [{ required: true, message: '请输入金额', trigger: 'blur' }],
  category_id: [{ required: true, message: '请选择分类', trigger: 'change' }],
  date: [{ required: true, message: '请选择日期', trigger: 'change' }]
}

// 级联选择器只允许选到二级分类
function normalizeCategories(list: Category[], type: RecordType): Category[] {
  return list
    .filter((item) => item.type === type)
    .map((item) => ({
      ...item,
      value: item.id,
      label: item.name,
      children: item.children
        ?.filter((child) => child.type === type)
        .map((child) => ({
          ...child,
          value: child.id,
          label: child.name,
          children: undefined
        }))
    }))
}

async function loadCategories(): Promise<void> {
  const data = (await window.api.getCategories()) as Category[]
  allCategories.value = data
  categoryOptions.value = normalizeCategories(data, form.type)
}

function onTypeChange(): void {
  // 切换收支类型时，重新加载对应分类，并清空已选分类
  categoryOptions.value = normalizeCategories(allCategories.value, form.type)
  form.category_id = null
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      loadCategories()
      if (props.record) {
        form.amount = props.record.amount
        form.category_id = props.record.category_id
        form.date = props.record.date
        form.note = props.record.note || ''
        form.type = props.record.type || 'expense'
      } else {
        form.amount = undefined
        form.category_id = null
        form.date =
          settings.defaultDateMode === 'today'
            ? new Date().toISOString().slice(0, 10)
            : ''
        form.note = ''
        form.type = settings.defaultType
      }
    }
  }
)

async function onSubmit(): Promise<void> {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    if (!form.amount || form.amount <= 0) {
      ElMessage.warning('金额必须大于 0')
      return
    }
    saving.value = true
    try {
      if (isEdit.value) {
        await window.api.updateRecord({
          id: props.record.id,
          amount: form.amount,
          category_id: form.category_id,
          date: form.date,
          note: form.note,
          type: form.type
        })
        ElMessage.success('修改成功')
      } else {
        await window.api.addRecord({
          amount: form.amount,
          category_id: form.category_id,
          date: form.date,
          note: form.note,
          type: form.type
        })
        ElMessage.success('记账成功')
      }
      visible.value = false
      emit('saved')
    } catch (e) {
      ElMessage.error('保存失败，请重试')
      console.error(e)
    } finally {
      saving.value = false
    }
  })
}

function onClosed(): void {
  formRef.value?.resetFields()
}
</script>
