# Bug 修复总结

## Bug 1: 同时编辑 key 和 value 时，key 的修改没有保存 ❌

### 问题分析
```typescript
// 原来的实现
const saveEdit = (node: JsonNode) => {
  // 1. 先保存键名
  if (editingKeyPath === node.path) {
    // ... 修改键名
    updateData(newData); // 第一次更新
  }
  
  // 2. 再保存值
  if (editingPath === node.path) {
    // ... 修改值
    updateValueByPath(node.path, parsedValue); // 第二次更新，但 path 还是旧的！
  }
};
```

**问题**：
1. 保存键名后调用 `updateData`，键名已经改变
2. 保存值时使用的还是旧的 `node.path`（包含旧键名）
3. 导致值保存到错误的位置，或者键名修改被覆盖

### 修复方案 ✅
```typescript
const saveEdit = (node: JsonNode) => {
  let success = true;
  const keys = node.path.split('.');
  const newData = JSON.parse(JSON.stringify(jsonData));

  let current = newData;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]];
  }

  const oldKey = node.key;
  let finalKey = oldKey;

  // 1. 先处理键名修改（在内存中）
  if (editingKeyPath === node.path) {
    const newKey = editingKeyValue.trim();
    if (newKey && newKey !== oldKey) {
      if (typeof current === 'object' && !Array.isArray(current)) {
        if (current.hasOwnProperty(newKey) && newKey !== oldKey) {
          alert('该字段名已存在');
          success = false;
        } else {
          // 重命名键
          const value = current[oldKey];
          delete current[oldKey];
          current[newKey] = value;
          finalKey = newKey; // 记录新键名
        }
      }
    }
  }

  // 2. 再处理值修改（使用新键名）
  if (success && editingPath === node.path) {
    let parsedValue: any = editingValue;
    // ... 类型转换
    if (success) {
      current[finalKey] = parsedValue; // 使用新键名！
    }
  }

  // 3. 最后一次性更新数据
  if (success) {
    updateData(newData);
    // 清理编辑状态
  }
};
```

**改进点**：
- ✅ 在同一个 `newData` 对象中完成所有修改
- ✅ 使用 `finalKey` 跟踪最终的键名
- ✅ 只调用一次 `updateData`
- ✅ 键名和值的修改都能正确保存

## Bug 2: 子层级添加节点后父节点收起 ❌

### 问题分析
```typescript
// 原来的实现
const [isInternalUpdate, setIsInternalUpdate] = useState(false);

useEffect(() => {
  if (isInternalUpdate) {
    setIsInternalUpdate(false); // 重置标记
    return; // 跳过初始化
  }
  // 重新初始化...
  setExpandedPaths(firstLevelPaths); // 重置展开状态
}, [value, isInternalUpdate]);

const updateData = (newData: any) => {
  setJsonData(newData);
  setIsInternalUpdate(true); // 设置标记
  onChange(JSON.stringify(newData, null, 2));
};
```

**问题**：
1. `isInternalUpdate` 是 state，修改会触发重新渲染
2. 第一次渲染：`isInternalUpdate = true`，跳过初始化
3. 第二次渲染：`isInternalUpdate = false`（被重置），触发初始化
4. 导致展开状态被重置

### 修复方案 ✅
```typescript
// 使用 ref 而不是 state
const isInternalUpdateRef = React.useRef(false);

useEffect(() => {
  // 如果是内部更新，跳过重新初始化
  if (isInternalUpdateRef.current) {
    isInternalUpdateRef.current = false;
    return;
  }

  // 外部更新，重新初始化
  try {
    const parsed = JSON.parse(value || '{}');
    setJsonData(parsed);
    setParseError(null);
    
    // 初始化时展开第一层
    const firstLevelPaths = new Set<string>();
    if (typeof parsed === 'object' && parsed !== null) {
      Object.keys(parsed).forEach(key => {
        if (typeof parsed[key] === 'object' && parsed[key] !== null) {
          firstLevelPaths.add(key);
        }
      });
    }
    setExpandedPaths(firstLevelPaths);
  } catch (e: any) {
    setParseError(e.message);
  }
}, [value]);

const updateData = (newData: any) => {
  setJsonData(newData);
  isInternalUpdateRef.current = true; // 设置 ref
  onChange(JSON.stringify(newData, null, 2));
};
```

