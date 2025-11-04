# JSON 只读查看器组件

## 新增组件

### JsonViewer.tsx ✅
一个只读的 JSON 查看器组件，用于显示响应体，具有与 JsonEditor 相同的视觉风格，但移除了所有编辑功能。

## 功能特性

### 支持的功能 ✅
- ✅ 树形结构显示
- ✅ 展开/折叠节点
- ✅ 全部展开/全部折叠
- ✅ 查找功能（支持键名和值）
- ✅ 查找导航（上一个/下一个）
- ✅ 快捷键支持（F3, Enter, Shift+Enter）
- ✅ 自动滚动到匹配项
- ✅ 高亮当前匹配项
- ✅ 语法高亮（不同类型不同颜色）

### 移除的功能 ❌
- ❌ 编辑键名
- ❌ 编辑值
- ❌ 添加字段
- ❌ 删除字段
- ❌ 替换功能

## 使用场景

### 1. 接口详情中的响应体
```typescript
{record.responseBody && (
  <div>
    <h5 className="text-xs font-medium text-gray-700 mb-2">响应体</h5>
    <JsonViewer
      value={typeof record.responseBody === 'string' 
        ? record.responseBody 
        : JSON.stringify(record.responseBody, null, 2)}
      placeholder="无响应体"
    />
  </div>
)}
```

### 2. 回放结果中的响应体
```typescript
<div>
  <div className="flex items-center justify-between mb-1">
    <div className="text-xs text-gray-700">响应片段（最多 32KB）</div>
    <button onClick={copyResponse}>复制响应体</button>
  </div>
  <JsonViewer
    value={typeof result.bodySnippet === 'string' 
      ? result.bodySnippet 
      : JSON.stringify(result.bodySnippet, null, 2)}
    placeholder="无响应体"
  />
</div>
```

## 组件对比

### JsonEditor（可编辑）
```typescript
<JsonEditor
  value={jsonString}
  onChange={handleChange}  // 支持编辑
  placeholder="编辑 JSON"
/>
```

**功能：**
- ✅ 查看
- ✅ 编辑
- ✅ 查找
- ✅ 替换

### JsonViewer（只读）
```typescript
<JsonViewer
  value={jsonString}
  // 无 onChange，不支持编辑
  placeholder="查看 JSON"
/>
```

**功能：**
- ✅ 查看
- ❌ 编辑
- ✅ 查找
- ❌ 替换

## 视觉风格

### 完全一致的 UI
- ✅ 相同的树形结构
- ✅ 相同的颜色方案
- ✅ 相同的展开/折叠动画
- ✅ 相同的查找高亮
- ✅ 相同的字体和间距

### 差异点
- ❌ 没有编辑按钮
- ❌ 没有删除按钮
- ❌ 没有添加按钮
- ❌ 没有替换输入框
- ❌ 键名和值不可点击编辑

## 查找功能

### 支持的查找操作
```
1. 输入查找内容
2. 点击"查找"或按 Enter
3. 显示匹配数量
4. 高亮当前匹配项
5. 使用导航按钮或快捷键切换
```

### 快捷键
| 快捷键 | 功能 |
|--------|------|
| Enter | 查找下一个 |
| Shift+Enter | 查找上一个 |
| F3 | 查找下一个 |
| Shift+F3 | 查找上一个 |
| Escape | 关闭查找面板 |

### 查找示例

**响应体：**
```json
{
  "status": "success",
  "data": {
    "userId": 12345,
    "userName": "张三",
    "userEmail": "user@example.com"
  }
}
```

**查找 "user"：**
- 找到 4 个匹配项
- userId（键名）
- userName（键名）
- userEmail（键名）
- user@example.com（值）

## 代码结构

### 核心状态
```typescript
const [jsonData, setJsonData] = useState<any>({});
const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
const [showSearch, setShowSearch] = useState(false);
const [searchText, setSearchText] = useState('');
const [searchResults, setSearchResults] = useState<Array<...>>([]);
const [currentResultIndex, setCurrentResultIndex] = useState(0);
```

