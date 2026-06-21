# 可视化版本管理工具 (VMT)

> Version: `1.0.1`

基于 JavaScript 的可视化版本管理工具，同时提供 **图形用户界面 (GUI)** 与 **命令行界面 (CLI)**，自动检测并同步项目中 `package.json`、`package-lock.json`、`README.md` 等文件中的版本号，确保多处版本信息完全一致。

## 功能特性

- **版本一致性检查**：自动检测 `package.json`、`package-lock.json`、`README.md` 三个文件中的版本号并比对
- **GUI 可视化界面**：直观展示各文件版本状态，绿色表示匹配、红色表示不匹配
- **CLI 命令行界面**：提供 `check`、`sync`、`update`、`history`、`serve`、`validate` 等命令
- **版本号自动同步**：以 `package.json` 版本号为准统一更新其他文件
- **语义化版本校验**：严格校验 `MAJOR.MINOR.PATCH` 格式
- **变更历史记录**：记录每次版本修改的时间、操作人和变更内容
- **配置文件自定义**：通过 `.versionrc.json` 指定额外需要检查的文件
- **跨平台兼容**：支持 Windows、macOS、Linux

## 安装

```bash
# 进入项目目录
cd vmt

# 安装依赖
npm install

# （可选）全局链接命令
npm link
```

安装完成后即可使用 `vmt` 命令（或 `node bin/vmt.js`）。

## 快速开始

### 启动 GUI 界面

```bash
npm start
# 或
node bin/vmt.js serve
# 自动打开浏览器
node bin/vmt.js serve --open
# 指定端口
node bin/vmt.js serve --port 8080
```

浏览器访问 `http://127.0.0.1:3000` 即可使用图形界面。

### CLI 命令

#### 检查版本一致性

```bash
vmt check
# 指定目录
vmt check --dir /path/to/project
# JSON 格式输出
vmt check --json
```

输出示例：
```
════════════════════════════════════════
       版本一致性检查报告
════════════════════════════════════════

基准源文件: package.json
基准版本号: 1.0.0

文件版本状态:
  ✓ package.json
      版本: 1.0.0
  ✗ package-lock.json
      版本: 0.9.0
  ✓ README.md
      版本: 1.0.0

✗ 版本不一致
  检测到 2 个不同版本：1.0.0, 0.9.0
提示: 运行 `vmt sync` 以基准版本号同步所有文件
```

#### 同步版本号

```bash
# 以基准源版本号同步所有文件
vmt sync

# 预览（不实际写入）
vmt sync --dry-run

# 指定目标版本
vmt sync --target 1.0.0
```

#### 更新版本号

```bash
# 直接指定新版本号
vmt update 1.2.0

# 使用关键字递增
vmt update patch    # 1.0.0 → 1.0.1
vmt update minor    # 1.0.0 → 1.1.0
vmt update major    # 1.0.0 → 2.0.0
```

#### 查看历史记录

```bash
vmt history
vmt history --limit 10
vmt history --json
vmt history --clear    # 清空历史
```

#### 校验版本号

```bash
vmt validate 1.2.3
vmt validate 1.2.3-beta.1
```

## 配置文件

在项目根目录创建 `.versionrc.json`（或 `.versionrc` / `.versionrc.js`）自定义配置：

```json
{
  "source": "package.json",
  "historyFile": ".version-history.json",
  "port": 3000,
  "host": "127.0.0.1",
  "files": [
    {
      "path": "package.json",
      "type": "json",
      "field": "version"
    },
    {
      "path": "package-lock.json",
      "type": "json-root",
      "field": "version"
    },
    {
      "path": "README.md",
      "type": "markdown",
      "pattern": "version[:\\s-]*`?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)[^\\s`]*`?"
    },
    {
      "path": "src/version.js",
      "type": "text",
      "pattern": "VERSION\\s*=\\s*['\"]([^'\"]+)['\"]"
    }
  ]
}
```

### 配置项说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `source` | string | 版本同步的基准源文件路径 |
| `historyFile` | string | 历史记录文件路径 |
| `port` | number | GUI 服务端口 |
| `host` | string | GUI 服务主机 |
| `files` | array | 需要检查的文件列表 |
| `files[].path` | string | 文件相对路径 |
| `files[].type` | string | 文件类型：`json` / `json-root` / `markdown` / `text` |
| `files[].field` | string | JSON 文件中版本号字段名（默认 `version`） |
| `files[].pattern` | string\|RegExp | 文本/Markdown 中提取版本号的正则 |

### 支持的文件类型

- **`json`**：标准 JSON 文件，从指定字段读取版本号
- **`json-root`**：`package-lock.json` 专用，同时同步顶层与 `packages[""]` 中的版本号
- **`markdown`**：Markdown 文件，支持 `version: 1.0.0`、`` `1.0.0` ``、`v1.0.0` 等常见写法
- **`text`**：纯文本文件，使用正则匹配版本号

## GUI 界面说明

启动 `vmt serve` 后浏览器访问 GUI：

- **顶部状态总览**：显示一致性状态、基准版本号、检查文件数、不一致文件数
- **文件版本列表**：每个文件以颜色编码展示状态（绿色匹配 / 红色不匹配 / 黄色缺失）
- **版本更新面板**：输入新版本号或使用快捷递增按钮（Patch/Minor/Major）
- **同步选项面板**：支持预览（dry-run）和实际同步
- **历史记录面板**：展示所有版本变更记录，含时间、操作人、变更详情

## 项目结构

```
版本管理工具（JS）/
├── bin/
│   └── vmt.js              # CLI 入口
├── src/
│   ├── index.js            # 主 API 模块
│   ├── checker.js          # 版本检查器
│   ├── syncer.js           # 版本同步器
│   ├── validator.js        # 语义化版本校验
│   ├── history.js          # 历史记录管理
│   ├── config.js           # 配置加载
│   └── server.js           # GUI Web 服务
├── gui/
│   ├── index.html          # GUI 页面
│   ├── styles.css          # 样式
│   └── app.js              # 前端逻辑
├── .versionrc.example.json # 示例配置
└── package.json
```

## 技术栈

- **Node.js** 运行时
- **commander** CLI 命令解析
- **express** GUI Web 服务
- **semver** 语义化版本处理
- 原生 HTML/CSS/JavaScript（无前端框架依赖）

## 跨平台支持

- Windows / macOS / Linux 全平台兼容
- 自动识别系统操作人（`USER` / `USERNAME` 环境变量）
- 路径处理使用 Node.js `path` 模块，确保跨平台一致
- CLI 颜色输出兼容 Windows 终端

## 许可证

MIT
