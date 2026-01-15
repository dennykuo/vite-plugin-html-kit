import fs from 'fs';
import path from 'path';
import lodash from 'lodash';

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
 * Vite Plugin: HTML Include & Templating Logic (XML-Style Tags Version)
 *
 * 這是使用 XML 風格標籤的版本，提供：
 * - 支援 Partial Includes（可重用的 HTML 組件）
 * - XML 風格的控制結構（<if>, <switch>, <each>）
 * - 使用 Lodash Template 引擎進行變數插值
 * - 完整的 HMR (Hot Module Replacement) 支援
 * - 內建路徑遍歷攻擊防護
 *
 * 語法差異對照：
 * - 條件: <if condition="..."> 替代 @if(...)
 * - 迴圈: <each loop="item in items"> 替代 @foreach(items as item)
 * - 分支: <switch expression="..."> 替代 @switch(...)
 *
 * @param {Object} options - 插件配置選項
 * @param {string} [options.partialsDir='partials'] - 存放 HTML partial 檔案的目錄（相對於專案根目錄）
 * @param {Object} [options.data={}] - 全域資料物件，所有模板都可以存取
 * @param {Object} [options.compilerOptions={}] - Lodash template 編譯器選項
 * @returns {import('vite').Plugin} Vite 插件物件
 *
 * @example
 * // vite.config.js
 * import vitePluginHtmlKit from 'vite-plugin-html-kit/src/vite-plugin-html-kit-2.js';
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
 *
 * @example
 * // 使用 XML 風格語法
 * <if condition="user.isAdmin">
 *   <p>Admin Panel</p>
 * </if>
 *
 * <each loop="item in items">
 *   <li>{{ item }}</li>
 * </each>
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
   * 轉換 XML 風格的邏輯標籤為 Lodash Template 語法
   *
   * 將 <if>, <switch>, <each> 等 XML 標籤轉換為 Lodash 可識別的 <% %> 語法
   * 這是本版本的特色，使用類似 HTML 的標籤語法而非 Blade 的 @ 語法
   *
   * @param {string} html - 包含 XML 標籤的 HTML 字串
   * @returns {string} 轉換後的 HTML（使用 Lodash Template 語法）
   *
   * @example
   * // Input:
   * // <if condition="user.isAdmin">
   * //   <p>Admin Panel</p>
   * // </if>
   *
   * // Output:
   * // <% if (user.isAdmin) { %>
   * //   <p>Admin Panel</p>
   * // <% } %>
   */
  const transformLogicTags = (html) => {
    let processed = html;

    // 1. 條件判斷 (Conditionals)
    //
    // 優化：處理連續的條件標籤（消除中間的空白）
    // 必須在獨立替換之前執行
    //
    // </if> [空白] <elseif condition="..."> -> <% } else if (...) { %>
    processed = processed.replace(
      /<\/(?:if|elseif)>\s*<elseif\s+condition=["'](.*?)["']\s*>/gi,
      '<% } else if ($1) { %>'
    );

    // </if> [空白] <else> -> <% } else { %>
    processed = processed.replace(
      /<\/(?:if|elseif)>\s*<else>/gi,
      '<% } else { %>'
    );

    // 標準替換（獨立或鏈中的第一個）
    // <if condition="..."> -> <% if (...) { %>
    processed = processed.replace(
      /<if\s+condition=["'](.*?)["']\s*>/gi,
      '<% if ($1) { %>'
    );
    // </if> -> <% } %>
    processed = processed.replace(/<\/if>/gi, '<% } %>');

    // <elseif condition="..."> -> <% } else if (...) { %>
    // （通常已被上面的合併處理，但處理沒有空白的情況）
    processed = processed.replace(
      /<elseif\s+condition=["'](.*?)["']\s*>/gi,
      '<% } else if ($1) { %>'
    );
    // </elseif> -> <% } %>
    processed = processed.replace(/<\/elseif>/gi, '<% } %>');

    // <else> -> <% } else { %>
    processed = processed.replace(/<else>/gi, '<% } else { %>');
    processed = processed.replace(/<\/else>/gi, '<% } %>');

    // 2. Switch 語句 (Switch Statements)
    //
    // 使用 IIFE（立即調用函式表達式）來避免 break/switch 語法錯誤
    // 每個 case 使用 return 來跳出，避免需要 break
    //
    // <switch expression="...">     -> <% (function(){ var __vphk_sw_xml__ = ...; %>
    // <case n="...">                -> <% if (__vphk_sw_xml__ === ...) { %>
    // </case>                       -> <% return; } %>
    // <default>                     -> <% { %>
    // </default>                    -> <% return; } %>
    // </switch>                     -> <% })(); %>

    // __vphk_sw_xml__ = vite-plugin-html-kit switch variable (XML version)
    // 使用唯一的變數名避免與用戶代碼衝突
    processed = processed.replace(
      /<switch\s+expression=["'](.*?)["']\s*>/gi,
      '<% (function(){ var __vphk_sw_xml__ = $1; %>'
    );

    processed = processed.replace(/<\/switch>/gi, '<% })(); %>');

    // <case n="..."> -> <% if (__vphk_sw_xml__ === ...) { %>
    processed = processed.replace(
      /<case\s+n=["'](.*?)["']\s*>/gi,
      '<% if (__vphk_sw_xml__ === $1) { %>'
    );

    // <default> -> <% { %>
    processed = processed.replace(/<default>/gi, '<% { %>');

    // 關閉 case/default -> return; }
    // return 確保只執行一個 case
    processed = processed.replace(/<\/case>/gi, '<% return; } %>');
    processed = processed.replace(/<\/default>/gi, '<% return; } %>');

    // 3. 迴圈 (Loops)
    //
    // XML 風格使用 <each loop="..."> 標籤
    // 支援兩種語法：
    // - <each loop="item in items"> - 只有項目
    // - <each loop="item, index in items"> - 項目 + 索引
    //
    // 轉換為原生 JavaScript for 迴圈
    processed = processed.replace(
      /<each\s+loop=["']\s*(\w+)(?:,\s*(\w+))?\s+in\s+(.+?)["']\s*>/gi,
      (match, item, index, collection) => {
        const idx = index || 'i'; // 如果沒有提供索引變數，使用預設的 'i'

        // 使用原生 for 迴圈（假設 collection 是類陣列物件）
        // 這比 for...of 更靈活，因為可以同時獲得索引
        return `<% for (let ${idx} = 0; ${idx} < (${collection}).length; ${idx}++) { let ${item} = (${collection})[${idx}]; %>`;
      }
    );

    // </each> -> <% } %>
    processed = processed.replace(/<\/each>/gi, '<% } %>');

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
   * // <if condition="active === 'true'">
   * //   <span>Active</span>
   * // </if>
   */
  const resolveIncludes = (html, dataContext) => {
    // 先轉換當前層的 XML 邏輯標籤
    let processedHtml = transformLogicTags(html);

    // Regex 匹配: <include src="file" ...attributes...> 或 <include src="file" ...attributes... />
    // 捕獲群組 1: src 值
    // 捕獲群組 2: 其他所有屬性
    const includeRegExp = /<include\s+src=["']([^"']+)["']\s*([^>]*)\/?>/gi;

    return processedHtml.replace(includeRegExp, (match, src, attributesStr) => {
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
        // 新版本只支援透過 HTML 屬性傳遞資料
        if (locals.locals) {
          delete locals.locals;
        }

        // 合併資料上下文: 全域資料 + 局部變數
        // _: lodash - 讓模板內可以使用 Lodash 函式庫（例如: {{ _.capitalize(name) }}）
        const currentData = { _: lodash, ...dataContext, ...locals };

        // 遞迴處理 partial 內的 include 標籤和邏輯標籤
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
    // 插件名稱（與 package.json 一致，附加版本標識）
    name: 'vite-plugin-html-kit-xml',

    // 在其他插件之前執行，確保 HTML 轉換優先處理
    enforce: 'pre',

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
     * 2. 轉換 XML 風格的邏輯標籤
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
