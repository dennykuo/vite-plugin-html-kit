# Vite Plugin HTML Kit - 開發指南

本文件為 AI Agent 和開發者提供專案開發的注意事項、流程和最佳實踐。

## 📋 目錄

- [專案概述](#專案概述)
- [專案架構](#專案架構)
- [核心功能](#核心功能)
- [開發流程](#開發流程)
- [重要注意事項](#重要注意事項)
- [測試方法](#測試方法)
- [Playground 開發](#playground-開發)
- [Git 工作流程](#git-工作流程)
- [常見問題](#常見問題)
- [變數與預設值處理](#變數與預設值處理)

---

## 專案概述

**Vite Plugin HTML Kit** 是一個 Vite 插件，將 Laravel Blade 風格的模板語法引入 HTML，提供：

- 佈局繼承系統 (`@extends`, `@section`, `@yield`)
- 組件槽位 (`@slot`, `@endslot`)
- 條件判斷 (`@if`, `@unless`, `@isset`, `@empty`)
- 迴圈處理 (`@foreach`, `@forelse`)
- 資源管理 (`@stack`, `@push`, `@prepend`)
- Include 功能 (`@include`, `@includeIf`, `@includeWhen`)
- 其他輔助功能 (`@json`, `@once`, `@verbatim`)

---

## 專案架構

```
vite-plugin-html-kit/
├── src/
│   ├── index.js              # 主插件邏輯
│   ├── error-handler.js      # 錯誤處理系統
│   └── ...
├── tests/                    # 測試文件
│   ├── *.test.js
│   └── ...
├── playground/               # 示範和測試環境
│   ├── index.html           # 主頁
│   ├── blade-features.html  # Blade 功能示範頁
│   ├── partials/            # Partial 組件
│   │   ├── layouts/         # 佈局文件
│   │   └── *.html
│   ├── vite.config.js       # Playground 配置
│   └── package.json
├── BLADE_FEATURES_TODO.md   # 功能開發追蹤
└── AGENTS.md               # 本文件
```

### 核心處理流程

插件在 `transformIndexHtml` hook 中按以下順序處理 HTML：

1. **處理 @verbatim 區塊** - 保護前端框架語法不被處理
2. **處理 Blade 指令** - 轉換所有 @ 開頭的指令
3. **解析 Include** - 遞迴處理所有 include 和 slot
4. **編譯 Lodash Template** - 執行變數插值和 JavaScript 代碼
5. **恢復 @verbatim 內容** - 將保護的內容恢復原樣

#### ⚡ Hook 執行順序 (order: 'pre')

`transformIndexHtml` 設置為 `order: 'pre'`，確保在 Vite 處理資源之前執行模板轉換。

**為什麼需要 'pre' 順序：**

```javascript
transformIndexHtml: {
  order: 'pre',  // 在 Vite 處理資源之前執行
  handler(html, ctx) {
    // 模板轉換邏輯
  }
}
```

**好處：**
- ✅ 模板插入的 `<script>`、`<link>` 等資源標籤會被 Vite 正確識別
- ✅ Vite 可以對動態插入的資源進行打包和優化
- ✅ HMR (熱模組替換) 能正確追蹤資源依賴

**範例：**
```html
<!-- partials/header.html -->
<head>
  <link rel="stylesheet" href="/styles/header.css">
  <script type="module" src="/scripts/header.js"></script>
</head>

<!-- index.html -->
<include src="header.html" />
```

在 `order: 'pre'` 模式下，Vite 會看到完整的 HTML（包含動態插入的 CSS/JS），並正確處理這些資源的打包和版本控制。

---

## 配置選項

### partialsDir 配置

`partialsDir` 選項指定存放 HTML partial 檔案的目錄，**支援相對路徑和絕對路徑**。

#### 📌 相對路徑（預設）

相對路徑會相對於 `vite.config.js` 中的 `root` 設定解析（預設為專案根目錄）。

```js
// vite.config.js
export default defineConfig({
  plugins: [
    vitePluginHtmlKit({
      partialsDir: 'partials'  // → 專案根目錄/partials
    })
  ]
});
```

**與自訂 root 配合使用：**

```js
// vite.config.js
export default defineConfig({
  root: 'src',  // 設定 root 為 src 目錄
  plugins: [
    vitePluginHtmlKit({
      partialsDir: 'partials'  // → src/partials
    })
  ]
});
```

#### 📌 絕對路徑

使用絕對路徑可以指定任意位置的目錄，不受 `root` 配置影響。

```js
// vite.config.js
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    vitePluginHtmlKit({
      partialsDir: path.resolve(__dirname, 'src/templates/partials')
    })
  ]
});
```

**實作原理：**

```javascript
// 內部實作邏輯
const absolutePartialsDir = path.isAbsolute(partialsDir)
  ? partialsDir
  : path.resolve(rootPath, partialsDir);
```

#### 📋 使用場景比較

| 使用場景 | 推薦方式 | 範例 |
|---------|---------|------|
| 標準專案結構 | 相對路徑 | `partialsDir: 'partials'` |
| 自訂 root 目錄 | 相對路徑 | `root: 'src'`, `partialsDir: 'partials'` |
| Monorepo 共享模板 | 絕對路徑 | `path.resolve(__dirname, '../shared/templates')` |
| 複雜目錄結構 | 絕對路徑 | `path.join(__dirname, 'src/views/partials')` |

#### ⚠️ 注意事項

1. **路徑安全性**：無論使用相對或絕對路徑，插件都會進行路徑遍歷攻擊防護
2. **路徑分隔符**：在 Windows 系統上使用 `path.resolve()` 或 `path.join()` 確保跨平台相容
3. **設定優先級**：絕對路徑會完全忽略 `root` 配置，請謹慎使用

---

## 核心功能

### 已實現功能（v1.2）

| 功能 | 語法 | 說明 |
|------|------|------|
| 佈局繼承 | `@extends`, `@section`, `@yield` | Laravel 風格的模板繼承 |
| Section 簡寫 | `@section('name', 'value')` | 單行 section 語法 |
| Blade Include | `@include('file.html', {})` | 與 `<include>` 標籤共存 |
| 條件判斷 | `@if`, `@else`, `@elseif`, `@endif` | 基本條件控制 |
| 否定條件 | `@unless`, `@endunless` | 等同於 `@if(!condition)` |
| 迴圈 | `@foreach`, `@endforeach` | 帶 $loop 變數 |
| 空資料處理 | `@forelse`, `@empty`, `@endforelse` | 迴圈 + 空值檢查 |
| Switch | `@switch`, `@case`, `@default` | 多分支判斷 |
| 組件槽位 | `@slot`, `@endslot` | 內容傳遞給組件 |
| 變數檢查 | `@isset`, `@empty` | 檢查變數存在或為空 |
| 防止重複 | `@once`, `@endonce` | 確保代碼只執行一次 |
| JSON 輸出 | `@json(data)`, `@json(data, true)` | 格式化 JSON |
| 跳過解析 | `@verbatim`, `@endverbatim` | 保護 Vue/Alpine 語法 |
| 資源管理 | `@stack`, `@push`, `@prepend` | CSS/JS 資源注入 |
| 條件 Include | `@includeIf`, `@includeWhen`, `@includeUnless`, `@includeFirst` | 條件式檔案引入 |

---

## 開發流程

### 新增 Blade 功能

1. **規劃設計**
   - 在 `BLADE_FEATURES_TODO.md` 中記錄功能需求
   - 設計 REGEX 模式和轉換邏輯
   - 確定優先級和預期工作量

2. **實現功能**
   ```bash
   # 在 src/index.js 中：
   # 1. 定義 REGEX 常數（約 line 500+）
   # 2. 實現轉換邏輯（約 line 1000+）
   # 3. 處理特殊情況（如 slot、include）
   ```

3. **編寫測試**
   ```bash
   # 在 tests/ 目錄創建測試文件
   npm test -- <test-file-name>
   ```

4. **更新文檔**
   - 更新 `BLADE_FEATURES_TODO.md`
   - 在 `playground/blade-features.html` 添加示範
   - 更新 `README.md`（如需要）

5. **提交代碼**
   ```bash
   git add .
   git commit -m "feat: 實現 @directive 功能"
   git push
   ```

### 開發檢查清單

- [ ] REGEX 模式正確匹配目標語法
- [ ] 處理巢狀結構（如 `@if` 內有 `@foreach`）
- [ ] 錯誤處理和降級策略
- [ ] 編寫至少 3-5 個測試案例
- [ ] Playground 中有實際示範
- [ ] 文檔更新完整

---

## 重要注意事項

### ⚠️ 轉義處理 - 非常重要！

**問題：** Playground 中的示範代碼會被當作真正的 Blade 指令執行。

**解決方案：** 使用 HTML 實體 `&#64;` 來顯示 `@` 符號。

#### 轉義規則

| 使用場景 | 寫法 | 說明 |
|----------|------|------|
| **示範文字**（註釋、標題、說明） | `&#64;section` | 轉義，僅顯示不執行 |
| **程式碼範例**（`<code>`, `<pre>` 中） | `&#64;section` | 轉義，僅顯示不執行 |
| **真正執行的代碼** | `@section` | **不轉義**，需要執行 |

#### 示例

```html
<!-- ✅ 正確：說明文字需轉義 -->
<h2>&#64;section 簡寫語法</h2>
<p>使用 &#64;section('title', 'value') 可以...</p>

<!-- ✅ 正確：程式碼示範需轉義 -->
<pre><code>&#64;section('title', '頁面標題')
&#64;section('class', 'container')
&#64;endsection</code></pre>

<!-- ✅ 正確：真正執行的代碼不轉義 -->
<div class="demo">
  @section('title', '示範標題')
  @foreach(items as item)
    <p>{{ item }}</p>
  @endforeach
</div>
```

#### 需要轉義的位置

在以下位置中的 `@` 符號**必須**轉義為 `&#64;`：

- HTML 註釋：`<!-- 1. &#64;section 簡寫語法 -->`
- 標題標籤：`<h1>`, `<h2>`, `<h3>` 等
- 段落標籤：`<p>`, `<span>`, `<div>` 的文字內容
- 程式碼區塊：`<code>`, `<pre>` 中的示範代碼
- 列表項目：`<li>` 中的說明文字

#### 檢查方法

```bash
# 搜尋可能需要轉義的位置
grep -n "@[a-z]" playground/*.html | grep -v "&#64;"

# 排除真正執行的代碼行
grep -n "@[a-z]" playground/*.html | grep -E "(<!-- |<h[0-9]|<p |<li )" | grep -v "&#64;"
```

### 🔧 插件當前限制

**`@@` 轉義功能尚未實現**
- Laravel Blade 中 `@@section` 會顯示為 `@section`
- 本插件目前不支援此功能
- 使用 `&#64;` HTML 實體替代

**模板編譯警告**
- 啟動開發伺服器時可能出現 "Lodash 模板編譯失敗" 警告
- 這是暫時性警告，不影響實際功能
- 頁面會正確載入和運作
- 可以忽略此警告

---

## 測試方法

### 單元測試

```bash
# 執行所有測試
npm test

# 執行特定測試文件
npm test -- conditional-include.test.js

# 監聽模式
npm test -- --watch
```

### Playground 測試

```bash
# 啟動開發伺服器
npm run dev --prefix playground

# 瀏覽器訪問
# http://localhost:5173/          - 主頁
# http://localhost:5173/blade-features.html - 功能示範頁
```

### 手動測試檢查清單

- [ ] 所有 Blade 指令正確執行
- [ ] 巢狀結構正常工作
- [ ] 錯誤訊息清晰有用
- [ ] 熱更新（HMR）正常
- [ ] 瀏覽器 Console 無錯誤
- [ ] HTML 實體 `&#64;` 正確顯示為 `@`

---

## Playground 開發

### 檔案結構

```
playground/
├── index.html              # 主頁（功能總覽）
├── blade-features.html     # Blade 功能詳細示範
├── layout-demo.html        # 佈局繼承示範
├── partials/
│   ├── layouts/
│   │   ├── base.html      # 基礎佈局
│   │   ├── app.html       # 應用佈局
│   │   └── blog.html      # 部落格佈局
│   ├── card.html          # 卡片組件（使用 slot）
│   ├── if.html            # 條件示範
│   ├── loop.html          # 迴圈示範
│   └── switch.html        # Switch 示範
└── vite.config.js         # 配置全域變數
```

### 添加新示範

1. **在 blade-features.html 添加區塊**

```html
<!-- N. &#64;directive 功能名稱 -->
<section class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
  <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
    <h2 class="text-lg font-semibold text-gray-800 flex items-center gap-2">
      <span class="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-xs font-bold">N</span>
      &#64;directive 功能名稱
    </h2>
  </div>
  <div class="p-6">
    <p class="text-sm text-gray-600 mb-4">
      功能說明（記得轉義 &#64; 符號）
    </p>
    <div class="bg-blue-50 rounded-lg p-4 border border-blue-100">
      <!-- 真正執行的示範代碼（不轉義） -->
      @directive
        <p>示範內容</p>
      @enddirective
    </div>

    <!-- 程式碼範例（需轉義） -->
    <pre class="text-xs font-mono text-gray-700 mt-4"><code>&#64;directive
  &lt;p&gt;示範內容&lt;/p&gt;
&#64;enddirective</code></pre>
  </div>
</section>
```

2. **更新 index.html 功能列表**

```html
<li class="flex items-center gap-2">
  <span class="text-pink-500">✓</span> &#64;directive 功能簡述
</li>
```

### Playground 全域變數

在 `playground/vite.config.js` 中配置：

```javascript
htmlKit({
  globalData: {
    siteTitle: 'Vite Plugin HTML Kit',
    author: 'DennyKuo',
    version: '1.2.0',
    // 添加更多全域變數
  }
})
```

---

## Git 工作流程

### 分支命名規則

```bash
# 本專案使用特定格式
claude/fix-<issue-description>-<session-id>

# 範例
claude/fix-missing-layout-file-JXjOE
```

### Commit 訊息規範

```bash
# 功能新增
git commit -m "feat: 實現 @directive 功能"

# Bug 修復
git commit -m "fix: 修復 @directive 巢狀問題"

# 文檔更新
git commit -m "docs: 更新 @directive 使用說明"

# 測試
git commit -m "test: 添加 @directive 測試案例"

# 重構
git commit -m "refactor: 優化 @directive 處理邏輯"
```

### 推送到遠端

```bash
# 推送時使用 -u 標記
git push -u origin <branch-name>

# 分支名稱必須以 'claude/' 開頭並包含 session id
# 否則會因 403 錯誤失敗
```

### 網路失敗重試

如果 git 操作因網路問題失敗，最多重試 4 次，使用指數退避：
- 第 1 次失敗：等待 2 秒
- 第 2 次失敗：等待 4 秒
- 第 3 次失敗：等待 8 秒
- 第 4 次失敗：等待 16 秒

---

## 常見問題

### Q1: 為什麼 playground 啟動時顯示 "模板編譯錯誤"？

**A:** 這是已知的暫時性警告，不影響實際功能。頁面會正確載入。可以忽略。

**驗證方法：**
```bash
# 啟動後用 curl 測試
curl -s http://localhost:5173/ | head -50

# 如果返回正常 HTML，表示功能正常
```

### Q2: Playground 中的 @ 符號被當作指令執行了怎麼辦？

**A:** 使用 `&#64;` HTML 實體替代 `@`。參考「轉義處理」章節。

```html
<!-- ❌ 錯誤 -->
<p>使用 @section 指令...</p>

<!-- ✅ 正確 -->
<p>使用 &#64;section 指令...</p>
```

### Q3: 如何處理變數可能未定義的情況？

**A:** 使用 JavaScript 的 `||` 運算符提供預設值。

```html
<!-- Layout 中 -->
<title>{{ title || '預設標題' }} - {{ site || '網站名稱' }}</title>

<!-- 或使用 @isset -->
<title>@isset(title){{ title }}@else預設標題@endisset</title>
```

詳見「變數與預設值處理」章節。

### Q4: 測試失敗怎麼辦？

**A:** 檢查以下常見原因：

1. **檔案路徑錯誤** - 確認 `partialsDir` 設定正確
2. **REGEX 不匹配** - 使用 regex101.com 測試模式
3. **轉義問題** - 檢查引號、特殊字元
4. **快取問題** - 刪除 `node_modules/.vite` 重試

### Q5: 如何調試 Blade 指令轉換？

**A:** 在轉換函數中添加 console.log：

```javascript
processed = processed.replace(REGEX.DIRECTIVE, (match, ...args) => {
  console.log('Match:', match);
  console.log('Args:', args);
  // ... 轉換邏輯
});
```

---

## 變數與預設值處理

### 在 Template 中使用預設值

#### 方法 1: || 運算符（推薦）

```html
<title>{{ title || '預設標題' }} - {{ site }}</title>
<div class="container {{ class || '' }}">
  <h1>{{ heading || '歡迎' }}</h1>
</div>
```

**優點：** 簡潔、直觀、符合 JavaScript 習慣

#### 方法 2: @isset 指令

```html
<title>
  @isset(title)
    {{ title }}
  @else
    預設標題
  @endisset
  - {{ site }}
</title>
```

**優點：** 明確的條件判斷、適合複雜邏輯

#### 方法 3: 三元運算符

```html
<title>{{ typeof title !== 'undefined' ? title : '預設標題' }}</title>
```

**優點：** 完整的 JavaScript 支援

### 在全域配置中設定預設值

在 `vite.config.js` 中：

```javascript
import { defineConfig } from 'vite';
import htmlKit from 'vite-plugin-html-kit';

export default defineConfig({
  plugins: [
    htmlKit({
      globalData: {
        site: 'Vite Plugin HTML Kit',
        author: 'DennyKuo',
        version: '1.2.0',
        // 為所有頁面提供預設值
        title: '首頁',
        description: '使用 Vite 和 Blade 風格模板',
      }
    })
  ]
});
```

### 在子頁面中覆蓋預設值

#### 方法 A: 使用 @section

```html
@extends('layouts/app.html')

@section('title', 'TURU AI 契約分析')
@section('description', '智能契約分析系統')

@section('content')
  <!-- 頁面內容 -->
@endsection
```

然後在 layout 中：

```html
<title>@yield('title') - {{ site }}</title>
<meta name="description" content="@yield('description')">
```

#### 方法 B: 使用 JavaScript 賦值

```html
@extends('layouts/app.html')

<%
  title = 'TURU AI 契約分析';
  description = '智能契約分析系統';
%>

@section('content')
  <!-- 頁面內容 -->
@endsection
```

### Layout 中的最佳實踐

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- 使用 || 提供預設值 -->
  <title>{{ title || '首頁' }} - {{ site || 'My Site' }}</title>
  <meta name="description" content="{{ description || '歡迎來到我的網站' }}">

  <!-- 條件式引入 CSS -->
  @isset(customCSS)
    <link rel="stylesheet" href="{{ customCSS }}">
  @endisset
</head>

<body class="{{ bodyClass || 'default-layout' }}">
  <!-- 主內容 -->
  <main class="{{ mainClass || 'container' }}">
    @yield('content')
  </main>

  <!-- 條件式引入腳本 -->
  @isset(customJS)
    <script src="{{ customJS }}"></script>
  @endisset
</body>
</html>
```

### 範例：完整的頁面設定

**layouts/app.html:**
```html
<!DOCTYPE html>
<html lang="{{ lang || 'zh-TW' }}">
<head>
  <meta charset="UTF-8" />
  <title>{{ title || '首頁' }} - {{ site || 'TURU AI' }}</title>
  <meta name="description" content="{{ description || '智能契約分析系統' }}">

  @stack('styles')
</head>
<body class="{{ bodyClass || 'font-sans antialiased' }}">
  <main class="{{ mainClass || 'container mx-auto' }}">
    @yield('content')
  </main>

  @stack('scripts')
</body>
</html>
```

**index.html:**
```html
@extends('layouts/app.html')

<%
  // 設定頁面專屬變數
  title = 'TURU AI 契約分析';
  description = '使用 AI 技術分析政府採購契約';
  bodyClass = 'h-full overflow-hidden flex';
  mainClass = 'flex-1 bg-white';
%>

@section('content')
<div class="welcome-screen">
  <h1>{{ title }}</h1>
  <p>{{ description }}</p>
</div>
@endsection

@push('scripts')
  <script src="/js/contract-analyzer.js"></script>
@endpush
```

---

## 組件槽位 (Slots) 使用指南

### 什麼是 Slot？

Slot（槽位）是一種將內容傳遞給組件的機制，類似於 Vue.js 的插槽系統。它允許你創建可重用的組件，並在使用時傳入自訂內容。

### 基本概念

| 角色 | 職責 | 語法 |
|------|------|------|
| **父組件** | 定義 slot 接收位置和預設值 | `@slot('name', 'default')` |
| **子頁面** | 傳遞內容到 slot | `@slot('name')...@endslot` |

### 完整示例

#### 1. 創建組件（父組件）

`partials/card.html`：

```html
<div class="card">
  <!-- 定義標題 slot，預設值為 "預設標題" -->
  <div class="card-header">
    <h3>@slot('title', '預設標題')</h3>
  </div>

  <!-- 定義內容 slot，沒有預設值 -->
  <div class="card-body">
    @slot('content')
  </div>

  <!-- 定義頁尾 slot，帶 HTML 預設值 -->
  <div class="card-footer">
    @slot('footer', '<p>預設頁尾</p>')
  </div>
</div>
```

#### 2. 使用組件（子頁面）

**重要：** Slot 只支援 `<include>` 標籤，**不支援** `@include` 指令！

**✅ 正確用法：使用 `<include>` 標籤**

```html
<include src="card.html">
  @slot('title')
    🎉 特別活動
  @endslot

  @slot('content')
    <p>這是自訂內容</p>
    <ul>
      <li>項目 1</li>
      <li>項目 2</li>
    </ul>
  @endslot

  @slot('footer')
    <button>查看詳情</button>
  @endslot
</include>
```

**❌ 錯誤用法：`@include` 不支援 slot**

```html
<!-- 這樣不行！@include 會轉換成自閉合標籤 -->
@include('card.html')
  @slot('title')...@endslot
@endinclude
```

**@include 適合簡單引入（無 slot）：**

```html
<!-- ✅ @include 用於不需要 slot 的簡單引入 -->
@include('header.html', { title: 'Home', active: 'home' })
```

#### 3. 部分自訂（使用預設值）

你可以只自訂部分 slot，其他使用預設值：

```html
<include src="card.html">
  @slot('title')
    📝 重要通知
  @endslot

  @slot('content')
    <p>只自訂標題和內容</p>
  @endslot

  <!-- footer 沒定義，會使用預設值 "<p>預設頁尾</p>" -->
</include>
```

#### 4. 完全使用預設值

如果完全不傳遞 slot，會使用所有預設值：

```html
<!-- 使用所有預設值 -->
<include src="card.html" />
```

### 實際應用場景

#### 場景 1：產品卡片

```html
<!-- 組件：partials/product-card.html -->
<div class="product-card">
  <div class="product-image">
    @slot('image', '<img src="/placeholder.jpg" />')
  </div>
  <h3 class="product-name">
    @slot('name', '未命名產品')
  </h3>
  <p class="product-price">
    @slot('price', '$0.00')
  </p>
  <div class="product-actions">
    @slot('actions', '<button>查看詳情</button>')
  </div>
</div>

<!-- 使用 -->
<include src="product-card.html">
  @slot('image')
    <img src="/products/laptop.jpg" alt="筆記型電腦" />
  @endslot

  @slot('name')
    高效能筆記型電腦
  @endslot

  @slot('price')
    $1,299.00
  @endslot

  @slot('actions')
    <button class="btn-primary">加入購物車</button>
    <button class="btn-secondary">收藏</button>
  @endslot
</include>
```

#### 場景 2：警告訊息組件

```html
<!-- 組件：partials/alert.html -->
<div class="alert alert-{{ type || 'info' }}">
  <div class="alert-icon">
    @slot('icon', '📢')
  </div>
  <div class="alert-message">
    @slot('message')
  </div>
</div>

<!-- 使用 -->
<include src="alert.html" type="warning">
  @slot('icon')
    ⚠️
  @endslot

  @slot('message')
    <strong>注意：</strong>系統將於今晚 10 點進行維護。
  @endslot
</include>
```

### 重要注意事項

#### ⚠️ 在迴圈中使用 Slot

當在迴圈中使用組件時，**建議使用屬性傳遞數據**，而不是 slot：

```html
<!-- ❌ 不推薦：在迴圈中使用 slot 可能有作用域問題 -->
@foreach(products as product)
  <include src="card.html">
    @slot('title')
      {{ product.name }}
    @endslot
  </include>
@endforeach

<!-- ✅ 推薦：使用屬性傳遞數據 -->
@foreach(products as product)
  <include src="card.html"
           title="{{ product.name }}"
           price="{{ product.price }}" />
@endforeach
```

#### 💡 Slot vs 屬性

| 使用時機 | 方法 | 範例 |
|----------|------|------|
| **簡單文字/變數** | 使用屬性 | `<include title="{{ name }}" />` |
| **複雜 HTML 結構** | 使用 slot | `@slot('content')<ul>...</ul>@endslot` |
| **在迴圈中** | 使用屬性 | `<include title="{{ item.name }}" />` |
| **靜態內容** | 使用 slot | `@slot('header')<h1>標題</h1>@endslot` |

### 快速參考

```html
<!-- 父組件定義 -->
@slot('name', 'default value')

<!-- 子頁面傳遞（只支援 <include> 標籤） -->
<include src="card.html">
  @slot('name')
    content here
  @endslot
</include>

<!-- @include vs <include> -->
<include src="...">...</include>  ✅ 支援 slot
@include('...')                    ❌ 不支援 slot（會變成自閉合標籤）
```

### 實際範例專案

查看完整的 slot 示範：
- 📄 `playground/slot-demo.html` - 完整的 slot 使用示範
- 📦 `playground/partials/simple-card.html` - 簡單的卡片組件範例

**執行示範：**
```bash
npm run dev --prefix playground
# 訪問 http://localhost:5173/slot-demo.html
```

---

## 錯誤處理

### 錯誤代碼系統

插件使用統一的錯誤代碼系統（定義於 `src/error-handler.js`）：

| 代碼 | 類型 | 說明 |
|------|------|------|
| E1xxx | 配置錯誤 | 插件配置問題 |
| E2xxx | 檔案系統錯誤 | 檔案讀取、路徑問題 |
| E3xxx | Include 錯誤 | Include 檔案不存在、路徑錯誤 |
| E4xxx | 解析錯誤 | Blade 語法解析問題 |
| E5xxx | 編譯錯誤 | Lodash 模板編譯問題 |

### 降級策略

當發生錯誤時，插件會：

1. **記錄錯誤** - 使用 `createAndLogError` 記錄詳細資訊
2. **返回 HTML 註釋** - 在開發環境顯示錯誤訊息
3. **繼續執行** - 盡可能不中斷整體處理流程

### 調試技巧

```javascript
// 在 src/index.js 中添加調試輸出
console.log('[DEBUG] Processing:', filename);
console.log('[DEBUG] REGEX match:', match);
console.log('[DEBUG] Transformed:', result);
```

---

## 性能優化

### REGEX 優化建議

- 使用非捕獲組 `(?:...)` 減少記憶體使用
- 避免過度貪婪匹配 `[\s\S]*?`
- 對常用模式添加快速失敗檢查

### Include 深度限制

當前無限制，建議添加深度檢查避免無限遞迴：

```javascript
const MAX_INCLUDE_DEPTH = 10;

function resolveIncludes(html, data, currentFile, depth = 0) {
  if (depth > MAX_INCLUDE_DEPTH) {
    throw new Error('Include depth exceeded');
  }
  // ... 處理邏輯
}
```

---

## 開發資源

### 相關文檔

- [Laravel Blade 文檔](https://laravel.com/docs/blade)
- [Vite Plugin API](https://vitejs.dev/guide/api-plugin.html)
- [Lodash Template](https://lodash.com/docs/#template)

### 推薦工具

- **Regex 測試**: [regex101.com](https://regex101.com/)
- **HTML 格式化**: [prettier.io](https://prettier.io/)
- **AST 查看器**: [astexplorer.net](https://astexplorer.net/)

### 專案文件

- `README.md` - 使用說明
- `BLADE_FEATURES_TODO.md` - 功能追蹤
- `src/index.js` - 核心實現（詳細註釋）
- `src/error-handler.js` - 錯誤處理
- `tests/` - 測試範例

---

## 總結

### 開發黃金法則

1. **先讀後寫** - 永遠先用 Read 工具讀取檔案
2. **轉義優先** - Playground 中的示範文字必須轉義
3. **測試驅動** - 先寫測試再寫功能
4. **文檔同步** - 功能和文檔同步更新
5. **錯誤優雅** - 提供清晰的錯誤訊息和降級策略

### 快速參考

```bash
# 開發流程
1. 規劃功能 → BLADE_FEATURES_TODO.md
2. 實現邏輯 → src/index.js
3. 編寫測試 → tests/*.test.js
4. 添加示範 → playground/blade-features.html
5. 更新文檔 → README.md, AGENTS.md

# 測試流程
npm test                        # 單元測試
npm run dev --prefix playground # Playground 測試

# Git 流程
git add .
git commit -m "feat: ..."
git push -u origin claude/fix-xxx-xxxxx
```

---

**文件版本:** 1.0
**最後更新:** 2026-01-18
**維護者:** DennyKuo
