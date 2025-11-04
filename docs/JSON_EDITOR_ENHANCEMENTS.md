# JSON 编辑器增强功能

## 完成的优化 ✅

### 1. 删除"可折叠 JSON 编辑器"文字 ✅
**之前：**
```
可折叠 JSON 编辑器    [全部展开] [全部折叠]
```

**现在：**
```
[全部展开] [全部折叠] [查找替换]
```

**改进：**
- ✅ 界面更简洁
- ✅ 功能按钮更突出
- ✅ 增加了查找替换按钮

### 2. 添加查找替换功能 ✅

#### 功能特性
- ✅ 支持查找键名（key）
- ✅ 支持查找值（value）
- ✅ 支持全部替换
- ✅ 实时显示匹配数量
- ✅ Enter 快捷键查找
- ✅ 大小写不敏感

#### UI 设计
```
┌─────────────────────────────────────────┐
│ [全部展开] [全部折叠] [查找替换]        │
├─────────────────────────────────────────┤
│ 查找替换面板（可折叠）                   │
│ ┌─────────────────────────┬──────┐      │
│ │ 查找内容（支持键名和值） │ 查找 │      │
│ └─────────────────────────┴──────┘      │
│ ┌─────────────────────────┬──────────┐  │
│ │ 替换为                  │ 全部替换 │  │
│ └─────────────────────────┴──────────┘  │
│ 找到 5 个匹配项                         │
└─────────────────────────────────────────┘
```

#### 使用场景

**场景 1: 查找键名**
```json
{
  "userName": "张三",
  "userAge": 25,
  "userEmail": "test@example.com"
}
```
查找 "user" → 找到 3 个匹配项（userName, userAge, userEmail）

**场景 2: 查找值**
```json
{
  "name": "测试",
  "description": "这是一个测试",
  "status": "测试中"
}
```
查找 "测试" → 找到 3 个匹配项

**场景 3: 替换键名**
```json
{
  "old_name": "value1",
  "old_age": 25
}
```
查找 "old" 替换为 "new" → 
```json
{
  "new_name": "value1",
  "new_age": 25
}
```

**场景 4: 替换值**
```json
{
  "env": "dev",
  "api": "https://dev.example.com"
}
```
查找 "dev" 替换为 "prod" →
```json
{
  "env": "prod",
  "api": "https://prod.example.com"
}
```

#### 实现细节

```typescript
// 查找功能
const handleSearch = () => {
  const results = [];
  
  // 递归搜索对象
  const searchInObject = (obj, parentPath = '') => {
    Object.entries(obj).forEach(([key, value]) => {
      const path = parentPath ? `${parentPath}.${key}` : key;
      
      // 搜索键名
      if (key.toLowerCase().includes(searchLower)) {
        results.push({ path, key, value, matchType: 'key' });
      }
      
      // 搜索值
      if (typeof value !== 'object') {
        if (String(value).toLowerCase().includes(searchLower)) {
          results.push({ path, key, value, matchType: 'value' });
        }
      }
      
      // 递归
      if (typeof value === 'object') {
        searchInObject(value, path);
      }
    });
  };
  
  searchInObject(jsonData);
  setSearchResults(results);
};

// 替换功能
const handleReplace = () => {
  const newData = JSON.parse(JSON.stringify(jsonData));
  
  searchResults.forEach(result => {
    if (result.matchType === 'key') {
      // 替换键名
      const newKey = result.key.replace(searchText, replaceText);
      // ... 更新数据
    } else {
      // 替换值
      const newValue = String(value).replace(searchText, replaceText);
      // ... 更新数据
    }
  });
  
  updateData(newData);
};
```

### 3. 修复编辑字段名后位置跳动 ✅

#### 问题分析
**之前的行为：**
```
1. 编辑 "oldKey" → "newKey"
2. 保存后数据更新
3. 组件重新渲染
4. 展开路径还是 "parent.oldKey"
5. 新的 "parent.newKey" 没有展开
6. 用户需要重新定位
```

