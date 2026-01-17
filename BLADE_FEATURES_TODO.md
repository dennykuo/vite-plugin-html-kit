# Laravel Blade 功能實現狀態

本文檔記錄與 Laravel Blade 相比，vite-plugin-html-kit 的功能實現狀態。

## ✅ 已實現功能

### 1. 模板繼承
- ✅ `@extends('layout')` - 繼承佈局
- ✅ `@section('name')...@endsection` - 定義內容區塊
- ✅ `@yield('name', 'default')` - 佔位符

### 2. 條件判斷
- ✅ `@if(condition)...@endif` - 條件判斷
- ✅ `@elseif(condition)` - 否則如果
- ✅ `@else` - 否則
- ✅ `@unless(condition)...@endunless` - 否定條件（等同於 @if(!condition)）
- ✅ `@switch/@case/@default/@endswitch` - Switch 語句

### 3. 迴圈
- ✅ `@foreach(items as item)...@endforeach` - 迴圈遍歷
- ✅ 支援 JavaScript 風格：`@foreach(item of items)`

### 4. 組件系統
- ✅ `<include src="file.html">` - Include 外部文件
- ✅ `@slot('name')...@endslot` - 定義插槽內容
- ✅ `@slot('name', 'default')` - 插槽佔位符
- ✅ 屬性傳遞支援

### 5. 變數插值
- ✅ `{{ variable }}` - 變數輸出
- ✅ `{{ expression }}` - 表達式求值
- ✅ Lodash 工具函式支援（`_`）

### 6. Blade 註釋
- ✅ `{{-- 註釋 --}}` - Blade 註釋（不出現在 HTML 輸出中）
- ✅ 支援單行和多行註釋
- ✅ 在 transformLogicTags 階段移除

---

## ❌ 未實現功能（前端適用）

### 🔴 高優先級（實用性高，建議實現）

#### 1. @forelse - 空資料處理
**用途：** 處理空陣列時顯示替代內容，避免額外的 @if 判斷

**Laravel Blade 語法：**
```blade
@forelse ($users as $user)
  <li>{{ $user->name }}</li>
@empty
  <p>沒有使用者資料</p>
@endforelse
```

**等同於：**
```blade
@if (count($users) > 0)
  @foreach ($users as $user)
    <li>{{ $user->name }}</li>
  @endforeach
@else
  <p>沒有使用者資料</p>
@endif
```

**實現難度：** ⭐⭐ (中等)
**預期工作量：** 2-3 小時

---

#### 2. $loop 變數 - 迴圈元資訊
**用途：** 在迴圈中獲取當前迭代的索引、是否第一個/最後一個等資訊

**Laravel Blade 語法：**
```blade
@foreach ($items as $item)
  <div class="item {{ $loop->first ? 'first' : '' }} {{ $loop->last ? 'last' : '' }}">
    <span class="index">{{ $loop->iteration }}</span>
    <span class="total">{{ $loop->count }}</span>
    <p>{{ $item->name }}</p>
  </div>
@endforeach
```

**$loop 物件屬性：**
| 屬性 | 類型 | 描述 |
|------|------|------|
| `$loop->index` | int | 當前索引（從 0 開始） |
| `$loop->iteration` | int | 當前迭代次數（從 1 開始） |
| `$loop->remaining` | int | 剩餘迭代次數 |
| `$loop->count` | int | 陣列總數 |
| `$loop->first` | bool | 是否第一個元素 |
| `$loop->last` | bool | 是否最後一個元素 |
| `$loop->even` | bool | 是否偶數迭代 |
| `$loop->odd` | bool | 是否奇數迭代 |
| `$loop->depth` | int | 嵌套深度（從 1 開始） |
| `$loop->parent` | object | 父迴圈的 $loop 物件 |

**實現難度：** ⭐⭐⭐ (較高)
**預期工作量：** 4-6 小時

---

#### 3. @stack/@push/@prepend - CSS/JS 資源管理
**用途：** 管理頁面中的 CSS 和 JavaScript，避免重複載入，支援從子頁面推送資源到佈局

**Laravel Blade 語法：**

**佈局文件 (layouts/app.html):**
```blade
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>@yield('title', 'My App')</title>

  <!-- 預設樣式 -->
  <link href="/css/app.css" rel="stylesheet">

  <!-- 自訂樣式堆疊 -->
  @stack('styles')
</head>
<body>
  @yield('content')

  <!-- 預設腳本 -->
  <script src="/js/app.js"></script>

  <!-- 自訂腳本堆疊 -->
  @stack('scripts')
</body>
</html>
```

