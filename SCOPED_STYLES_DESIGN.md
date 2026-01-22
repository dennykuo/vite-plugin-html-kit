# 作用域樣式（Scoped Styles）設計文檔

## 1. 功能概述

實現類似 Vue.js 的 `<style scoped>` 功能，為組件提供樣式隔離。

### 1.1 目標
- 支援 `<style scoped>` 語法
- 自動為 CSS 選擇器添加屬性選擇器（如 `[data-v-xxxxx]`）
- 自動為 HTML 元素添加對應的 data 屬性
- 防止樣式洩漏到組件外部

### 1.2 使用場景
```html
<!-- partials/card.html -->
<div class="card">
  <h2>{{ title }}</h2>
  <div class="content">
    @slot('content')
  </div>
</div>

<style scoped>
  .card {
    border: 1px solid #ccc;
    padding: 1rem;
  }
  .content {
    margin-top: 0.5rem;
  }
</style>
```

**轉換後：**
```html
<div class="card" data-v-abc123>
  <h2 data-v-abc123>{{ title }}</h2>
  <div class="content" data-v-abc123>
    @slot('content')
  </div>
</div>

<style>
  .card[data-v-abc123] {
    border: 1px solid #ccc;
    padding: 1rem;
  }
  .content[data-v-abc123] {
    margin-top: 0.5rem;
  }
</style>
```

## 2. 實現策略

### 2.1 處理流程插入點

在現有的處理流程中插入作用域樣式處理：

```
transformIndexHtml:
  ├─ 步驟 0.5: 保護 @verbatim 區塊
  ├─ 步驟 1: processExtends（處理佈局繼承）
  ├─ 步驟 2: transformLogicTags（轉換 Blade 邏輯）
  ├─ 步驟 3: resolveIncludes（解析 Include）
  │   └─ [新增] 在這裡處理 scoped styles
  ├─ 步驟 4: compileTemplate（編譯 Lodash Template）
  └─ 步驟 5: 恢復 @verbatim 區塊
```

**為什麼在 resolveIncludes 內部處理？**
- Scoped styles 主要用於組件（partials），而不是頁面級別
- 在 include 解析時，我們知道當前處理的是哪個 partial
- 可以為每個 partial 生成獨立的 scopeId
- 避免跨組件的樣式衝突

### 2.2 核心實現步驟

#### 步驟 1: 檢測並提取 `<style scoped>`
```javascript
const SCOPED_STYLE_REGEX = /<style\s+scoped\s*>([\s\S]*?)<\/style>/gi;

function extractScopedStyles(html) {
  const styles = [];
  let match;

  while ((match = SCOPED_STYLE_REGEX.exec(html)) !== null) {
    styles.push(match[1]);
  }

  // 移除 scoped style 標籤
  const htmlWithoutStyles = html.replace(SCOPED_STYLE_REGEX, '');

  return { styles, htmlWithoutStyles };
}
```

#### 步驟 2: 生成唯一的 ScopeId
```javascript
function generateScopeId(filePath, content) {
  // 使用文件路徑 + 內容生成唯一 hash
  const hash = crypto
    .createHash('md5')
    .update(filePath + content)
    .digest('hex')
    .substring(0, 8);

  return `v-${hash}`;
}
```

#### 步驟 3: 轉換 CSS 選擇器
```javascript
function transformScopedCSS(css, scopeId) {
  // 簡單版本：為每個選擇器添加屬性選擇器
  // 匹配 CSS 規則：selector { ... }
  const ruleRegex = /([^{]+)\{([^}]*)\}/g;

  return css.replace(ruleRegex, (match, selector, body) => {
    // 處理選擇器
    const transformedSelector = transformSelector(selector.trim(), scopeId);
    return `${transformedSelector}{${body}}`;
  });
}

function transformSelector(selector, scopeId) {
  // 處理多個選擇器（逗號分隔）
  const selectors = selector.split(',').map(s => s.trim());

  return selectors.map(sel => {
    // 添加屬性選擇器
    // .class -> .class[data-v-xxx]
    // #id -> #id[data-v-xxx]
    // div -> div[data-v-xxx]
    return `${sel}[data-${scopeId}]`;
  }).join(', ');
}
```

#### 步驟 4: 為 HTML 元素添加 data 屬性
```javascript
function addScopeIdToElements(html, scopeId) {
  // 匹配所有開始標籤：<tag ...>
  // 需要處理：
  // - 普通標籤：<div>, <div class="...">
  // - 自閉合標籤：<img />, <include ... />

  const openTagRegex = /<([a-zA-Z][\w:-]*)((?:\s+[^>]*?)?)(\/?)>/g;

  return html.replace(openTagRegex, (match, tagName, attrs, selfClosing) => {
    // 跳過某些標籤（如 style, script）
    if (['style', 'script'].includes(tagName.toLowerCase())) {
      return match;
    }

    // 檢查是否已經有這個屬性
    if (attrs.includes(`data-${scopeId}`)) {
      return match;
    }

    // 添加屬性
    return `<${tagName}${attrs} data-${scopeId}${selfClosing}>`;
  });
}
```

### 2.3 整合到 resolveIncludes

修改 `resolveIncludes` 函數，在處理每個 include 時檢測並處理 scoped styles：

