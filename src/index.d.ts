import { Plugin } from 'vite';

/**
 * Vite Plugin HTML Kit 配置選項
 */
export interface VitePluginHtmlKitOptions {
  /**
   * 存放 HTML partial 檔案的目錄（相對於專案根目錄）
   * @default 'partials'
   */
  partialsDir?: string;

  /**
   * 全域資料物件，所有模板都可以存取
   *
   * 這些資料可以在任何 HTML 檔案或 partial 中使用
   *
   * @default {}
   *
   * @example
   * ```typescript
   * {
   *   siteTitle: 'My Website',
   *   version: '1.0.0',
   *   user: {
   *     name: 'John',
   *     isAdmin: true
   *   }
   * }
   * ```
   */
  data?: Record<string, any>;

  /**
   * Lodash template 編譯器選項
   *
   * 可自訂插值、求值、轉義等語法的正則表達式
   *
   * @default { interpolate: /{{([\s\S]+?)}}/g }
   *
   * @see https://lodash.com/docs/4.17.15#template
   */
  compilerOptions?: {
    /**
     * 插值語法正則表達式
     * 用於變數插值，例如: {{ variable }}
     *
     * @default /{{([\s\S]+?)}}/g
     */
    interpolate?: RegExp;

    /**
     * 求值語法正則表達式
     * 用於執行 JavaScript 代碼，例如: <% code %>
     */
    evaluate?: RegExp;

    /**
     * HTML 轉義插值語法正則表達式
     * 用於自動轉義 HTML 字元，例如: <%- value %>
     */
    escape?: RegExp;

    /**
     * 模板中的變數名稱
     *
     * @default 'obj'
     */
    variable?: string;

    /**
     * 導入語句
     * 在模板中導入外部模組或變數
     */
    imports?: Record<string, any>;

    /**
     * Source URL
     * 用於調試時顯示模板來源
     */
    sourceURL?: string;
  };
}

/**
 * Vite Plugin: HTML Include & Templating Logic
 *
 * 提供強大的 HTML 模板功能，包括：
 * - 支援 Partial Includes（可重用的 HTML 組件）
 * - Blade 風格的控制結構（@if, @foreach, @switch）
 * - 使用 Lodash Template 引擎進行變數插值
 * - 完整的 HMR (Hot Module Replacement) 支援
 * - 內建路徑遍歷攻擊防護
 *
 * @param options - 插件配置選項
 * @returns Vite 插件物件
 *
 * @example
 * 基本使用
 * ```typescript
 * import { defineConfig } from 'vite';
 * import vitePluginHtmlKit from 'vite-plugin-html-kit';
 *
 * export default defineConfig({
 *   plugins: [
 *     vitePluginHtmlKit({
 *       partialsDir: 'partials',
 *       data: {
 *         siteTitle: 'My Website',
 *         version: '1.0.0'
 *       }
 *     })
 *   ]
 * });
 * ```
 *
 * @example
 * 進階配置
 * ```typescript
 * import { defineConfig } from 'vite';
 * import vitePluginHtmlKit from 'vite-plugin-html-kit';
 *
 * export default defineConfig({
 *   plugins: [
 *     vitePluginHtmlKit({
 *       partialsDir: 'src/components',
 *       data: {
 *         env: process.env.NODE_ENV,
 *         config: {
 *           apiUrl: 'https://api.example.com',
 *           features: ['feature1', 'feature2']
 *         }
 *       },
 *       compilerOptions: {
 *         interpolate: /\[\[([\s\S]+?)\]\]/g  // 使用 [[variable]] 語法
 *       }
 *     })
 *   ]
 * });
 * ```
 */
export default function vitePluginHtmlKit(
  options?: VitePluginHtmlKitOptions
): Plugin;
