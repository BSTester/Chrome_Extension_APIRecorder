# 多实例冲突修复

## 问题描述

当页面中存在多个 JsonEditor 或 JsonViewer 实例时，查找功能会产生冲突：
- 在回放编辑器中查找，可能滚动到接口详情的查看器
- 在接口详情中查找，可能滚动到回放结果的查看器
- 多个实例的 `data-path` 属性相同，导致 `querySelector` 定位错误

## 问题场景

### 场景示例
```
页面结构：
├─ 接口详情
│  ├─ JSON Body (JsonViewer)
│  │  └─ data-path="user.name"
│  └─ 响应体 (JsonViewer)
│     └─ data-path="user.name"
└─ 回放编辑器
   ├─ 请求体 (JsonEditor)
   │  └─ data-path="user.name"
   └─ 响应体 (JsonViewer)
      └─ data-path="user.name"
```

**问题：**
在回放编辑器中查找 "user.name"，`querySelector` 可能找到接口详情中的元素，导致滚动到错误的位置。

## 解决方案

### 1. 添加实例 ID 属性

**JsonEditor：**
```typescript
interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  instanceId?: string; // 新增：组件实例 ID
}

const JsonEditor: React.FC<JsonEditorProps> = ({ 
  value, 
  onChange, 
  placeholder, 
  className, 
  instanceId = 'default' // 默认值
}) => {
  // ...
};
```

**JsonViewer：**
```typescript
interface JsonViewerProps {
  value: string;
  placeholder?: string;
  className?: string;
  instanceId?: string; // 新增：组件实例 ID
}

const JsonViewer: React.FC<JsonViewerProps> = ({ 
  value, 
  placeholder, 
  className, 
  instanceId = 'viewer' // 默认值
}) => {
  // ...
};
```

### 2. 修改 DOM 属性

**之前：**
```typescript
<div data-path={node.path}>
```

**现在：**
```typescript
<div 
  data-instance={instanceId}
  data-path={node.path}
>
```

### 3. 修改选择器

**之前：**
```typescript
const element = document.querySelector(`[data-path="${path}"]`);
```

**问题：** 可能找到其他实例的元素

**现在：**
```typescript
const element = document.querySelector(
  `[data-instance="${instanceId}"][data-path="${path}"]`
);
```

**优点：** 只会找到当前实例的元素

## 实例 ID 分配

### GroupedRequestList 中的分配

```typescript
// 1. 接口详情 - JSON Body
<JsonViewer
  value={...}
  instanceId={`request-json-${record.id}`}
/>

// 2. 接口详情 - 响应体
<JsonViewer
  value={...}
  instanceId={`response-body-${record.id}`}
/>

// 3. 回放编辑器 - 请求体
<JsonEditor
  value={...}
  onChange={...}
  instanceId="replay-json-body"
/>

// 4. 回放结果 - 响应体
<JsonViewer
  value={...}
  instanceId={`replay-response-${record.id}`}
/>
```

### ID 命名规则

| 位置 | ID 格式 | 示例 |
|------|---------|------|
| 接口详情 - JSON Body | `request-json-${recordId}` | `request-json-abc123` |
| 接口详情 - 响应体 | `response-body-${recordId}` | `response-body-abc123` |
| 回放编辑器 - 请求体 | `replay-json-body` | `replay-json-body` |
| 回放结果 - 响应体 | `replay-response-${recordId}` | `replay-response-abc123` |

## 技术实现

### DOM 结构

**之前：**
```html
<!-- 实例 1 -->
<div data-path="user.name">...</div>

<!-- 实例 2 -->
<div data-path="user.name">...</div>

<!-- querySelector 可能找到任意一个 -->
```

**现在：**
```html
<!-- 实例 1 -->
<div data-instance="request-json-abc123" data-path="user.name">...</div>

<!-- 实例 2 -->
<div data-instance="replay-json-body" data-path="user.name">...</div>

<!-- querySelector 精确定位 -->
```

