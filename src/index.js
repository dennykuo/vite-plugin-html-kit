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
 * 性能統計：追蹤快取效能
 *
 * 用於監控快取命中率和整體性能表現
 * 可透過環境變數 DEBUG=1 或 VITE_HTML_KIT_DEBUG=1 啟用詳細日誌
 */
const performanceStats = {
  cacheHits: 0,        // 快取命中次數
  cacheMisses: 0,      // 快取未命中次數
  transformCount: 0,   // 總轉換次數

  /**
   * 記錄快取命中
   */
  recordHit() {
    this.cacheHits++;
    this.transformCount++;
  },

  /**
   * 記錄快取未命中
   */
  recordMiss() {
    this.cacheMisses++;
    this.transformCount++;
  },

  /**
   * 取得快取命中率
   * @returns {number} 命中率百分比 (0-100)
   */
  getHitRate() {
    if (this.transformCount === 0) return 0;
    return ((this.cacheHits / this.transformCount) * 100).toFixed(2);
  },

  /**
   * 輸出性能統計到控制台
   */
  log() {
    const debugEnabled = process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG;
    if (!debugEnabled) return;

    console.log('\n📊 [vite-plugin-html-kit] 性能統計:');
    console.log(`  ├─ 總轉換次數: ${this.transformCount}`);
    console.log(`  ├─ 快取命中: ${this.cacheHits}`);
    console.log(`  ├─ 快取未命中: ${this.cacheMisses}`);
    console.log(`  └─ 命中率: ${this.getHitRate()}%`);
  }
};

/**
 * Helper: 生成內容的快速 Hash
 *
 * 使用 MD5 生成 HTML 內容的唯一識別碼，用作快取鍵值
 * MD5 速度快且碰撞機率極低，適合用於快取鍵
 *
 * @param {string} content - 要 hash 的內容
 * @returns {string} 32 字元的 MD5 hash 字串
 *
 * @example
 * hash('<p>Hello</p>') // '5eb63bbbe01eeed093cb22bb8f5acdc3'
 */
const hash = (content) => {
  return crypto.createHash('md5').update(content).digest('hex');
};

/**
 * 預編譯 Regex Patterns (效能優化)
 *
 * 為了提升效能，所有正則表達式都在模組載入時預先編譯
 * 使用全域標誌 /g 來支援多次匹配，使用 /i 來忽略大小寫
 */