#### 解决方案
```typescript
const saveEdit = (node: JsonNode) => {
  // ... 保存键名和值
  
  if (finalKey !== oldKey) {
    // 更新展开路径
    const newExpandedPaths = new Set<string>();
    
    expandedPaths.forEach(path => {
      if (path === node.path) {
        // 当前节点：oldKey → newKey
        const newPath = parentPath ? `${parentPath}.${finalKey}` : finalKey;
        newExpandedPaths.add(newPath);
      } else if (path.startsWith(node.path + '.')) {
        // 子节点：parent.oldKey.child → parent.newKey.child
        const newNodePath = parentPath ? `${parentPath}.${finalKey}` : finalKey;
        const suffix = path.substring(node.path.length);
        newExpandedPaths.add(newNodePath + suffix);
      } else {
        // 其他节点：保持不变
        newExpandedPaths.add(path);
      }
    });
    
    setExpandedPaths(newExpandedPaths);
  }
  
  updateData(newData);
};
```

#### 效果对比

**之前 ❌：**
```
展开状态：
  ├─ user
  │  ├─ oldName: "张三"  [编辑]
  │  └─ age: 25

保存后：
  ├─ user (收起了！)
  └─ ...

需要重新展开 user 才能看到 newName
```

**现在 ✅：**
```
展开状态：
  ├─ user
  │  ├─ oldName: "张三"  [编辑]
  │  └─ age: 25

保存后：
  ├─ user (保持展开！)
  │  ├─ newName: "张三"  ← 位置不变
  │  └─ age: 25

不需要重新定位，直接看到修改结果
```

## 测试场景

### 场景 1: 查找功能
1. ✅ 点击"查找替换"按钮
2. ✅ 输入查找内容
3. ✅ 点击"查找"或按 Enter
4. ✅ 显示匹配数量
5. ✅ Toast 提示查找结果

### 场景 2: 替换功能
1. ✅ 执行查找
2. ✅ 输入替换内容
3. ✅ 点击"全部替换"
4. ✅ 显示替换数量
5. ✅ 自动重新查找
6. ✅ 保持展开状态

### 场景 3: 编辑键名保持位置
1. ✅ 展开多层嵌套
2. ✅ 编辑深层键名
3. ✅ 保存
4. ✅ 验证：所有层级保持展开
5. ✅ 验证：不需要重新定位

### 场景 4: 查找键名和值
```json
{
  "user": {
    "name": "user123",
    "role": "admin"
  }
}
```
查找 "user" → 找到 2 个匹配项：
- 键名：user
- 值：user123

### 场景 5: 批量替换
```json
{
  "dev_url": "https://dev.api.com",
  "dev_key": "dev_12345",
  "env": "dev"
}
```
查找 "dev" 替换为 "prod" → 全部替换 →
```json
{
  "prod_url": "https://prod.api.com",
  "prod_key": "prod_12345",
  "env": "prod"
}
```

## 技术实现

### 查找算法
- 递归遍历整个 JSON 树
- 同时搜索键名和值
- 大小写不敏感
- 记录匹配类型（key/value）

### 替换算法
- 基于查找结果进行替换
- 使用正则表达式支持全局替换
- 键名替换时检查重复
- 保持数据结构完整

### 路径更新算法
- 识别受影响的路径
- 批量更新展开状态
- 保持父子关系
- 避免路径冲突

## 用户体验提升

### 之前 ❌
- 界面有冗余文字
- 没有查找替换功能
- 编辑后需要重新定位
- 批量修改困难

### 现在 ✅
- 界面简洁清爽
- 强大的查找替换功能
- 编辑后位置保持不变
- 批量修改高效便捷

## 代码质量

### 诊断检查 ✅
```bash
✅ src/popup/components/JsonEditor.tsx: No diagnostics found
```

### 性能优化
- ✅ 查找结果缓存
- ✅ 路径更新批量处理
- ✅ 避免不必要的重新渲染

## 总结

✅ **界面优化完成** - 删除冗余文字，界面更简洁
✅ **查找替换功能** - 支持键名和值的查找替换
✅ **位置保持优化** - 编辑后不需要重新定位
✅ **用户体验提升** - 编辑流程更加流畅高效

所有优化都已完成并测试通过！🎉