**子頁面 (pages/dashboard.html):**
```blade
@extends('layouts/app')

@section('title', 'Dashboard')

@push('styles')
  <link href="/css/dashboard.css" rel="stylesheet">
  <link href="/css/charts.css" rel="stylesheet">
@endpush

@push('scripts')
  <script src="/js/charts.js"></script>
  <script>
    // Dashboard specific code
  </script>
@endpush

@section('content')
  <h1>Dashboard</h1>
  <!-- ... -->
@endsection
```

**最終輸出：**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Dashboard</title>
  <link href="/css/app.css" rel="stylesheet">
  <link href="/css/dashboard.css" rel="stylesheet">
  <link href="/css/charts.css" rel="stylesheet">
</head>
<body>
  <h1>Dashboard</h1>
  <!-- ... -->
  <script src="/js/app.js"></script>
  <script src="/js/charts.js"></script>
  <script>
    // Dashboard specific code
  </script>
</body>
</html>
```

**@prepend - 在堆疊前面插入：**
```blade
@prepend('styles')
  <!-- 這個會插入到 stack 的最前面 -->
  <link href="/css/critical.css" rel="stylesheet">
@endprepend
```

**技術細節：**
- Stack 在 processExtends 階段收集
- 需要在解析 section 時同時解析 @push/@prepend
- 支援多次 push 到同一個 stack
- 支援嵌套佈局中的 stack

**實現難度：** ⭐⭐⭐⭐ (高)
**預期工作量：** 6-8 小時

---

#### 4. @once - 防止重複輸出
**用途：** 確保某段代碼只輸出一次，即使 partial 被多次 include

**Laravel Blade 語法：**

**partial/alert.html:**
```blade
<div class="alert">
  {{ message }}
</div>

@once
  <!-- 即使 alert.html 被 include 多次，jQuery 只載入一次 -->
  <script src="/js/jquery.js"></script>
  <script src="/js/alert.js"></script>
@endonce
```

**使用：**
```blade
<include src="alert.html" message="警告 1" />
<include src="alert.html" message="警告 2" />
<include src="alert.html" message="警告 3" />
```

**輸出：**
```html
<div class="alert">警告 1</div>
<div class="alert">警告 2</div>
<div class="alert">警告 3</div>
<!-- jQuery 只出現一次 -->
<script src="/js/jquery.js"></script>
<script src="/js/alert.js"></script>
```

**技術細節：**
- 需要全域追蹤已輸出的 @once 區塊
- 使用內容 hash 或區塊 ID 識別
- 在 resolveIncludes 階段實現

**實現難度：** ⭐⭐ (中等)
**預期工作量：** 2-3 小時

---

### 🟡 中優先級（有用但不緊急）

#### 6. @isset/@empty - 變數檢查
**用途：** 檢查變數是否定義或為空

**Laravel Blade 語法：**
```blade
@isset($user->name)
  <p>{{ $user->name }}</p>
@endisset

@empty($users)
  <p>沒有使用者</p>
@endempty
```

**等同於：**
```blade
@if (isset($user->name))
  <p>{{ $user->name }}</p>
@endif

@if (empty($users))
  <p>沒有使用者</p>
@endif
```

**實現難度：** ⭐⭐ (中等)
**預期工作量：** 2 小時

---

#### 8. @verbatim - 跳過 Blade 解析
**用途：** 與 Vue.js、Alpine.js 等使用 `{{ }}` 語法的框架整合

**Laravel Blade 語法：**
```blade
@verbatim
  <div id="app">
    <!-- 這裡的 {{ }} 不會被 Blade 處理 -->
    <h1>{{ message }}</h1>
    <p>{{ user.name }}</p>
  </div>
@endverbatim

<script>
  // Vue.js 會處理這些變數
  new Vue({
    el: '#app',
    data: { message: 'Hello', user: { name: 'John' } }
  });
</script>
```

**技術細節：**
- 在 transformLogicTags 之前處理
- 暫時替換 @verbatim 區塊為佔位符
- 轉換完成後恢復原始內容

**實現難度：** ⭐⭐ (中等)
**預期工作量：** 2-3 小時

---

#### 8. @includeIf/@includeWhen/@includeUnless - 條件 Include
**用途：** 條件性載入 partial，避免檔案不存在錯誤

**Laravel Blade 語法：**
```blade
<!-- 只在檔案存在時 include -->
@includeIf('partials.header')

<!-- 條件 include -->
@includeWhen($user->isAdmin, 'partials.admin-panel')
@includeUnless($user->isGuest, 'partials.user-menu')

