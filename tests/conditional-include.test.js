/**
 * 條件 Include 測試
 * 測試 @includeIf, @includeWhen, @includeUnless, @includeFirst 功能
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';
import fs from 'fs';
import path from 'path';

describe('條件 Include 測試', () => {
  let plugin;
  const testDir = path.join(process.cwd(), 'test-temp-conditional-include');
  const partialsDir = path.join(testDir, 'partials');

  beforeEach(() => {
    // 創建臨時測試目錄
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (!fs.existsSync(partialsDir)) {
      fs.mkdirSync(partialsDir, { recursive: true });
    }

    plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {
        isAdmin: true,
        isGuest: false,
        showHeader: true
      }
    });

    plugin.configResolved({
      root: testDir,
      command: 'serve',
      mode: 'development'
    });
  });

  afterEach(() => {
    // 清理臨時測試目錄
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('@includeWhen - 條件為 true 時 include', () => {
    test('應該在條件為 true 時 include 檔案', () => {
      const headerContent = '<header>Admin Header</header>';
      fs.writeFileSync(path.join(partialsDir, 'admin-header.html'), headerContent);

      const input = `<div class="page">
  @includeWhen(isAdmin, 'admin-header.html')
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<header>Admin Header</header>');
      expect(output).toContain('<main>Content</main>');
    });

    test('應該在條件為 false 時不 include 檔案', () => {
      const headerContent = '<header>Admin Header</header>';
      fs.writeFileSync(path.join(partialsDir, 'admin-header.html'), headerContent);

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          isAdmin: false
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `<div class="page">
  @includeWhen(isAdmin, 'admin-header.html')
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).not.toContain('<header>Admin Header</header>');
      expect(output).toContain('<main>Content</main>');
    });

    test('應該支援傳遞參數', () => {
      const headerContent = '<header>Welcome, {{ name }}</header>';
      fs.writeFileSync(path.join(partialsDir, 'header.html'), headerContent);

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          showHeader: true,
          userName: 'John'
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `<div class="page">
  @includeWhen(showHeader, 'header.html', { name: userName })
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('Welcome, John');
    });
  });

  describe('@includeUnless - 條件為 false 時 include', () => {
    test('應該在條件為 false 時 include 檔案', () => {
      const guestMenuContent = '<nav>Guest Menu</nav>';
      fs.writeFileSync(path.join(partialsDir, 'guest-menu.html'), guestMenuContent);

      const input = `<div class="page">
  @includeUnless(isGuest, 'guest-menu.html')
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<nav>Guest Menu</nav>');
      expect(output).toContain('<main>Content</main>');
    });

    test('應該在條件為 true 時不 include 檔案', () => {
      const guestMenuContent = '<nav>Guest Menu</nav>';
      fs.writeFileSync(path.join(partialsDir, 'guest-menu.html'), guestMenuContent);

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          isGuest: true
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `<div class="page">
  @includeUnless(isGuest, 'guest-menu.html')
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).not.toContain('<nav>Guest Menu</nav>');
      expect(output).toContain('<main>Content</main>');
    });

    test('應該支援傳遞參數', () => {
      const menuContent = '<nav>{{ title }}</nav>';
      fs.writeFileSync(path.join(partialsDir, 'menu.html'), menuContent);

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          isGuest: false
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `<div class="page">
  @includeUnless(isGuest, 'menu.html', { title: 'User Menu' })
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<nav>User Menu</nav>');
    });
  });

  describe('@includeIf - 只在檔案存在時 include', () => {
    test('應該在檔案存在時 include', () => {
      const customHeaderContent = '<header>Custom Header</header>';
      fs.writeFileSync(path.join(partialsDir, 'custom-header.html'), customHeaderContent);

      const input = `<div class="page">
  @includeIf('custom-header.html')
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<header>Custom Header</header>');
      expect(output).toContain('<main>Content</main>');
    });

    test('應該在檔案不存在時靜默失敗（不報錯）', () => {
      const input = `<div class="page">
  @includeIf('non-existent.html')
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).not.toContain('non-existent');
      expect(output).toContain('<main>Content</main>');
      expect(output).not.toContain('<!-- [vite-plugin-html-kit] 錯誤');
    });

    test('應該支援傳遞參數', () => {
      const headerContent = '<header>{{ title }}</header>';
      fs.writeFileSync(path.join(partialsDir, 'header.html'), headerContent);

      const input = `<div class="page">
  @includeIf('header.html', { title: 'Custom Title' })
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<header>Custom Title</header>');
    });

    test('應該在有多個 @includeIf 時正確處理', () => {
      const header1Content = '<header>Header 1</header>';
      const header2Content = '<header>Header 2</header>';

      fs.writeFileSync(path.join(partialsDir, 'header1.html'), header1Content);
      // 故意不創建 header2.html

      const input = `<div class="page">
  @includeIf('header1.html')
  @includeIf('header2.html')
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<header>Header 1</header>');
      expect(output).not.toContain('<header>Header 2</header>');
      expect(output).toContain('<main>Content</main>');
    });
  });

  describe('@includeFirst - include 第一個存在的檔案', () => {
    test('應該 include 第一個存在的檔案', () => {
      const defaultHeaderContent = '<header>Default Header</header>';
      fs.writeFileSync(path.join(partialsDir, 'default-header.html'), defaultHeaderContent);

      const input = `<div class="page">
  @includeFirst(['custom-header.html', 'default-header.html'])
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<header>Default Header</header>');
      expect(output).toContain('<main>Content</main>');
    });

    test('應該優先使用列表中第一個存在的檔案', () => {
      const customHeaderContent = '<header>Custom Header</header>';
      const defaultHeaderContent = '<header>Default Header</header>';

      fs.writeFileSync(path.join(partialsDir, 'custom-header.html'), customHeaderContent);
      fs.writeFileSync(path.join(partialsDir, 'default-header.html'), defaultHeaderContent);

      const input = `<div class="page">
  @includeFirst(['custom-header.html', 'default-header.html'])
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<header>Custom Header</header>');
      expect(output).not.toContain('<header>Default Header</header>');
    });

    test('應該在所有檔案都不存在時靜默失敗', () => {
      const input = `<div class="page">
  @includeFirst(['header1.html', 'header2.html', 'header3.html'])
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).not.toContain('header');
      expect(output).toContain('<main>Content</main>');
      expect(output).not.toContain('<!-- [vite-plugin-html-kit] 錯誤');
    });

    test('應該支援傳遞參數', () => {
      const customHeaderContent = '<header>{{ title }}</header>';
      fs.writeFileSync(path.join(partialsDir, 'custom-header.html'), customHeaderContent);

      const input = `<div class="page">
  @includeFirst(['custom-header.html', 'default-header.html'], { title: 'My Title' })
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<header>My Title</header>');
    });

    test('應該處理超過兩個檔案的列表', () => {
      const fallbackContent = '<header>Fallback</header>';
      fs.writeFileSync(path.join(partialsDir, 'fallback.html'), fallbackContent);

      const input = `<div class="page">
  @includeFirst(['first.html', 'second.html', 'third.html', 'fallback.html'])
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<header>Fallback</header>');
    });
  });

  describe('混合使用', () => {
    test('應該支援 @includeWhen 和 @includeIf 混用', () => {
      const adminMenuContent = '<nav>Admin Menu</nav>';
      const optionalContent = '<aside>Optional</aside>';

      fs.writeFileSync(path.join(partialsDir, 'admin-menu.html'), adminMenuContent);
      fs.writeFileSync(path.join(partialsDir, 'optional.html'), optionalContent);

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          isAdmin: true
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `<div class="page">
  @includeWhen(isAdmin, 'admin-menu.html')
  @includeIf('optional.html')
  @includeIf('missing.html')
  <main>Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<nav>Admin Menu</nav>');
      expect(output).toContain('<aside>Optional</aside>');
      expect(output).toContain('<main>Content</main>');
      expect(output).not.toContain('missing');
    });

    test('應該在複雜條件下正確工作', () => {
      const headerContent = '<header>Header</header>';
      const footerContent = '<footer>Footer</footer>';
      const sidebarContent = '<aside>Sidebar</aside>';

      fs.writeFileSync(path.join(partialsDir, 'header.html'), headerContent);
      fs.writeFileSync(path.join(partialsDir, 'footer.html'), footerContent);
      // 故意不創建 sidebar.html

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          showHeader: true,
          showFooter: false,
          isGuest: true
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `<div class="page">
  @includeWhen(showHeader, 'header.html')
  @includeWhen(showFooter, 'footer.html')
  @includeUnless(isGuest, 'sidebar.html')
  @includeFirst(['custom-main.html', 'main.html'])
  <main>Default Content</main>
</div>`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<header>Header</header>');
      expect(output).not.toContain('<footer>Footer</footer>');
      expect(output).not.toContain('<aside>Sidebar</aside>');
      expect(output).toContain('<main>Default Content</main>');
    });
  });

  describe('參數傳遞', () => {
    test('應該支援 JavaScript 物件語法', () => {
      const cardContent = '<div class="card">{{ title }} - {{ count }}</div>';
      fs.writeFileSync(path.join(partialsDir, 'card.html'), cardContent);

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          showCard: true
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `@includeWhen(showCard, 'card.html', { title: 'Test', count: 5 })`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('Test - 5');
    });

    test('應該支援 PHP 陣列語法', () => {
      const cardContent = '<div class="card">{{ title }}</div>';
      fs.writeFileSync(path.join(partialsDir, 'card.html'), cardContent);

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          showCard: true
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `@includeWhen(showCard, 'card.html', ['title' => 'PHP Style'])`;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('PHP Style');
    });
  });
});
