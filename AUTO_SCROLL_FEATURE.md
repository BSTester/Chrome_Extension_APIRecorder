# 自动滚动到匹配项功能

## 实现的功能 ✅

### 自动滚动
- ✅ 查找时自动滚动到第一个匹配项
- ✅ 点击"下一个"自动滚动
- ✅ 点击"上一个"自动滚动
- ✅ 使用快捷键时自动滚动
- ✅ 平滑滚动动画

## 技术实现

### 1. 添加 data-path 属性

为每个节点添加唯一标识：

```typescript
<div
  key={idx}
  data-path={node.path}  // 添加路径标识
  className={`flex items-center py-1 px-1 rounded group ${
    isCurrentMatch ? 'bg-yellow-100 border-l-2 border-yellow-500' : 'hover:bg-gray-50'
  }`}
>
```

### 2. 滚动函数

```typescript
const scrollToMatch = (path: string) => {
  // 等待 DOM 更新后再滚动
  setTimeout(() => {
    // 使用 data-path 属性查找元素
    const element = document.querySelector(`[data-path="${path}"]`);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',      // 平滑滚动
        block: 'center',         // 垂直居中
        inline: 'nearest'        // 水平最近位置
      });
    }
  }, 100);
};
```

### 3. 集成到导航函数

```typescript
// 上一个匹配项
const handlePrevResult = () => {
  if (searchResults.length === 0) return;
  const newIndex = currentResultIndex > 0 ? currentResultIndex - 1 : searchResults.length - 1;
  setCurrentResultIndex(newIndex);
  expandToPath(searchResults[newIndex].path);
  scrollToMatch(searchResults[newIndex].path);  // 自动滚动
};

// 下一个匹配项
const handleNextResult = () => {
  if (searchResults.length === 0) return;
  const newIndex = currentResultIndex < searchResults.length - 1 ? currentResultIndex + 1 : 0;
  setCurrentResultIndex(newIndex);
  expandToPath(searchResults[newIndex].path);
  scrollToMatch(searchResults[newIndex].path);  // 自动滚动
};

// 初始查找
const handleSearch = () => {
  // ... 查找逻辑
  if (results.length > 0) {
    expandToPath(results[0].path);
    scrollToMatch(results[0].path);  // 自动滚动到第一个
  }
};
```

## 滚动行为说明

### scrollIntoView 参数

#### behavior: 'smooth'
- 平滑滚动动画
- 用户体验更好
- 可以看到滚动过程

#### block: 'center'
- 垂直方向居中显示
- 匹配项显示在视口中间
- 上下都有足够的上下文

#### inline: 'nearest'
- 水平方向最近位置
- 避免不必要的水平滚动
- 保持当前水平位置

### 延迟处理

```typescript
setTimeout(() => {
  // 滚动逻辑
}, 100);
```

**原因：**
- 等待 DOM 更新完成
- 等待展开动画完成
- 确保元素已渲染

## 使用场景

### 场景 1: 初始查找

```
1. 输入 "test" 并点击查找
2. 找到 10 个匹配项
3. ✅ 自动展开到第一个匹配项
4. ✅ 自动滚动到第一个匹配项
5. ✅ 第一个匹配项黄色高亮并居中显示
```

### 场景 2: 导航匹配项

```
1. 点击"下一个" [▶]
2. ✅ 跳转到第 2 个匹配项
3. ✅ 自动滚动到第 2 个匹配项
4. ✅ 第 2 个匹配项居中显示
```

### 场景 3: 深层嵌套

```json
{
  "level1": {
    "level2": {
      "level3": {
        "level4": {
          "target": "找到了！"  ← 深层嵌套
        }
      }
    }
  }
}
```

**操作：**
1. 查找 "target"
2. ✅ 自动展开所有父级
3. ✅ 自动滚动到 target
4. ✅ target 居中显示并高亮

### 场景 4: 快捷键导航

```
1. 按 F3 查找下一个
2. ✅ 自动滚动到下一个匹配项
3. 按 Shift+F3 查找上一个
4. ✅ 自动滚动到上一个匹配项
```

### 场景 5: 循环导航

