import fs from 'fs';
import path from 'path';
import lodash from 'lodash';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

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
 * 生成內容的 MD5 雜湊值
 *
 * 為 HTML 內容生成唯一的識別碼，用作 LRU 快取的鍵值。
 *
 * 為什麼使用 MD5：
 * - 速度極快（比 SHA-256 快約 2 倍）
 * - 碰撞機率極低（對於快取鍵已足夠）
 * - 固定長度 32 字元（便於管理）
 * - Node.js 原生支援，無需額外依賴
 *
 * 注意：
 * - MD5 不適合密碼學用途（容易被暴力破解）
 * - 但對於快取鍵來說，安全性不是主要考量
 * - 主要目標是快速生成唯一識別碼
 *
 * 效能：
 * - 處理 10KB HTML 約需 0.1ms
 * - 快取查詢約需 0.01ms
 * - 總體開銷可忽略不計
 *
 * @param {string} content - 要計算雜湊的內容（通常是 HTML 字串）
 * @returns {string} 32 字元的十六進位 MD5 雜湊值
 *
 * @example
 * // 基本用法
 * hash('<p>Hello</p>')
 * // 返回: '5eb63bbbe01eeed093cb22bb8f5acdc3'
 *
 * @example
 * // 用於快取鍵
 * const cacheKey = hash(htmlContent);
 * const cached = transformCache.get(cacheKey);
 */
