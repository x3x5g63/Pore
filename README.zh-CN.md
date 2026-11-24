<div align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="84" height="84" alt="Pore icon" />
  <h1>Pore</h1>
  <p><strong>极速、纯粹、零 AI 的源码、Markdown 与 Git Diff 桌面阅读器。</strong></p>

  <p>
    <a href="README.md">English</a> •
    <strong>简体中文</strong>
  </p>

  <p>
    <a href="#为什么做-pore">为什么做 Pore</a> •
    <a href="#核心特性">核心特性</a> •
    <a href="#主题与排版">主题与排版</a> •
    <a href="#开发与构建">开发与构建</a> •
    <a href="#快捷键">快捷键</a> •
    <a href="#架构概览">架构概览</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Built_with-Tauri_v2-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/Core-Rust-DEA584?style=flat-square&logo=rust&logoColor=white" alt="Rust" />
    <img src="https://img.shields.io/badge/Highlighter-Shiki-F7DF1E?style=flat-square&logoColor=black" alt="Shiki" />
    <img src="https://img.shields.io/badge/AI_Features-0%25-10B981?style=flat-square" alt="Zero AI" />
    <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License" />
  </p>
</div>

---

## 为什么做 Pore？

现代代码编辑器越来越臃肿。在行内幽灵补全、侧边聊天框和后台索引 Agent 的重重干扰下，只是想**安静地读一遍仓库代码**或 **Review 一份 Diff**，也变得前所未有的沉重。

**Pore**（意为“全神贯注地阅读与研读”）只为一件事而生：**为人类开发者提供一个纯粹、无干扰、只读的代码检视桌面空间。**

* **0% AI，100% 专注：** 没有 Copilot、没有 Prompt 输入框、没有遥测埋点，也没有占用内存的后台 LLM 进程。
* **原生轻量：** 基于 **Tauri v2** 与 **Rust** 构建——所有文件遍历、二进制嗅探、系统字体枚举与 Git Diff 计算均在 Rust 原生完成，彻底告别 `monaco` / `codemirror` 等重型编辑器运行时。
* **三合一阅读体验：** 无缝切换代码阅读、Markdown 排版预览与词级 Git Diff 对比。

---

## 核心特性

### 1. 流畅清晰的源码阅读
* 基于 **Shiki**（TextMate grammars + JS regex engine）并在独立 **Web Worker** 中执行语法高亮，按需加载语言包，不阻塞主线程。
* 结合 **`@tanstack/react-virtual`** 实现逐行虚拟滚动渲染与 sticky 等宽行号 gutter，大文件也能顺滑滚动。
* Rust 端通过 `content_inspector` 进行 8 KB 二进制嗅探与 `5 MB` 安全阈值拦截，避免误开二进制或超大文件卡死界面。

### 2. 干净优雅的 Markdown 预览
* 由 `unified` + `remark-parse` + `remark-gfm` + `remark-math` + `remark-rehype` + `rehype-katex` + `@shikijs/rehype` + `rehype-stringify` 驱动。
* 精细排版渲染 `README.md` 与技术文档，支持 GFM 表格、任务列表、**KaTeX 数学公式**（行内与块级公式）、字数与阅读时长统计，代码块自动同步当前 Shiki 主题。
* 一键在 **Preview**（预览）与 **Raw**（源码，复用虚拟滚动代码阅读器）之间切换；外部编辑保存后支持实时文件监听自动刷新。

### 3. 精准的 Git Diff 检视
* 基于 **`@pierre/diffs`**，直接消费 Rust 端 **`git2`** + **`similar`** 预计算的行级与词级 inline diff hunks，JavaScript 端零 Diff 计算。
* 支持 **Split**（双栏对比）与 **Unified**（单栏整合）视图即时切换，展示 `+additions` / `-deletions` 统计，并支持展开未变更上下文。
* 常驻双 Tab 侧边栏（**Files** 懒加载目录树 + **Changes** Git 变更列表），对于已修改文件，顶部 Header 还提供 **File / Diff** 快速切换。