```
1. 在最后一个匹配项
2. 按 Enter 或点击"下一个"
3. ✅ 循环到第一个匹配项
4. ✅ 自动滚动回顶部
```

## 视觉效果

### 滚动前
```
┌─────────────────────────────┐
│ field1: "value1"            │
│ field2: "value2"            │
│ field3: "value3"            │ ← 视口顶部
│ field4: "value4"            │
│ field5: "value5"            │
└─────────────────────────────┘
  ...
  field20: "target" ← 匹配项在下方看不见
```

### 滚动后
```
  ...
┌─────────────────────────────┐
│ field18: "value18"          │
│ field19: "value19"          │
│ field20: "target" ← 高亮    │ ← 居中显示
│ field21: "value21"          │
│ field22: "value22"          │
└─────────────────────────────┘
  ...
```

## 对比其他实现

### 不滚动 ❌
```
问题：
- 匹配项可能在视口外
- 用户需要手动滚动
- 体验不流畅
```

### 滚动到顶部 ❌
```
问题：
- 匹配项在视口顶部
- 看不到上方的上下文
- 不够直观
```

### 滚动到底部 ❌
```
问题：
- 匹配项在视口底部
- 看不到下方的上下文
- 不够直观
```

### 滚动到中间 ✅
```
优点：
- 匹配项在视口中间
- 上下都有足够的上下文
- 视觉效果最佳
- 符合用户习惯
```

## 性能优化

### 1. 延迟滚动
```typescript
setTimeout(() => {
  // 滚动逻辑
}, 100);
```
- 避免在 DOM 更新期间滚动
- 等待动画完成
- 提高稳定性

### 2. 使用 data 属性
```typescript
const element = document.querySelector(`[data-path="${path}"]`);
```
- 精确定位元素
- 避免复杂的选择器
- 性能更好

### 3. 条件滚动
```typescript
if (element) {
  element.scrollIntoView(...);
}
```
- 检查元素是否存在
- 避免错误
- 提高健壮性

## 浏览器兼容性

### scrollIntoView API
- ✅ Chrome 61+
- ✅ Firefox 36+
- ✅ Safari 15.4+
- ✅ Edge 79+

### smooth 行为
- ✅ Chrome 61+
- ✅ Firefox 36+
- ✅ Safari 15.4+
- ✅ Edge 79+

**降级方案：**
```typescript
// 如果不支持 smooth，会自动降级为瞬间滚动
element.scrollIntoView({
  behavior: 'smooth',  // 不支持时自动降级
  block: 'center',
  inline: 'nearest'
});
```

## 测试场景

### 测试 1: 基本滚动
1. ✅ 查找匹配项
2. ✅ 验证：自动滚动到第一个
3. ✅ 验证：匹配项居中显示
4. ✅ 验证：匹配项高亮

### 测试 2: 导航滚动
1. ✅ 点击"下一个"
2. ✅ 验证：滚动到下一个匹配项
3. ✅ 验证：平滑滚动动画
4. ✅ 验证：匹配项居中

### 测试 3: 快捷键滚动
1. ✅ 按 F3
2. ✅ 验证：自动滚动
3. ✅ 验证：匹配项居中
4. ✅ 验证：高亮正确

### 测试 4: 深层嵌套滚动
1. ✅ 查找深层嵌套的值
2. ✅ 验证：自动展开所有父级
3. ✅ 验证：滚动到目标位置
4. ✅ 验证：目标居中显示

### 测试 5: 循环滚动
1. ✅ 在最后一个匹配项
2. ✅ 点击"下一个"
3. ✅ 验证：滚动回第一个
4. ✅ 验证：平滑滚动到顶部

## 用户体验提升

### 之前 ❌
- 匹配项可能在视口外
- 需要手动滚动查找
- 不知道匹配项在哪里
- 体验不流畅

### 现在 ✅
- 自动滚动到匹配项
- 匹配项始终可见
- 居中显示更直观
- 平滑动画更优雅

## 总结

✅ **自动滚动功能完成**
✅ **平滑滚动动画**
✅ **居中显示匹配项**
✅ **所有导航方式都支持**
✅ **用户体验大幅提升**

现在查找功能完全类似专业 IDE，自动定位、自动滚动、自动高亮！🎉
