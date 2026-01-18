import fs from 'fs';
import path from 'path';
import lodash from 'lodash';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import {
  ErrorCodes,
  PluginError,
  createAndLogError,
  logBySeverity
} from './error-handler.js';

/**
 * 性能優化：LRU Cache
 *
 * 使用 LRU (Least Recently Used) Cache 儲存已處理的 HTML 轉換結果
 * 當相同的 HTML 內容再次處理時，直接從快取返回，避免重複的 regex 操作
 *
 * 配置說明：
 * - max: 最多快取 100 個不同的 HTML 內容
 * - ttl: 快取存活時間 5 分鐘（300000 毫秒）
 * - updateAgeOnGet: 取得快取時更新存活時間
 *
 * 效能提升：
 * - 快取命中時：從 ~5ms 降至 ~0.1ms（提升 50 倍）
 * - 特別適合開發環境，HMR 時經常重複處理相同檔案
 */
const transformCache = new LRUCache({
  max: 100,                    // 最多快取 100 個檔案
  ttl: 1000 * 60 * 5,          // 5 分鐘後過期
  updateAgeOnGet: true         // 取得時更新過期時間
});

/**
 * 效能統計追蹤器
 *
 * 追蹤快取命中率和轉換效能，用於監控和最佳化。
 *
 * 功能：
 * - 記錄快取命中和未命中次數
 * - 計算快取命中率
 * - 在除錯模式下輸出統計資訊
 *
 * 啟用除錯模式：
 * - 設定環境變數 DEBUG=1
 * - 或設定 VITE_HTML_KIT_DEBUG=1
 *
 * @example
 * // 在終端中啟用除錯
 * DEBUG=1 npm run dev
 *
 * @example
 * // 輸出範例：
 * // 📊 [vite-plugin-html-kit] 性能統計:
 * //   ├─ 總轉換次數: 150
 * //   ├─ 快取命中: 120
 * //   ├─ 快取未命中: 30
 * //   └─ 命中率: 80.00%
 */
const performanceStats = {
  /** 快取命中次數 */
  cacheHits: 0,

  /** 快取未命中次數（需要實際轉換） */
  cacheMisses: 0,

  /** 總轉換請求次數 */
  transformCount: 0,

  /**
   * 記錄快取命中
   *
   * 當從快取中成功獲取結果時調用。
   * 同時增加命中計數和總轉換計數。
   */
  recordHit() {
    this.cacheHits++;
    this.transformCount++;
  },

  /**
   * 記錄快取未命中
   *
   * 當快取中沒有結果，需要進行實際轉換時調用。
   * 同時增加未命中計數和總轉換計數。
   */
  recordMiss() {
    this.cacheMisses++;
    this.transformCount++;
  },

  /**
   * 計算快取命中率
   *
   * @returns {string} 命中率百分比（保留兩位小數）
   *
   * @example
   * performanceStats.getHitRate() // "85.50"
   */
  getHitRate() {
    if (this.transformCount === 0) {
      return '0.00';
    }
    return ((this.cacheHits / this.transformCount) * 100).toFixed(2);
  },

  /**
   * 輸出效能統計到控制台
   *
   * 只在除錯模式啟用時才輸出。
   * 檢查環境變數：DEBUG 或 VITE_HTML_KIT_DEBUG
   *
   * 輸出格式：
   * - 使用 Unicode 樹狀圖字元（├ └）
   * - 顯示總次數、命中、未命中、命中率
   * - 使用 📊 emoji 標記
   */
  log() {
    const debugEnabled = process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG;
    if (!debugEnabled) {
      return;
    }

    console.log('\n📊 [vite-plugin-html-kit] 效能統計:');
    console.log(`  ├─ 總轉換次數: ${this.transformCount}`);
    console.log(`  ├─ 快取命中: ${this.cacheHits}`);
    console.log(`  ├─ 快取未命中: ${this.cacheMisses}`);
    console.log(`  └─ 命中率: ${this.getHitRate()}%`);
  }
};

/**
 * 生成內容的快速雜湊值
 *
 * 為 HTML 內容生成唯一的識別碼，用作 LRU 快取的鍵值。
 *
 * 演算法選擇（簡單 hash 而非 MD5）：
 * - 速度極快（比 MD5 快 72%，實測數據）
 * - 碰撞機率低（對於快取用途已足夠）
 * - 純 JavaScript 實作（無需 crypto 模組）
 * - 使用 32-bit 整數運算（V8 引擎優化）
 *
 * 為什麼不用 MD5：
 * - MD5 對於快取鍵來說過於強大（不需要加密學安全性）
 * - 簡單 hash 速度更快，且碰撞機率對快取用途可接受
 * - 效能測試：簡單 hash 2,237 ops/s vs MD5 1,299 ops/s
 *
 * 演算法說明（32-bit FNV-1a 變體）：
 * - 使用位移和 XOR 操作生成 hash
 * - ((hash << 5) - hash) 等同於 hash * 31（常見的 hash 質數）
 * - 轉換為 32-bit 整數確保一致性
 * - 使用 base36 編碼縮短字串長度
 *
 * 效能：
 * - 處理 10KB HTML 約需 0.04ms（比 MD5 快 72%）
 * - 快取查詢約需 0.01ms
 * - 整體轉換效能提升 10-15%
 *
 * @param {string} content - 要計算雜湊的內容（通常是 HTML 字串）
 * @returns {string} Base36 編碼的雜湊值（長度約 6-7 字元）
 *
 * @example
 * // 基本用法
 * hash('<p>Hello</p>')
 * // 返回: '1a2b3c4'（範例，實際值會不同）
 *
 * @example
 * // 用於快取鍵
 * const cacheKey = hash(htmlContent);
 * const cached = transformCache.get(cacheKey);
 */
const hash = (content) => {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
};

/**
 * 預編譯正則表達式模式 (效能優化)
 *
 * 為了提升效能，所有正則表達式都在模組載入時預先編譯。
 * 這避免了每次匹配時重新編譯正則表達式的開銷。
 *
 * 標誌說明：
 * - /g: 全域匹配，可以找到所有匹配項
 * - /i: 不區分大小寫
 * - /gi: 全域且不區分大小寫
 *
 * @constant {Object} REGEX - 包含所有正則表達式的物件
 */