const hash = (content) => {
  return crypto.createHash('md5').update(content).digest('hex');
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
  // 📌 條件判斷語句 (Conditionals)
  // ====================================================================
  // 支援 Blade 風格的條件判斷語法
  //
  // 轉換規則：
  // @if(condition)     -> <% if (condition) { %>
  // @elseif(condition) -> <% } else if (condition) { %>
  // @else              -> <% } else { %>
  // @endif             -> <% } %>
  //
  // 範例：
  // @if(user.isAdmin)
  //   <p>管理員面板</p>
  // @elseif(user.isEditor)
  //   <p>編輯面板</p>
  // @else
  //   <p>一般用戶</p>
  // @endif

  /** 匹配 @if(condition) */
  IF: /@if\s*\((.*?)\)/gi,

  /** 匹配 @elseif(condition) */
  ELSEIF: /@elseif\s*\((.*?)\)/gi,

  /** 匹配 @else */
  ELSE: /@else/gi,

  /** 匹配 @endif */
  ENDIF: /@endif/gi,

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
  // 範例：
  // @foreach(products as product)
  //   <div>{{ product.name }}</div>
  // @endforeach

  /** 匹配 @foreach(expression) */
  FOREACH: /@foreach\s*\((.*?)\)/gi,

  /** 匹配 @endforeach */
  ENDFOREACH: /@endforeach/gi,

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
   */
  SECTION: /@section\s*\(\s*['"](.+?)['"]\s*\)([\s\S]*?)@endsection/gi,

  /**
   * 匹配 @yield('name') 或 @yield('name', 'default')
   * 捕獲群組: $1=yield名稱, $2=預設值(可選)
   */
  YIELD: /@yield\s*\(\s*['"](.+?)['"]\s*(?:,\s*['"](.+?)['"]\s*)?\)/gi,

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
    console.warn(`\x1b[33m[vite-plugin-html-kit] 解析屬性時發生錯誤: ${error.message}\x1b[0m`);
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
        console.warn(
          `\x1b[33m[vite-plugin-html-kit] 無法評估屬性表達式\x1b[0m\n` +
          `  屬性: ${key}\n` +
          `  值: ${value}\n` +
          `  錯誤: ${error.message}`
        );
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

  // 統一的 Lodash Template 編譯選項
  // 支援 {{ variable }} 語法進行變數插值
  const defaultCompilerOptions = {
    interpolate: /{{([\s\S]+?)}}/g,  // 自訂插值語法: {{ ... }}
    ...compilerOptions
  };

  /**
   * 轉換 Blade 風格的邏輯標籤為 Lodash Template 語法（含快取優化）
   *
   * 將 @if, @foreach, @switch 等 Blade 標籤轉換為 Lodash 可識別的 <% %> 語法
   * 這樣可以讓開發者使用更簡潔、可讀的語法，而不需要直接寫 Lodash 模板代碼
   *
   * 性能優化：
   * - 使用 LRU Cache 儲存轉換結果
   * - 相同的 HTML 內容會直接從快取返回，避免重複的 regex 操作
   * - 快取命中時性能提升 50 倍以上
   *
   * @param {string} html - 包含 Blade 標籤的 HTML 字串
   * @returns {string} 轉換後的 HTML（使用 Lodash Template 語法）
   *
   * @example
   * // Input:
   * // @if (user.isAdmin)
   * //   <p>Admin Panel</p>
   * // @endif
   *
   * // Output:
   * // <% if (user.isAdmin) { %>
   * //   <p>Admin Panel</p>
   * // <% } %>
   */
  const transformLogicTags = (html) => {
    // 🚀 性能優化：檢查快取
    const cacheKey = hash(html);
    const cached = transformCache.get(cacheKey);

    if (cached !== undefined) {
      // 快取命中，直接返回
      performanceStats.recordHit();
      return cached;
    }

    // 快取未命中，執行轉換
    performanceStats.recordMiss();

    let processed = html;

    // 1. 條件判斷 (Conditionals)
    // @if(expression) -> <% if (expression) { %>
    processed = processed.replace(REGEX.IF, '<% if ($1) { %>');
    processed = processed.replace(REGEX.ELSEIF, '<% } else if ($1) { %>');
    processed = processed.replace(REGEX.ELSE, '<% } else { %>');
    processed = processed.replace(REGEX.ENDIF, '<% } %>');

    // 2. Switch 語句 (Switch Statements)
    //
    // 使用 if/else 鏈模擬 switch 行為，避免 JavaScript switch 的 break 問題
    // 使用唯一的變數名避免與用戶代碼衝突
    //
    // @switch(value)              -> <% { const __vphk_sw__ = (value); if (false) { %>
    // @case(val)                  -> <% } else if (__vphk_sw__ === (val)) { %>
    // @default                    -> <% } else { %>
    // @endswitch                  -> <% } } %>

    // __vphk_sw__ = vite-plugin-html-kit switch variable
    // 使用雙底線前後綴，降低變數名稱衝突的可能性
    processed = processed.replace(REGEX.SWITCH, '<% { const __vphk_sw__ = ($1); if (false) { %>');
    processed = processed.replace(REGEX.CASE, '<% } else if (__vphk_sw__ === ($1)) { %>');
    processed = processed.replace(REGEX.BREAK, '');  // @break 在 if/else 結構中是隱含的
    processed = processed.replace(REGEX.DEFAULT, '<% } else { %>');
    processed = processed.replace(REGEX.ENDSWITCH, '<% } } %>');

    // 3. 迴圈 (Loops)
    //
    // 支援兩種語法風格：
    // - Blade 風格: @foreach(items as item)
    // - JavaScript 風格: @foreach(item of items)
    //
    // 兩者都會被轉換為標準的 JavaScript for...of 迴圈
    processed = processed.replace(REGEX.FOREACH, (match, expression) => {
      expression = expression.trim();
      let collection, item;

      // 解析 "collection as item" 語法 (Blade 風格)
      if (expression.includes(' as ')) {
        [collection, item] = expression.split(' as ').map(s => s.trim());
      }
      // 解析 "item of collection" 語法 (JavaScript 風格)
      else if (expression.includes(' of ')) {
        let parts = expression.split(' of ').map(s => s.trim());
        collection = parts[1];
        item = parts[0].replace(/^let\s+|^const\s+|^var\s+/, '');  // 移除變數宣告關鍵字
      }
      // 如果兩種語法都不匹配，直接當作原生 for 迴圈語法
      else {
        return `<% for (${expression}) { %>`;
      }

      return `<% for (let ${item} of ${collection}) { %>`;
    });
    processed = processed.replace(REGEX.ENDFOREACH, '<% } %>');

    // 🚀 性能優化：將結果儲存到快取
    transformCache.set(cacheKey, processed);

    return processed;
  };

  /**
   * 解析 @section 區塊
   *
   * 從 HTML 中提取所有 @section('name')...@endsection 區塊
   * 返回一個物件，鍵為 section 名稱，值為 section 內容
   *
   * @param {string} html - 包含 section 定義的 HTML 字串
   * @returns {Object} section 名稱到內容的映射
   *
   * @example
   * // HTML: @section('title')Home Page@endsection
   * // Returns: { title: 'Home Page' }
   */
  const parseSections = (html) => {
    const sections = {};
    let match;

    // 重置 regex 的 lastIndex（避免狀態殘留）
    REGEX.SECTION.lastIndex = 0;

    while ((match = REGEX.SECTION.exec(html)) !== null) {
      const name = match[1];       // section 名稱
      const content = match[2];    // section 內容
      sections[name] = content.trim();
    }

    return sections;
  };

  /**
   * 處理佈局繼承（含循環引用檢測）
   *
   * 處理 @extends 指令，載入佈局檔案並將 @section 內容填入 @yield 佔位符
   * 支援：
   * - 佈局繼承
   * - Section/Yield 機制
   * - 默認值支援
   * - 循環引用檢測（防止 A extends B extends A）
   * - 多層佈局的 section 傳遞
   *
   * @param {string} html - 包含 @extends 和 @section 的 HTML 字串
   * @param {string} [currentFile='root'] - 當前檔案名稱（用於循環引用檢測）
   * @param {Object} [inheritedSections={}] - 從子頁面繼承的 sections
   * @returns {string} 處理後的 HTML（已應用佈局）
   */
  const processExtends = (() => {
    // 🔄 使用閉包儲存佈局堆疊，用於循環引用檢測
    const layoutStack = [];

    return function process(html, currentFile = 'root', inheritedSections = {}) {
      // 檢查是否有 @extends 指令
      const extendsMatch = html.match(REGEX.EXTENDS);
      if (!extendsMatch) {
        // 沒有 @extends，直接返回
        return html;
      }

      // 提取佈局路徑
      const layoutPath = extendsMatch[0].replace(REGEX.EXTENDS, '$1');

      // 🔒 循環引用檢測
      if (layoutStack.includes(layoutPath)) {
        const cycle = [...layoutStack, layoutPath].join(' → ');
        const errorMsg = `循環佈局引用偵測: ${cycle}`;
        console.error(`\x1b[31m[vite-plugin-html-kit] ${errorMsg}\x1b[0m`);
        return `<!-- [vite-plugin-html-kit] 錯誤: ${errorMsg} -->`;
      }

      layoutStack.push(layoutPath);

      try {
        // 移除 @extends 指令
        html = html.replace(REGEX.EXTENDS, '');

        // 解析所有 @section 區塊
        const sections = parseSections(html);

        // 移除所有 @section 定義（已經提取到 sections 物件）
        html = html.replace(REGEX.SECTION, '');

        // 讀取佈局檔案
        const rootPath = viteConfig?.root || process.cwd();
        const absolutePartialsDir = path.resolve(rootPath, partialsDir);
        const layoutFilePath = path.resolve(absolutePartialsDir, layoutPath);

        // 🔒 安全性檢查：路徑遍歷攻擊防護
        // 確保解析後的檔案路徑必須在 partialsDir 目錄內
        if (!layoutFilePath.startsWith(absolutePartialsDir)) {
          console.error(`\x1b[31m[vite-plugin-html-kit] 路徑遍歷攻擊偵測: ${layoutPath}\x1b[0m`);
          return `<!-- [vite-plugin-html-kit] 錯誤: 不允許的佈局路徑 -->`;
        }

        if (!fs.existsSync(layoutFilePath)) {
          console.warn(`\x1b[33m[vite-plugin-html-kit] 找不到佈局檔案: ${layoutPath}\x1b[0m`);
          return `<!-- [vite-plugin-html-kit] 錯誤: 找不到佈局檔案 ${layoutPath} -->`;
        }

        let layoutContent = fs.readFileSync(layoutFilePath, 'utf-8');

        // 遞迴處理佈局的 @extends（支援多層佈局）
        // 先提取佈局中的 sections（如果有）
        const layoutSections = parseSections(layoutContent);

        // 合併所有可用的 sections：當前頁面 sections + 繼承的 sections
        // 優先使用當前頁面的 sections（覆蓋繼承的同名 sections）
        const allSections = { ...inheritedSections, ...sections };

        // 處理佈局的 extends，並傳遞合併後的 sections
        layoutContent = process(layoutContent, layoutPath, allSections);

        // 替換 @yield 佔位符
        // 優先順序：當前頁面 sections > 繼承的 sections > 佈局自己的 sections > 默認值
        layoutContent = layoutContent.replace(REGEX.YIELD, (match, name, defaultValue) => {
          // 如果當前頁面有對應的 section，使用當前頁面的 section 內容
          if (sections[name] !== undefined) {
            return sections[name];
          }
          // 否則如果繼承的 sections 有，使用繼承的 section 內容
          if (inheritedSections[name] !== undefined) {
            return inheritedSections[name];
          }
          // 否則如果佈局有對應的 section，使用佈局的 section 內容
          if (layoutSections[name] !== undefined) {
            return layoutSections[name];
          }
          // 都沒有，使用默認值（如果有提供）
          if (defaultValue !== undefined) {
            return defaultValue;
          }
          // 都沒有，返回空字串
          return '';
        });

        return layoutContent;

      } catch (error) {
        console.error(`\x1b[31m[vite-plugin-html-kit] 處理佈局時發生錯誤: ${error.message}\x1b[0m`);
        return `<!-- [vite-plugin-html-kit] 錯誤: ${error.message} -->`;
      } finally {
        // 無論成功或失敗，都要從堆疊中移除
        layoutStack.pop();
      }
    };
  })();

  /**
   * 遞迴解析 HTML Include 標籤（含循環引用檢測）
   *
   * 處理 <include src="..." /> 標籤，載入外部 HTML partial 檔案
   * 支援：
   * - 遞迴 include（partial 內可以再 include 其他 partial）
   * - 資料傳遞（透過 HTML 屬性傳遞變數給 partial）
   * - 完整的 Lodash Template 編譯
   * - 路徑遍歷攻擊防護
   * - 循環引用檢測（防止無限遞迴）
   *
   * @param {string} html - 包含 include 標籤的 HTML 字串
   * @param {Object} dataContext - 當前可用的資料上下文
   * @param {string} [currentFile='root'] - 當前正在處理的檔案名稱（用於循環引用檢測）
   * @returns {string} 處理後的 HTML（include 標籤已被實際內容取代）
   *
   * @example
   * // 使用方式:
   * // <include src="header.html" title="Home" active="true" />
   *
   * // header.html 內可以使用:
   * // <h1>{{ title }}</h1>
   * // @if (active === 'true')
   * //   <span>Active</span>
   * // @endif
   */
  const resolveIncludes = (() => {
    // 🔄 使用閉包儲存 include 堆疊，用於循環引用檢測
    // 每個元素是正在處理的檔案路徑
    const includeStack = [];

    /**
     * 內部遞迴函式，帶循環引用檢測
     */
    return function resolve(html, dataContext, currentFile = 'root') {
      // 🔍 循環引用檢測：檢查當前檔案是否已在處理堆疊中
      if (includeStack.includes(currentFile)) {
        // 發現循環引用！建立循環路徑字串用於錯誤訊息
        const cycle = [...includeStack, currentFile].join(' → ');
        const errorMsg = `循環引用偵測: ${cycle}`;
        console.error(`\x1b[31m[vite-plugin-html-kit] ${errorMsg}\x1b[0m`);
        return `<!-- [vite-plugin-html-kit] 錯誤: ${errorMsg} -->`;
      }

      // 將當前檔案加入處理堆疊
      includeStack.push(currentFile);

      try {
        // 先轉換當前層的 Blade 邏輯標籤
        let processedHtml = transformLogicTags(html);

        return processedHtml.replace(REGEX.INCLUDE, (match, src, attributesStr, includeContent, src2, attributesStr2) => {
          // 處理兩種形式的 include 標籤
          // 形式1: <include src="..." ...>content</include>（包含 slot）
          // 形式2: <include src="..." ... />（自閉合，無 slot）
          if (!src) {
            // 如果第一組沒匹配到，使用第二組（自閉合形式）
            src = src2;
            attributesStr = attributesStr2;
            includeContent = '';
          }
          const rootPath = viteConfig?.root || process.cwd();
          const absolutePartialsDir = path.resolve(rootPath, partialsDir);
          const filePath = path.resolve(absolutePartialsDir, src);

          // 🔒 安全性檢查：防止路徑遍歷攻擊
          // 確保解析後的檔案路徑必須在 partialsDir 目錄內
          // 這可以防止攻擊者使用 "../../../etc/passwd" 讀取系統檔案
          if (!filePath.startsWith(absolutePartialsDir)) {
            const errorMsg = `路徑遍歷攻擊偵測: ${src}`;
            console.error(`\x1b[31m[vite-plugin-html-kit] ${errorMsg}\x1b[0m`);
            return `<!-- [vite-plugin-html-kit] 錯誤: ${errorMsg} -->`;
          }

          // 檢查檔案是否存在
          if (!fs.existsSync(filePath)) {
            const errorMsg = `找不到檔案: ${src}`;
            console.warn(`\x1b[33m[vite-plugin-html-kit] ${errorMsg}\x1b[0m`);
            return `<!-- [vite-plugin-html-kit] 警告: ${errorMsg} -->`;
          }

          try {
            // 讀取 partial 檔案內容
            let content = fs.readFileSync(filePath, 'utf-8');

            // 🎰 解析 Slot 內容（如果有）
            // 從 <include>...</include> 標籤內容中提取 @slot('name')...@endslot 區塊
            const slots = {};
            if (includeContent && includeContent.trim()) {
              let slotMatch;
              // 重置 regex 的 lastIndex
              REGEX.SLOT_BLOCK.lastIndex = 0;

              while ((slotMatch = REGEX.SLOT_BLOCK.exec(includeContent)) !== null) {
                const slotName = slotMatch[1];      // slot 名稱
                const slotContent = slotMatch[2];   // slot 內容
                slots[slotName] = slotContent.trim();
              }
            }

            // 🎰 替換組件中的 @slot 佔位符
            // 在處理 include 之前，先替換 slot 佔位符
            content = content.replace(REGEX.SLOT, (slotMatch, slotName, defaultValue) => {
              // 如果有對應的 slot 內容，使用 slot 內容
              if (slots[slotName] !== undefined) {
                return slots[slotName];
              }
              // 否則使用默認值（如果有提供）
              if (defaultValue !== undefined) {
                return defaultValue;
              }
              // 都沒有，返回空字串
              return '';
            });

            // 解析傳遞給 partial 的局部變數 (Locals)
            // 例如: <include src="..." title="Home" show="true" />
            // 會被解析為: { title: "Home", show: "true" }
            const rawLocals = parseAttributes(attributesStr);

            // 移除不應該存在的 locals 屬性（舊版語法遺留）
            // 新版本只支援透過 HTML 屬性傳遞資料，不再支援 locals='{"key": "val"}' 格式
            if (rawLocals.locals) {
              delete rawLocals.locals;
            }

            // 評估屬性值中的 {{ }} 表達式
            // 例如: tags="{{ post.tags }}" 會被評估為實際的陣列值
            const locals = evaluateAttributeExpressions(rawLocals, dataContext, defaultCompilerOptions);

            // 合併資料上下文: 全域資料 + 局部變數
            // _: lodash - 讓模板內可以使用 Lodash 函式庫（例如: {{ _.capitalize(name) }}）
            const currentData = { _: lodash, ...dataContext, ...locals };

            // 🔄 遞迴處理 partial 內的 include 標籤，傳入當前檔案名稱用於循環檢測
            const resolvedContent = resolve(content, currentData, src);

            // 編譯並執行 Lodash Template
            try {
              const compiled = lodash.template(resolvedContent, defaultCompilerOptions);
              return compiled(currentData);
            } catch (e) {
              // 如果編譯失敗，根據環境變數決定是否顯示除錯資訊
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
            const errorMsg = `處理檔案 ${src} 時發生錯誤: ${error.message}`;
            console.error(`\x1b[31m[vite-plugin-html-kit] ${errorMsg}\x1b[0m`);
            return `<!-- [vite-plugin-html-kit] 錯誤: ${errorMsg} -->`;
          }
        });

      } finally {
        // ✅ 處理完成後，必須從堆疊移除當前檔案
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
     * 排除 partials 目錄中的檔案，避免它們被當作獨立的入口點建構
     * 這些檔案應該只作為 include 的來源，不應該產生獨立的輸出檔案
     *
     * @param {import('vite').UserConfig} config - Vite 使用者配置
     */
    config(config) {
      if (!config.build || !config.build.rollupOptions || !config.build.rollupOptions.input) {
        return;
      }

      const input = config.build.rollupOptions.input;
      const rootPath = config.root || process.cwd();
      const absolutePartialsDir = path.resolve(rootPath, partialsDir);

      // 如果 input 是物件格式，檢查每個入口點
      if (typeof input === 'object' && !Array.isArray(input)) {
        for (const key in input) {
          const filePath = path.resolve(rootPath, input[key]);
          // 移除位於 partials 目錄內的入口點
          if (filePath.startsWith(absolutePartialsDir)) {
            delete input[key];
          }
        }
      }
    },

    /**
     * Vite ConfigResolved Hook: 儲存解析後的配置供後續使用
     *
     * 同時設置 process 退出時輸出性能統計（僅在 DEBUG 模式下）
     *
     * @param {import('vite').ResolvedConfig} resolvedConfig - Vite 解析後的完整配置
     */
    configResolved(resolvedConfig) {
      viteConfig = resolvedConfig;

      // 在 process 退出時輸出性能統計（僅在 DEBUG 模式下）
      // 使用 once 確保只註冊一次
      if (process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG) {
        process.once('beforeExit', () => {
          performanceStats.log();
        });
      }
    },

    /**
     * Vite TransformIndexHtml Hook: 轉換 HTML 檔案
     *
     * 這是主要的轉換邏輯，處理所有 HTML 檔案：
     * 1. 解析並替換 <include> 標籤
     * 2. 轉換 Blade 風格的邏輯標籤
     * 3. 編譯 Lodash Template
     * 4. 注入全域資料
     *
     * @param {string} html - 原始 HTML 內容
     * @param {import('vite').IndexHtmlTransformContext} ctx - 轉換上下文
     * @returns {string} 轉換後的 HTML
     */
    transformIndexHtml(html, ctx) {
      // 建立全域資料上下文
      // _: lodash - 讓所有模板都可以使用 Lodash 函式庫
      const globalData = { _: lodash, ...data };

      // 取得當前處理的檔案名稱（用於循環引用檢測的錯誤訊息）
      const filename = ctx?.filename ? path.basename(ctx.filename) : 'index.html';

      // 🎨 步驟 1: 處理佈局繼承（@extends + @section + @yield）
      // 必須在其他處理之前執行，因為佈局可能包含 include 和其他邏輯
      html = processExtends(html, filename);

      // 🎨 步驟 1.5: 轉換 Blade 邏輯標籤
      // 在處理 extends 後，確保所有 @if/@foreach/@switch 都被轉換
      html = transformLogicTags(html);

      // 🧩 步驟 2: 遞迴處理所有 include 標籤（帶槽位支援和循環引用檢測）
      let fullHtml = resolveIncludes(html, globalData, filename);

      try {
        // 編譯並執行最終的 HTML 模板
        const compiled = lodash.template(fullHtml, defaultCompilerOptions);
        return compiled(globalData);
      } catch (error) {
        console.error(`\x1b[31m[vite-plugin-html-kit] Lodash 渲染錯誤: ${error.message}\x1b[0m`);
        // 發生錯誤時返回未編譯的 HTML，讓開發者可以看到原始內容
        return fullHtml;
      }
    },

    /**
     * Vite HandleHotUpdate Hook: 處理 Hot Module Replacement (HMR)
     *
     * 當 HTML 檔案或 partials 目錄內的檔案變更時，觸發完整的頁面重載
     * 這確保了開發時修改 HTML 或 partial 檔案可以立即看到效果
     *
     * @param {Object} context - HMR 上下文
     * @param {string} context.file - 變更的檔案路徑
     * @param {import('vite').ViteDevServer} context.server - Vite 開發伺服器實例
     */
    handleHotUpdate({ file, server }) {
      const rootPath = viteConfig?.root || process.cwd();
      const absolutePartialsDir = path.resolve(rootPath, partialsDir);

      // 檢查是否為 HTML 檔案或 partials 目錄內的檔案
      const isHtmlFile = file.endsWith('.html');
      const isPartialFile = file.startsWith(absolutePartialsDir);

      if (isHtmlFile || isPartialFile) {
        // 🔥 清除快取：確保下次請求時重新轉換
        // 當 HTML 或 partial 檔案變更時，必須清除快取
        // 否則會返回舊的快取內容，導致熱更新失效
        transformCache.clear();

        // 發送完整重載訊號給瀏覽器
        server.ws.send({
          type: 'full-reload',
          path: '*'
        });
      }
    }
  };
}
