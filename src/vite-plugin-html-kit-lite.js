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


  // 遞迴解析函數
  const resolveIncludes = (html, dataContext) => {
    // Regex matches: <include src="file" ...attributes...> OR <include src="file" ...attributes... />
    // Capture group 1: src value
    // Capture group 2: all other attributes (locals, etc)
    const includeRegExp = /<include\s+src=["']([^"']+)["']\s*([^>]*)\/?>/gi;


    return html.replace(includeRegExp, (match, src, attributesStr) => {
      // 拼接路徑：使用 viteConfig.root 作為基底
      const rootPath = viteConfig?.root || process.cwd();
      const filePath = path.resolve(rootPath, partialsDir, src);


      if (!fs.existsSync(filePath)) {
        console.warn(`\x1b[33m[vite-plugin-html-includes] File not found: ${filePath}\x1b[0m`);
        return ``;
      }


      try {
        let content = fs.readFileSync(filePath, 'utf-8');


        // Parse attributes for locals
        let locals = {};
        if (attributesStr) {
          const localsMatch = attributesStr.match(/locals=(['"])(.*?)\1/);
          if (localsMatch) {
            try {
              // Replace single quotes with double quotes for valid JSON if needed,
              // though simple JSON.parse expects strict JSON.
              // If user uses locals='{"a":1}', it works.
              // If user uses locals="{a:1}", it might fail.
              // We assume valid JSON in the attribute.
              locals = JSON.parse(localsMatch[2]);
            } catch (e) {
              console.warn(`\x1b[33m[vite-plugin-html-includes] Failed to parse locals for ${src}: ${e.message}\x1b[0m`);
            }
          }
        }


        // Merge parent dataContext with new locals
        const currentData = { ...dataContext, ...locals };


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
      let fullHtml = resolveIncludes(html, data);


      // 2. Lodash Template Render Global
      try {
        const compiled = lodash.template(fullHtml, compilerOptions);
        return compiled(data);
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
