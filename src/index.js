import fs from 'fs';
import path from 'path';
import lodash from 'lodash';

/**
 * 預編譯 Regex Patterns (效能優化)
 */
const REGEX = {


  // 條件 (Blade Style)
  IF: /@if\s*\((.*?)\)/gi,
  ELSEIF: /@elseif\s*\((.*?)\)/gi,
  ELSE: /@else/gi,
  ENDIF: /@endif/gi,

  // Switch (Blade Style)
  SWITCH: /@switch\s*\((.*?)\)/gi,
  CASE: /@case\s*\((.*?)\)/gi,
  BREAK: /@break/gi,
  DEFAULT: /@default/gi,
  ENDSWITCH: /@endswitch/gi,

  // 迴圈 (Blade & JS Style)
  FOREACH: /@foreach\s*\((.*?)\)/gi,
  ENDFOREACH: /@endforeach/gi,

  // Include 標籤: <include src="..." ... />
  // 捕獲 src 和 其餘屬性字串
  INCLUDE: /<include\s+src=["']([^"']+)["']\s*([^>]*)\/?>/gi,

  // 屬性解析: key="value" 或 key='value'
  ATTRS: /(\w+(?:-\w+)*)=(['"])(.*?)\2/g
};

/**
 * Helper: 解析 HTML 屬性字串為物件
 * @param {string} str 屬性字串 (e.g. title="Home" show="true")
 * @returns {object}
 */
const parseAttributes = (str) => {
  const attrs = {};
  if (!str) return attrs;

  let match;
  // 重置 lastIndex 因為我們在重複使用全域 RegExp (如果它有 /g flag)
  // 但這裡 REGEX.ATTRS 是全域的，所以直接用 matchAll 或 while exec 都可以
  // 為了安全起見，這邊使用 RegExp.prototype.exec 的迴圈
  const regex = new RegExp(REGEX.ATTRS); // Clone for local state safety or just use matchAll logic

  // 簡單的 regex exec 迴圈
  while ((match = regex.exec(str)) !== null) {
    const key = match[1];
    const value = match[3];
    attrs[key] = value;
  }
  return attrs;
};

/**
 * Vite Plugin: HTML Include & Templating Logic
 */
export default function vitePluginHtmlKit(options = {}) {
  const {
    partialsDir = 'partials',
    data = {},
    compilerOptions = {}
  } = options;

  let viteConfig;

  /**
   * 轉換邏輯標籤為 Lodash Template 語法
   */
  const transformLogicTags = (html) => {
    let processed = html;



    // 1. 條件判斷
    processed = processed.replace(REGEX.IF, '<% if ($1) { %>');
    processed = processed.replace(REGEX.ELSEIF, '<% } else if ($1) { %>');
    processed = processed.replace(REGEX.ELSE, '<% } else { %>');
    processed = processed.replace(REGEX.ENDIF, '<% } %>');

    // 2. Switch 語句 (使用 if/else 模式以避免 break 問題)
    // @switch(val) -> 建立區塊 scope, 定義變數, 並且開始一個 dummy if(false) 讓後續的 else if 可以串接
    processed = processed.replace(REGEX.SWITCH, '<% { const _sw = ($1); if (false) { %>');

    // @case(val) -> 關閉上一個 if/else block, 開啟新的 else if
    processed = processed.replace(REGEX.CASE, '<% } else if (_sw === ($1)) { %>');

    // @break -> 在 if/else 結構中, break 是隱含的 (因為只會執行一個 block), 所以忽略 @break
    processed = processed.replace(REGEX.BREAK, '');

    // @default -> 關閉上一個 block, 開啟 else
    processed = processed.replace(REGEX.DEFAULT, '<% } else { %>');

    // @endswitch -> 關閉最後一個 else block, 並且關閉最外層的 scope block
    processed = processed.replace(REGEX.ENDSWITCH, '<% } } %>');

    // 3. 迴圈
    processed = processed.replace(REGEX.FOREACH, (match, expression) => {
      expression = expression.trim();
      let collection, item;

      if (expression.includes(' as ')) {
        [collection, item] = expression.split(' as ').map(s => s.trim());
      } else if (expression.includes(' of ')) {
        let parts = expression.split(' of ').map(s => s.trim());
        collection = parts[1];
        item = parts[0].replace(/^let\s+|^const\s+|^var\s+/, '');
      } else {
        return `<% for (${expression}) { %>`;
      }

      return `<% for (let ${item} of ${collection}) { %>`;
    });
    processed = processed.replace(REGEX.ENDFOREACH, '<% } %>');

    return processed;
  };

  /**
   * 遞迴解析 HTML Include
   */
  const resolveIncludes = (html, dataContext) => {
    // 先轉換當前層的邏輯標籤
    let processedHtml = transformLogicTags(html);

    return processedHtml.replace(REGEX.INCLUDE, (match, src, attributesStr) => {
      const rootPath = viteConfig?.root || process.cwd();
      const filePath = path.resolve(rootPath, partialsDir, src);

      if (!fs.existsSync(filePath)) {
        console.warn(`\x1b[33m[vite-plugin-html-includes] File not found: ${filePath}\x1b[0m`);
        return ``;
      }

      try {
        let content = fs.readFileSync(filePath, 'utf-8');

        // 解析 Locals (傳遞給 Partial 的變數)
        // 變更: 僅支援透過 HTML 屬性傳遞變數 (Attribute-based locals)
        // 例如: <include src="..." title="Home" />
        // 不再支援 locals='{"key": "val"}' 這種 JSON 格式
        const locals = parseAttributes(attributesStr);

        // 如果意外傳入了 locals="..."，我們從結果中移除它，避免它汙染資料上下文
        if (locals.locals) {
          delete locals.locals;
        }

        const currentData = { _: lodash, ...dataContext, ...locals };

        const resolvedContent = resolveIncludes(content, currentData);
        // [DEBUG] Print content before compilation if error occurs
        try {
          const compiled = lodash.template(resolvedContent, compilerOptions);
          return compiled(currentData);
        } catch (e) {
          console.log('--- ERROR COMPILING PARTIAL ---');
          console.log(resolvedContent);
          console.log('-----------------------------');
          throw e;
        }

      } catch (error) {
        console.error(`\x1b[31m[vite-plugin-html-includes] Error: ${error.message}\x1b[0m`);
        return ``;
      }
    });
  };

  return {
    name: 'vite-plugin-html-includes',
    enforce: 'pre',

    config(config) {
      if (!config.build || !config.build.rollupOptions || !config.build.rollupOptions.input) {
        return;
      }
      const input = config.build.rollupOptions.input;
      const rootPath = config.root || process.cwd();
      const absolutePartialsDir = path.resolve(rootPath, partialsDir);

      if (typeof input === 'object' && !Array.isArray(input)) {
        for (const key in input) {
          const filePath = path.resolve(rootPath, input[key]);
          if (filePath.startsWith(absolutePartialsDir)) {
            delete input[key];
          }
        }
      }
    },

    configResolved(resolvedConfig) {
      viteConfig = resolvedConfig;
    },

    transformIndexHtml(html, ctx) {
      const globalData = { _: lodash, ...data };
      let fullHtml = resolveIncludes(html, globalData);

      try {
        const compiled = lodash.template(fullHtml, {
          ...compilerOptions,
          interpolate: /{{([\s\S]+?)}}/g,
        });
        return compiled(globalData);
      } catch (error) {
        console.error(`\x1b[31m[vite-plugin-html-includes] Lodash Render Error: ${error.message}\x1b[0m`);
        return fullHtml;
      }
    },

    handleHotUpdate({ file, server }) {
      if (file.endsWith('.html')) {
        server.ws.send({
          type: 'full-reload',
          path: '*'
        });
      }
    }
  };
}
