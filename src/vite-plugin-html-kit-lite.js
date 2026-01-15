import fs from 'fs';
import path from 'path';

/**
 * Helper: 解析 HTML 屬性字串為物件
 *
 * 將 HTML 標籤的屬性字串解析為 JavaScript 物件
 * 例如: title="Home" show="true" -> { title: "Home", show: "true" }
 *
 * 注意：Lite 版本不使用這些屬性進行資料傳遞，僅用於未來擴展
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
 * Vite Plugin: HTML Include Only (Ultra-Lite Version)
 *
 * 這是超輕量版本，提供：
 * - ✅ 支援 Partial Includes（可重用的 HTML 組件）
 * - ✅ 完整的 HMR (Hot Module Replacement) 支援
 * - ✅ 內建路徑遍歷攻擊防護
 * - ❌ 不支援變數插值（無 {{ variable }}）
 * - ❌ 不支援控制結構（無 @if, @foreach, @switch 等）
 * - ❌ 不使用 Lodash Template
 *
 * 適用情境：
 * - 只需要 HTML partial includes 功能
 * - 純靜態 HTML 組合，無需動態資料
 * - 追求最小化依賴（不依賴 Lodash）
 * - 最小檔案大小和最快執行速度
 * - 簡單的 HTML 模組化需求
 *
 * @param {Object} options - 插件配置選項
 * @param {string} [options.partialsDir='partials'] - 存放 HTML partial 檔案的目錄（相對於專案根目錄）
 * @returns {import('vite').Plugin} Vite 插件物件
 *
 * @example
 * // vite.config.js
 * import vitePluginHtmlKit from 'vite-plugin-html-kit/src/vite-plugin-html-kit-lite.js';
 *
 * export default {
 *   plugins: [
 *     vitePluginHtmlKit({
 *       partialsDir: 'partials'
 *     })
 *   ]
 * };
 *
 * @example
 * // 純 HTML 組合
 * // index.html
 * <!DOCTYPE html>
 * <html>
 * <head>
 *   <title>My Website</title>
 * </head>
 * <body>
 *   <include src="header.html" />
 *   <main>
 *     <h1>Welcome</h1>
 *   </main>
 *   <include src="footer.html" />
 * </body>
 * </html>
 *
 * // partials/header.html
 * <header>
 *   <nav>
 *     <a href="/">Home</a>
 *     <a href="/about">About</a>
 *   </nav>
 * </header>
 *
 * // partials/footer.html
 * <footer>
 *   <p>&copy; 2026 My Company</p>
 * </footer>
 */
export default function vitePluginHtmlKit(options = {}) {
  const {
    partialsDir = 'partials'
  } = options;

  // 儲存 Vite 的解析後配置
  let viteConfig;

  /**
   * 遞迴解析 HTML Include 標籤
   *
   * 處理 <include src="..." /> 標籤，載入外部 HTML partial 檔案
   * 支援：
   * - 遞迴 include（partial 內可以再 include 其他 partial）
   * - 路徑遍歷攻擊防護
   *
   * 注意：Lite 版本不處理任何變數或邏輯
   * 只做純 HTML 文件合併，沒有任何模板處理
   *
   * @param {string} html - 包含 include 標籤的 HTML 字串
   * @returns {string} 處理後的 HTML（include 標籤已被實際內容取代）
   *
   * @example
   * // 使用方式:
   * // <include src="header.html" />
   * // <include src="navigation.html" />
   *
   * // 結果就是直接插入 header.html 和 navigation.html 的內容
   * // 不會處理任何變數或條件邏輯
   */
  const resolveIncludes = (html) => {
    // Regex 匹配: <include src="file" ...> 或 <include src="file" ... />
    // 捕獲群組 1: src 值
    // 捕獲群組 2: 其他屬性（在 lite 版本中被忽略）
    const includeRegExp = /<include\s+src=["']([^"']+)["']\s*([^>]*)\/?>/gi;

    return html.replace(includeRegExp, (match, src, attributesStr) => {
      const rootPath = viteConfig?.root || process.cwd();
      const absolutePartialsDir = path.resolve(rootPath, partialsDir);
      const filePath = path.resolve(absolutePartialsDir, src);

      // 🔒 安全性檢查：防止路徑遍歷攻擊
      // 確保解析後的檔案路徑必須在 partialsDir 目錄內
      // 這可以防止攻擊者使用 "../../../etc/passwd" 讀取系統檔案
      if (!filePath.startsWith(absolutePartialsDir)) {
        const errorMsg = `路徑遍歷攻擊偵測: ${src}`;
        console.error(`\x1b[31m[vite-plugin-html-kit-lite] ${errorMsg}\x1b[0m`);
        return `<!-- [vite-plugin-html-kit-lite] 錯誤: ${errorMsg} -->`;
      }

      // 檢查檔案是否存在
      if (!fs.existsSync(filePath)) {
        const errorMsg = `找不到檔案: ${src}`;
        console.warn(`\x1b[33m[vite-plugin-html-kit-lite] ${errorMsg}\x1b[0m`);
        return `<!-- [vite-plugin-html-kit-lite] 警告: ${errorMsg} -->`;
      }

      try {
        // 讀取 partial 檔案內容
        let content = fs.readFileSync(filePath, 'utf-8');

        // 遞迴處理 partial 內的 include 標籤
        // Lite 版本只做文件合併，不做任何模板處理
        const resolvedContent = resolveIncludes(content);

        // 直接返回解析後的內容，不使用 Lodash template 編譯
        return resolvedContent;

      } catch (error) {
        const errorMsg = `處理檔案 ${src} 時發生錯誤: ${error.message}`;
        console.error(`\x1b[31m[vite-plugin-html-kit-lite] ${errorMsg}\x1b[0m`);
        return `<!-- [vite-plugin-html-kit-lite] 錯誤: ${errorMsg} -->`;
      }
    });
  };

  // 返回 Vite Plugin 物件
  return {
    // 插件名稱（與 package.json 一致，附加版本標識）
    name: 'vite-plugin-html-kit-lite',

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
     * 2. 直接返回合併後的 HTML（不做模板處理）
     *
     * 注意：Lite 版本專注於極致簡單性
     * - 不使用 Lodash template
     * - 不處理變數插值
     * - 不處理控制結構
     * - 只做純 HTML 文件合併
     *
     * @param {string} html - 原始 HTML 內容
     * @param {import('vite').IndexHtmlTransformContext} ctx - 轉換上下文
     * @returns {string} 轉換後的 HTML
     */
    transformIndexHtml(html, ctx) {
      // 遞迴處理所有 include 標籤
      // 直接返回結果，不做任何模板編譯
      return resolveIncludes(html);
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
