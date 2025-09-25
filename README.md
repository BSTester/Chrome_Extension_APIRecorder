# API Recorder - Chrome扩展程序

一个强大的Chrome浏览器扩展，用于录制网页中的HTTP接口请求，并导出为OpenAPI 3.0规范文件。

## 功能特性

### 🎯 核心功能
- **自动接口录制**：自动捕获和记录所有HTTP请求
- **智能过滤系统**：排除静态资源，专注于业务接口
- **OpenAPI导出**：生成符合OpenAPI 3.0规范的文档
- **实时监控**：提供录制状态和请求统计信息

### 🔧 高级功能
- **请求去重**：基于URL模式和参数结构的智能去重
- **数据本地化**：使用IndexedDB进行大容量数据存储
- **参数推断**：自动推断请求参数和响应Schema
- **多种导出格式**：支持YAML、JSON和原始数据格式

### 🎨 用户界面
- **现代化设计**：基于React和Tailwind CSS的响应式界面
- **分页浏览**：高效处理大量请求数据
- **详细信息**：查看完整的请求头、响应数据等
- **过滤选项**：灵活的过滤和搜索功能

## 安装方法

### 从源码构建

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd chrome_ext_openapi
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **构建项目**
   ```bash
   npm run build
   ```

4. **加载到Chrome**
   - 打开Chrome浏览器
   - 访问 `chrome://extensions/`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择项目中的 `dist` 文件夹

## 使用指南

### 基本操作

1. **开始录制**
   - 点击Chrome工具栏中的扩展图标
   - 点击"开始录制"按钮
   - 浏览需要记录的网页

2. **查看请求**
   - 在"请求列表"标签中查看已录制的请求
   - 点击请求可查看详细信息
   - 支持复制URL和JSON数据

3. **配置过滤**
   - 在"过滤选项"标签中设置过滤规则
   - 排除静态资源和无关请求
   - 支持域名和状态码过滤

4. **导出数据**
   - 在"导出"标签中选择导出格式
   - 配置OpenAPI文档信息
   - 下载生成的文档文件

### 过滤选项详解

#### 基础过滤
- **排除静态资源**：自动过滤图片、CSS、JS等静态文件
- **仅AJAX请求**：只录制XMLHttpRequest和Fetch请求
- **去除重复请求**：基于URL和方法进行智能去重

#### 高级过滤
- **响应时间过滤**：设置最小响应时间阈值
- **域名过滤**：只录制指定域名的请求
- **状态码过滤**：只录制特定状态码的请求

### OpenAPI导出配置

#### 基本信息
- **API标题**：生成文档的标题
- **API版本**：版本号（如1.0.0）
- **API描述**：可选的详细描述

#### 高级选项
- **服务器URL**：API服务器地址（支持自动检测）
- **包含示例数据**：在Schema中包含实际的请求响应示例
- **参数化URL**：自动将URL中的ID和UUID参数化为路径参数

## 技术架构

### 技术栈
- **前端框架**：React 18 + TypeScript
- **样式框架**：Tailwind CSS
- **构建工具**：Vite
- **存储**：Chrome Extension Storage API + IndexedDB
- **规范支持**：OpenAPI 3.0

### 架构组件
- **Service Worker**：后台请求监听和数据处理
- **Content Script**：页面上下文信息收集
- **Popup UI**：用户交互界面
- **Storage Manager**：数据存储和管理
- **Export Engine**：OpenAPI文档生成

### 数据流程
```
Web请求 → Service Worker → 过滤处理 → 数据存储 → UI展示 → OpenAPI导出
```

## 开发指南

### 项目结构
```
src/
├── background/          # Service Worker
├── content/            # Content Scripts
├── popup/              # Popup UI
│   ├── components/     # React组件
│   └── hooks/          # React Hooks
├── storage/            # 存储管理
├── export/             # 导出引擎
├── utils/              # 工具函数
└── types/              # TypeScript类型定义
```

### 开发命令
```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 类型检查
npm run type-check

# 代码检查
npm run lint
```

### 扩展开发
项目支持通过插件系统进行扩展：

- **自定义过滤器**：实现FilterPlugin接口
- **数据处理器**：实现DataProcessor接口
- **导出格式**：实现ExportFormatter接口
- **UI组件**：实现UIComponent接口

## 使用场景

### API文档生成
- 快速为现有系统生成API文档
- 无需手动整理接口信息
- 保证文档与实际接口的一致性

### 接口测试
- 生成Postman Collection
- 导入到API测试工具
- 进行自动化测试

### 系统集成
- 了解第三方API的调用方式
- 分析系统间的接口依赖
- 优化接口性能

### 开发调试
- 监控前端API调用
- 分析请求响应数据
- 排查接口问题

## 注意事项

### 隐私和安全
- 扩展只在用户主动录制时收集数据
- 所有数据存储在本地，不上传到服务器
- 支持手动清除所有录制数据

### 性能优化
- 使用虚拟滚动处理大量数据
- 智能过滤减少无关请求
- 异步处理避免阻塞用户界面

### 兼容性
- 支持Chrome Manifest V3
- 兼容现代Web技术（fetch、XMLHttpRequest）
- 支持SPA应用的路由变化监听

## 许可证

本项目采用 MIT 许可证。详情请查看 [LICENSE](LICENSE) 文件。

## 贡献指南

欢迎提交Issue和Pull Request！

1. Fork本项目
2. 创建feature分支
3. 提交更改
4. 发起Pull Request

## 更新日志

### v1.0.0 (2024-09-25)
- 初始版本发布
- 支持HTTP请求录制
- OpenAPI 3.0文档导出
- React用户界面
- 智能过滤系统