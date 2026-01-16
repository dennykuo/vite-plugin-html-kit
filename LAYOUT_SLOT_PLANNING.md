# Laravel Blade 風格的 @layout 和 @slot 功能規劃

## 📋 功能概述

實作類似 Laravel Blade 的佈局繼承和槽位系統，讓 HTML 模板可以：
1. 繼承和擴展佈局模板
2. 定義和使用內容區塊
3. 支援組件槽位功能

---

## 🎯 Laravel Blade 語法參考

### 1. 佈局繼承（@extends + @section + @yield）

**佈局檔案 (layouts/app.blade.php):**
```blade
<!DOCTYPE html>
<html>
<head>
    <title>@yield('title', 'Default Title')</title>
    @yield('styles')
</head>
<body>
    <header>
        @yield('header')
    </header>

    <main>
        @yield('content')
    </main>

    <footer>
        @yield('footer', '<p>Default Footer</p>')
    </footer>

    @yield('scripts')
</body>
</html>
```

**子頁面 (pages/home.blade.php):**
```blade
@extends('layouts.app')

@section('title')
    Home Page
@endsection

@section('styles')
    <link rel="stylesheet" href="home.css">
@endsection

@section('content')
    <h1>Welcome Home</h1>
    <p>This is the home page content.</p>
@endsection

@section('scripts')
    <script src="home.js"></script>
@endsection
```

### 2. 組件槽位（@component + @slot）

**組件檔案 (components/alert.blade.php):**
```blade
<div class="alert alert-{{ $type }}">
    <div class="alert-title">
        {{ $title }}
    </div>
    <div class="alert-content">
        {{ $slot }}
    </div>
</div>
```

**使用組件:**
```blade
@component('components.alert', ['type' => 'danger'])
    @slot('title')
        Error!
    @endslot

    An error occurred while processing your request.
@endcomponent
```

---

## 💡 vite-plugin-html-kit 實作方案

### 方案 A: 完整 Blade 風格語法（推薦）

保持與 Laravel Blade 高度一致的語法。

#### 語法設計

**1. 佈局定義與繼承**

```html
<!-- partials/layouts/app.html -->
<!DOCTYPE html>
<html>
<head>
    <title>@yield('title', 'My Site')</title>
    @yield('styles')
</head>
<body>
    <header>
        @yield('header')
    </header>

    <main>
        @yield('content')
    </main>

    <footer>
        @yield('footer', '<p>&copy; 2026</p>')
    </footer>

    @yield('scripts')
</body>
</html>
```

```html
<!-- index.html -->
@extends('layouts/app.html')

@section('title')
    Home Page - My Site
@endsection

@section('content')
    <h1>Welcome</h1>
    <p>This is the home page.</p>
@endsection

@section('scripts')
    <script src="/main.js"></script>
@endsection
```

**2. 組件槽位**

```html
<!-- partials/components/card.html -->
<div class="card">
    <div class="card-header">
        @slot('header', '<h3>Default Header</h3>')
    </div>
    <div class="card-body">
        @slot('body')
    </div>
    <div class="card-footer">
        @slot('footer')
    </div>
</div>
```

```html
<!-- 使用組件 -->
<include src="components/card.html">
    @slot('header')
        <h3>My Card Title</h3>
    @endslot

    @slot('body')
        <p>Card content goes here.</p>
    @endslot

    @slot('footer')
        <button>Action</button>
    @endslot
</include>
```

---

### 方案 B: HTML 標籤風格（較簡化）

使用 XML 風格的標籤，更接近 HTML 語法。

```html
<!-- index.html -->
<extends src="layouts/app.html">
    <section name="title">Home Page</section>
    <section name="content">
        <h1>Welcome</h1>
    </section>
</extends>
```

```html
<!-- partials/layouts/app.html -->
<!DOCTYPE html>
<html>
<head>
    <title><yield name="title" default="My Site"></yield></title>
</head>
<body>
    <yield name="content"></yield>
</body>
</html>
```

---

## 🏗️ 實作架構

### 核心處理流程

```
1. 偵測 @extends 指令
   ↓
2. 載入佈局檔案
   ↓
3. 解析 @section 區塊
   ↓
4. 替換佈局中的 @yield 佔位符
   ↓
5. 處理 @slot (在 include 內)
   ↓
6. 最後進行變數插值和邏輯處理
```

### 正則表達式模式