**改进点**：
- ✅ 使用 `useRef` 而不是 `useState`
- ✅ ref 的修改不会触发重新渲染
- ✅ 内部更新时完全跳过初始化
- ✅ 展开状态得以保持

### 为什么使用 ref 而不是 state？

| 特性 | useState | useRef |
|------|----------|--------|
| 修改后 | 触发重新渲染 | 不触发重新渲染 |
| 值的持久性 | 在渲染间保持 | 在渲染间保持 |
| 适用场景 | UI 状态 | 标记、缓存 |

在这个场景中，`isInternalUpdate` 只是一个标记，不需要触发渲染，所以用 ref 更合适。

## 测试场景

### 场景 1: 同时编辑 key 和 value
1. ✅ 点击编辑按钮
2. ✅ 修改键名：`oldKey` → `newKey`
3. ✅ 修改值：`oldValue` → `newValue`
4. ✅ Enter 保存
5. ✅ 验证：键名和值都正确保存
6. ✅ 展开状态保持不变

### 场景 2: 在深层嵌套中添加字段
```json
{
  "level1": {
    "level2": {
      "level3": {
        // 在这里添加新字段
      }
    }
  }
}
```

1. ✅ 展开 level1
2. ✅ 展开 level2
3. ✅ 展开 level3
4. ✅ 点击 level3 的"+"按钮
5. ✅ 添加 newField
6. ✅ 验证：level1、level2、level3 都保持展开状态
7. ✅ newField 立即进入编辑状态

### 场景 3: 编辑后继续编辑
1. ✅ 编辑一个字段
2. ✅ 保存
3. ✅ 立即编辑另一个字段
4. ✅ 验证：不需要重新定位
5. ✅ 展开状态保持不变

### 场景 4: 只编辑 key
1. ✅ 点击编辑按钮
2. ✅ 只修改键名
3. ✅ 不修改值
4. ✅ Enter 保存
5. ✅ 验证：键名正确修改，值保持不变

### 场景 5: 只编辑 value
1. ✅ 点击值
2. ✅ 修改值
3. ✅ Enter 保存
4. ✅ 验证：值正确修改，键名保持不变

## 技术细节

### 内部更新流程
```
用户编辑
  ↓
updateData(newData)
  ↓
setJsonData(newData) + isInternalUpdateRef.current = true + onChange()
  ↓
父组件更新 value prop
  ↓
useEffect 触发
  ↓
检查 isInternalUpdateRef.current === true
  ↓
跳过初始化，重置 ref
  ↓
保持所有状态（展开、编辑位置等）
```

### 外部更新流程
```
外部更新 value prop
  ↓
useEffect 触发
  ↓
检查 isInternalUpdateRef.current === false
  ↓
重新解析 JSON
  ↓
重新初始化展开状态
  ↓
这是期望的行为（外部数据变化）
```

## 代码质量

### 诊断检查 ✅
```bash
✅ src/popup/components/JsonEditor.tsx: No diagnostics found
```

### 改进总结
1. ✅ 修复了同时编辑 key 和 value 的保存问题
2. ✅ 修复了子层级添加节点后父节点收起的问题
3. ✅ 使用 ref 优化了内部更新标记
4. ✅ 减少了不必要的重新渲染
5. ✅ 提升了用户体验

## 总结

✅ **Bug 1 已修复**: 同时编辑 key 和 value 时都能正确保存
✅ **Bug 2 已修复**: 任何层级的编辑操作都保持展开状态
✅ **性能优化**: 使用 ref 减少不必要的渲染
✅ **用户体验**: 编辑流程更流畅，不需要重新定位
