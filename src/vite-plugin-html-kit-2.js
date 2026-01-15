import fs from 'fs';
import path from 'path';
import lodash from 'lodash';

export default function vitePluginHtmlKit(options = {}) {
  const {
    partialsDir = 'partials', // Default to partials
    data = {},
    compilerOptions = {}
  } = options;

  let viteConfig;

  // 轉換邏輯標籤為 Lodash Template 語法
  const transformLogicTags = (html) => {
    let processed = html;

    // 1. Conditionals - Optimization for chaining (collapse whitespace)
    // Must run BEFORE the standalone replacements
    // </if> [whitespace] <elseif ...> -> <% } else if (...) { %>
    processed = processed.replace(/<\/(?:if|elseif)>\s*<elseif\s+condition=["'](.*?)["']\s*>/gi, '<% } else if ($1) { %>');

    // </if> [whitespace] <else> -> <% } else { %>
    processed = processed.replace(/<\/(?:if|elseif)>\s*<else>/gi, '<% } else { %>');

    // 2. Standard Replacements (Standalone or first in chain)
    // <if condition="..."> -> <% if (...) { %>
    processed = processed.replace(/<if\s+condition=["'](.*?)["']\s*>/gi, '<% if ($1) { %>');
    // </if> -> <% } %>
    processed = processed.replace(/<\/if>/gi, '<% } %>');

    // <elseif condition="..."> -> <% } else if (...) { %> (Should be caught by merge above usually, but if no whitespace/previous tag?)
    // Actually standard replacement for <elseif> implies closing previous.
    // But if we merged, we consumed the previous closing tag.
    // We should only replace REMAINING <elseif> tags.
    processed = processed.replace(/<elseif\s+condition=["'](.*?)["']\s*>/gi, '<% } else if ($1) { %>');
    // </elseif> -> <% } %>
    processed = processed.replace(/<\/elseif>/gi, '<% } %>');

    // <else> -> <% } else { %>
    processed = processed.replace(/<else>/gi, '<% } else { %>');
    processed = processed.replace(/<\/else>/gi, '<% } %>');

    // 3. Switch Case (Refactored to IIFE to avoid break/switch syntax errors)
    // <switch expression="..."> -> <% (function(){ var __val = ...; %>
    processed = processed.replace(/<switch\s+expression=["'](.*?)["']\s*>/gi, '<% (function(){ var __val = $1; %>');
    // </switch> -> <% })(); %>
    processed = processed.replace(/<\/switch>/gi, '<% })(); %>');

    // <case n="..."> -> <% if (__val === ...) { %>
    processed = processed.replace(/<case\s+n=["'](.*?)["']\s*>/gi, '<% if (__val === $1) { %>');
    // <default> -> <% { %> (treated as always run if we reach here, but we need to ensure previous cases returned)
    // Actually, IIFE logic:
    // if A return
    // if B return
    // default (no if) return
    processed = processed.replace(/<default>/gi, '<% { %>');

    // Closing case/default -> return; }
    processed = processed.replace(/<\/case>/gi, '<% return; } %>');
    processed = processed.replace(/<\/default>/gi, '<% return; } %>');


    // 4. Loops
    // <each loop="item, index in items"> -> Native for loop
    // Regex to parse `item, index in items` OR `item in items`
    processed = processed.replace(/<each\s+loop=["']\s*(\w+)(?:,\s*(\w+))?\s+in\s+(.+?)["']\s*>/gi, (match, item, index, collection) => {
      const idx = index || 'i'; // default index var if not provided
      // Use native for loop (assumes collection is array-like)
      return `<% for (let ${idx} = 0; ${idx} < (${collection}).length; ${idx}++) { let ${item} = (${collection})[${idx}]; %>`;
    });
    // </each> -> <% } %>
    processed = processed.replace(/<\/each>/gi, '<% } %>');

    // console.log('[DEBUG LOGIC TRANS] \n', processed);
    return processed;
  };

  // 遞迴解析函數
  const resolveIncludes = (html, dataContext) => {
    // Process Logic Tags FIRST
    let processedHtml = transformLogicTags(html);

    // Regex matches: <include src="file" ...attributes...> OR <include src="file" ...attributes... />
    // Capture group 1: src value
    // Capture group 2: all other attributes (locals, etc)
    const includeRegExp = /<include\s+src=["']([^"']+)["']\s*([^>]*)\/?>/gi;

    return processedHtml.replace(includeRegExp, (match, src, attributesStr) => {
      // 拼接路徑：使用 viteConfig.root 作為基底
      const rootPath = viteConfig?.root || process.cwd();
      const filePath = path.resolve(rootPath, partialsDir, src);

      if (!fs.existsSync(filePath)) {
        console.warn(`\x1b[33m[vite-plugin-html-includes] File not found: ${filePath}\x1b[0m`);
        return ``;
      }

      try {
        let content = fs.readFileSync(filePath, 'utf-8');

        // Transform logic tags in the INCLUDED content
        // handled by recursion

        // Parse attributes for locals
        let locals = {};
        if (attributesStr) {
          const localsMatch = attributesStr.match(/locals=(['"])(.*?)\1/);
          if (localsMatch) {
            try {
              locals = JSON.parse(localsMatch[2]);
            } catch (e) {
              console.warn(`\x1b[33m[vite-plugin-html-includes] Failed to parse locals for ${src}: ${e.message}\x1b[0m`);
            }
          }
        }



        // Merge parent dataContext with new locals
        const currentData = { _: lodash, ...dataContext, ...locals };

        // 遞迴解析 (using the updated data context)
        const resolvedContent = resolveIncludes(content, currentData);

        // Let's Compile the partial content with currentData
        const compiled = lodash.template(resolvedContent, compilerOptions);
        return compiled(currentData);

      } catch (error) {
        console.error(`\x1b[31m[vite-plugin-html-includes] Error: ${error.message}\x1b[0m`);
        return ``;
      }
    });
  };

  return {
    name: 'vite-plugin-html-includes',

    configResolved(resolvedConfig) {
      viteConfig = resolvedConfig;
    },

    transformIndexHtml(html, ctx) {
      // 1. 遞迴引入 HTML 碎片
      // Start with global `data`
      const globalData = { _: lodash, ...data };
      let fullHtml = resolveIncludes(html, globalData);

      // 2. Lodash Template Render Global
      try {
        const compiled = lodash.template(fullHtml, compilerOptions);
        return compiled(globalData);
      } catch (error) {
        console.error(`\x1b[31m[vite-plugin-html-includes] Lodash Render Error: ${error.message}\x1b[0m`);
        return fullHtml;
      }
    },

    // HMR Support
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