<!-- 嘗試多個檔案，使用第一個存在的 -->
@includeFirst(['custom.header', 'partials.header'])
```

**對應語法（需要設計）：**
```blade
<include-if src="partials/header.html" />
<include-when condition="{{ user.isAdmin }}" src="partials/admin-panel.html" />
<include-unless condition="{{ user.isGuest }}" src="partials/user-menu.html" />
<include-first src="custom/header.html,partials/header.html" />
```

**實現難度：** ⭐⭐⭐ (較高)
**預期工作量：** 4-5 小時

---

### 🟢 低優先級（可替代或較少使用）

#### 9. @for/@while - 其他迴圈類型
**用途：** 提供更多迴圈選項

**Laravel Blade 語法：**
```blade
@for ($i = 0; $i < 10; $i++)
  <p>{{ $i }}</p>
@endfor

@while ($count > 0)
  <p>{{ $count-- }}</p>
@endwhile
```

**備註：** 大部分情況可用 @foreach 替代

**實現難度：** ⭐⭐ (中等)
**預期工作量：** 2-3 小時

---

#### 10. @continue/@break - 迴圈控制
**用途：** 控制迴圈執行

**Laravel Blade 語法：**
```blade
@foreach ($users as $user)
  @continue($user->isHidden)
  @break($user->id === 10)

  <li>{{ $user->name }}</li>
@endforeach
```

**備註：** 前端模板中較少需要，可用條件判斷替代

**實現難度：** ⭐⭐ (中等)
**預期工作量：** 2 小時

---

#### 11. @class() - 條件類名
**用途：** 動態生成 CSS 類名

**Laravel Blade 語法：**
```blade
<div @class([
  'btn',
  'btn-primary' => $isPrimary,
  'btn-large' => $isLarge,
  'btn-disabled' => $isDisabled
])>
```

**備註：** 可透過 JavaScript 或模板表達式實現

**實現難度：** ⭐⭐⭐ (較高)
**預期工作量：** 3-4 小時

---

#### 12. @json() - JSON 輸出
**用途：** 安全地輸出 JSON 資料到 JavaScript

**Laravel Blade 語法：**
```blade
<script>
  const user = @json($user);
  const config = @json($config, JSON_PRETTY_PRINT);
</script>
```

**備註：** 前端模板通常已有 JSON 資料，較少需要

**實現難度：** ⭐ (簡單)
**預期工作量：** 1 小時

---

## 📊 實現優先級總結

### 第一階段（核心功能）- 建議優先實現
1. **@forelse** - 空資料處理 ⭐⭐
2. **$loop 變數** - 迴圈元資訊 ⭐⭐⭐

**預估工作量：** 6-10 小時

---

### 第二階段（進階功能）- 提升開發體驗
3. **@stack/@push/@prepend** - 資源管理 ⭐⭐⭐⭐
4. **@once** - 防止重複 ⭐⭐
5. **@verbatim** - Vue/Alpine 整合 ⭐⭐
6. **@isset/@empty** - 變數檢查 ⭐⭐

**預估工作量：** 12-16 小時

---

### 第三階段（錦上添花）- 可選
7. **@includeIf/@includeWhen** - 條件 Include ⭐⭐⭐
8. **@for/@while** - 其他迴圈 ⭐⭐
9. **@continue/@break** - 迴圈控制 ⭐⭐
10. **@class()** - 條件類名 ⭐⭐⭐
11. **@json()** - JSON 輸出 ⭐

**預估工作量：** 12-15 小時

---

## 🚫 不適用於前端的功能（已排除）

以下是 Laravel Blade 的 Server-Side 專有功能，不適合在前端實現：

1. **@auth/@guest** - 需要 server-side session
2. **@can/@cannot** - 需要 server-side 權限系統
3. **@csrf/@method** - 需要 server-side CSRF token
4. **@env** - 需要 server-side 環境變數
5. **@production/@dd/@dump** - 開發工具，server-side 限定
6. **@component** - 已被 @slot 系統取代
7. **@lang/@choice** - 需要 server-side i18n 系統
8. **@inject** - 需要 server-side 依賴注入
9. **@php/@endphp** - 執行 PHP 代碼
10. **@include with data merging** - Server-side 資料合併邏輯

---

## 💡 實現建議

### 架構考量
1. **向後相容：** 確保新功能不破壞現有代碼
2. **錯誤處理：** 使用現有的錯誤處理系統
3. **效能：** 利用現有的 LRU Cache
4. **測試：** 每個新功能都需要完整測試

### 語法設計原則
1. 盡可能保持與 Laravel Blade 一致
2. 前端環境需要調整語法時，保持直觀易懂
3. 提供清晰的錯誤訊息和文檔

### 開發流程
1. 設計正則表達式和語法
2. 實現核心轉換邏輯
3. 整合錯誤處理
4. 編寫測試案例
5. 更新文檔

---

**文檔版本：** 1.0
**最後更新：** 2026-01-17
**維護者：** vite-plugin-html-kit