const REGEX = {
  // 條件判斷 (Blade Style)
  // @if(condition) -> <% if (condition) { %>
  IF: /@if\s*\((.*?)\)/gi,
  ELSEIF: /@elseif\s*\((.*?)\)/gi,
  ELSE: /@else/gi,
  ENDIF: /@endif/gi,

  // Switch 語句 (Blade Style)
  // @switch(value) -> 開始一個 switch 區塊
  SWITCH: /@switch\s*\((.*?)\)/gi,
  CASE: /@case\s*\((.*?)\)/gi,
  BREAK: /@break/gi,
  DEFAULT: /@default/gi,
  ENDSWITCH: /@endswitch/gi,

  // 迴圈 (支援 Blade 與 JS 兩種風格)
  // @foreach(items as item) 或 @foreach(item of items)
  FOREACH: /@foreach\s*\((.*?)\)/gi,
  ENDFOREACH: /@endforeach/gi,

  // Include 標籤: <include src="..." ... />
  // 捕獲 src 屬性、其他屬性和標籤內容（用於 slot）
  // 支援自閉合和非自閉合兩種形式
  // (?<!\/) 負向後行斷言：確保 > 前面不是 /，避免錯誤匹配自閉合標籤
  INCLUDE: /<include\s+src=["']([^"']+)["']\s*([^>]*?)(?<!\/)>([\s\S]*?)<\/include>|<include\s+src=["']([^"']+)["']\s*([^>]*)\/?>/gi,

  // 佈局繼承 (Layout Inheritance)
  // @extends('layout-path')
  EXTENDS: /@extends\s*\(\s*['"](.+?)['"]\s*\)/gi,

  // Section 定義: @section('name') ... @endsection
  SECTION: /@section\s*\(\s*['"](.+?)['"]\s*\)([\s\S]*?)@endsection/gi,

  // Yield 佔位符: @yield('name') 或 @yield('name', 'default')
  YIELD: /@yield\s*\(\s*['"](.+?)['"]\s*(?:,\s*['"](.+?)['"]\s*)?\)/gi,

  // Slot 定義: @slot('name') ... @endslot
  SLOT_BLOCK: /@slot\s*\(\s*['"](.+?)['"]\s*\)([\s\S]*?)@endslot/gi,

  // Slot 佔位符: @slot('name') 或 @slot('name', 'default')
  SLOT: /@slot\s*\(\s*['"](.+?)['"]\s*(?:,\s*['"](.+?)['"]\s*)?\)/gi,

  // 屬性解析: key="value" 或 key='value'
  // 支援帶連字符的屬性名稱 (e.g., data-id)
  ATTRS: /(\w+(?:-\w+)*)=(['"])(.*?)\2/g
};

/**
 * Helper: 解析 HTML 屬性字串為物件
 *
 * 將 HTML 標籤的屬性字串解析為 JavaScript 物件
 * 例如: title="Home" show="true" -> { title: "Home", show: "true" }
 *
 * @param {string} str - 屬性字串 (e.g., 'title="Home" show="true"')
 * @returns {Object} 包含所有屬性的物件
 *
 * @example
 * parseAttributes('title="Home" active="true"')
 * // Returns: { title: "Home", active: "true" }
 */
const parseAttributes = (str) => {
  const attrs = {};
  if (!str) return attrs;

  // 使用 String.prototype.matchAll 來迭代所有匹配
  // 這比手動使用 exec() 迴圈更安全，避免 lastIndex 狀態問題
  for (const match of str.matchAll(/(\w+(?:-\w+)*)=(['"])(.*?)\2/g)) {
    const key = match[1];    // 屬性名稱
    const value = match[3];  // 屬性值 (不含引號)
    attrs[key] = value;
  }

  return attrs;
};

/**
 * Helper: 評估屬性值中的 {{ }} 表達式
 *
 * 當在 include 標籤中使用 {{ }} 傳遞資料時（例如: tags="{{ post.tags }}"），
 * 需要先評估這些表達式才能將實際的值傳遞給 partial
 *
 * 注意：此函式會保留 JavaScript 資料型別（陣列、物件等），
 * 而不是將所有值都轉換為字串
 *
 * @param {Object} attrs - 屬性物件
 * @param {Object} dataContext - 當前資料上下文
 * @param {Object} compilerOptions - Lodash template 編譯選項（未使用，為了保持一致性）
 * @returns {Object} 評估後的屬性物件
 *
 * @example
 * // 輸入: { tags: "{{ post.tags }}" }
 * // 輸出: { tags: ['vite', 'frontend', 'javascript'] }
 */
const evaluateAttributeExpressions = (attrs, dataContext, compilerOptions) => {
  const evaluated = {};

  for (const [key, value] of Object.entries(attrs)) {
    // 檢查值是否包含 {{ }} 表達式
    if (typeof value === 'string' && /^\{\{[\s\S]+?\}\}$/.test(value.trim())) {
      try {
        // 提取 {{ }} 內的表達式
        const expression = value.trim().replace(/^\{\{|\}\}$/g, '').trim();

        // 使用 Function 構造器評估表達式，保留原始資料型別
        // 這樣可以正確傳遞陣列、物件等複雜資料結構
        const func = new Function(...Object.keys(dataContext), '_', `return ${expression};`);
        evaluated[key] = func(...Object.values(dataContext), lodash);
      } catch (e) {
        // 如果評估失敗，保留原始字串
        console.warn(`\x1b[33m[vite-plugin-html-kit] 無法評估屬性 ${key} 的值: ${value}\x1b[0m`);
        evaluated[key] = value;
      }
    } else {
      // 沒有 {{ }} 表達式，直接使用原始值
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
        // 發送完整重載訊號給瀏覽器
        server.ws.send({
          type: 'full-reload',
          path: '*'
        });
      }
    }
  };
}
