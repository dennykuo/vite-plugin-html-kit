# Laravel Blade 功能實現狀態

本文檔記錄與 Laravel Blade 相比，vite-plugin-html-kit 的功能實現狀態。

## ✅ 已實現功能

### 1. 模板繼承
- ✅ `@extends('layout')` - 繼承佈局
- ✅ `@section('name')...@endsection` - 定義內容區塊（完整語法）
- ✅ `@section('name', 'content')` - 簡寫語法（單行內容）
- ✅ `@yield('name', 'default')` - 佔位符

### 2. 條件判斷
- ✅ `@if(condition)...@endif` - 條件判斷
- ✅ `@elseif(condition)` - 否則如果
- ✅ `@else` - 否則
- ✅ `@unless(condition)...@endunless` - 否定條件（等同於 @if(!condition)）
- ✅ `@switch/@case/@default/@endswitch` - Switch 語句

### 3. 迴圈
- ✅ `@foreach(items as item)...@endforeach` - 迴圈遍歷
- ✅ `@forelse(items as item)...@empty...@endforelse` - 帶空資料處理的迴圈
- ✅ 支援 JavaScript 風格：`@foreach(item of items)` 和 `@forelse(item of items)`

### 4. 組件系統
- ✅ `<include src="file.html">` - Include 外部文件
- ✅ `@include('file.html', { params })` - Blade 風格 include（轉換為自閉合標籤）
- ✅ `@slot('name')...@endslot` - 定義插槽內容（**只支援 `<include>` 標籤**）
- ✅ `@slot('name', 'default')` - 插槽佔位符（在組件中定義預設值）
- ✅ 屬性傳遞支援
- ⚠️ **限制：** `@include` 指令不支援 slot（會轉換成自閉合標籤 `<include ... />`）
- ✅ **Slot 只能配合 `<include>` 標籤使用**
- ✅ 完整示範：`playground/slot-demo.html`

### 5. 變數插值
- ✅ `{{ variable }}` - 變數輸出
- ✅ `{{ expression }}` - 表達式求值
- ✅ Lodash 工具函式支援（`_`）

### 6. Blade 註釋
- ✅ `{{-- 註釋 --}}` - Blade 註釋（不出現在 HTML 輸出中）
- ✅ 支援單行和多行註釋
- ✅ 在 transformLogicTags 階段移除

### 7. 防止重複輸出
- ✅ `@once...@endonce` - 防止重複輸出
- ✅ 使用內容 hash 識別唯一區塊
- ✅ 在 resolveIncludes 階段實現
- ✅ 支援嵌套 partial 和條件語法集成

### 8. 迴圈元資訊
- ✅ `loop` 變數 - 在 @foreach 和 @forelse 中自動提供
- ✅ `loop.index` - 當前索引（從 0 開始）
- ✅ `loop.iteration` - 當前迭代次數（從 1 開始）
- ✅ `loop.remaining` - 剩餘迭代次數
- ✅ `loop.count` - 陣列總數
- ✅ `loop.first` - 是否第一個元素
- ✅ `loop.last` - 是否最後一個元素
- ✅ `loop.even` - 是否偶數迭代
- ✅ `loop.odd` - 是否奇數迭代
- ✅ `loop.depth` - 嵌套深度（從 1 開始）
- ✅ `loop.parent` - 父迴圈的 loop 物件

### 9. Blade 風格的 Include
- ✅ `@include('file.html')` - Blade 風格的 include 語法
- ✅ `@include('file.html', { key: 'value' })` - 傳遞參數（JS 物件語法）
- ✅ `@include('file.html', ['key' => 'value'])` - 傳遞參數（PHP 陣列語法）
- ✅ 支援字串、數字、布林值、變數和陣列參數
- ✅ 與現有 `<include src="..." />` 語法完全共存
- ✅ 轉換為 `<include>` 標籤後在 resolveIncludes 階段處理

### 10. JSON 輸出
- ✅ `@json(expression)` - JSON 輸出語法
- ✅ `@json(expression, true)` - 格式化輸出（pretty print）
- ✅ 支援物件、陣列、變數和表達式
- ✅ 自動處理特殊字元轉義
- ✅ 可用於 script 標籤和 HTML 屬性

### 11. 變數檢查
- ✅ `@isset(variable)...@endisset` - 檢查變數是否定義且不為 null
- ✅ `@empty(variable)...@endempty` - 檢查變數是否為空
- ✅ 支援深層屬性訪問（如 `user.profile.name`）
- ✅ 支援檢查陣列、物件、字串的空值
- ✅ 空值定義：null, undefined, false, 0, '', [], {}

### 12. @verbatim - 跳過 Blade 解析
- ✅ `@verbatim...@endverbatim` - 保護區塊內的內容不被 Blade 處理
- ✅ 與 Vue.js、Alpine.js 等前端框架整合
- ✅ 保護 `{{ }}` 語法不被處理
- ✅ 保護 Blade 指令（@if、@foreach 等）不被轉換
- ✅ 支援多個 verbatim 區塊
- ✅ 支援多行內容和特殊字元

### 13. @stack/@push/@prepend - CSS/JS 資源管理
- ✅ `@stack('name')` - 定義資源堆疊位置
- ✅ `@push('name')...@endpush` - 推送內容到堆疊末尾
- ✅ `@prepend('name')...@endprepend` - 推送內容到堆疊開頭
- ✅ 支援多次 push/prepend 到同一個 stack
- ✅ 支援多層佈局繼承中的 stack 累積
- ✅ 正確處理 prepend 和 push 的順序
- ✅ 與其他 Blade 功能（@if、@foreach）整合

### 14. @includeIf/@includeWhen/@includeUnless/@includeFirst - 條件 Include
- ✅ `@includeIf('file.html')` - 只在檔案存在時 include
- ✅ `@includeWhen(condition, 'file.html')` - 條件為 true 時 include
- ✅ `@includeUnless(condition, 'file.html')` - 條件為 false 時 include
- ✅ `@includeFirst(['file1.html', 'file2.html'])` - include 第一個存在的檔案
- ✅ 支援傳遞參數 (`{ key: 'value' }` 或 `['key' => 'value']`)
- ✅ 檔案不存在時靜默失敗（不報錯）
- ✅ 支援路徑安全檢查
- ✅ 與其他 Blade 功能完全整合

---

## ❌ 未實現功能（前端適用）

### 🟢 低優先級（可替代或較少使用）

#### 1. @for/@while - 其他迴圈類型
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

#### 2. @continue/@break - 迴圈控制
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

#### 3. @class() - 條件類名
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

**文檔版本：** 1.2
**最後更新：** 2026-01-18
**維護者：** vite-plugin-html-kit
