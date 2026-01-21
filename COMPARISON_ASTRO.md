# vite-plugin-html-kit vs Astro 比較分析

本文件比較 vite-plugin-html-kit 與 Astro 框架的異同，並提出可借鑑的改善方向。

## 📊 核心定位比較

| 特性 | vite-plugin-html-kit | Astro |
|------|---------------------|-------|
| **定位** | Vite 插件 | 完整的 Web 框架 |
| **主要用途** | 靜態 HTML 模板處理 | 內容驅動的網站框架 |
| **複雜度** | 輕量級（單一插件） | 重量級（完整生態系統） |
| **學習曲線** | 低（熟悉 Blade 語法即可） | 中等（需要學習框架概念） |
| **適用場景** | 靜態網站、文檔站、Landing Pages | 博客、文檔、電商、內容站 |

---

## 🎯 相同之處

### 1. 組件化開發
**共同點：**
- ✅ 都支援將 HTML 拆分為可重用組件
- ✅ 都支援組件間的資料傳遞
- ✅ 都支援 Slot/插槽機制

**vite-plugin-html-kit：**
```html
<!-- partials/card.html -->
<div class="card">
  @slot('title', '預設標題')
  @slot('content')
</div>

<!-- index.html -->
<include src="card.html">
  @slot('title')自訂標題@endslot
  @slot('content')<p>內容</p>@endslot
</include>
```

**Astro：**
```astro
<!-- Card.astro -->
---
const { title = '預設標題' } = Astro.props;
---
<div class="card">
  <h2>{title}</h2>
  <slot />
</div>

<!-- index.astro -->
<Card title="自訂標題">
  <p>內容</p>
</Card>
```

### 2. 模板語法
**共同點：**
- ✅ 條件渲染（@if / {condition && ...}）
- ✅ 迴圈處理（@foreach / .map()）
- ✅ 變數插值（{{ var }} / {var}）

### 3. Vite 整合
**共同點：**
- ✅ 都基於或整合 Vite
- ✅ 都支援 HMR
- ✅ 都享受 Vite 的快速開發體驗

---

## ⚔️ 主要差異

### 1. 架構層級

#### vite-plugin-html-kit
**特點：**
- 純模板層解決方案
- 不涉及 JavaScript 框架
- 專注於靜態 HTML 生成
- 輕量級，無運行時開銷

**適合：**
```
靜態網站 → 模板轉換 → 純 HTML
```

#### Astro
**特點：**
- 完整的全端框架
- Islands Architecture（部分水合）
- 支援多框架組件（React/Vue/Svelte）
- 內建路由、API 端點、Content Collections

**適合：**
```
複雜應用 → SSR/SSG → 部分互動 → 優化輸出
```

### 2. 互動性支援

| 功能 | vite-plugin-html-kit | Astro |
|------|---------------------|-------|
| **靜態內容** | ✅ 完整支援 | ✅ 完整支援 |
| **客戶端 JavaScript** | ⚠️ 手動引入 | ✅ 自動處理 |
| **Partial Hydration** | ❌ 不支援 | ✅ **核心特性** |
| **React/Vue 組件** | ❌ 不支援 | ✅ 完整支援 |
| **Islands Architecture** | ❌ | ✅ |

**Astro 的 Partial Hydration 範例：**
```astro
---
import InteractiveComponent from './Interactive.jsx';
import Header from './Header.astro';
---
<Header /> <!-- 純靜態，無 JS -->
<InteractiveComponent client:visible /> <!-- 進入視窗才載入 JS -->
```

### 3. 組件語法

#### Props 傳遞

**vite-plugin-html-kit：**
```html
<!-- 透過屬性傳遞 -->
<include src="card.html" title="標題" active="true" />

<!-- 或透過 @include 指令 -->
@include('card.html', { title: '標題', active: true })
```

**Astro：**
```astro
<!-- 更現代的 JSX 風格 -->
<Card title="標題" active={true} />

<!-- TypeScript 型別檢查 -->
---
interface Props {
  title: string;
  active?: boolean;
}
const { title, active = false } = Astro.props;
---
```

#### Slot 機制

**vite-plugin-html-kit：**
```html
<!-- 需要明確定義 slot 名稱 -->
<include src="layout.html">
  @slot('header')<h1>標題</h1>@endslot
  @slot('content')<p>內容</p>@endslot
</include>
```

**Astro：**
```astro
<!-- 支援具名和預設 slot -->
<Layout>
  <h1 slot="header">標題</h1>
  <p>內容</p> <!-- 預設 slot -->
</Layout>
```

### 4. 檔案類型支援