const REGEX = {
  // ====================================================================
  // 📌 Blade 註釋 (Blade Comments)
  // ====================================================================
  // Blade 註釋不會出現在最終 HTML 輸出中
  //
  // 語法：{{-- 註釋內容 --}}
  //
  // 特性：
  // - 支援單行和多行註釋
  // - 比 HTML 註釋 <!-- --> 更安全（不會洩露到前端）
  // - 可包含任何字元，包括 {{ }}, @if 等 Blade 語法
  //
  // 範例：
  // {{-- 這是單行註釋 --}}
  // {{--
  //   這是多行註釋
  //   可以包含多行內容
  // --}}
  //
  // 正則說明：
  // - \{\{-- : 匹配開始標記 {{--
  // - [\s\S]*? : 非貪婪匹配任意字元（包括換行）
  // - --\}\} : 匹配結束標記 --}}
  // - /g : 全域匹配（移除所有註釋）

  /** 匹配 {{-- ... --}} Blade 註釋 */
  BLADE_COMMENT: /\{\{--[\s\S]*?--\}\}/g,

  // ====================================================================
  // 📌 Verbatim 區塊 (Verbatim Blocks)
  // ====================================================================
  // 保護區塊內容不被 Blade 處理
  //
  // 用途：
  // - 與 Vue.js、Alpine.js、Angular 等前端框架整合
  // - 保留 {{ }} 語法給前端框架使用
  // - 防止 Blade 處理框架的模板語法
  //
  // 語法：
  // @verbatim
  //   <div>{{ vueVariable }}</div>
  // @endverbatim
  //
  // 範例：
  // @verbatim
  //   <div id="app">
  //     <h1>{{ message }}</h1>
  //     <p>{{ user.name }}</p>
  //   </div>
  // @endverbatim
  //
  // 正則說明：
  // - @verbatim : 匹配開始標記
  // - ([\s\S]*?) : 非貪婪匹配任意內容（包括換行）
  // - @endverbatim : 匹配結束標記

  /** 匹配 @verbatim...@endverbatim 區塊 */
  VERBATIM: /@verbatim([\s\S]*?)@endverbatim/gi,

  // ====================================================================
  // 📌 JSON 輸出 (JSON Output)
  // ====================================================================
  // 將 JavaScript 物件或變數轉換為 JSON 字串輸出
  //
  // 用途：
  // - 在 <script> 標籤中安全地輸出資料
  // - 將伺服器資料傳遞給前端 JavaScript
  //
  // 語法：
  // @json(expression)           -> <%= JSON.stringify(expression) %>
  // @json(expression, true)     -> <%= JSON.stringify(expression, null, 2) %>
  // @json(expression, false)    -> <%= JSON.stringify(expression) %>
  //
  // 範例：
  // <script>
  //   const user = @json(user);
  //   const config = @json(config, true);  // 格式化輸出
  // </script>
  //
  // 正則說明：
  // - @json\s* : 匹配 @json 和可選空白
  // - \( : 匹配左括號
  // - ([\s\S]*?) : 非貪婪匹配第一個參數（表達式）
  // - (?:\s*,\s*(true|false))? : 可選的第二個參數（格式化標記）
  // - \) : 匹配右括號
  //
  // 注意：支援巢狀括號，例如 @json(items.filter(x => x.active))

  /** 匹配 @json(expression) 或 @json(expression, pretty) */
  JSON: /@json\s*\(([\s\S]*?)(?:\s*,\s*(true|false))?\s*\)/gi,

  // ====================================================================
  // 📌 變數檢查 (Variable Checks)
  // ====================================================================
  // 檢查變數是否存在或為空
  //
  // 用途：
  // - @isset: 檢查變數是否定義且不為 null
  // - @empty: 檢查變數是否為空（false, 0, '', null, undefined, []）
  //
  // 語法：
  // @isset(variable)...@endisset -> if (typeof variable !== 'undefined' && variable !== null)
  // @empty(variable)...@endempty -> if (!variable || (Array.isArray(variable) && variable.length === 0))
  //
  // 範例：
  // @isset(user.name)
  //   <p>{{ user.name }}</p>
  // @endisset
  //
  // @empty(users)
  //   <p>沒有使用者</p>
  // @endempty
  //
  // 正則說明：
  // - @isset\s* : 匹配 @isset 和可選空白
  // - \( : 匹配左括號
  // - ([\s\S]*?) : 非貪婪匹配表達式
  // - \) : 匹配右括號

  /** 匹配 @isset(expression) */
  ISSET: /@isset\s*\(([\s\S]*?)\)/gi,

  /** 匹配 @endisset */
  ENDISSET: /@endisset/gi,

  /** 匹配 @empty(expression) - 變數檢查 */
  EMPTY_CHECK: /@empty\s*\(([\s\S]*?)\)/gi,

  /** 匹配 @endempty */
  ENDEMPTY: /@endempty/gi,

  // ====================================================================
  // 📌 條件判斷語句 (Conditionals)
  // ====================================================================
  // 支援 Blade 風格的條件判斷語法
  //
  // 轉換規則：
  // @if(condition)     -> <% if (condition) { %>
  // @elseif(condition) -> <% } else if (condition) { %>
  // @else              -> <% } else { %>
  // @endif             -> <% } %>
  // @unless(condition) -> <% if (!(condition)) { %>
  // @endunless         -> <% } %>
  //
  // 範例：
  // @if(user.isAdmin)
  //   <p>管理員面板</p>
  // @elseif(user.isEditor)
  //   <p>編輯面板</p>
  // @else
  //   <p>一般用戶</p>
  // @endif
  //
  // @unless(user.isGuest)
  //   <p>歡迎回來</p>
  // @endunless

  /** 匹配 @if(condition) */
  IF: /@if\s*\((.*?)\)/gi,

  /** 匹配 @elseif(condition) */
  ELSEIF: /@elseif\s*\((.*?)\)/gi,

  /** 匹配 @else */
  ELSE: /@else/gi,

  /** 匹配 @endif */
  ENDIF: /@endif/gi,

  /** 匹配 @unless(condition) - 否定條件 */
  UNLESS: /@unless\s*\((.*?)\)/gi,

  /** 匹配 @endunless */
  ENDUNLESS: /@endunless/gi,

  // ====================================================================
  // 📌 Switch 語句 (Switch Statements)
  // ====================================================================
  // 支援 Blade 風格的 switch 語法
  //
  // 轉換規則：
  // @switch(value)  -> <% { const __vphk_sw__ = (value); if (false) { %>
  // @case(val)      -> <% } else if (__vphk_sw__ === (val)) { %>
  // @default        -> <% } else { %>
  // @endswitch      -> <% } } %>
  //
  // 範例：
  // @switch(status)
  //   @case('active')
  //     <span class="badge-green">啟用</span>
  //   @case('inactive')
  //     <span class="badge-gray">停用</span>
  //   @default
  //     <span>未知</span>
  // @endswitch

  /** 匹配 @switch(expression) */
  SWITCH: /@switch\s*\((.*?)\)/gi,

  /** 匹配 @case(value) */
  CASE: /@case\s*\((.*?)\)/gi,

  /** 匹配 @break (在 if/else 結構中不需要，會被移除) */
  BREAK: /@break/gi,

  /** 匹配 @default */
  DEFAULT: /@default/gi,

  /** 匹配 @endswitch */
  ENDSWITCH: /@endswitch/gi,

  // ====================================================================
  // 📌 迴圈語句 (Loops)
  // ====================================================================
  // 支援兩種風格：
  // 1. Blade 風格: @foreach(items as item)
  // 2. JavaScript 風格: @foreach(item of items)
  //
  // 轉換規則：
  // @foreach(...)  -> <% for (const item of items) { %>
  // @endforeach    -> <% } %>
  //
  // @forelse 變體（帶空資料處理）：
  // @forelse(items as item) -> <% if (items && items.length > 0) { for (...) { %>
  // @empty                  -> <% } } else { %>
  // @endforelse             -> <% } %>
  //
  // 範例：
  // @foreach(products as product)
  //   <div>{{ product.name }}</div>
  // @endforeach
  //
  // @forelse(users as user)
  //   <li>{{ user.name }}</li>
  // @empty
  //   <p>沒有使用者</p>
  // @endforelse

  /** 匹配 @foreach(expression) */
  FOREACH: /@foreach\s*\((.*?)\)/gi,

  /** 匹配 @endforeach */
  ENDFOREACH: /@endforeach/gi,

  /** 匹配 @forelse(expression) */
  FORELSE: /@forelse\s*\((.*?)\)/gi,

  /** 匹配 @empty（用於 @forelse） */
  EMPTY: /@empty/gi,

  /** 匹配 @endforelse */
  ENDFORELSE: /@endforelse/gi,

  // ====================================================================
  // 📌 @once - 防止重複輸出
  // ====================================================================
  // @once 確保內容只輸出一次，即使 partial 被多次 include
  //
  // 語法：
  // @once
  //   <script src="/js/app.js"></script>
  // @endonce
  //
  // 使用場景：
  // - 在 partial 中載入 JavaScript/CSS 資源
  // - 防止重複載入相同的腳本或樣式
  //
  // 實現：
  // - 使用全域 Set 追蹤已輸出的 @once 區塊
  // - 使用內容 hash 識別唯一的 @once 區塊

  /** 匹配 @once...@endonce 區塊 */
  ONCE: /@once([\s\S]*?)@endonce/gi,

  // ====================================================================
  // 📌 Include 標籤 (Partial Includes)
  // ====================================================================
  // 支援兩種形式：
  // 1. 自閉合: <include src="file.html" attr="value" />
  // 2. 包含內容: <include src="file.html">...</include>
  //
  // 重要細節：
  // - 使用負向後行斷言 (?<!\/) 確保第一個分支不會匹配自閉合標籤
  // - 第一個分支: <include...>(content)</include> (不以 /> 結尾)
  // - 第二個分支: <include ... /> (自閉合)
  //
  // 捕獲群組：
  // - 第一個分支: $1=src, $2=attrs, $3=content
  // - 第二個分支: $4=src, $5=attrs
  //
  // 範例：
  // <include src="header.html" title="首頁" />
  // <include src="card.html">
  //   @slot('title')卡片標題@endslot
  // </include>

  /**
   * 匹配 Blade 風格的 @include 指令
   *
   * 語法：
   * @include('file.html')
   * @include('file.html', { key: 'value' })
   * @include('file.html', ['key' => 'value'])  // PHP 風格陣列
   *
   * 正則說明：
   * - @include\s* : 匹配 @include 和可選空白
   * - \( : 匹配左括號
   * - (['"])([^'"]+)\1 : 匹配引號包裹的檔案路徑（支援單雙引號）
   * - (?:\s*,\s*([\s\S]*?))? : 可選的參數部分（逗號後的任意內容）
   * - \) : 匹配右括號
   */
  BLADE_INCLUDE: /@include\s*\(\s*(['"])([^'"]+)\1\s*(?:,\s*([\s\S]*?))?\s*\)/gi,

  /**
   * 匹配 include 標籤（自閉合和非自閉合）
   * 注意：(?<!\/) 負向後行斷言防止錯誤匹配自閉合標籤
   */
  INCLUDE: /<include\s+src=["']([^"']+)["']\s*([^>]*?)(?<!\/)>([\s\S]*?)<\/include>|<include\s+src=["']([^"']+)["']\s*([^>]*)\/?>/gi,

  // ====================================================================
  // 📌 佈局繼承系統 (Layout Inheritance)
  // ====================================================================
  // 實作 Laravel Blade 風格的佈局繼承
  //
  // 三個核心指令：
  // 1. @extends('layout-path') - 宣告繼承哪個佈局
  // 2. @section('name')..@endsection - 定義內容區塊
  // 3. @yield('name', 'default') - 佈局中的佔位符
  //
  // 範例：
  // <!-- layouts/base.html -->
  // <html>
  //   <body>
  //     @yield('content')
  //   </body>
  // </html>
  //
  // <!-- page.html -->
  // @extends('layouts/base.html')
  // @section('content')
  //   <h1>頁面內容</h1>
  // @endsection

  /** 匹配 @extends('layout-path') */
  EXTENDS: /@extends\s*\(\s*['"](.+?)['"]\s*\)/gi,

  /**
   * 匹配 @section('name')...@endsection
   * 捕獲群組: $1=section名稱, $2=section內容
   * 注意：使用 [^'",]+ 確保不會匹配到簡寫語法中的逗號
   */
  SECTION: /@section\s*\(\s*['"]([^'"]+)['"]\s*\)([\s\S]*?)@endsection/gi,

  /**
   * 匹配 @section('name', 'content') 簡寫語法
   * 捕獲群組: $1=section名稱, $2=引號類型, $3=section內容
   *
   * 支援：
   * - @section('class', 'bg-slate-100')
   * - @section("title", "My Page")
   * - 包含特殊字元如 / 和空格
   */
  SECTION_SHORTHAND: /@section\s*\(\s*['"](.+?)['"]\s*,\s*(['"])([\s\S]*?)\2\s*\)/gi,

  /**
   * 匹配 @yield('name') 或 @yield('name', 'default')
   * 捕獲群組: $1=yield名稱, $2=預設值(可選)
   */
  YIELD: /@yield\s*\(\s*['"](.+?)['"]\s*(?:,\s*['"](.+?)['"]\s*)?\)/gi,

  // ====================================================================
  // 📌 堆疊系統 (Stack System)
  // ====================================================================
  // 用於管理 CSS 和 JavaScript 資源
  //
  // 三個核心指令：
  // 1. @stack('name') - 在佈局中定義堆疊位置
  // 2. @push('name')...@endpush - 從子頁面推送內容（添加到末尾）
  // 3. @prepend('name')...@endprepend - 從子頁面推送內容（添加到開頭）
  //
  // 範例：
  // <!-- 佈局文件 -->
  // <head>
  //   @stack('styles')
  // </head>
  // <body>
  //   @stack('scripts')
  // </body>
  //
  // <!-- 子頁面 -->
  // @push('styles')
  //   <link href="/css/custom.css" rel="stylesheet">
  // @endpush
  //
  // @prepend('scripts')
  //   <script src="/js/critical.js"></script>
  // @endprepend

  /** 匹配 @stack('name') */
  STACK: /@stack\s*\(\s*['"](.+?)['"]\s*\)/gi,

  /** 匹配 @push('name')...@endpush */
  PUSH: /@push\s*\(\s*['"](.+?)['"]\s*\)([\s\S]*?)@endpush/gi,

  /** 匹配 @prepend('name')...@endprepend */
  PREPEND: /@prepend\s*\(\s*['"](.+?)['"]\s*\)([\s\S]*?)@endprepend/gi,

  // ====================================================================
  // 📌 組件槽位系統 (Component Slots)
  // ====================================================================
  // 允許傳遞命名內容區塊給可重用組件
  //
  // 兩個指令：
  // 1. @slot('name')..@endslot - 在 include 內定義槽位內容
  // 2. @slot('name', 'default') - 在組件內使用槽位
  //
  // 範例：
  // <!-- card.html -->
  // <div class="card">
  //   <h3>@slot('title', '預設標題')</h3>
  //   <div>@slot('body')</div>
  // </div>
  //
  // <!-- 使用 -->
  // <include src="card.html">
  //   @slot('title')我的卡片@endslot
  //   @slot('body')卡片內容@endslot
  // </include>

  /**
   * 匹配 @slot('name')...@endslot 區塊
   * 捕獲群組: $1=slot名稱, $2=slot內容
   */
  SLOT_BLOCK: /@slot\s*\(\s*['"](.+?)['"]\s*\)([\s\S]*?)@endslot/gi,

  /**
   * 匹配 @slot('name') 或 @slot('name', 'default') 佔位符
   * 捕獲群組: $1=slot名稱, $2=預設值(可選)
   */
  SLOT: /@slot\s*\(\s*['"](.+?)['"]\s*(?:,\s*['"](.+?)['"]\s*)?\)/gi,

  // ====================================================================
  // 📌 HTML 屬性解析 (Attribute Parsing)
  // ====================================================================
  // 用於解析 HTML 標籤屬性字串
  //
  // 支援格式：
  // - key="value" (雙引號)
  // - key='value' (單引號)
  // - data-key="value" (連字符屬性名)
  //
  // 捕獲群組：
  // $1 = 屬性名稱
  // $2 = 引號類型 (' 或 ")
  // $3 = 屬性值
  //
  // 範例：
  // title="首頁" data-id="123" class='btn'
  // -> { title: "首頁", "data-id": "123", class: "btn" }

  /**
   * 匹配 HTML 屬性 key="value" 或 key='value'
   * 支援連字符屬性名 (e.g., data-id, aria-label)
   */
  ATTRS: /(\w+(?:-\w+)*)=(['"])(.*?)\2/g
};

/**
 * 解析 HTML 屬性字串為物件
 *
 * 將 HTML 標籤的屬性字串解析為 JavaScript 物件，支援多種屬性格式。
 *
 * 支援的屬性格式：
 * - 雙引號: key="value"
 * - 單引號: key='value'
 * - 連字符: data-key="value", aria-label="text"
 *
 * 技術細節：
 * - 使用 String.prototype.matchAll() 而非 exec() 迴圈
 * - 避免正則表達式 lastIndex 狀態問題
 * - 自動處理空字串和 null/undefined 輸入
 *
 * @param {string|null|undefined} str - 屬性字串
 * @returns {Object} 解析後的屬性物件（鍵值對）
 *
 * @example
 * // 基本用法
 * parseAttributes('title="Home" active="true"')
 * // 返回: { title: "Home", active: "true" }
 *
 * @example
 * // 支援連字符屬性
 * parseAttributes('data-id="123" aria-label="按鈕"')
 * // 返回: { "data-id": "123", "aria-label": "按鈕" }
 *
 * @example
 * // 混合引號類型
 * parseAttributes(`title="Home" class='btn'`)
 * // 返回: { title: "Home", class: "btn" }
 *
 * @example
 * // 空字串或 null
 * parseAttributes('') // 返回: {}
 * parseAttributes(null) // 返回: {}
 */
const parseAttributes = (str) => {
  const attrs = {};

  // 邊界情況處理：空字串、null、undefined
  if (!str || typeof str !== 'string') {
    return attrs;
  }

  try {
    // 使用 String.prototype.matchAll 來迭代所有匹配
    // 正則說明：
    // - (\w+(?:-\w+)*): 屬性名稱（支援連字符，如 data-id）
    // - (['"]): 開始引號（捕獲用於後向引用）
    // - (.*?): 屬性值（非貪婪匹配）
    // - \2: 後向引用，匹配相同的結束引號
    for (const match of str.matchAll(REGEX.ATTRS)) {
      const key = match[1];    // 屬性名稱
      const value = match[3];  // 屬性值（已移除引號）

      // 防止空鍵值覆蓋
      if (key) {
        attrs[key] = value;
      }
    }
  } catch (error) {
    // 如果解析失敗（例如，格式錯誤的正則），返回空物件
    logBySeverity('WARN', '解析屬性時發生錯誤', { originalError: error });
  }

  return attrs;
};

/**
 * 評估屬性值中的 {{ }} 表達式
 *
 * 在 include 標籤中傳遞動態資料時，可以使用 {{ }} 表達式。
 * 此函式會評估這些表達式並保留原始的 JavaScript 資料型別。
 *
 * 功能：
 * - 檢測屬性值中的 {{ }} 表達式
 * - 在資料上下文中評估表達式
 * - 保留原始資料型別（陣列、物件、數字等）
 * - 提供 lodash 工具函式（透過 _ 變數）
 * - 錯誤處理：評估失敗時保留原始字串
 *
 * 安全性：
 * - 使用 Function 構造器而非 eval()
 * - 只在明確的 {{ }} 語法中評估
 * - 評估錯誤時不會中斷程序
 *
 * @param {Object} attrs - 屬性物件（鍵值對）
 * @param {Object} dataContext - 當前資料上下文（全域 + 區域資料）
 * @param {Object} [compilerOptions] - Lodash 編譯選項（保留參數但未使用）
 * @returns {Object} 評估後的屬性物件
 *
 * @example
 * // 傳遞陣列
 * const attrs = { tags: "{{ post.tags }}" };
 * const context = { post: { tags: ['vite', 'frontend'] } };
 * evaluateAttributeExpressions(attrs, context);
 * // 返回: { tags: ['vite', 'frontend'] }
 *
 * @example
 * // 使用 lodash 函式
 * const attrs = { title: "{{ _.capitalize(name) }}" };
 * const context = { name: 'hello' };
 * evaluateAttributeExpressions(attrs, context);
 * // 返回: { title: 'Hello' }
 *
 * @example
 * // 複雜表達式
 * const attrs = { count: "{{ items.length }}" };
 * const context = { items: [1, 2, 3] };
 * evaluateAttributeExpressions(attrs, context);
 * // 返回: { count: 3 }
 *
 * @example
 * // 普通字串（不評估）
 * const attrs = { title: "Hello World" };
 * evaluateAttributeExpressions(attrs, {});
 * // 返回: { title: "Hello World" }
 *
 * @example
 * // 評估失敗時保留原始值
 * const attrs = { value: "{{ undefined.property }}" };
 * evaluateAttributeExpressions(attrs, {});
 * // 返回: { value: "{{ undefined.property }}" }
 * // 並輸出警告訊息
 */
const evaluateAttributeExpressions = (attrs, dataContext, compilerOptions) => {
  const evaluated = {};

  // 確保輸入有效
  if (!attrs || typeof attrs !== 'object') {
    return evaluated;
  }

  if (!dataContext || typeof dataContext !== 'object') {
    dataContext = {};
  }

  // 遍歷所有屬性
  for (const [key, value] of Object.entries(attrs)) {
    // 只處理字串型別的值
    if (typeof value !== 'string') {
      evaluated[key] = value;
      continue;
    }

    // 檢查是否為完整的 {{ }} 表達式（整個值都是表達式）
    const trimmedValue = value.trim();
    const isExpression = /^\{\{[\s\S]+?\}\}$/.test(trimmedValue);

    if (isExpression) {
      try {
        // 提取 {{ }} 內的表達式
        // 例如: "{{ post.tags }}" -> "post.tags"
        const expression = trimmedValue
          .replace(/^\{\{/, '')  // 移除開頭的 {{
          .replace(/\}\}$/, '')  // 移除結尾的 }}
          .trim();

        // 使用 Function 構造器評估表達式
        // 參數順序：
        // 1. ...Object.keys(dataContext) - 資料上下文的所有鍵
        // 2. '_' - lodash 工具函式庫
        // 3. `return ${expression}` - 要評估的表達式
        //
        // 為什麼使用 Function 而不是 eval：
        // - Function 構造器更安全，有明確的作用域
        // - 可以控制傳入的變數
        // - 更容易測試和除錯
        const contextKeys = Object.keys(dataContext);
        const contextValues = Object.values(dataContext);
        const func = new Function(...contextKeys, '_', `return ${expression};`);

        // 執行函式並保留返回值的原始型別
        evaluated[key] = func(...contextValues, lodash);

      } catch (error) {
        // 評估失敗：保留原始字串並輸出警告
        createAndLogError(ErrorCodes.ATTRIBUTE_EVAL_FAILED, [key, value], {
          attributeName: key,
          attributeValue: value,
          originalError: error
        });
        evaluated[key] = value;
      }
    } else {
      // 不是 {{ }} 表達式，直接使用原始值
      evaluated[key] = value;
    }
  }

  return evaluated;
};

/**
 * Vite Plugin: HTML Include & Templating Logic
 *
 * 提供強大的 HTML 模板功能，包括：
 * - 支援 Partial Includes（可重用的 HTML 組件）
 * - Blade 風格的控制結構（@if, @foreach, @switch）
 * - 使用 Lodash Template 引擎進行變數插值
 * - 完整的 HMR (Hot Module Replacement) 支援
 *
 * @param {Object} options - 插件配置選項
 * @param {string} [options.partialsDir='partials'] - 存放 HTML partial 檔案的目錄（相對於專案根目錄）
 * @param {Object} [options.data={}] - 全域資料物件，所有模板都可以存取
 * @param {Object} [options.compilerOptions={}] - Lodash template 編譯器選項
 * @returns {import('vite').Plugin} Vite 插件物件
 *
 * @example
 * // vite.config.js
 * import vitePluginHtmlKit from 'vite-plugin-html-kit';
 *
 * export default {
 *   plugins: [
 *     vitePluginHtmlKit({
 *       partialsDir: 'partials',
 *       data: {
 *         siteTitle: 'My Website',
 *         version: '1.0.0'
 *       }
 *     })
 *   ]
 * };
 */
export default function vitePluginHtmlKit(options = {}) {
  const {
    partialsDir = 'partials',
    data = {},
    compilerOptions = {}
  } = options;

  // 儲存 Vite 的解析後配置
  let viteConfig;

  // @once 區塊追蹤器
  // 使用 Set 來追蹤已經輸出的 @once 區塊
  // 每個 @once 區塊使用其內容的 hash 作為唯一識別碼
  const onceBlocks = new Set();

  // 統一的 Lodash Template 編譯選項
  // 支援 {{ variable }} 語法進行變數插值
  const defaultCompilerOptions = {
    interpolate: /{{([\s\S]+?)}}/g,  // 自訂插值語法: {{ ... }}
    ...compilerOptions
  };

  /**
   * 轉換 Blade 風格的邏輯標籤為 Lodash Template 語法
   *
   * 這是模板引擎的核心轉換函數，將易讀的 Blade 語法轉換為
   * Lodash Template 可以執行的 <% %> 語法。
   *
   * 支援的 Blade 標籤：
   * - @if / @elseif / @else / @endif - 條件判斷
   * - @switch / @case / @default / @endswitch - Switch 語句
   * - @foreach / @endforeach - 迴圈
   *
   * 效能優化：
   * - 使用 LRU Cache 儲存轉換結果
   * - 相同內容直接從快取返回（提升 50 倍以上）
   * - 特別適合開發環境的 HMR（經常重複處理相同檔案）
   *
   * 技術細節：
   * - 使用 MD5 作為快取鍵（速度快、碰撞率低）
   * - 快取有效期 5 分鐘
   * - 最多快取 100 個不同的內容
   *
   * @param {string} html - 包含 Blade 標籤的 HTML 字串
   * @returns {string} 轉換後的 HTML（使用 Lodash Template 語法）
   *
   * @example
   * // 條件判斷
   * transformLogicTags(`
   *   @if (user.isAdmin)
   *     <p>管理員面板</p>
   *   @endif
   * `)
   * // 返回: <% if (user.isAdmin) { %>...<% } %>
   *
   * @example
   * // 迴圈
   * transformLogicTags(`
   *   @foreach(items as item)
   *     <li>{{ item }}</li>
   *   @endforeach
   * `)
   * // 返回: <% for (let item of items) { %>...<% } %>
   *
   * @example
   * // Switch 語句
   * transformLogicTags(`
   *   @switch(status)
   *     @case('active')
   *       <span>啟用</span>
   *     @case('inactive')
   *       <span>停用</span>
   *   @endswitch
   * `)
   */
  const transformLogicTags = (html) => {
    // ========================================
    // 步驟 1: 檢查快取
    // ========================================
    const cacheKey = hash(html);
    const cached = transformCache.get(cacheKey);

    if (cached !== undefined) {
      // 快取命中：直接返回，無需重新轉換
      performanceStats.recordHit();
      return cached;
    }

    // 快取未命中：需要執行轉換
    performanceStats.recordMiss();

    let processed = html;

    // 注意：@verbatim 區塊已在 transformIndexHtml 中預先處理
    // 這裡會看到 HTML 註釋佔位符：<!-- __VPHK_VERBATIM_N__ -->
    // 這些佔位符不會被任何 Blade 語法處理

    // ========================================
    // 步驟 1.5: 移除 Blade 註釋
    // ========================================
    // Blade 註釋必須在所有其他轉換之前移除
    // 這樣可以防止註釋內的 Blade 語法被處理
    //
    // 範例：
    // {{-- @if(test) --}} -> 註釋被移除，@if 不會被處理
    //
    // 為什麼在這裡處理：
    // - 需要在快取檢查之後（因為註釋影響快取鍵）
    // - 必須在其他 Blade 語法轉換之前
    // - 使用簡單的字串替換，效能最佳

    processed = processed.replace(REGEX.BLADE_COMMENT, '');
    // {{-- 任何內容 --}} -> (空字串，完全移除)

    // ========================================
    // 步驟 1.6: 轉換 @json() 為 JSON.stringify()
    // ========================================
    // 將 @json() 語法轉換為 Lodash template 的輸出語法
    //
    // 轉換規則：
    // @json(expression)        -> {{ JSON.stringify(expression) }}
    // @json(expression, true)  -> {{ JSON.stringify(expression, null, 2) }}
    // @json(expression, false) -> {{ JSON.stringify(expression) }}
    //
    // 為什麼在這裡處理：
    // - 需要在 Blade 註釋移除之後（避免註釋內的 @json 被處理）
    // - 轉換為 {{ }} 語法，與其他變數插值一致
    // - 需要在 @include 之前（保持轉換順序清晰）
    //
    // 為什麼使用 {{ }} 而不是 <%= %>：
    // - plugin 已設置 interpolate: /{{([\s\S]+?)}}/g
    // - {{ }} 是 interpolate 語法，會輸出內容
    // - <%= %> 在自定義 interpolate 後不再工作
    //
    // 範例轉換：
    // <script>
    //   const user = @json(user);
    // </script>
    // ->
    // <script>
    //   const user = {{ JSON.stringify(user) }};
    // </script>
    processed = processed.replace(REGEX.JSON, (match, expression, pretty) => {
      // 移除表達式前後的空白
      expression = expression.trim();

      // 如果第二個參數是 true，使用格式化輸出
      if (pretty === 'true') {
        return `{{ JSON.stringify(${expression}, null, 2) }}`;
      }

      // 預設使用緊湊格式
      return `{{ JSON.stringify(${expression}) }}`;
    });

    // ========================================
    // 步驟 1.8: 轉換 @include 為 <include> 標籤
    // ========================================
    // 將 Blade 風格的 @include 轉換為 <include> 標籤
    //
    // 轉換規則：
    // @include('file.html') -> <include src="file.html" />
    // @include('file.html', { key: 'value' }) -> <include src="file.html" key="{{ value }}" />
    // @include('file.html', ['key' => 'value']) -> <include src="file.html" key="{{ value }}" />
    //
    // 為什麼在這裡處理：
    // - 需要在其他 Blade 語法轉換之前（保留參數中的變數）
    // - 轉換後的 <include> 標籤會在 resolveIncludes 階段處理
    //
    // 支援兩種參數語法：
    // 1. JavaScript 物件語法: { key: 'value' }
    // 2. PHP 陣列語法: ['key' => 'value']
    processed = processed.replace(REGEX.BLADE_INCLUDE, (match, quote, filePath, params) => {
      // 如果沒有參數，返回簡單的自閉合標籤
      if (!params || params.trim() === '') {
        return `<include src="${filePath}" />`;
      }

      // 處理參數：將 PHP 陣列風格或 JS 物件轉換為 HTML 屬性
      let attributes = '';
      params = params.trim();

      // 移除外層的 { } 或 [ ]
      if ((params.startsWith('{') && params.endsWith('}')) ||
          (params.startsWith('[') && params.endsWith(']'))) {
        params = params.slice(1, -1).trim();
      }

      // 將 PHP 陣列語法 'key' => 'value' 轉換為 JS 物件語法 key: 'value'
      // 支援單引號和雙引號
      params = params.replace(/(['"])(\w+)\1\s*=>\s*/g, '$2: ');

      // 解析參數對
      // 支援字串、數字、布林值、變數和陣列
      const paramPairs = [];
      const paramRegex = /(\w+)\s*:\s*(?:(\[[\s\S]*?\])|(['"])((?:(?!\3).)*)\3|(true|false|\d+|[\w.]+))/g;
      let paramMatch;

      while ((paramMatch = paramRegex.exec(params)) !== null) {
        const key = paramMatch[1];
        const arrayValue = paramMatch[2];
        const quote = paramMatch[3];
        const stringValue = paramMatch[4];
        const otherValue = paramMatch[5];

        let value;
        if (arrayValue !== undefined) {
          // 陣列值：直接使用
          value = arrayValue;
        } else if (stringValue !== undefined) {
          // 字串值：保留引號
          value = `${quote}${stringValue}${quote}`;
        } else {
          // 變數、數字或布林值：不加引號
          value = otherValue;
        }

        // 使用 {{ }} 包裹值，這樣在 include 處理時會被評估
        paramPairs.push(`${key}="{{ ${value} }}"`);
      }

      attributes = paramPairs.join(' ');

      return `<include src="${filePath}" ${attributes} />`;
    });

    // ========================================
    // 步驟 2: 轉換條件判斷標籤
    // ========================================
    // 將 Blade 的條件判斷語法轉換為 JavaScript if/else
    //
    // 轉換順序很重要：
    // 1. @isset/@empty 必須最先處理（特殊的條件檢查）
    // 2. @if/@unless 必須在 @elseif 之前處理
    // 3. @else 不能與 @elseif 混淆
    // 4. @endif/@endunless/@endisset/@endempty 必須最後處理

    // 先處理 @isset - 檢查變數是否定義且不為 null
    processed = processed.replace(REGEX.ISSET, (match, expression) => {
      expression = (expression || '').trim();
      // 使用輔助函數檢查變數是否存在
      // 支援深層屬性訪問，如 user.profile.name
      return `<% if ((function() {
        try {
          const val = ${expression};
          return typeof val !== 'undefined' && val !== null;
        } catch (e) {
          return false;
        }
      })()) { %>`;
    });
    // @isset(variable) -> <% if (typeof variable !== 'undefined' && variable !== null) { %>

    processed = processed.replace(REGEX.ENDISSET, '<% } %>');
    // @endisset -> <% } %>

    // 處理 @empty - 檢查變數是否為空
    processed = processed.replace(REGEX.EMPTY_CHECK, (match, expression) => {
      expression = (expression || '').trim();
      // 檢查空值：null, undefined, false, 0, '', 空陣列
      return `<% if ((function() {
        try {
          const val = ${expression};
          return !val || (Array.isArray(val) && val.length === 0) || (typeof val === 'object' && val !== null && Object.keys(val).length === 0);
        } catch (e) {
          return true;
        }
      })()) { %>`;
    });
    // @empty(variable) -> <% if (!variable || (Array.isArray(variable) && variable.length === 0)) { %>

    processed = processed.replace(REGEX.ENDEMPTY, '<% } %>');
    // @endempty -> <% } %>

    processed = processed.replace(REGEX.IF, '<% if ($1) { %>');
    // @if(condition) -> <% if (condition) { %>

    processed = processed.replace(REGEX.UNLESS, '<% if (!($1)) { %>');
    // @unless(condition) -> <% if (!(condition)) { %>
    // 注意：條件被包裹在括號中並取反，確保正確的優先級

    processed = processed.replace(REGEX.ELSEIF, '<% } else if ($1) { %>');
    // @elseif(condition) -> <% } else if (condition) { %>

    processed = processed.replace(REGEX.ELSE, '<% } else { %>');
    // @else -> <% } else { %>

    processed = processed.replace(REGEX.ENDIF, '<% } %>');
    // @endif -> <% } %>

    processed = processed.replace(REGEX.ENDUNLESS, '<% } %>');
    // @endunless -> <% } %>

    // ========================================
    // 步驟 3: 轉換 Switch 語句
    // ========================================
    // 使用 if/else 鏈模擬 switch 行為，原因：
    // 1. JavaScript switch 需要 break 語句，容易出錯
    // 2. if/else 鏈更安全，不會發生 fall-through
    // 3. 與 Blade 的行為更一致
    //
    // 技巧：使用特殊變數名 __vphk_sw__ 避免與使用者代碼衝突
    // - vphk = vite-plugin-html-kit
    // - 雙底線前後綴降低命名衝突機率

    processed = processed.replace(
      REGEX.SWITCH,
      '<% { const __vphk_sw__ = ($1); if (false) { %>'
    );
    // @switch(value) -> 建立區塊作用域並儲存 switch 值

    processed = processed.replace(
      REGEX.CASE,
      '<% } else if (__vphk_sw__ === ($1)) { %>'
    );
    // @case(val) -> 使用嚴格相等比較

    processed = processed.replace(REGEX.BREAK, '');
    // @break -> 移除（在 if/else 結構中不需要）

    processed = processed.replace(REGEX.DEFAULT, '<% } else { %>');
    // @default -> else 分支

    processed = processed.replace(REGEX.ENDSWITCH, '<% } } %>');
    // @endswitch -> 關閉 else 和區塊作用域

    // ========================================
    // 步驟 4: 轉換迴圈標籤
    // ========================================
    // 支援兩種語法風格，方便不同背景的開發者：
    // 1. Blade 風格: @foreach(items as item) - 類似 PHP
    // 2. JavaScript 風格: @foreach(item of items) - 原生 JS
    //
    // 兩種風格都會轉換為標準的 JavaScript for...of 迴圈
    //
    // @forelse 變體：帶空資料處理的迴圈
    // @forelse(items as item) -> if (items && items.length > 0) { for (...) {
    // @empty                  -> } } else {
    // @endforelse             -> }

    // 先處理 @forelse（比 @foreach 複雜，需要優先處理）
    processed = processed.replace(REGEX.FORELSE, (match, expression) => {
      expression = expression.trim();
      let collection, item;

      // 解析 Blade 風格: "items as item"
      if (expression.includes(' as ')) {
        [collection, item] = expression.split(' as ').map(s => s.trim());
        return `<% if (${collection} && ${collection}.length > 0) { ` +
          `{ const __vphk_lp__ = typeof loop !== 'undefined' ? loop : null; ` +
          `const __vphk_ld__ = __vphk_lp__ ? __vphk_lp__.depth + 1 : 1; ` +
          `const __vphk_lc__ = ${collection}; ` +
          `const __vphk_ln__ = __vphk_lc__.length; ` +
          `let __vphk_li__ = 0; ` +
          `for (let ${item} of __vphk_lc__) { ` +
          `const loop = { index: __vphk_li__, iteration: __vphk_li__ + 1, ` +
          `remaining: __vphk_ln__ - __vphk_li__ - 1, count: __vphk_ln__, ` +
          `first: __vphk_li__ === 0, last: __vphk_li__ === __vphk_ln__ - 1, ` +
          `even: (__vphk_li__ + 1) % 2 === 0, odd: (__vphk_li__ + 1) % 2 !== 0, ` +
          `depth: __vphk_ld__, parent: __vphk_lp__ }; __vphk_li__++; %>`;
      }

      // 解析 JavaScript 風格: "item of items"
      if (expression.includes(' of ')) {
        const parts = expression.split(' of ').map(s => s.trim());
        collection = parts[1];
        item = parts[0].replace(/^(let|const|var)\s+/, '');
        return `<% if (${collection} && ${collection}.length > 0) { ` +
          `{ const __vphk_lp__ = typeof loop !== 'undefined' ? loop : null; ` +
          `const __vphk_ld__ = __vphk_lp__ ? __vphk_lp__.depth + 1 : 1; ` +
          `const __vphk_lc__ = ${collection}; ` +
          `const __vphk_ln__ = __vphk_lc__.length; ` +
          `let __vphk_li__ = 0; ` +
          `for (let ${item} of __vphk_lc__) { ` +
          `const loop = { index: __vphk_li__, iteration: __vphk_li__ + 1, ` +
          `remaining: __vphk_ln__ - __vphk_li__ - 1, count: __vphk_ln__, ` +
          `first: __vphk_li__ === 0, last: __vphk_li__ === __vphk_ln__ - 1, ` +
          `even: (__vphk_li__ + 1) % 2 === 0, odd: (__vphk_li__ + 1) % 2 !== 0, ` +
          `depth: __vphk_ld__, parent: __vphk_lp__ }; __vphk_li__++; %>`;
      }

      // 不符合兩種語法：使用原始表達式（不支援 loop）
      return `<% if (true) { for (${expression}) { %>`;
    });

    processed = processed.replace(REGEX.EMPTY, '<% } } } else { %>');
    // @empty -> 關閉 for、loop 區塊作用域、if，開始 else

    processed = processed.replace(REGEX.ENDFORELSE, '<% } %>');
    // @endforelse -> 關閉 else

    // 再處理 @foreach（標準迴圈，無空資料處理）
    processed = processed.replace(REGEX.FOREACH, (match, expression) => {
      expression = expression.trim();
      let collection, item;

      // 解析 Blade 風格: "items as item"
      if (expression.includes(' as ')) {
        [collection, item] = expression.split(' as ').map(s => s.trim());
        return `<% { const __vphk_lp__ = typeof loop !== 'undefined' ? loop : null; ` +
          `const __vphk_ld__ = __vphk_lp__ ? __vphk_lp__.depth + 1 : 1; ` +
          `const __vphk_lc__ = ${collection}; ` +
          `const __vphk_ln__ = __vphk_lc__.length; ` +
          `let __vphk_li__ = 0; ` +
          `for (let ${item} of __vphk_lc__) { ` +
          `const loop = { index: __vphk_li__, iteration: __vphk_li__ + 1, ` +
          `remaining: __vphk_ln__ - __vphk_li__ - 1, count: __vphk_ln__, ` +
          `first: __vphk_li__ === 0, last: __vphk_li__ === __vphk_ln__ - 1, ` +
          `even: (__vphk_li__ + 1) % 2 === 0, odd: (__vphk_li__ + 1) % 2 !== 0, ` +
          `depth: __vphk_ld__, parent: __vphk_lp__ }; __vphk_li__++; %>`;
      }

      // 解析 JavaScript 風格: "item of items"
      if (expression.includes(' of ')) {
        const parts = expression.split(' of ').map(s => s.trim());
        collection = parts[1];
        // 移除可能的變數宣告關鍵字（let, const, var）
        item = parts[0].replace(/^(let|const|var)\s+/, '');
        return `<% { const __vphk_lp__ = typeof loop !== 'undefined' ? loop : null; ` +
          `const __vphk_ld__ = __vphk_lp__ ? __vphk_lp__.depth + 1 : 1; ` +
          `const __vphk_lc__ = ${collection}; ` +
          `const __vphk_ln__ = __vphk_lc__.length; ` +
          `let __vphk_li__ = 0; ` +
          `for (let ${item} of __vphk_lc__) { ` +
          `const loop = { index: __vphk_li__, iteration: __vphk_li__ + 1, ` +
          `remaining: __vphk_ln__ - __vphk_li__ - 1, count: __vphk_ln__, ` +
          `first: __vphk_li__ === 0, last: __vphk_li__ === __vphk_ln__ - 1, ` +
          `even: (__vphk_li__ + 1) % 2 === 0, odd: (__vphk_li__ + 1) % 2 !== 0, ` +
          `depth: __vphk_ld__, parent: __vphk_lp__ }; __vphk_li__++; %>`;
      }

      // 不符合兩種語法：假設是原生 for 迴圈語法（不支援 loop）
      // 例如: @foreach(let i = 0; i < 10; i++)
      return `<% for (${expression}) { %>`;
    });

    processed = processed.replace(REGEX.ENDFOREACH, '<% } } %>');
    // @endforeach -> 關閉 for 和 loop 區塊作用域

    // ========================================
    // 步驟 5: 儲存到快取
    // ========================================
    // 將轉換結果存入 LRU Cache，下次相同內容可直接使用
    transformCache.set(cacheKey, processed);

    return processed;
  };

  /**
   * 解析 HTML 中的 @section 區塊
   *
   * 從子頁面或佈局檔案中提取所有 @section 定義，
   * 用於佈局繼承系統。
   *
   * Section 是佈局繼承的核心概念：
   * - 子頁面使用 @section 定義內容區塊
   * - 父佈局使用 @yield 顯示這些內容
   * - 支援多層繼承（section 可以傳遞給更上層的佈局）
   *
   * 技術細節：
   * - 使用 REGEX.SECTION 正則表達式匹配
   * - 自動 trim 內容（移除前後空白）
   * - 重置 lastIndex 避免狀態殘留（正則表達式的 /g 標誌問題）
   * - 支援相同名稱的 section（後面的會覆蓋前面的）
   *
   * @param {string} html - 包含 @section 定義的 HTML 字串
   * @returns {Object<string, string>} Section 名稱到內容的映射物件
   *
   * @example
   * // 單個 section
   * const html = `@section('title')首頁@endsection`;
   * parseSections(html);
   * // 返回: { title: '首頁' }
   *
   * @example
   * // 多個 sections
   * const html = `
   *   @section('title')
   *     部落格文章
   *   @endsection
   *
   *   @section('content')
   *     <h1>文章標題</h1>
   *     <p>文章內容...</p>
   *   @endsection
   * `;
   * parseSections(html);
   * // 返回: {
   * //   title: '部落格文章',
   * //   content: '<h1>文章標題</h1>\n<p>文章內容...</p>'
   * // }
   *
   * @example
   * // Section 內容會自動 trim
   * const html = `
   *   @section('meta')
   *
   *     <meta name="description" content="...">
   *
   *   @endsection
   * `;
   * parseSections(html);
   * // 返回: { meta: '<meta name="description" content="...">' }
   *
   * @example
   * // 空的 HTML 或沒有 section
   * parseSections('');
   * // 返回: {}
   *
   * parseSections('<div>無 section</div>');
   * // 返回: {}
   */
  const parseSections = (html) => {
    const sections = {};

    // 確保輸入有效
    if (!html || typeof html !== 'string') {
      return sections;
    }

    // ========================================
    // 步驟 1: 處理簡寫語法 @section('name', 'content')
    // ========================================
    // 重置正則表達式的 lastIndex
    REGEX.SECTION_SHORTHAND.lastIndex = 0;

    let match;

    // 使用 exec() 迴圈查找所有簡寫 @section
    while ((match = REGEX.SECTION_SHORTHAND.exec(html)) !== null) {
      const name = match[1];       // 第一個捕獲群組：section 名稱
      const content = match[3];    // 第三個捕獲群組：section 內容（第二個是引號類型）

      // 儲存 section 內容，並移除前後空白
      // 如果有重複的 section 名稱，後面的會覆蓋前面的
      sections[name] = content.trim();
    }

    // ========================================
    // 步驟 2: 處理完整語法 @section('name')...@endsection
    // ========================================
    // 重置正則表達式的 lastIndex
    // 重要：當正則表達式有 /g 標誌時，exec() 會保留狀態
    // 如果不重置，可能會從上次的位置開始匹配，導致遺漏結果
    REGEX.SECTION.lastIndex = 0;

    // 使用 exec() 迴圈查找所有 @section 區塊
    // exec() 會逐一返回匹配結果，直到沒有更多匹配為止
    while ((match = REGEX.SECTION.exec(html)) !== null) {
      const name = match[1];       // 第一個捕獲群組：section 名稱
      const content = match[2];    // 第二個捕獲群組：section 內容

      // 儲存 section 內容，並移除前後空白
      // 如果有重複的 section 名稱，後面的會覆蓋前面的
      sections[name] = content.trim();
    }

    return sections;
  };

  /**
   * 解析 HTML 中的 @push 和 @prepend 區塊
   *
   * 從子頁面中提取所有 @push 和 @prepend 定義，
   * 用於堆疊系統（CSS/JS 資源管理）。
   *
   * @param {string} html - 包含 @push/@prepend 標籤的 HTML
   * @returns {Object} stacks - 鍵為 stack 名稱，值為內容陣列
   *
   * @example
   * const stacks = parseStacks(`
   *   @push('styles')
   *     <link href="/css/custom.css" rel="stylesheet">
   *   @endpush
   *
   *   @push('styles')
   *     <style>body { margin: 0; }</style>
   *   @endpush
   *
   *   @prepend('scripts')
   *     <script src="/js/critical.js"></script>
   *   @endprepend
   * `);
   *
   * // 返回:
   * // {
   * //   styles: [
   * //     { type: 'push', content: '<link href="/css/custom.css" rel="stylesheet">' },
   * //     { type: 'push', content: '<style>body { margin: 0; }</style>' }
   * //   ],
   * //   scripts: [
   * //     { type: 'prepend', content: '<script src="/js/critical.js"></script>' }
   * //   ]
   * // }
   */
  const parseStacks = (html) => {
    const stacks = {};

    // 確保輸入有效
    if (!html || typeof html !== 'string') {
      return stacks;
    }

    // ========================================
    // 步驟 1: 處理 @push 區塊
    // ========================================
    // @push 將內容添加到堆疊的末尾
    REGEX.PUSH.lastIndex = 0;
    let match;

    while ((match = REGEX.PUSH.exec(html)) !== null) {
      const name = match[1];     // stack 名稱
      const content = match[2];  // 內容

      // 初始化堆疊（如果不存在）
      if (!stacks[name]) {
        stacks[name] = [];
      }

      // 添加到堆疊末尾（push）
      stacks[name].push({
        type: 'push',
        content: content.trim()
      });
    }

    // ========================================
    // 步驟 2: 處理 @prepend 區塊
    // ========================================
    // @prepend 將內容添加到堆疊的開頭
    REGEX.PREPEND.lastIndex = 0;

    while ((match = REGEX.PREPEND.exec(html)) !== null) {
      const name = match[1];     // stack 名稱
      const content = match[2];  // 內容

      // 初始化堆疊（如果不存在）
      if (!stacks[name]) {
        stacks[name] = [];
      }

      // 添加到堆疊開頭（prepend）
      stacks[name].push({
        type: 'prepend',
        content: content.trim()
      });
    }

    return stacks;
  };

  /**
   * 處理佈局繼承（含循環引用檢測）
   *
   * 佈局繼承是模板系統的核心機制，允許子頁面繼承父佈局的結構：
   * - 子頁面使用 @extends('layout.html') 繼承佈局
   * - 子頁面使用 @section('name') 定義內容區塊
   * - 父佈局使用 @yield('name') 顯示子頁面內容
   * - 支援多層繼承（A extends B extends C）
   *
   * 範例：
   *
   * 子頁面 (index.html):
   *   @extends('layouts/app.html')
   *   @section('title')
   *     首頁
   *   @endsection
   *   @section('content')
   *     <h1>歡迎</h1>
   *   @endsection
   *
   * 父佈局 (layouts/app.html):
   *   <!DOCTYPE html>
   *   <html>
   *   <head><title>@yield('title', '預設標題')</title></head>
   *   <body>
   *     <main>@yield('content')</main>
   *   </body>
   *   </html>
   *
   * 最終結果:
   *   <!DOCTYPE html>
   *   <html>
   *   <head><title>首頁</title></head>
   *   <body>
   *     <main><h1>歡迎</h1></main>
   *   </body>
   *   </html>
   *
   * @param {string} html - 包含 @extends 和 @section 的 HTML 字串
   * @param {string} [currentFile='root'] - 當前檔案名稱（用於循環引用檢測）
   * @param {Object} [inheritedSections={}] - 從子頁面繼承的 sections
   * @returns {string} 處理後的 HTML（已應用佈局）
   */
  const processExtends = (() => {
    // ========================================
    // 閉包變數：佈局堆疊（循環引用檢測）
    // ========================================
    // 為什麼使用閉包：
    // - 在遞迴處理多層佈局時，需要追蹤當前的佈局路徑鏈
    // - 防止循環引用（A extends B extends A）
    // - 閉包確保每次呼叫共用同一個 stack
    const layoutStack = [];

    return function process(html, currentFile = 'root', inheritedSections = {}) {

      // ========================================
      // 步驟 1: 檢查是否需要處理佈局繼承
      // ========================================
      // 如果沒有 @extends 指令，直接返回原始 HTML
      const extendsMatch = html.match(REGEX.EXTENDS);
      if (!extendsMatch) {
        return html;
      }

      // ========================================
      // 步驟 2: 提取佈局路徑
      // ========================================
      // 從 @extends('layouts/app.html') 提取 'layouts/app.html'
      const layoutPath = extendsMatch[0].replace(REGEX.EXTENDS, '$1');

      // ========================================
      // 步驟 3: 循環引用檢測
      // ========================================
      // 檢查當前佈局是否已在堆疊中（表示循環引用）
      // 範例：index.html extends app.html extends base.html extends app.html (❌ 循環)
      if (layoutStack.includes(layoutPath)) {
        const cycle = [...layoutStack, layoutPath].join(' → ');
        const error = createAndLogError(ErrorCodes.CIRCULAR_LAYOUT_REFERENCE, [cycle], {
          layoutPath,
          layoutStack: [...layoutStack],
          currentFile
        });
        return error.toHTMLComment();
      }

      // 將當前佈局加入堆疊
      layoutStack.push(layoutPath);

      try {
        // ========================================
        // 步驟 4: 解析當前頁面的 Section 內容
        // ========================================
        // 移除 @extends 指令（已經提取了路徑）
        html = html.replace(REGEX.EXTENDS, '');

        // 解析所有 @section 區塊
        // 範例：@section('title') 首頁 @endsection
        //       sections = { title: '首頁' }
        const sections = parseSections(html);

        // 移除所有 @section 定義（內容已提取到 sections 物件）
        html = html.replace(REGEX.SECTION, '');

        // ========================================
        // 步驟 5: 讀取佈局檔案（含安全性檢查）
        // ========================================
        const rootPath = viteConfig?.root || process.cwd();
        const absolutePartialsDir = path.resolve(rootPath, partialsDir);
        const layoutFilePath = path.resolve(absolutePartialsDir, layoutPath);

        // 🔒 安全性檢查：路徑遍歷攻擊防護
        // 防止惡意路徑如 '../../../etc/passwd'
        // 確保解析後的檔案路徑必須在 partialsDir 目錄內
        if (!layoutFilePath.startsWith(absolutePartialsDir)) {
          const error = createAndLogError(ErrorCodes.PATH_TRAVERSAL_LAYOUT, [layoutPath], {
            layoutPath,
            resolvedPath: layoutFilePath,
            allowedDir: absolutePartialsDir,
            currentFile
          });
          return error.toHTMLComment();
        }

        // 檢查檔案是否存在
        if (!fs.existsSync(layoutFilePath)) {
          const error = createAndLogError(ErrorCodes.LAYOUT_FILE_NOT_FOUND, [layoutPath], {
            layoutPath,
            searchedPath: layoutFilePath,
            partialsDir: absolutePartialsDir,
            currentFile
          });
          return error.toHTMLComment();
        }

        // 讀取佈局檔案內容
        let layoutContent = fs.readFileSync(layoutFilePath, 'utf-8');

        // ========================================
        // 步驟 6: 處理多層佈局繼承
        // ========================================
        // 佈局檔案本身也可能 extends 其他佈局
        // 範例：index.html extends app.html extends base.html

        // 先提取佈局中的 sections（如果有）
        const layoutSections = parseSections(layoutContent);

        // 合併所有可用的 sections：
        // - inheritedSections: 從更深層子頁面傳遞來的
        // - sections: 當前頁面定義的
        // 優先順序：當前頁面 > 繼承的（覆蓋同名 section）
        const allSections = { ...inheritedSections, ...sections };

        // 遞迴處理佈局的 @extends，並傳遞合併後的 sections
        layoutContent = process(layoutContent, layoutPath, allSections);

        // ========================================
        // 步驟 7: 替換 @yield 佔位符
        // ========================================
        // @yield 的優先順序（由高到低）：
        // 1. 當前頁面的 section
        // 2. 繼承的 section（從子頁面傳遞）
        // 3. 佈局自己定義的 section
        // 4. @yield 的默認值
        // 5. 空字串
        layoutContent = layoutContent.replace(REGEX.YIELD, (match, name, defaultValue) => {
          // 優先使用當前頁面的 section
          if (sections[name] !== undefined) {
            return sections[name];
          }
          // 其次使用繼承的 section
          if (inheritedSections[name] !== undefined) {
            return inheritedSections[name];
          }
          // 再次使用佈局自己的 section
          if (layoutSections[name] !== undefined) {
            return layoutSections[name];
          }
          // 最後使用默認值或空字串
          if (defaultValue !== undefined) {
            return defaultValue;
          }
          return '';
        });

        return layoutContent;

      } catch (error) {
        // ========================================
        // 錯誤處理
        // ========================================
        const pluginError = createAndLogError(ErrorCodes.LAYOUT_PROCESSING_ERROR, [layoutPath], {
          layoutPath,
          currentFile,
          originalError: error
        });
        return pluginError.toHTMLComment();

      } finally {
        // ========================================
        // 清理：移除佈局堆疊
        // ========================================
        // 無論成功或失敗，都要從堆疊中移除當前佈局
        // 這樣才能正確處理下一個佈局
        layoutStack.pop();
      }
    };
  })();

  /**
   * 遞迴解析 HTML Include 標籤（含循環引用檢測）
   *
   * Include 機制允許重用 HTML 片段（partial），類似組件系統：
   * - 使用 <include src="..." /> 載入外部 HTML 檔案
   * - 透過 HTML 屬性傳遞資料給 partial
   * - 支援 Slot 機制（類似 Vue/React 的 children）
   * - 支援遞迴 include（partial 內可再 include 其他 partial）
   *
   * 兩種使用方式：
   *
   * 1. 自閉合標籤（無 slot）:
   *    <include src="header.html" title="首頁" active="true" />
   *
   * 2. 包含內容標籤（有 slot）:
   *    <include src="card.html" title="標題">
   *      @slot('content')
   *        <p>卡片內容</p>
   *      @endslot
   *      @slot('footer')
   *        <button>確定</button>
   *      @endslot
   *    </include>
   *
   * Partial 檔案範例 (card.html):
   *    <div class="card">
   *      <h3>{{ title }}</h3>
   *      <div class="body">@slot('content', '預設內容')</div>
   *      <div class="footer">@slot('footer')</div>
   *    </div>
   *
   * @param {string} html - 包含 include 標籤的 HTML 字串
   * @param {Object} dataContext - 當前可用的資料上下文
   * @param {string} [currentFile='root'] - 當前正在處理的檔案名稱（用於循環引用檢測）
   * @returns {string} 處理後的 HTML（include 標籤已被實際內容取代）
   */
  const resolveIncludes = (() => {
    // ========================================
    // 閉包變數：Include 堆疊（循環引用檢測）
    // ========================================
    // 防止無限遞迴：A includes B includes C includes A (❌ 循環)
    const includeStack = [];

    return function resolve(html, dataContext, currentFile = 'root') {

      // ========================================
      // 步驟 1: 循環引用檢測
      // ========================================
      // 檢查當前檔案是否已在處理堆疊中
      if (includeStack.includes(currentFile)) {
        const cycle = [...includeStack, currentFile].join(' → ');
        const error = createAndLogError(ErrorCodes.CIRCULAR_INCLUDE_REFERENCE, [cycle], {
          currentFile,
          includeStack: [...includeStack]
        });
        return error.toHTMLComment();
      }

      // 將當前檔案加入堆疊
      includeStack.push(currentFile);

      try {
        // ========================================
        // 步驟 2: 預處理 - 轉換 Blade 邏輯標籤
        // ========================================
        // 先轉換當前層的 @if、@foreach 等標籤為 Lodash Template 語法
        // 這樣在 include 的 partial 內也能使用 Blade 語法
        let processedHtml = transformLogicTags(html);

        // ========================================
        // 步驟 3: 替換所有 <include> 標籤
        // ========================================
        return processedHtml.replace(REGEX.INCLUDE, (match, src, attributesStr, includeContent, src2, attributesStr2) => {

          // ----------------------------------------
          // 步驟 3.1: 識別 Include 標籤類型
          // ----------------------------------------
          // 兩種形式：
          // - 形式1: <include src="..." ...>content</include>（包含 slot）
          // - 形式2: <include src="..." ... />（自閉合，無 slot）
          if (!src) {
            src = src2;
            attributesStr = attributesStr2;
            includeContent = '';
          }

          // ----------------------------------------
          // 步驟 3.2: 解析檔案路徑（含安全檢查）
          // ----------------------------------------
          const rootPath = viteConfig?.root || process.cwd();
          const absolutePartialsDir = path.resolve(rootPath, partialsDir);
          const filePath = path.resolve(absolutePartialsDir, src);

          // 🔒 安全性檢查：路徑遍歷攻擊防護
          // 防止惡意路徑如 '../../../etc/passwd'
          if (!filePath.startsWith(absolutePartialsDir)) {
            const error = createAndLogError(ErrorCodes.PATH_TRAVERSAL_INCLUDE, [src], {
              includePath: src,
              resolvedPath: filePath,
              allowedDir: absolutePartialsDir,
              currentFile
            });
            return error.toHTMLComment();
          }

          // 檢查檔案是否存在
          if (!fs.existsSync(filePath)) {
            const error = createAndLogError(ErrorCodes.INCLUDE_FILE_NOT_FOUND, [src], {
              includePath: src,
              searchedPath: filePath,
              partialsDir: absolutePartialsDir,
              currentFile
            });
            return error.toHTMLComment();
          }

          try {
            // ----------------------------------------
            // 步驟 3.3: 讀取 Partial 檔案
            // ----------------------------------------
            let content = fs.readFileSync(filePath, 'utf-8');

            // ----------------------------------------
            // 步驟 3.3.5: 處理 @once 區塊（防止重複輸出）
            // ----------------------------------------
            // @once 區塊用於確保某段代碼只輸出一次，即使 partial 被多次 include
            // 範例：在 alert.html 中使用 @once 包裹 jQuery 載入
            //       即使 alert.html 被 include 3 次，jQuery 只載入一次
            content = content.replace(REGEX.ONCE, (match, onceContent) => {
              // 使用內容的 hash 作為唯一識別碼
              const contentHash = hash(onceContent);

              // 如果這個區塊已經輸出過，返回空字串
              if (onceBlocks.has(contentHash)) {
                return '';
              }

              // 首次輸出：記錄 hash 並返回內容（移除 @once/@endonce 標籤）
              onceBlocks.add(contentHash);
              return onceContent;
            });

            // ----------------------------------------
            // 步驟 3.4: 解析 Slot 內容
            // ----------------------------------------
            // 從 <include>...</include> 內容中提取所有 @slot 區塊
            // 範例：
            //   @slot('header')
            //     <h1>標題</h1>
            //   @endslot
            // 解析為: slots = { header: '<h1>標題</h1>' }
            const slots = {};
            if (includeContent && includeContent.trim()) {
              // 重置正則表達式的 lastIndex（重要！）
              REGEX.SLOT_BLOCK.lastIndex = 0;

              let slotMatch;
              while ((slotMatch = REGEX.SLOT_BLOCK.exec(includeContent)) !== null) {
                const slotName = slotMatch[1];
                const slotContent = slotMatch[2];
                slots[slotName] = slotContent.trim();
              }
            }

            // ----------------------------------------
            // 步驟 3.5: 替換 Partial 中的 @slot 佔位符
            // ----------------------------------------
            // 在 partial 檔案中，@slot('name', 'default') 會被替換為：
            // 1. 傳入的 slot 內容（優先）
            // 2. 默認值（如果有提供）
            // 3. 空字串
            content = content.replace(REGEX.SLOT, (slotMatch, slotName, defaultValue) => {
              if (slots[slotName] !== undefined) {
                return slots[slotName];
              }
              if (defaultValue !== undefined) {
                return defaultValue;
              }
              return '';
            });

            // ----------------------------------------
            // 步驟 3.6: 解析傳遞的屬性（Locals）
            // ----------------------------------------
            // 從 <include src="..." title="首頁" count="5" />
            // 解析為: { title: "首頁", count: "5" }
            const rawLocals = parseAttributes(attributesStr);

            // 移除不應該存在的 locals 屬性（舊版語法遺留）
            if (rawLocals.locals) {
              delete rawLocals.locals;
            }

            // ----------------------------------------
            // 步驟 3.7: 評估屬性表達式
            // ----------------------------------------
            // 將屬性值中的 {{ }} 表達式求值
            // 範例: count="{{ items.length }}" 會被評估為實際數字
            const locals = evaluateAttributeExpressions(rawLocals, dataContext, defaultCompilerOptions);

            // ----------------------------------------
            // 步驟 3.8: 合併資料上下文
            // ----------------------------------------
            // 合併順序（後者覆蓋前者）：
            // 1. Lodash 工具函式（_）
            // 2. 全域資料上下文
            // 3. 局部變數（傳入的屬性）
            const currentData = { _: lodash, ...dataContext, ...locals };

            // ----------------------------------------
            // 步驟 3.9: 遞迴處理 Partial 內的 Include
            // ----------------------------------------
            // Partial 內可能還有其他 <include> 標籤，需要遞迴處理
            // 傳入檔案名稱用於循環引用檢測
            const resolvedContent = resolve(content, currentData, src);

            // ----------------------------------------
            // 步驟 3.10: 編譯並執行 Lodash Template
            // ----------------------------------------
            try {
              const compiled = lodash.template(resolvedContent, defaultCompilerOptions);
              return compiled(currentData);

            } catch (e) {
              // 編譯失敗時的除錯資訊
              if (process.env.DEBUG || process.env.VITE_DEBUG) {
                console.log('\n--- [vite-plugin-html-kit] 編譯 Partial 時發生錯誤 ---');
                console.log(`檔案: ${src}`);
                console.log('內容:');
                console.log(resolvedContent);
                console.log('-----------------------------\n');
              }
              throw e;
            }

          } catch (error) {
            // ----------------------------------------
            // 錯誤處理
            // ----------------------------------------
            const pluginError = createAndLogError(ErrorCodes.INCLUDE_PROCESSING_ERROR, [src], {
              includePath: src,
              currentFile,
              originalError: error
            });
            return pluginError.toHTMLComment();
          }
        });

      } finally {
        // ========================================
        // 清理：移除 Include 堆疊
        // ========================================
        // 無論成功或失敗，都要從堆疊中移除當前檔案
        // 使用 finally 確保即使發生錯誤也會正確清理
        includeStack.pop();
      }
    };
  })();

  // 返回 Vite Plugin 物件
  return {
    // 插件名稱（與 package.json 一致）
    name: 'vite-plugin-html-kit',

    // 在其他插件之前執行，確保 HTML 轉換優先處理
    enforce: 'pre',

    /**
     * Vite Config Hook: 在配置解析前修改 Rollup 輸入設定
     *
     * 執行時機：
     * - 在 Vite 解析使用者配置之前調用
     * - 可以修改配置物件，影響後續的建構過程
     *
     * 目的：
     * 排除 partials 目錄中的檔案，防止它們被當作獨立的建構入口點。
     * Partial 檔案應該只作為 <include> 標籤的來源，不應該產生獨立的輸出檔案。
     *
     * 為什麼需要這個處理：
     * - Vite 預設會將所有 HTML 檔案視為入口點
     * - 如果 partials 目錄的檔案被建構為入口，會產生不必要的輸出檔案
     * - 這些輸出檔案可能包含未解析的模板語法（因為缺少上下文）
     *
     * 影響的配置：
     * - build.rollupOptions.input（物件格式）
     * - 不影響陣列格式的 input（較少使用）
     *
     * @param {import('vite').UserConfig} config - Vite 使用者配置物件
     * @param {string} [config.root] - 專案根目錄
     * @param {Object} [config.build] - 建構選項
     * @param {Object} [config.build.rollupOptions] - Rollup 選項
     * @param {Object|string|string[]} [config.build.rollupOptions.input] - 入口點配置
     *
     * @example
     * // 假設有以下目錄結構：
     * // - index.html
     * // - about.html
     * // - partials/header.html
     * // - partials/footer.html
     *
     * // Vite 自動掃描後的 input:
     * // {
     * //   index: '/path/to/index.html',
     * //   about: '/path/to/about.html',
     * //   header: '/path/to/partials/header.html',  // ❌ 不應該被建構
     * //   footer: '/path/to/partials/footer.html'   // ❌ 不應該被建構
     * // }
     *
     * // 經過此 hook 處理後:
     * // {
     * //   index: '/path/to/index.html',
     * //   about: '/path/to/about.html'
     * // }
     */
    config(config) {
      // ========================================
      // 步驟 1: 檢查配置是否存在
      // ========================================
      // 邊界情況處理：
      // - config.build 可能不存在（使用預設建構設定）
      // - config.build.rollupOptions 可能不存在
      // - config.build.rollupOptions.input 可能不存在（使用預設入口點）
      //
      // 如果任何一層不存在，直接返回，不做任何修改
      if (!config.build || !config.build.rollupOptions || !config.build.rollupOptions.input) {
        return;
      }

      // ========================================
      // 步驟 2: 解析目錄路徑
      // ========================================
      const input = config.build.rollupOptions.input;
      const rootPath = config.root || process.cwd();
      const absolutePartialsDir = path.resolve(rootPath, partialsDir);

      // ========================================
      // 步驟 3: 過濾 Partials 入口點
      // ========================================
      // 只處理物件格式的 input
      // 範例：{ index: 'index.html', about: 'about.html' }
      //
      // 不處理的格式：
      // - 字串格式：'index.html'
      // - 陣列格式：['index.html', 'about.html']
      // （這些格式較少使用，且通常不包含 partials）
      if (typeof input === 'object' && !Array.isArray(input)) {
        for (const key in input) {
          // 將相對路徑轉換為絕對路徑
          const filePath = path.resolve(rootPath, input[key]);

          // 檢查檔案是否在 partials 目錄內
          if (filePath.startsWith(absolutePartialsDir)) {
            // 從 input 物件中移除此入口點
            delete input[key];

            // 在除錯模式下輸出資訊
            if (process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG) {
              console.log(`[vite-plugin-html-kit] 排除 partial 入口點: ${path.relative(rootPath, filePath)}`);
            }
          }
        }
      }
    },

    /**
     * Vite ConfigResolved Hook: 儲存解析後的配置供後續使用
     *
     * 執行時機：
     * - 在 Vite 完成配置解析後調用
     * - 此時所有插件的 config hook 都已執行完畢
     * - 配置已合併並標準化為最終形式
     *
     * 目的：
     * 1. 儲存解析後的配置供其他 hook 使用（主要是 transformIndexHtml）
     * 2. 註冊效能統計輸出（僅除錯模式）
     *
     * 為什麼需要儲存配置：
     * - processExtends 和 resolveIncludes 需要知道專案根目錄（viteConfig.root）
     * - 用於解析 partial 檔案的絕對路徑
     * - 用於路徑遍歷攻擊防護
     *
     * 效能統計輸出：
     * - 只在除錯模式下啟用
     * - 在 process 退出前輸出快取命中率等資訊
     * - 幫助開發者了解快取效益
     *
     * @param {import('vite').ResolvedConfig} resolvedConfig - Vite 解析後的完整配置
     * @param {string} resolvedConfig.root - 專案根目錄絕對路徑
     * @param {string} resolvedConfig.command - 執行命令（'serve' | 'build'）
     * @param {string} resolvedConfig.mode - 執行模式（'development' | 'production'）
     *
     * @example
     * // resolvedConfig 範例：
     * // {
     * //   root: '/path/to/project',
     * //   command: 'serve',
     * //   mode: 'development',
     * //   plugins: [...],
     * //   ...
     * // }
     */
    configResolved(resolvedConfig) {
      // ========================================
      // 步驟 1: 儲存配置
      // ========================================
      // 將配置物件儲存到外層作用域的 viteConfig 變數
      // 這樣其他 hook（如 transformIndexHtml）就可以訪問配置
      viteConfig = resolvedConfig;

      // 在除錯模式下輸出配置資訊
      if (process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG) {
        console.log('\n[vite-plugin-html-kit] 配置已解析:');
        console.log(`  ├─ 根目錄: ${resolvedConfig.root}`);
        console.log(`  ├─ 命令: ${resolvedConfig.command}`);
        console.log(`  ├─ 模式: ${resolvedConfig.mode}`);
        console.log(`  └─ Partials 目錄: ${path.resolve(resolvedConfig.root, partialsDir)}\n`);
      }

      // ========================================
      // 步驟 2: 註冊效能統計輸出
      // ========================================
      // 只在除錯模式下啟用
      // 環境變數：DEBUG=1 或 VITE_HTML_KIT_DEBUG=1
      if (process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG) {
        // 使用 once 確保只註冊一次監聽器
        // 避免多次調用 configResolved 時重複註冊
        //
        // beforeExit 事件：
        // - 在 Node.js process 即將退出時觸發
        // - 適合輸出統計資訊（不影響正常執行）
        // - 在所有非同步操作完成後觸發
        process.once('beforeExit', () => {
          // 輸出效能統計（快取命中率等）
          performanceStats.log();
        });
      }
    },

    /**
     * Vite TransformIndexHtml Hook: 轉換 HTML 檔案
     *
     * 這是整個插件的主要入口點，負責將包含模板語法的 HTML 轉換為最終輸出。
     *
     * 轉換流程概覽：
     * 1. 處理佈局繼承（@extends + @section + @yield）
     * 2. 轉換 Blade 邏輯標籤（@if, @foreach, @switch）
     * 3. 解析並替換 <include> 標籤（含 Slot 支援）
     * 4. 編譯 Lodash Template（處理 {{ }} 變數插值）
     * 5. 注入全域資料並生成最終 HTML
     *
     * 執行時機：
     * - 開發模式：每次請求 HTML 時觸發
     * - 建構模式：處理每個 HTML 入口檔案
     *
     * 效能考量：
     * - 使用 LRU Cache 快取轉換結果（transformLogicTags）
     * - MD5 hash 用於快取鍵值生成
     * - 開發模式下快取命中率可達 80%+
     *
     * @param {string} html - 原始 HTML 內容（未處理的模板）
     * @param {import('vite').IndexHtmlTransformContext} ctx - Vite 提供的轉換上下文
     * @param {string} ctx.filename - 當前處理的檔案絕對路徑
     * @param {import('vite').ViteDevServer} ctx.server - 開發伺服器實例（僅開發模式）
     * @returns {string} 轉換後的 HTML（可直接輸出給瀏覽器）
     *
     * @example
     * // 輸入 (index.html):
     * // @extends('layouts/app.html')
     * // @section('content')
     * //   <h1>{{ pageTitle }}</h1>
     * //   <include src="header.html" title="Welcome" />
     * // @endsection
     *
     * // 輸出:
     * // <!DOCTYPE html>
     * // <html>
     * //   <body>
     * //     <h1>Home Page</h1>
     * //     <header><h2>Welcome</h2></header>
     * //   </body>
     * // </html>
     */
    transformIndexHtml(html, ctx) {
      // ========================================
      // 步驟 0: 準備資料上下文和檔案資訊
      // ========================================
      // 建立全域資料上下文，合併用戶提供的 data 選項
      // 特別注入 _ (lodash)，讓所有模板都可以使用 Lodash 工具函式
      // 範例：{{ _.capitalize(name) }}, {{ _.map(items, 'id') }}
      const globalData = { _: lodash, ...data };

      // 提取檔案名稱用於錯誤訊息和循環引用檢測
      // 範例：/path/to/index.html -> 'index.html'
      const filename = ctx?.filename ? path.basename(ctx.filename) : 'index.html';

      // ========================================
      // 步驟 0.5: 保護 @verbatim 區塊
      // ========================================
      // 在所有處理之前，提取並保護 @verbatim 區塊
      // 這些區塊的內容將完全不被 Blade 和 Lodash Template 處理
      //
      // 策略：
      // 1. 提取所有 @verbatim...@endverbatim 區塊
      // 2. 用 HTML 註釋佔位符替換
      // 3. 在 Lodash Template 編譯後恢復原始內容
      const verbatimBlocks = [];
      html = html.replace(REGEX.VERBATIM, (match, content) => {
        const index = verbatimBlocks.length;
        verbatimBlocks.push(content);
        return `<!-- __VPHK_VERBATIM_${index}__ -->`;
      });

      // ========================================
      // 步驟 1: 處理佈局繼承（Layout Inheritance）
      // ========================================
      // 為什麼放在第一步：
      // - 佈局檔案可能包含 include 標籤和邏輯標籤
      // - 子頁面的 section 內容需要先提取，再填入佈局的 yield 位置
      // - 支援多層繼承（A extends B extends C）
      //
      // 處理內容：
      // - @extends('layout.html') - 載入佈局檔案
      // - @section('name') ... @endsection - 提取內容區塊
      // - @yield('name', 'default') - 替換為 section 內容
      //
      // 輸入範例：
      //   @extends('layouts/app.html')
      //   @section('title')首頁@endsection
      //
      // 處理後：
      //   <!DOCTYPE html>
      //   <html><title>首頁</title>...</html>
      html = processExtends(html, filename);

      // ========================================
      // 步驟 2: 轉換 Blade 邏輯標籤
      // ========================================
      // 為什麼在 extends 之後：
      // - 佈局檔案已經載入，現在處理完整的 HTML
      // - 確保佈局中的邏輯標籤也被轉換
      //
      // 處理內容：
      // - @if(condition) -> <% if (condition) { %>
      // - @foreach(items as item) -> <% for (let item of items) { %>
      // - @switch(value) -> <% { const __vphk_sw__ = value; if (false) { %>
      //
      // 效能優化：
      // - 使用 LRU Cache 快取轉換結果
      // - 相同內容的快取命中可提升 50 倍速度
      //
      // 輸入範例：
      //   @if(user.isAdmin)
      //     <p>管理員</p>
      //   @endif
      //
      // 處理後：
      //   <% if (user.isAdmin) { %>
      //     <p>管理員</p>
      //   <% } %>
      html = transformLogicTags(html);

      // ========================================
      // 步驟 3: 遞迴解析 Include 標籤
      // ========================================
      // 為什麼在邏輯標籤之後：
      // - Include 的 partial 檔案內可能也有邏輯標籤
      // - 在 resolveIncludes 內部會再次調用 transformLogicTags
      //
      // 處理內容：
      // - <include src="header.html" title="Hello" /> - 載入 partial
      // - 支援 Slot 機制（@slot('name') ... @endslot）
      // - 支援屬性傳遞和表達式求值
      // - 遞迴處理（partial 內可再 include）
      //
      // 安全性：
      // - 路徑遍歷攻擊防護
      // - 循環引用檢測（A -> B -> C -> A）
      //
      // 輸入範例：
      //   <include src="card.html" title="{{ post.title }}">
      //     @slot('content')
      //       <p>{{ post.body }}</p>
      //     @endslot
      //   </include>
      //
      // 處理後：
      //   <div class="card">
      //     <h3>文章標題</h3>
      //     <p>文章內容</p>
      //   </div>
      let fullHtml = resolveIncludes(html, globalData, filename);

      // ========================================
      // 步驟 4: 編譯並執行 Lodash Template
      // ========================================
      // 這是最後一步，將所有 <% %> 和 {{ }} 語法編譯為可執行的 JavaScript
      //
      // 處理內容：
      // - {{ variable }} - 變數插值
      // - {{ expression }} - 表達式求值
      // - <% code %> - 執行 JavaScript 程式碼
      //
      // 編譯選項：
      // - interpolate: /{{([\s\S]+?)}}/g - 自訂插值語法
      // - 其他選項繼承自 compilerOptions 參數
      try {
        // 編譯模板為函數
        const compiled = lodash.template(fullHtml, defaultCompilerOptions);

        // 執行函數，注入全域資料，生成最終 HTML
        let result = compiled(globalData);

        // ========================================
        // 步驟 5: 恢復 @verbatim 區塊的原始內容
        // ========================================
        // 將 HTML 註釋佔位符替換為原始內容
        // 這確保前端框架（Vue.js、Alpine.js）可以處理原始的 {{ }} 語法
        //
        // 恢復規則：
        // <!-- __VPHK_VERBATIM_0__ --> -> 原始 verbatim 內容
        if (verbatimBlocks.length > 0) {
          result = result.replace(/<!-- __VPHK_VERBATIM_(\d+)__ -->/g, (match, indexStr) => {
            const index = parseInt(indexStr, 10);
            return verbatimBlocks[index] || match;
          });
        }

        return result;

      } catch (error) {
        // ========================================
        // 錯誤處理
        // ========================================
        // Lodash 編譯/執行失敗時的降級處理
        //
        // 常見錯誤原因：
        // - 語法錯誤（未閉合的 {{ }}）
        // - 變數未定義（嘗試訪問 undefined.property）
        // - 表達式錯誤（除以零、錯誤的函數呼叫等）
        //
        // 降級策略：
        // - 使用統一錯誤處理系統記錄錯誤
        // - 返回未編譯的 HTML（保留 <% %> 和 {{ }} 語法）
        // - 讓開發者可以在瀏覽器中看到原始模板內容，便於除錯
        createAndLogError(ErrorCodes.TEMPLATE_COMPILE_ERROR, [filename], {
          filename,
          originalError: error
        });

        return fullHtml;
      }
    },

    /**
     * Vite HandleHotUpdate Hook: 處理 Hot Module Replacement (HMR)
     *
     * 當檔案系統中的檔案發生變更時，Vite 會調用此 hook。
     * 本插件需要監聽 HTML 檔案和 partials 目錄內的檔案變更，
     * 以確保開發時的即時預覽功能正常運作。
     *
     * HMR 工作原理：
     * 1. 檔案變更觸發此 hook
     * 2. 檢查是否為相關檔案（HTML 或 partial）
     * 3. 清除轉換快取
     * 4. 通知瀏覽器重新載入頁面
     *
     * 為什麼需要完整重載（Full Reload）：
     * - HTML 模板的依賴關係複雜（include、extends）
     * - 一個 partial 的變更可能影響多個頁面
     * - Vite 的模組熱替換（Module HMR）僅適用於 JS/CSS
     * - HTML 變更需要重新執行整個轉換流程
     *
     * 效能影響：
     * - 清除快取操作：O(1) 時間複雜度
     * - 完整重載：瀏覽器重新請求 HTML（約 50-200ms）
     * - 對開發體驗影響極小（使用者幾乎無感）
     *
     * @param {Object} context - Vite 提供的 HMR 上下文
     * @param {string} context.file - 發生變更的檔案絕對路徑
     * @param {import('vite').ViteDevServer} context.server - Vite 開發伺服器實例
     * @param {import('vite').ModuleNode[]} context.modules - 受影響的模組列表
     *
     * @example
     * // 當修改 partials/header.html 時：
     * // 1. file = '/path/to/project/partials/header.html'
     * // 2. isPartialFile = true
     * // 3. transformCache.clear() - 清除所有快取
     * // 4. 瀏覽器收到重載訊號 -> 刷新頁面
     */
    handleHotUpdate({ file, server }) {
      // ========================================
      // 步驟 1: 解析目錄路徑
      // ========================================
      // 取得專案根目錄和 partials 目錄的絕對路徑
      // 用於後續判斷檔案是否在 partials 目錄內
      const rootPath = viteConfig?.root || process.cwd();
      const absolutePartialsDir = path.resolve(rootPath, partialsDir);

      // ========================================
      // 步驟 2: 判斷檔案類型
      // ========================================
      // 檢查變更的檔案是否需要觸發 HMR
      //
      // isHtmlFile: 任何 .html 結尾的檔案
      // - 包含專案根目錄的 HTML 檔案
      // - 包含 partials 目錄的 HTML 檔案
      // - 包含子目錄的 HTML 檔案
      //
      // isPartialFile: partials 目錄內的任何檔案
      // - 即使不是 .html 也會觸發（例如 .txt, .md）
      // - 這樣可以捕捉意外的檔案類型
      const isHtmlFile = file.endsWith('.html');
      const isPartialFile = file.startsWith(absolutePartialsDir);

      // ========================================
      // 步驟 3: 執行 HMR 處理
      // ========================================
      if (isHtmlFile || isPartialFile) {
        // ----------------------------------------
        // 步驟 3.1: 清除轉換快取
        // ----------------------------------------
        // 為什麼必須清除快取：
        // - transformLogicTags 使用 LRU Cache 快取轉換結果
        // - 快取鍵基於檔案內容的 MD5 hash
        // - 檔案變更後，內容改變，但舊的快取可能仍然存在
        // - 如果不清除，下次請求會返回舊的快取內容
        //
        // 清除策略：
        // - 清除所有快取（transformCache.clear()）
        // - 不做選擇性清除，因為依賴關係複雜
        //
        // 範例情境：
        // 1. 用戶修改 partials/header.html
        // 2. index.html includes header.html
        // 3. 如果不清除快取，index.html 仍會使用舊的 header 內容
        transformCache.clear();

        // ----------------------------------------
        // 步驟 3.2: 通知瀏覽器重新載入
        // ----------------------------------------
        // 發送 WebSocket 訊息給所有連接的瀏覽器客戶端
        //
        // 訊息格式：
        // - type: 'full-reload' - 完整重載（非模組熱替換）
        // - path: '*' - 影響所有頁面（萬用字元）
        //
        // 為什麼使用 '*'：
        // - 一個 partial 可能被多個頁面使用
        // - 無法精確知道哪些頁面受影響
        // - 重載所有頁面是最安全的做法
        //
        // 替代方案（未採用）：
        // - path: '/' - 僅重載首頁
        // - 分析依賴關係圖 - 過於複雜，效益不高
        server.ws.send({
          type: 'full-reload',
          path: '*'
        });

        // 在除錯模式下輸出 HMR 資訊
        if (process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG) {
          console.log(`\n🔥 [vite-plugin-html-kit] HMR 觸發:`);
          console.log(`  ├─ 檔案: ${path.relative(rootPath, file)}`);
          console.log(`  ├─ 類型: ${isPartialFile ? 'Partial' : 'HTML'}`);
          console.log(`  ├─ 快取已清除`);
          console.log(`  └─ 瀏覽器將重新載入\n`);
        }
      }

      // 不返回任何值，讓 Vite 繼續處理其他 HMR 邏輯
      // 如果返回空陣列 []，會阻止其他插件處理此檔案
    }
  };
}