### 核心函数
```typescript
// 展开/折叠
const toggleExpand = (path: string) => { ... };
const expandAll = () => { ... };
const collapseAll = () => { ... };

// 查找
const handleSearch = () => { ... };
const handlePrevResult = () => { ... };
const handleNextResult = () => { ... };

// 辅助
const expandToPath = (targetPath: string) => { ... };
const scrollToMatch = (path: string) => { ... };
```

### 渲染逻辑
```typescript
const nodes = parseJsonToTree(jsonData);

return (
  <div>
    {/* 工具栏 */}
    <div>
      <button onClick={expandAll}>全部展开</button>
      <button onClick={collapseAll}>全部折叠</button>
      <button onClick={() => setShowSearch(!showSearch)}>查找</button>
    </div>

    {/* 查找面板 */}
    {showSearch && <SearchPanel />}

    {/* JSON 树形视图 */}
    <div>
      {nodes.map(node => (
        <div data-path={node.path}>
          {/* 展开按钮 */}
          {/* 键名 */}
          {/* 值 */}
        </div>
      ))}
    </div>
  </div>
);
```

## 性能优化

### 1. 按需渲染
- 只渲染展开的节点
- 折叠的子节点不渲染
- 减少 DOM 节点数量

### 2. 虚拟滚动
- 使用 `max-h-64` 限制高度
- 启用滚动条
- 避免渲染过多节点

### 3. 事件优化
- 使用事件委托
- 避免重复监听
- 正确清理事件

## 集成效果

### 接口详情
```
┌─────────────────────────────────────┐
│ 请求头                               │
│ ...                                  │
├─────────────────────────────────────┤
│ 响应体                               │
│ ┌─────────────────────────────────┐ │
│ │ [全部展开] [全部折叠] [查找]    │ │
│ ├─────────────────────────────────┤ │
│ │ ├─ status: "success"            │ │
│ │ ├─ data: {...}                  │ │
│ │ │  ├─ userId: 12345             │ │
│ │ │  ├─ userName: "张三"          │ │
│ │ │  └─ userEmail: "..."          │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 回放结果
```
┌─────────────────────────────────────┐
│ 响应片段（最多 32KB） [复制响应体]  │
│ ┌─────────────────────────────────┐ │
│ │ [全部展开] [全部折叠] [查找]    │ │
│ ├─────────────────────────────────┤ │
│ │ ├─ code: 200                    │ │
│ │ ├─ message: "success"           │ │
│ │ └─ data: {...}                  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 用户体验

### 之前 ❌
```
响应体：
┌─────────────────────────────────────┐
│ {                                   │
│   "status": "success",              │
│   "data": {                         │
│     "userId": 12345,                │
│     "userName": "张三",             │
│     "userEmail": "user@example.com" │
│   }                                 │
│ }                                   │
└─────────────────────────────────────┘
```

**问题：**
- 纯文本显示
- 无法折叠
- 无法查找
- 大 JSON 难以阅读

### 现在 ✅
```
响应体：
┌─────────────────────────────────────┐
│ [全部展开] [全部折叠] [查找]        │
├─────────────────────────────────────┤
│ ▼ status: "success"                 │
│ ▼ data: {2 keys}                    │
│   ├─ userId: 12345                  │
│   ├─ userName: "张三"               │
│   └─ userEmail: "user@example.com"  │
└─────────────────────────────────────┘
```

**优点：**
- 树形结构
- 可折叠
- 可查找
- 语法高亮
- 易于阅读

## 代码质量

### 诊断检查 ✅
```bash
✅ src/popup/components/JsonViewer.tsx: No diagnostics found
✅ src/popup/components/GroupedRequestList.tsx: No diagnostics found
```

### 代码复用
- 复用 JsonEditor 的核心逻辑
- 移除编辑相关代码
- 保持一致的视觉风格
- 减少维护成本

## 总结

✅ **JsonViewer 组件完成**
✅ **只读查看，不可编辑**
✅ **支持查找，不支持替换**
✅ **与 JsonEditor 风格一致**
✅ **已集成到响应体显示**
✅ **用户体验大幅提升**

现在响应体显示更加专业和易用！🎉
