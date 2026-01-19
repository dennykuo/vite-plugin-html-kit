import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vitePluginHtmlKit from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Include 功能測試套件
 *
 * 測試 <include> 標籤的功能，包括：
 * - 基本的檔案引入
 * - 遞迴引入（partial 內再引入其他 partial）
 * - 資料傳遞
 * - 錯誤處理
 */
describe('Include 功能測試', () => {
  const testDir = path.join(__dirname, 'fixtures', 'include');
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

  describe('基本 Include 功能', () => {
    it('應該正確載入簡單的 partial', () => {
      // 建立 partial 檔案
      fs.writeFileSync(
        path.join(partialsDir, 'header.html'),
        '<header><h1>My Site</h1></header>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        <include src="header.html" />
        <main>Content</main>
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<header><h1>My Site</h1></header>');
      expect(result).toContain('<main>Content</main>');
    });

    it('應該支援多個 include 標籤', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'header.html'),
        '<header>Header</header>'
      );

      fs.writeFileSync(
        path.join(partialsDir, 'footer.html'),
        '<footer>Footer</footer>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        <include src="header.html" />
        <main>Content</main>
        <include src="footer.html" />
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<header>Header</header>');
      expect(result).toContain('<footer>Footer</footer>');
      expect(result).toContain('<main>Content</main>');
    });
  });

  describe('遞迴 Include', () => {
    it('應該支援遞迴的 include（partial 內再 include）', () => {
      // nav.html
      fs.writeFileSync(
        path.join(partialsDir, 'nav.html'),
        '<nav>Navigation</nav>'
      );

      // header.html 內包含 nav.html
      fs.writeFileSync(
        path.join(partialsDir, 'header.html'),
        '<header><include src="nav.html" /><h1>Title</h1></header>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="header.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      // 應該包含兩層的內容
      expect(result).toContain('<header>');
      expect(result).toContain('<nav>Navigation</nav>');
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('</header>');
    });

    it('應該支援多層遞迴 include', () => {
      // logo.html
      fs.writeFileSync(
        path.join(partialsDir, 'logo.html'),
        '<img src="logo.png" alt="Logo">'
      );

      // nav.html 包含 logo.html
      fs.writeFileSync(
        path.join(partialsDir, 'nav.html'),
        '<nav><include src="logo.html" /><a href="/">Home</a></nav>'
      );

      // header.html 包含 nav.html
      fs.writeFileSync(
        path.join(partialsDir, 'header.html'),
        '<header><include src="nav.html" /></header>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="header.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      // 應該包含三層的內容
      expect(result).toContain('<header>');
      expect(result).toContain('<nav>');
      expect(result).toContain('<img src="logo.png"');
      expect(result).toContain('<a href="/">Home</a>');
      expect(result).toContain('</nav>');
      expect(result).toContain('</header>');
    });
  });

  describe('資料傳遞', () => {
    it('應該透過屬性傳遞資料給 partial', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'greeting.html'),
        '<p>Hello, {{ name }}!</p>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="greeting.html" name="Alice" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<p>Hello, Alice!</p>');
    });

    it('應該支援多個屬性', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'card.html'),
        '<div class="{{ className }}"><h2>{{ title }}</h2><p>{{ description }}</p></div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="card.html" className="card-primary" title="My Card" description="This is a card" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('class="card-primary"');
      expect(result).toContain('<h2>My Card</h2>');
      expect(result).toContain('<p>This is a card</p>');
    });

    it('應該正確處理帶連字符的屬性名稱', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'button.html'),
        '<button data-id="{{ dataId }}" aria-label="{{ ariaLabel }}">{{ text }}</button>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="button.html" dataId="123" ariaLabel="Click me" text="Submit" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('data-id="123"');
      expect(result).toContain('aria-label="Click me"');
      expect(result).toContain('>Submit</button>');
    });

    it('局部變數應該覆蓋全域變數', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'message.html'),
        '<p>{{ message }}</p>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          message: 'Global Message'
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="message.html" message="Local Message" />';
      const result = plugin.transformIndexHtml.handler(html);

      // 應該使用局部變數的值
      expect(result).toContain('<p>Local Message</p>');
      expect(result).not.toContain('Global Message');
    });
  });

  describe('全域資料存取', () => {
    it('partial 應該能存取全域資料', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'user-info.html'),
        '<p>{{ siteName }} - {{ userName }}</p>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          siteName: 'My Website',
          userName: 'John'
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="user-info.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<p>My Website - John</p>');
    });

    it('應該同時支援全域資料和局部資料', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'mixed.html'),
        '<p>{{ global }} and {{ local }}</p>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          global: 'Global Value'
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="mixed.html" local="Local Value" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<p>Global Value and Local Value</p>');
    });
  });

  describe('Include 與邏輯標籤混合使用', () => {
    it('partial 內可以使用 @if 邏輯', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'conditional.html'),
        '@if (show)<p>Visible</p>@endif'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="conditional.html" show="true" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<p>Visible</p>');
    });

    it('partial 內可以使用 @foreach 迴圈', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'list.html'),
        '<ul>@foreach (items as item)<li>{{ item }}</li>@endforeach</ul>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          items: ['A', 'B', 'C']
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="list.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<li>A</li>');
      expect(result).toContain('<li>B</li>');
      expect(result).toContain('<li>C</li>');
    });
  });

  describe('子目錄支援', () => {
    it('應該支援子目錄中的 partial', () => {
      const componentsDir = path.join(partialsDir, 'components');
      fs.mkdirSync(componentsDir, { recursive: true });

      fs.writeFileSync(
        path.join(componentsDir, 'button.html'),
        '<button>Click</button>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="components/button.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<button>Click</button>');
    });

    it('應該支援多層子目錄', () => {
      const uiDir = path.join(partialsDir, 'ui', 'forms');
      fs.mkdirSync(uiDir, { recursive: true });

      fs.writeFileSync(
        path.join(uiDir, 'input.html'),
        '<input type="text" />'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="ui/forms/input.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<input type="text" />');
    });
  });

  describe('Lodash 函式庫存取', () => {
    it('partial 應該能使用 Lodash 函式', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'lodash-test.html'),
        '<p>{{ _.upperCase(text) }}</p>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="lodash-test.html" text="hello world" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<p>HELLO WORLD</p>');
    });
  });
});
