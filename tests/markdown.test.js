import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vitePluginHtmlKit from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Markdown 功能測試套件
 *
 * 測試 Markdown 支援功能，包括：
 * - @markdown...@endmarkdown 區塊
 * - 引入 .md 檔案
 * - Frontmatter 解析
 * - Markdown 與 Blade 語法混用
 */
describe('Markdown 功能測試', () => {
  const testDir = path.join(__dirname, 'fixtures', 'markdown');
  const partialsDir = path.join(testDir, 'partials');

  beforeEach(() => {
    // 建立測試目錄結構
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (!fs.existsSync(partialsDir)) {
      fs.mkdirSync(partialsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理測試檔案
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('@markdown 區塊', () => {
    it('應該轉換基本 Markdown 語法', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        <div class="content">
          @markdown
# 標題

這是一段文字。
          @endmarkdown
        </div>
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<h1>標題</h1>');
      expect(result).toContain('<p>這是一段文字。</p>');
    });

    it('應該支援 Markdown 粗體和斜體', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        @markdown
        **粗體** 和 *斜體* 文字
        @endmarkdown
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<strong>粗體</strong>');
      expect(result).toContain('<em>斜體</em>');
    });

    it('應該支援 Markdown 列表', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        @markdown
- 項目 1
- 項目 2
- 項目 3
        @endmarkdown
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>項目 1</li>');
      expect(result).toContain('<li>項目 2</li>');
      expect(result).toContain('<li>項目 3</li>');
    });

    it('應該支援 Markdown 程式碼區塊', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        @markdown
        \`\`\`javascript
        const x = 10;
        \`\`\`
        @endmarkdown
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<code');
      expect(result).toContain('const x = 10;');
    });

    it('應該支援 Markdown 連結', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        @markdown
        [點擊這裡](https://example.com)
        @endmarkdown
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<a href="https://example.com">點擊這裡</a>');
    });
  });

  describe('Markdown 與 Blade 混用', () => {
    it('Markdown 中應該可以使用變數插值', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          title: '動態標題'
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        @markdown
        # {{ title }}
        @endmarkdown
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<h1>動態標題</h1>');
    });

    it('應該先處理 Markdown 再處理 Blade 指令', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          showContent: true
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        @markdown
        ## 內容
        @if(showContent)
        這是條件內容
        @endif
        @endmarkdown
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<h2>內容</h2>');
      expect(result).toContain('這是條件內容');
    });
  });

  describe('引入 Markdown 檔案', () => {
    it('應該支援引入 .md 檔案', () => {
      // 創建 Markdown 檔案
      fs.writeFileSync(
        path.join(partialsDir, 'article.md'),
        '# 文章標題\n\n這是文章內容。'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="article.md" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<h1>文章標題</h1>');
      expect(result).toContain('<p>這是文章內容。</p>');
    });

    it('應該支援 Markdown frontmatter', () => {
      // 創建帶 frontmatter 的 Markdown 檔案
      fs.writeFileSync(
        path.join(partialsDir, 'post.md'),
        `---
title: 文章標題
author: 作者名稱
---
# {{ title }}

作者：{{ author }}`
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="post.md" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<h1>文章標題</h1>');
      expect(result).toContain('作者：作者名稱');
    });

    it('frontmatter 應該可以被 include 屬性覆蓋', () => {
      // 創建帶 frontmatter 的 Markdown 檔案
      fs.writeFileSync(
        path.join(partialsDir, 'template.md'),
        `---
title: 預設標題
---
# {{ title }}`
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="template.md" title="自訂標題" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<h1>自訂標題</h1>');
      expect(result).not.toContain('預設標題');
    });
  });

  describe('禁用 Markdown', () => {
    it('markdown: false 應該停用 Markdown 處理', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        markdown: false
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        @markdown
        # 標題
        @endmarkdown
      `;

      const result = plugin.transformIndexHtml.handler(html);

      // Markdown 不應該被轉換
      expect(result).toContain('@markdown');
      expect(result).toContain('# 標題');
      expect(result).toContain('@endmarkdown');
      expect(result).not.toContain('<h1>標題</h1>');
    });
  });

  describe('多個 Markdown 區塊', () => {
    it('應該處理多個 @markdown 區塊', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        <div>
          @markdown
          # 第一個區塊
          @endmarkdown
        </div>
        <div>
          @markdown
          ## 第二個區塊
          @endmarkdown
        </div>
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<h1>第一個區塊</h1>');
      expect(result).toContain('<h2>第二個區塊</h2>');
    });
  });

  describe('Markdown 中的 HTML', () => {
    it('應該允許 Markdown 中的 HTML 標籤', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        @markdown
# 標題

<div class="custom">自訂 HTML</div>
        @endmarkdown
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<h1>標題</h1>');
      expect(result).toContain('<div class="custom">自訂 HTML</div>');
    });
  });
});
