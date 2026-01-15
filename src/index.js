import fs from 'fs';
import path from 'path';
import lodash from 'lodash';

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
  // 捕獲 src 屬性和其他屬性字串
  INCLUDE: /<include\s+src=["']([^"']+)["']\s*([^>]*)\/?>/gi,

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
   * 轉換 Blade 風格的邏輯標籤為 Lodash Template 語法
   *
   * 將 @if, @foreach, @switch 等 Blade 標籤轉換為 Lodash 可識別的 <% %> 語法
   * 這樣可以讓開發者使用更簡潔、可讀的語法，而不需要直接寫 Lodash 模板代碼
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

    return processed;
  };

  /**
   * 遞迴解析 HTML Include 標籤
   *
   * 處理 <include src="..." /> 標籤，載入外部 HTML partial 檔案
   * 支援：
   * - 遞迴 include（partial 內可以再 include 其他 partial）
   * - 資料傳遞（透過 HTML 屬性傳遞變數給 partial）
   * - 完整的 Lodash Template 編譯
   * - 路徑遍歷攻擊防護
   *
   * @param {string} html - 包含 include 標籤的 HTML 字串
   * @param {Object} dataContext - 當前可用的資料上下文
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
  const resolveIncludes = (html, dataContext) => {
    // 先轉換當前層的 Blade 邏輯標籤
    let processedHtml = transformLogicTags(html);

    return processedHtml.replace(REGEX.INCLUDE, (match, src, attributesStr) => {
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

        // 解析傳遞給 partial 的局部變數 (Locals)
        // 例如: <include src="..." title="Home" show="true" />
        // 會被解析為: { title: "Home", show: "true" }
        const locals = parseAttributes(attributesStr);

        // 移除不應該存在的 locals 屬性（舊版語法遺留）
        // 新版本只支援透過 HTML 屬性傳遞資料，不再支援 locals='{"key": "val"}' 格式
        if (locals.locals) {
          delete locals.locals;
        }

        // 合併資料上下文: 全域資料 + 局部變數
        // _: lodash - 讓模板內可以使用 Lodash 函式庫（例如: {{ _.capitalize(name) }}）
        const currentData = { _: lodash, ...dataContext, ...locals };

        // 遞迴處理 partial 內的 include 標籤
        const resolvedContent = resolveIncludes(content, currentData);

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
  };

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
     * @param {import('vite').ResolvedConfig} resolvedConfig - Vite 解析後的完整配置
     */
    configResolved(resolvedConfig) {
      viteConfig = resolvedConfig;
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

      // 遞迴處理所有 include 標籤
      let fullHtml = resolveIncludes(html, globalData);

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
