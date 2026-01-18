import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vitePluginHtmlKit from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 整合測試套件
 *
 * 測試插件的整體功能和與 Vite 的整合
 * 包括完整的使用場景和真實世界的案例
 */
describe('整合測試', () => {
  const testDir = path.join(__dirname, 'fixtures', 'integration');
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

  describe('完整頁面渲染', () => {
    it('應該正確渲染包含多個功能的完整頁面', () => {
      // 建立 partials
      fs.writeFileSync(
        path.join(partialsDir, 'header.html'),
        '<header><h1>{{ siteTitle }}</h1></header>'
      );

      fs.writeFileSync(
        path.join(partialsDir, 'nav.html'),
        `<nav>
          @foreach (navItems as item)
            <a href="{{ item.url }}">{{ item.label }}</a>
          @endforeach
        </nav>`
      );

      fs.writeFileSync(
        path.join(partialsDir, 'footer.html'),
        '<footer><p>&copy; {{ year }} {{ siteTitle }}</p></footer>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          siteTitle: 'My Website',
          year: 2026,
          navItems: [
            { url: '/', label: 'Home' },
            { url: '/about', label: 'About' },
            { url: '/contact', label: 'Contact' }
          ],
          user: {
            isLoggedIn: true,
            name: 'John Doe'
          }
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>{{ siteTitle }}</title>
        </head>
        <body>
          <include src="header.html" />
          <include src="nav.html" />
          <main>
            @if (user.isLoggedIn)
              <p>Welcome back, {{ user.name }}!</p>
            @else
              <p>Please log in.</p>
            @endif
          </main>
          <include src="footer.html" />
        </body>
        </html>
      `;

      const result = plugin.transformIndexHtml(html);

      // 驗證頁面結構
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<title>My Website</title>');

      // 驗證 header
      expect(result).toContain('<h1>My Website</h1>');

      // 驗證導航
      expect(result).toContain('<a href="/">Home</a>');
      expect(result).toContain('<a href="/about">About</a>');
      expect(result).toContain('<a href="/contact">Contact</a>');

      // 驗證條件內容
      expect(result).toContain('Welcome back, John Doe!');
      expect(result).not.toContain('Please log in.');

      // 驗證 footer
      expect(result).toContain('&copy; 2026 My Website');
    });
  });

  describe('部落格文章頁面範例', () => {
    it('應該正確渲染部落格文章頁面', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'post-meta.html'),
        `<div class="meta">
          <span class="author">{{ author }}</span>
          <span class="date">{{ date }}</span>
          @if (tags && tags.length > 0)
            <div class="tags">
              @foreach (tags as tag)
                <span class="tag">{{ tag }}</span>
              @endforeach
            </div>
          @endif
        </div>`
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          post: {
            title: 'Getting Started with Vite',
            author: 'Jane Smith',
            date: '2026-01-15',
            tags: ['vite', 'frontend', 'javascript'],
            content: 'This is the post content...'
          }
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        <article>
          <h1>{{ post.title }}</h1>
          <include src="post-meta.html" author="{{ post.author }}" date="{{ post.date }}" tags="{{ post.tags }}" />
          <div class="content">{{ post.content }}</div>
        </article>
      `;

      const result = plugin.transformIndexHtml(html);

      expect(result).toContain('<h1>Getting Started with Vite</h1>');
      expect(result).toContain('Jane Smith');
      expect(result).toContain('2026-01-15');
      expect(result).toContain('<span class="tag">vite</span>');
      expect(result).toContain('<span class="tag">frontend</span>');
      expect(result).toContain('This is the post content...');
    });
  });

  describe('電子商務產品列表範例', () => {
    it('應該正確渲染產品列表', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'product-card.html'),
        `<div class="product-card">
          <img src="{{ image }}" alt="{{ name }}">
          <h3>{{ name }}</h3>
          <p class="price">\${{ price }}</p>
          @if (onSale)
            <span class="badge">SALE</span>
          @endif
          @if (stock > 0)
            <button>Add to Cart</button>
          @else
            <button disabled>Out of Stock</button>
          @endif
        </div>`
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          products: [
            { id: 1, name: 'Laptop', price: 999, image: 'laptop.jpg', onSale: true, stock: 5 },
            { id: 2, name: 'Mouse', price: 29, image: 'mouse.jpg', onSale: false, stock: 0 },
            { id: 3, name: 'Keyboard', price: 79, image: 'keyboard.jpg', onSale: false, stock: 10 }
          ]
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        <div class="products">
          @foreach (products as product)
            <include src="product-card.html"
              name="{{ product.name }}"
              price="{{ product.price }}"
              image="{{ product.image }}"
              onSale="{{ product.onSale }}"
              stock="{{ product.stock }}" />
          @endforeach
        </div>
      `;

      const result = plugin.transformIndexHtml(html);

      // 驗證所有產品都被渲染
      expect(result).toContain('Laptop');
      expect(result).toContain('$999');
      expect(result).toContain('SALE'); // 只有 Laptop 有 SALE 標誌

      expect(result).toContain('Mouse');
      expect(result).toContain('$29');
      expect(result).toContain('Out of Stock'); // Mouse 缺貨

      expect(result).toContain('Keyboard');
      expect(result).toContain('$79');
    });
  });

  describe('多語言網站範例', () => {
    it('應該支援多語言內容切換', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'welcome.html'),
        '<h1>{{ greeting }}</h1><p>{{ description }}</p>'
      );

      // 測試英文版本
      const pluginEn = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          lang: 'en',
          greeting: 'Welcome',
          description: 'This is an English page'
        }
      });
      pluginEn.configResolved({ root: process.cwd() });

      const html = '<include src="welcome.html" />';
      const resultEn = pluginEn.transformIndexHtml(html);

      expect(resultEn).toContain('<h1>Welcome</h1>');
      expect(resultEn).toContain('This is an English page');

      // 測試中文版本
      const pluginZh = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          lang: 'zh',
          greeting: '歡迎',
          description: '這是中文頁面'
        }
      });
      pluginZh.configResolved({ root: process.cwd() });

      const resultZh = pluginZh.transformIndexHtml(html);

      expect(resultZh).toContain('<h1>歡迎</h1>');
      expect(resultZh).toContain('這是中文頁面');
    });
  });

  describe('Vite Plugin Hooks', () => {
    it('應該正確實作 configResolved hook', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials'
      });

      expect(plugin.configResolved).toBeDefined();
      expect(typeof plugin.configResolved).toBe('function');

      // 測試 hook 執行
      const mockConfig = {
        root: process.cwd(),
        base: '/',
        mode: 'development'
      };

      plugin.configResolved(mockConfig);
      // Hook 應該成功執行不報錯
    });

    it('應該正確實作 transformIndexHtml hook', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials'
      });

      expect(plugin.transformIndexHtml).toBeDefined();
      expect(typeof plugin.transformIndexHtml).toBe('function');
    });

    it('應該正確實作 handleHotUpdate hook', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials'
      });

      plugin.configResolved({ root: process.cwd() });

      expect(plugin.handleHotUpdate).toBeDefined();
      expect(typeof plugin.handleHotUpdate).toBe('function');

      // 模擬 HMR 更新
      const mockHtmlFile = path.join(partialsDir, 'test.html');
      const mockServer = {
        ws: {
          send: () => {}
        }
      };

      // 應該成功執行不報錯
      plugin.handleHotUpdate({
        file: mockHtmlFile,
        server: mockServer
      });
    });

    it('plugin 應該有正確的名稱和 enforce 屬性', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials'
      });

      expect(plugin.name).toBe('vite-plugin-html-kit');
      expect(plugin.enforce).toBe('pre');
    });
  });

  describe('錯誤處理', () => {
    it('應該優雅地處理編譯錯誤', () => {
      fs.writeFileSync(
        path.join(partialsDir, 'invalid.html'),
        // 使用無效的 JavaScript 語法來製造真正的錯誤
        '<% this is invalid javascript syntax %>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {}
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="invalid.html" />';

      // 插件會優雅地處理錯誤，返回包含錯誤訊息的 HTML 註解
      // 而不是拋出異常中斷執行
      const result = plugin.transformIndexHtml(html);

      // 應該返回錯誤訊息（以 HTML 註解形式）
      expect(result).toContain('錯誤');
      expect(result).toContain('invalid.html');
    });

    it('應該正確處理空的 HTML', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '';
      const result = plugin.transformIndexHtml(html);

      expect(result).toBe('');
    });

    it('應該正確處理沒有 include 標籤的 HTML', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          title: 'Test'
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<h1>{{ title }}</h1>';
      const result = plugin.transformIndexHtml(html);

      expect(result).toContain('<h1>Test</h1>');
    });
  });

  describe('環境變數支援', () => {
    it('應該支援來自全域 data 的複雜物件', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir),
        data: {
          config: {
            api: {
              endpoint: 'https://api.example.com',
              version: 'v1'
            },
            features: {
              darkMode: true,
              analytics: false
            }
          }
        }
      });

      plugin.configResolved({ root: process.cwd() });

      const html = `
        <div>
          <p>API: {{ config.api.endpoint }}/{{ config.api.version }}</p>
          @if (config.features.darkMode)
            <button>Toggle Dark Mode</button>
          @endif
          @if (config.features.analytics)
            <script>/* Analytics */</script>
          @endif
        </div>
      `;

      const result = plugin.transformIndexHtml(html);

      expect(result).toContain('API: https://api.example.com/v1');
      expect(result).toContain('Toggle Dark Mode');
      expect(result).not.toContain('Analytics');
    });
  });
});