| 格式 | vite-plugin-html-kit | Astro |
|------|---------------------|-------|
| **HTML** | ✅ 主要格式 | ✅ 支援 |
| **Markdown** | ❌ | ✅ 原生支援 |
| **MDX** | ❌ | ✅ 完整支援 |
| **JSX/TSX** | ❌ | ✅ 支援 |
| **Vue/Svelte** | ❌ | ✅ 支援 |

### 5. 樣式處理

**vite-plugin-html-kit：**
```html
<!-- 需要手動管理 CSS -->
<link rel="stylesheet" href="/styles/component.css">
<div class="component">...</div>
```

**Astro：**
```astro
---
// 組件邏輯
---
<div class="component">...</div>

<style>
  /* 自動作用域，不會洩漏 */
  .component {
    color: blue;
  }
</style>
```

### 6. 內容管理

**vite-plugin-html-kit：**
- 手動管理 HTML 檔案
- 沒有內建的內容架構

**Astro：**
- Content Collections（內容集合）
- 型別安全的內容查詢
- 自動生成路由

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.date(),
    author: z.string(),
  }),
});

export const collections = { blog };
```

---

## 💡 可借鑑的改善方向

### 🟢 高優先級（強烈建議）

#### 1. **組件作用域樣式**

**問題：**
目前需要手動管理 CSS，容易造成樣式衝突。

**建議：**
```html
<!-- partials/card.html -->
<div class="card">
  <h2>@slot('title')</h2>
  <div>@slot('content')</div>
</div>

<style scoped>
  .card {
    border: 1px solid #ccc;
    padding: 1rem;
  }
  /* 自動轉換為 .card[data-v-xxxxx] */
</style>
```

**實作考量：**
- 使用 PostCSS 添加唯一屬性
- 類似 Vue 的 scoped CSS
- 可選功能（不強制）

#### 2. **TypeScript Props 定義**

**問題：**
缺乏型別檢查，容易傳錯參數。

**建議：**
```html
<!-- partials/card.html -->
<!--@props
interface CardProps {
  title: string;
  description?: string;
  active?: boolean;
}
-->
<div class="card" data-active="{{ active }}">
  <h2>{{ title }}</h2>
  @if(description)
    <p>{{ description }}</p>
  @endif
</div>
```

**實作考量：**
- 解析特殊註釋區塊
- 生成 `.d.ts` 型別檔案
- IDE 自動完成支援

#### 3. **組件自動導入**

**問題：**
需要手動寫 `<include src="...">` 路徑。

**建議：**
```js
// vite.config.js
vitePluginHtmlKit({
  partialsDir: 'partials',
  autoImport: true,  // 啟用自動導入
  componentPrefix: ''  // 組件前綴（可選）
})
```

```html
<!-- 自動從 partials/ 查找 -->
<Card title="標題" />  <!-- 自動對應 partials/Card.html -->
<Button>點擊</Button>   <!-- 自動對應 partials/Button.html -->

<!-- 子目錄支援 -->
<LayoutDefault>...</LayoutDefault>  <!-- partials/Layout/Default.html -->
```

**實作考量：**
- 使用 PascalCase 自動對應檔案
- 支援子目錄結構
- 向後相容現有 `<include>` 語法

#### 4. **更好的錯誤提示**

**問題：**
錯誤訊息可以更友善，類似 Astro。

**建議：**
```bash
# 目前錯誤
❌ Include 檔案不存在 [E3002]

# 改善後（類似 Astro）
❌ Component not found: "partials/card.html"

  src/index.html:15:3
  14 | <div class="container">
  15 |   <include src="card.html" />
     |   ^^^^^^^^^^^^^^^^^^^^^^^
  16 | </div>

  Hint: Did you mean "partials/Card.html"? (capital C)

  Available components in partials/:
    - Button.html
    - Card.html
    - Header.html
```

### 🟡 中優先級（值得考慮）

#### 5. **Markdown 支援**

**建議：**
```html
<!-- 支援內聯 Markdown -->
<div class="content">
  @markdown
  # 標題
  這是一段 **粗體** 文字。
  - 列表項目 1
  - 列表項目 2
  @endmarkdown
</div>

<!-- 或引入 Markdown 檔案 -->
<include src="content/article.md" />
```

**實作考量：**
- 整合 markdown-it 或 marked
- 支援 frontmatter
- 可選功能

#### 6. **組件事件系統**（實驗性）

**建議：**
```html
<!-- partials/Modal.html -->
<div class="modal" data-component="modal">
  <div class="modal-content">
    @slot('content')
  </div>
  <button @click="close">關閉</button>
</div>

<script>
// 輕量級事件系統
export default {
  methods: {
    close() {
      this.$emit('close');
    }
  }
}
</script>
```

**注意：**
- 這會增加運行時開銷
- 可能偏離「純靜態」定位
- 需要仔細評估是否符合專案目標

#### 7. **圖片優化**

**建議：**
```html
<!-- 自動優化圖片 -->
<img
  src="/images/hero.jpg"
  width="800"
  height="600"
  optimize