```javascript
const REGEX = {
  // @extends('layout-path')
  EXTENDS: /@extends\s*\(\s*['"](.+?)['"]\s*\)/gi,

  // @section('name') ... @endsection
  SECTION: /@section\s*\(\s*['"](.+?)['"]\s*\)([\s\S]*?)@endsection/gi,

  // @yield('name') 或 @yield('name', 'default')
  YIELD: /@yield\s*\(\s*['"](.+?)['"]\s*(?:,\s*['"](.+?)['"]\s*)?\)/gi,

  // @slot('name') 或 @slot('name', 'default')
  SLOT: /@slot\s*\(\s*['"](.+?)['"]\s*(?:,\s*['"](.+?)['"]\s*)?\)/gi,

  // @slot('name') ... @endslot
  SLOT_BLOCK: /@slot\s*\(\s*['"](.+?)['"]\s*\)([\s\S]*?)@endslot/gi,
};
```

### 資料結構

```javascript
// 儲存 section 內容
const sections = {
  'title': 'Home Page',
  'content': '<h1>Welcome</h1>...',
  'scripts': '<script src="main.js"></script>'
};

// 儲存 slot 內容
const slots = {
  'header': '<h3>Card Title</h3>',
  'body': '<p>Content</p>',
  'footer': '<button>Action</button>'
};
```

---

## 📝 實作步驟

### 階段 1: 基礎佈局繼承（@extends + @section + @yield）

**優先度**: 🔴 高

**步驟**:
1. 新增 `processExtends()` 函式
   - 偵測 `@extends('layout')`
   - 載入佈局檔案

2. 新增 `parseSections()` 函式
   - 解析所有 `@section...@endsection` 區塊
   - 儲存到 sections 物件

3. 新增 `resolveYields()` 函式
   - 替換佈局中的 `@yield('name')`
   - 支援默認值 `@yield('name', 'default')`

4. 整合到主處理流程
   - 在 `transformIndexHtml` 中先處理 extends
   - 再處理其他邏輯

**預估時間**: 4-6 小時

---

### 階段 2: 組件槽位（@slot）

**優先度**: 🟡 中

**步驟**:
1. 修改 `resolveIncludes()` 函式
   - 解析 `<include>` 內的 `@slot...@endslot`
   - 傳遞 slots 資料到組件

2. 新增 `resolveSlots()` 函式
   - 在組件中替換 `@slot('name')`
   - 支援默認值和默認槽位

3. 支援巢狀槽位
   - 槽位內可包含其他 include
   - 槽位內可使用變數插值

**預估時間**: 3-4 小時

---

### 階段 3: 進階功能

**優先度**: 🟢 低

**功能**:
- `@parent` - 在 section 中包含父級內容
- `@append` - 附加到 section 而非覆蓋
- `@prepend` - 前置到 section
- `@show` - 立即顯示 section
- `@stack` / `@push` - 堆疊管理（用於腳本/樣式）

**預估時間**: 每個功能 1-2 小時

---

## 🧪 測試案例設計

### 測試檔案: `tests/layout.test.js`

```javascript
describe('佈局繼承測試', () => {
  it('應該正確載入並應用佈局', () => {
    // 測試基本的 @extends + @section + @yield
  });

  it('應該支援 @yield 的默認值', () => {
    // 測試未定義的 section 使用默認值
  });

  it('應該正確處理多個 sections', () => {
    // 測試多個 section 同時使用
  });

  it('應該支援巢狀佈局', () => {
    // 測試 layout 繼承另一個 layout
  });
});

describe('槽位系統測試', () => {
  it('應該在 include 中正確處理 @slot', () => {
    // 測試組件槽位基本功能
  });

  it('應該支援默認槽位內容', () => {
    // 測試 @slot 的默認值
  });

  it('應該支援多個命名槽位', () => {
    // 測試多槽位組件
  });
});
```

---

## ⚠️ 技術挑戰與解決方案

### 挑戰 1: 處理順序衝突

**問題**: @extends 必須在其他處理之前執行，但 @section 內可能包含 @if/@foreach

**解決方案**:
```javascript
// 處理順序:
// 1. 先解析 @extends 和 @section（不處理內容）
// 2. 組裝完整 HTML
// 3. 再處理 @if/@foreach/@switch
// 4. 最後處理變數插值
```

### 挑戰 2: 循環引用檢測

**問題**: Layout A extends Layout B extends Layout A

**解決方案**:
```javascript
// 複用現有的循環引用檢測機制
const layoutStack = [];

function processExtends(html, layoutPath) {
  if (layoutStack.includes(layoutPath)) {
    throw new Error(`循環佈局引用: ${layoutStack.join(' → ')} → ${layoutPath}`);
  }
  layoutStack.push(layoutPath);
  // ... 處理佈局
  layoutStack.pop();
}
```

