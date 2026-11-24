<div align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="84" height="84" alt="Pore icon" />
  <h1>Pore</h1>
  <p><strong>Pore over code, Markdown, and Git diffs—fast, quiet, and zero-AI.</strong></p>

  <p>
    <strong>English</strong> •
    <a href="README.zh-CN.md">简体中文</a>
  </p>

  <p>
    <a href="#why-pore">Why Pore?</a> •
    <a href="#features">Features</a> •
    <a href="#themes--typography">Themes & Typography</a> •
    <a href="#development--build">Build</a> •
    <a href="#keyboard-shortcuts">Shortcuts</a> •
    <a href="#architecture">Architecture</a>
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

## Why Pore?

Modern code editors have become noisy. Between inline ghost text, floating chat sidebars, and background indexing agents, simply **reading a repository** or **reviewing a diff** feels heavier than ever.

**Pore** (*to read or study carefully and attentively*) is built on a single premise: **a dedicated, read-only desktop space for humans to inspect code without distractions.**

* **0% AI, 100% Focus:** No copilots, no prompt boxes, no telemetry, and no background LLM processes.
* **Native & Lightweight:** Built with **Tauri v2** and **Rust**—all filesystem traversal, binary detection, font discovery, and Git diffing run natively in Rust, with zero heavy editor runtimes (`monaco` / `codemirror`).
* **Three-in-One Reader:** Seamlessly inspect syntax-highlighted source code, rendered Markdown, and Git diffs in a calm.

---

## Features

### 1. Crisp Source Code Reading
* Powered by **Shiki** (TextMate grammars with the JS regex engine) running inside a dedicated **Web Worker**—off-main-thread highlighting with on-demand grammar loading.
* Virtualized line-by-line rendering via **`@tanstack/react-virtual`** with a sticky tabular line-number gutter for smooth scrolling on large files.
* Automatic binary detection (`content_inspector`, 8 KB sniff) and a `5 MB` safety cap handled in Rust.

### 2. Clean Markdown Preview
* Powered by `unified` + `remark-parse` + `remark-gfm` + `remark-math` + `remark-rehype` + `rehype-katex` + `@shikijs/rehype` + `rehype-stringify`.
* Renders `README.md` and documentation with refined typography, GFM tables, task lists, **KaTeX math** (inline & display equations), word count / reading-time metadata, and fenced code blocks synced to the active Shiki theme.
* One-click toggle between **Preview** and **Raw** source (reusing the virtualized code viewer), with live file-watching reload when edited externally.

### 3. Precision Git Diff Review
* Built on **`@pierre/diffs`** hydrated directly from Rust-computed **`git2`** + **`similar`** (line & word-level inline) diff hunks—zero diff computation in JavaScript.
* Instant toggle between **Split** (side-by-side) and **Unified** layouts, with `+additions` / `-deletions` stats and expandable unchanged context.
* Permanent dual-tab sidebar (**Files** lazy-loaded tree + **Changes** Git status list) plus a quick **File / Diff** switcher in the header for modified files.

---

## Themes & Typography

* **5 Curated Color Themes** synced across the UI chrome, Shiki code viewer, Markdown code blocks, and `@pierre/diffs`:
  * **Dark:** `Linear Dark` (default), `Gruvbox Dark`, `Everforest Dark`
  * **Light:** `Linear Light`, `Vitesse Light`
* **Instant Light / Dark Toggle:** Switch appearance from the header bar with persistent preference and flash-free startup.
* **System Font & Font Size Picker:** Enumerates fonts installed on your machine natively via Rust's `fontdb` (with search and monospace prioritization) and lets you adjust code font size from `11px` to `22px` (default `14px`).

---

## Development & Build

### Prerequisites
* **Rust** (`>= 1.77`)
* **Node.js** (`>= 20`)
* **pnpm**
* Platform prerequisites for [Tauri v2](https://v2.tauri.app/start/prerequisites/)

### Run in Development
```bash
git clone https://github.com/your-username/pore.git
cd pore
pnpm install
pnpm tauri dev
```

### Production Build & Verification
```bash
# Build frontend bundle (TypeScript check + Vite)
pnpm build

# Run Rust unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Build native desktop app bundle (.app / .dmg / etc.)
pnpm tauri build
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Cmd/Ctrl + P` | Open fuzzy file finder (respects `.gitignore`) |
| `Cmd/Ctrl + O` | Open folder dialog |
| `Cmd/Ctrl + +` / `Cmd/Ctrl + -` | Increase / decrease code font size |
| `Cmd/Ctrl + 0` | Reset code font size to `14px` |
| `↑` / `↓` · `Enter` · `Esc` | Navigate, open, or dismiss Quick Open |

---

## Architecture

Pore delegates filesystem, Git, and system font operations to Rust while keeping the React UI thin and declarative:

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
│  ├── ignore                ──► .gitignore-aware dir/file walker│
│  ├── git2                  ──► Repo status, worktree & HEAD    │
│  ├── similar               ──► Line & word-level inline diffs  │
│  ├── content_inspector     ──► 8 KB binary sniff & 5 MB guard  │
│  ├── fontdb                ──► Installed system font discovery │
│  └── notify-debouncer-mini ──► Debounced live file watcher     │
└────────────────────────────────────────────────────────────────┘
```

---

## Non-Goals

To keep Pore fast and focused, the following are intentionally **out of scope**:
* Full IDE editing, refactoring, or debugging capabilities
* Heavy editor runtimes (`monaco-editor`, `codemirror`, `ace`) or LSP daemons
* Plugin marketplaces or extension runtimes
* Any form of AI generation, summarization, or chat assistants

---

## License

MIT