### 选择器优先级

```typescript
// 组合选择器，同时匹配两个属性
const selector = `[data-instance="${instanceId}"][data-path="${path}"]`;

// 等价于
const selector = `div[data-instance="replay-json-body"][data-path="user.name"]`;
```

**优点：**
- 精确匹配
- 避免冲突
- 性能良好

## 测试场景

### 测试 1: 多个实例同时存在

**页面状态：**
- 接口详情展开，显示 JSON Body 和响应体
- 回放面板展开，显示请求体编辑器和响应体

**操作：**
1. ✅ 在回放编辑器中查找 "user"
2. ✅ 验证：只在回放编辑器中高亮和滚动
3. ✅ 验证：接口详情的查看器不受影响

### 测试 2: 相同路径不同实例

**数据：**
```json
// 接口详情 - JSON Body
{
  "user": {
    "name": "张三"
  }
}

// 回放编辑器 - 请求体
{
  "user": {
    "name": "李四"
  }
}
```

**操作：**
1. ✅ 在回放编辑器中查找 "user.name"
2. ✅ 验证：滚动到回放编辑器的 user.name
3. ✅ 验证：不会滚动到接口详情的 user.name

### 测试 3: 切换实例查找

**操作：**
1. ✅ 在接口详情的 JSON Body 中查找 "test"
2. ✅ 验证：在 JSON Body 中高亮和滚动
3. ✅ 在回放编辑器中查找 "test"
4. ✅ 验证：在回放编辑器中高亮和滚动
5. ✅ 验证：两个实例互不干扰

### 测试 4: 多个记录展开

**操作：**
1. ✅ 展开记录 A 的详情
2. ✅ 展开记录 B 的详情
3. ✅ 在记录 A 的 JSON Body 中查找
4. ✅ 验证：只在记录 A 中滚动
5. ✅ 验证：记录 B 不受影响

## 性能影响

### 选择器性能

**之前：**
```typescript
// 简单属性选择器
document.querySelector(`[data-path="${path}"]`);
```

**现在：**
```typescript
// 组合属性选择器
document.querySelector(`[data-instance="${instanceId}"][data-path="${path}"]`);
```

**性能对比：**
- 组合选择器稍慢，但差异可忽略
- 精确匹配减少了错误匹配
- 整体性能影响极小

### DOM 属性

**之前：**
```html
<div data-path="user.name">
```

**现在：**
```html
<div data-instance="replay-json-body" data-path="user.name">
```

**影响：**
- 每个节点增加一个属性
- 内存占用略微增加
- 影响可忽略

## 代码质量

### 诊断检查 ✅
```bash
✅ src/popup/components/JsonEditor.tsx: No diagnostics found
✅ src/popup/components/JsonViewer.tsx: No diagnostics found
✅ src/popup/components/GroupedRequestList.tsx: No diagnostics found
```

### 向后兼容 ✅
```typescript
instanceId = 'default' // JsonEditor 默认值
instanceId = 'viewer'  // JsonViewer 默认值
```

- 如果不传 instanceId，使用默认值
- 不影响现有代码
- 完全向后兼容

## 实例 ID 总览

| 组件 | 位置 | Instance ID |
|------|------|-------------|
| JsonViewer | 接口详情 - JSON Body | `request-json-${recordId}` |
| JsonViewer | 接口详情 - 响应体 | `response-body-${recordId}` |
| JsonEditor | 回放编辑器 - 请求体 | `replay-json-body` |
| JsonViewer | 回放结果 - 响应体 | `replay-response-${recordId}` |

## 总结

✅ **多实例冲突已修复**
✅ **每个实例有唯一 ID**
✅ **查找和滚动精确定位**
✅ **实例之间互不干扰**
✅ **向后兼容**
✅ **性能影响极小**

现在多个 JSON 编辑器/查看器可以在同一页面和谐共存！🎉
