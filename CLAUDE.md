# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**vite-plugin-html-kit** 是一個 Vite 插件，將 Laravel Blade 風格的模板語法引入 HTML。支援 partials、layouts、slots、條件判斷、迴圈、資源管理等功能。

- 語言：JavaScript (ESM)，無 TypeScript 編譯步驟
- 相容 Vite 3-7
- 執行時依賴：lodash（模板引擎）、lru-cache（快取）

## Commands

```bash
# 測試
npm test                          # 執行所有測試 (vitest run)
npm test -- forelse.test.js       # 執行單一測試檔案
npm run test:watch                # 監視模式
npm run test:coverage             # 覆蓋率報告

# Playground 開發伺服器
npm run play                      # 啟動 playground (localhost:5173)
npm run build-play                # 建置 playground

# 版本發布
npm run release                   # standard-version
npm run release:patch             # patch release
npm run release:dry               # dry run
```

## Architecture

### 核心檔案

- `src/index.js` — 主插件邏輯（~2800 行），包含所有 Blade 指令的正則表達式定義與轉換邏輯
- `src/error-handler.js` — 統一錯誤處理系統，錯誤碼 E1xxx-E5xxx
- `src/index.d.ts` — TypeScript 類型定義

### 插件處理流程

插件透過 `transformIndexHtml` hook（`order: 'pre'`）處理 HTML，順序為：

1. 保護 `@verbatim` 區塊（替換為佔位符）
2. 處理佈局繼承（`@extends` / `@section` / `@yield`）
3. 遞迴解析 Include 和 Slot（`@include` / `<include>` / `@slot`）
4. 轉換 Blade 邏輯標籤為 Lodash Template 語法（`@if` → `<% if(...) { %>`）
5. 編譯 Lodash Template（變數插值 `{{ var }}`）
6. 恢復 `@verbatim` 內容

設為 `order: 'pre'` 是為了讓動態插入的 `<script>` / `<link>` 資源標籤能被 Vite 正確識別和處理。

### 效能機制

- **LRU Cache**：快取轉換結果（max=100, ttl=5 分鐘），快取命中時速度提升 ~50x
- **正則預編譯**：所有 REGEX 在模組載入時預編譯，定義在 `src/index.js` 上半部

### 安全機制

- 路徑遍歷防護：阻止 `../` 和絕對路徑存取 partialsDir 以外的檔案
- 循環引用偵測：防止 include 無限遞迴

## Key Conventions

### Blade 指令開發

新增 Blade 功能的步驟：
1. 在 `src/index.js` 的 REGEX 物件中定義正則表達式
2. 在 `transformLogicTags()` 或對應函式中實作轉換邏輯
3. 在 `tests/` 建立測試檔案
4. 在 `playground/blade-features.html` 新增示範

### Playground 轉義規則

Playground 中的 HTML 會被插件處理，因此示範文字中的 `@` 符號必須轉義為 `&#64;`，只有需要實際執行的 Blade 指令才使用原始 `@`。

### Slot 限制

Slot 只支援 `<include>` 標籤語法，不支援 `@include` 指令。`@include` 適合不需要 slot 的簡單引入。

### Commit 訊息格式

使用 conventional commits：`feat:` / `fix:` / `docs:` / `test:` / `refactor:`

### Git 分支

推送到遠端時分支名稱需以 `claude/` 開頭並包含 session ID，例如 `claude/fix-<描述>-<id>`。

### 文件格式

- 2 空格縮進（JS/HTML/TS）、4 空格縮進（CSS）
- LF 換行、UTF-8
- 無 ESLint / Prettier 配置
