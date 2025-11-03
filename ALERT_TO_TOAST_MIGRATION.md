# Alert 到 Toast 迁移总结

## 已完成的文件

### ✅ JsonEditor.tsx
- ✅ 导入 Toast 组件
- ✅ 添加 toast 状态
- ✅ 添加 showToast 函数
- ✅ 替换 "该字段名已存在" alert
- ✅ 替换 "请输入有效的数字" alert
- ✅ 添加 Toast 组件到渲染

### ✅ GroupedRequestList.tsx
- ✅ 已有 toast 状态和 showToast 函数
- ✅ 替换 "删除分组失败" alert
- ✅ 替换 "分组名称不能为空" alert
- ✅ 替换 "更新分组失败" alert

## 待处理的文件

### TestSuitePanel.tsx
需要替换的 alert：
- "创建测试套件失败"
- "激活测试套件失败"
- "删除测试套件失败"

### TagsManager.tsx
需要替换的 alert：
- "删除失败，请重试"
- "请选择要添加标签的记录和标签" (2处)

## 迁移步骤

对于每个文件：
1. 导入 Toast 组件
2. 添加 toast 状态
3. 添加 showToast 函数
4. 替换所有 alert() 为 showToast()
5. 在组件末尾添加 Toast 渲染

## Toast 使用示例

```typescript
// 1. 导入
import Toast from './Toast';

// 2. 状态
const [toast, setToast] = useState<{
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}>({
  show: false,
  message: '',
  type: 'info',
});

// 3. 函数
const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
  setToast({ show: true, message, type });
};

// 4. 使用
showToast('操作成功', 'success');
showToast('操作失败', 'error');
showToast('提示信息', 'info');

// 5. 渲染
{toast.show && (
  <Toast
    message={toast.message}
    type={toast.type}
    onClose={() => setToast({ ...toast, show: false })}
  />
)}
```