---

## 主题与排版

* **5 套精选 Color Themes**，UI Chrome、Shiki 代码阅读器、Markdown 代码块与 `@pierre/diffs` 全链路实时联动：
  * **Dark：** `Linear Dark`（默认）、`Gruvbox Dark`、`Everforest Dark`
  * **Light：** `Linear Light`、`Vitesse Light`
* **明暗模式一键切换：** 顶部栏支持快速切换 Light / Dark，配置自动持久化且启动无闪屏。
* **本机字体与字号调节：** 通过 Rust 的 `fontdb` 原生枚举本机已安装字体（支持搜索与等宽代码字体优先排序），支持在 `11px`–`22px` 范围内自由调整代码字号（默认 `14px`）。

---

## 开发与构建

### 环境要求
* **Rust**（`>= 1.77`）
* **Node.js**（`>= 20`）
* **pnpm**
* [Tauri v2](https://v2.tauri.app/start/prerequisites/) 对应的系统构建依赖

### 本地开发运行
```bash
git clone https://github.com/your-username/pore.git
cd pore
pnpm install
pnpm tauri dev
```

### 生产构建与测试验证
```bash
# 前端构建与类型检查（TypeScript + Vite）
pnpm build

# 运行 Rust 单元测试
cargo test --manifest-path src-tauri/Cargo.toml

# 打包原生桌面端应用（.app / .dmg 等）
pnpm tauri build
```

---

## 快捷键

| 快捷键 | 功能 |
| :--- | :--- |
| `Cmd/Ctrl + P` | 打开模糊文件快搜（遵守 `.gitignore`） |
| `Cmd/Ctrl + O` | 打开文件夹选择弹窗 |
| `Cmd/Ctrl + +` / `Cmd/Ctrl + -` | 放大 / 缩小代码字号 |
| `Cmd/Ctrl + 0` | 重置代码字号为 `14px` |
| `↑` / `↓` · `Enter` · `Esc` | 在快搜列表中上下选择、打开文件或关闭弹窗 |

---

## 架构概览

Pore 将文件系统、Git 操作、字体枚举与文件监听下沉至 Rust，保持 React 前端层轻薄纯粹：

```text
┌────────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + TypeScript + Vite + Tailwind CSS v4)     │
│  ├── CodeViewer   ──► Shiki Web Worker + @tanstack/react-virtual│
│  ├── MdViewer     ──► unified + remark-gfm + KaTeX + Shiki     │
│  └── DiffViewer   ──► @pierre/diffs (hydrated from Rust hunks) │
└──────────────────────────────┬─────────────────────────────────┘
                               │ Tauri v2 IPC & Events
┌──────────────────────────────▼─────────────────────────────────┐
│  Backend Core (Rust + Tauri v2 + tauri-plugin-dialog)          │
│  ├── ignore                ──► .gitignore 感知的目录与文件遍历 │
│  ├── git2                  ──► 仓库状态、工作区与 HEAD 读取    │
│  ├── similar               ──► 行级与词级 inline diff 计算     │
│  ├── content_inspector     ──► 8 KB 二进制嗅探与 5 MB 保护     │
│  ├── fontdb                ──► 本机已安装字体原生枚举          │
│  └── notify-debouncer-mini ──► 防抖实时文件变更监听            │
└────────────────────────────────────────────────────────────────┘
```

---

## 非目标（Non-Goals）

为了保持 Pore 的极速与专注，以下功能**刻意不在支持范围内**：
* 完整的 IDE 代码编辑、重构或断点调试能力
* 重型编辑器运行时（`monaco-editor`、`codemirror`、`ace`）或 LSP 守护进程
* 插件市场或第三方扩展运行时
* 任何形式的 AI 生成、摘要或对话助手

---

## 开源协议

MIT