### 挑戰 3: Section 內容解析

**問題**: Section 內容可能包含複雜的 HTML 和嵌套標籤

**解決方案**:
```javascript
// 使用非貪婪匹配和計數器
function parseSections(html) {
  const sections = {};
  let match;

  // 使用正則找到所有 @section...@endsection 配對
  const regex = /@section\s*\(['"](.+?)['"]\)([\s\S]*?)@endsection/gi;

  while ((match = regex.exec(html)) !== null) {
    const [, name, content] = match;
    sections[name] = content.trim();
  }

  return sections;
}
```

---

## 📊 實作優先順序建議

### 推薦實作順序

1. **第一階段** (必要功能):
   - ✅ @extends + @section + @yield
   - 這是最核心的功能，提供最大價值

2. **第二階段** (增強功能):
   - ✅ @slot (組件槽位)
   - 提升組件重用性

3. **第三階段** (進階功能):
   - @parent / @append / @prepend
   - @stack / @push
   - 這些是錦上添花的功能

---

## 🎨 使用範例

### 範例 1: 部落格網站

```html
<!-- partials/layouts/blog.html -->
<!DOCTYPE html>
<html>
<head>
    <title>@yield('title') - My Blog</title>
    <meta name="description" content="@yield('description', 'My awesome blog')">
    @yield('meta')
    <link rel="stylesheet" href="/blog.css">
    @yield('styles')
</head>
<body>
    <include src="partials/nav.html" />

    <main class="container">
        @yield('content')
    </main>

    <include src="partials/footer.html" />

    @yield('scripts')
</body>
</html>
```

```html
<!-- post.html -->
@extends('layouts/blog.html')

@section('title')
    {{ post.title }}
@endsection

@section('description')
    {{ post.excerpt }}
@endsection

@section('content')
    <article>
        <h1>{{ post.title }}</h1>
        <div class="meta">{{ post.date }} by {{ post.author }}</div>
        <div class="content">
            {{ post.content }}
        </div>
    </article>
@endsection

@section('scripts')
    <script src="/post-viewer.js"></script>
@endsection
```

### 範例 2: 可重用卡片組件

```html
<!-- partials/components/card.html -->
<div class="card {{ type }}">
    <div class="card-header">
        @slot('header')
    </div>
    <div class="card-body">
        @slot('body')
    </div>
    @if (actions)
        <div class="card-actions">
            @slot('actions')
        </div>
    @endif
</div>
```

```html
<!-- 使用卡片 -->
<include src="components/card.html" type="primary">
    @slot('header')
        <h3>Product Name</h3>
    @endslot

    @slot('body')
        <p>Product description goes here.</p>
        <p class="price">${{ product.price }}</p>
    @endslot

    @slot('actions')
        <button>Add to Cart</button>
    @endslot
</include>
```

---

## 📈 效益分析

### 優點
1. ✅ **大幅減少重複代碼** - 佈局可重用
2. ✅ **提升可維護性** - 集中管理佈局結構
3. ✅ **更好的組織結構** - 清晰的頁面繼承關係
4. ✅ **開發體驗佳** - 熟悉 Laravel 的開發者零學習曲線
5. ✅ **組件化開發** - slot 支援靈活的組件設計

### 挑戰
1. ⚠️ **實作複雜度中等** - 需要仔細處理解析順序
2. ⚠️ **需要完善測試** - 邊界情況較多
3. ⚠️ **錯誤訊息要清晰** - 幫助開發者快速定位問題

---

## 🚀 建議行動方案

### 立即開始（推薦）
如果認為此功能價值高，建議：
1. 先實作階段 1（@extends/@section/@yield）
2. 完成後評估使用效果
3. 根據反饋決定是否實作階段 2 和 3

### 延後實作
如果現有功能已足夠：
1. 將此功能加入改善計劃
2. 等待用戶需求
3. 優先處理其他項目（如 CI/CD、CHANGELOG）

---

## 📌 相關資源

- [Laravel Blade Templates 官方文檔](https://laravel.com/docs/blade)
- [Lodash Template 文檔](https://lodash.com/docs/4.17.15#template)
- 現有 resolveIncludes 函式 (src/index.js:400+)
- 現有循環引用檢測機制 (src/index.js:420+)

---

**建議優先度**: 🟡 中高
**預估總時間**: 8-12 小時（階段 1 + 2）
**建議開始時間**: 完成 CHANGELOG 和 CI/CD 後