```javascript
function resolveIncludes(html, data, filename, partialsDir, includeStack = []) {
  // ... 現有代碼 ...

  return html.replace(REGEX.INCLUDE, (match, attrs, content) => {
    // ... 解析屬性，讀取檔案 ...

    let partialContent = fs.readFileSync(partialPath, 'utf-8');

    // [新增] 處理 scoped styles
    const { styles, htmlWithoutStyles } = extractScopedStyles(partialContent);

    if (styles.length > 0) {
      // 生成 scopeId
      const scopeId = generateScopeId(partialPath, styles.join(''));

      // 轉換 CSS
      const transformedStyles = styles.map(css =>
        transformScopedCSS(css, scopeId)
      ).join('\n');

      // 為 HTML 元素添加屬性
      partialContent = addScopeIdToElements(htmlWithoutStyles, scopeId);

      // 將轉換後的樣式重新插入
      partialContent = `${partialContent}\n<style>${transformedStyles}</style>`;
    } else {
      partialContent = htmlWithoutStyles;
    }

    // ... 繼續處理 slots 等 ...
  });
}
```

## 3. 邊界情況處理

### 3.1 多個 scoped style 標籤
如果一個組件有多個 `<style scoped>` 標籤，應該合併處理：
```javascript
if (styles.length > 0) {
  const combinedStyles = styles.join('\n');
  const scopeId = generateScopeId(partialPath, combinedStyles);
  // ...
}
```

### 3.2 嵌套組件
子組件應該有自己的 scopeId，不應該繼承父組件的：
- 每個 include 獨立處理
- 遞迴調用 resolveIncludes 時，每個層級獨立生成 scopeId

### 3.3 Slot 內容
Slot 內容來自父組件，不應該被子組件的 scoped style 影響：
- Slot 內容在父組件中已經被處理過
- 子組件的 scopeId 只添加到子組件自己的元素上

### 3.4 特殊選擇器
需要特別處理的選擇器：
- `:deep()` 或 `>>>` - 穿透選擇器（未來功能）
- `:global()` - 全局選擇器（未來功能）
- 偽類和偽元素：`:hover`, `::before` 等

```javascript
function transformSelector(selector, scopeId) {
  // 處理偽類和偽元素
  // .class:hover -> .class[data-v-xxx]:hover
  // .class::before -> .class[data-v-xxx]::before

  const pseudoMatch = selector.match(/^([^:]+)(::?[^:\s]+)?$/);
  if (pseudoMatch) {
    const [, base, pseudo = ''] = pseudoMatch;
    return `${base}[data-${scopeId}]${pseudo}`;
  }

  return `${selector}[data-${scopeId}]`;
}
```

## 4. 性能考量

### 4.1 緩存策略
- ScopeId 的生成基於文件路徑和內容，所以相同的文件會生成相同的 scopeId
- 可以使用 LRU Cache 緩存轉換結果
- 當文件內容改變時，hash 會改變，緩存自動失效

### 4.2 正則表達式優化
- 預編譯正則表達式
- 使用非捕獲組減少內存使用
- 避免回溯問題

## 5. 測試計劃

### 5.1 基本功能測試
- ✅ 提取 `<style scoped>` 標籤
- ✅ 生成唯一的 scopeId
- ✅ 轉換簡單的 CSS 選擇器（類、ID、元素）
- ✅ 為 HTML 元素添加 data 屬性

### 5.2 複雜場景測試
- ✅ 組合選擇器（`.parent .child`）
- ✅ 偽類選擇器（`:hover`, `:focus`）
- ✅ 偽元素選擇器（`::before`, `::after`）
- ✅ 多個選擇器（逗號分隔）
- ✅ 嵌套組件的樣式隔離
- ✅ 與 @if/@foreach 等邏輯語法的整合
- ✅ 與 slot 系統的整合

### 5.3 邊界情況測試
- ✅ 沒有 scoped style 的組件
- ✅ 多個 scoped style 標籤
- ✅ 空的 scoped style 標籤
- ✅ 包含註釋的 CSS
- ✅ Media queries
- ✅ Keyframes

## 6. 文檔更新

需要更新的文檔：
- ✅ README.md - 添加使用說明和示例
- ✅ BLADE_FEATURES_TODO.md - 標記為已實現
- ✅ COMPARISON_ASTRO.md - 更新對比分析

## 7. 未來改進

### 7.1 進階選擇器支援
- `:deep()` - 穿透選擇器，影響子組件
- `:global()` - 全局選擇器，不添加 scopeId
- `:slotted()` - 影響 slot 內容

### 7.2 使用 PostCSS
- 使用專業的 CSS 解析器
- 更準確的選擇器轉換
- 支援 CSS 預處理器（Sass, Less）

### 7.3 Source Maps
- 生成 CSS Source Maps
- 方便調試

## 8. 實現時程

- **階段 1**（2-3 小時）：實現基本功能
  - 提取和解析 scoped styles
  - 簡單的選擇器轉換
  - HTML 屬性添加

- **階段 2**（1-2 小時）：完善功能
  - 處理複雜選擇器
  - 處理偽類和偽元素
  - 邊界情況處理

- **階段 3**（2-3 小時）：測試和文檔
  - 編寫完整的測試套件
  - 更新文檔
  - 示例和最佳實踐

**總預估時間：** 5-8 小時

## 9. 依賴項

**不需要新增依賴項**，使用 Node.js 內建模組：
- `crypto` - 生成 hash
- 正則表達式 - CSS 和 HTML 解析

**可選依賴項**（未來改進）：
- `postcss` - 更準確的 CSS 解析
- `postcss-selector-parser` - 選擇器解析