/>

<!-- 自動生成 -->
<img
  src="/images/hero.jpg?w=800&h=600&format=webp"
  srcset="..."
  loading="lazy"
  width="800"
  height="600"
/>
```

#### 8. **Content Collections（輕量版）**

**建議：**
```js
// vite.config.js
vitePluginHtmlKit({
  collections: {
    blog: {
      pattern: 'content/blog/*.md',
      schema: {
        title: 'string',
        date: 'date',
        tags: 'string[]'
      }
    }
  }
})
```

```html
<!-- index.html -->
@foreach(collections.blog as post)
  <article>
    <h2>{{ post.title }}</h2>
    <time>{{ post.date }}</time>
  </article>
@endforeach
```

### 🔵 低優先級（長期規劃）

#### 9. **VS Code 擴充套件**

類似 Astro Language Server：
- 語法高亮
- 自動完成
- 錯誤檢查
- 組件跳轉

#### 10. **開發工具面板**

類似 Astro Dev Toolbar：
- 顯示組件樹狀結構
- 檢視 Props 和 Slots
- 效能分析

---

## 🎯 建議的實作順序

### Phase 1: 基礎改善（1-2 週）
1. ✅ 已完成：`order: 'pre'` 設置
2. ✅ 已完成：絕對路徑支援
3. 🔄 改善錯誤訊息（類似 Astro）
4. 🔄 組件自動導入（實驗功能）

### Phase 2: 開發體驗（2-4 週）
5. 組件作用域樣式（`<style scoped>`）
6. TypeScript Props 定義
7. 更好的型別檢查

### Phase 3: 功能擴充（選擇性）
8. Markdown 支援
9. 圖片優化
10. Content Collections（輕量版）

### Phase 4: 開發工具（長期）
11. VS Code 擴充套件
12. 開發工具面板

---

## 📊 決策矩陣

| 功能 | 實作成本 | 用戶價值 | 維護成本 | 建議 |
|------|---------|---------|---------|------|
| 組件自動導入 | 中 | 高 | 低 | ✅ 強烈推薦 |
| 作用域樣式 | 中 | 高 | 中 | ✅ 強烈推薦 |
| TypeScript Props | 高 | 高 | 中 | ✅ 推薦 |
| 錯誤訊息改善 | 低 | 高 | 低 | ✅ 強烈推薦 |
| Markdown 支援 | 低 | 中 | 低 | ⚠️ 可考慮 |
| 圖片優化 | 高 | 中 | 高 | ⚠️ 謹慎評估 |
| 事件系統 | 高 | 低 | 高 | ❌ 不建議 |
| Islands 架構 | 極高 | 低* | 極高 | ❌ 偏離定位 |

*對靜態網站用戶價值低

---

## 🎓 總結

### vite-plugin-html-kit 應該保持的優勢
1. ✅ **輕量級** - 不要變成另一個 Astro
2. ✅ **專注靜態** - 不需要支援客戶端框架
3. ✅ **簡單易用** - Blade 語法已經很好
4. ✅ **零配置** - 開箱即用

### 可以借鑑的 Astro 優點
1. 🎯 **更好的開發體驗**（錯誤訊息、自動導入）
2. 🎯 **現代化語法**（TypeScript、作用域樣式）
3. 🎯 **完善的工具鏈**（但不需要全部實作）

### 不應該模仿的部分
1. ❌ Islands Architecture（太重量級）
2. ❌ 多框架支援（偏離定位）
3. ❌ SSR/SSG 混合（增加複雜度）
4. ❌ 完整路由系統（可用 Vite MPA）

---

## 🔗 參考資源

**Astro 官方文檔：**
- [Islands Architecture](https://docs.astro.build/en/concepts/islands/)
- [Components](https://docs.astro.build/en/basics/astro-components/)
- [Template Syntax](https://docs.astro.build/en/reference/astro-syntax/)
- [Front-end Frameworks](https://docs.astro.build/en/guides/framework-components/)

**社群文章：**
- [Astro Islands Architecture Explained](https://strapi.io/blog/astro-islands-architecture-explained-complete-guide)
- [Understanding Astro Islands](https://blog.logrocket.com/understanding-astro-islands-architecture/)
- [Islands Architecture Pattern](https://www.patterns.dev/vanilla/islands-architecture/)

**框架比較：**
- [Remix vs Next.js vs Astro](https://www.index.dev/skill-vs-skill/remix-vs-nextjs-vs-astro)

---

**最後更新：** 2026-01-21
**維護者：** vite-plugin-html-kit 開發團隊
