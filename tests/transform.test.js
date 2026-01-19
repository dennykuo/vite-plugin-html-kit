import { describe, it, expect, beforeEach } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';

/**
 * 語法轉換測試套件
 *
 * 測試 Blade 風格語法標籤的轉換功能
 * 包括條件判斷、迴圈、Switch 語句等
 */
describe('語法轉換測試', () => {
  let plugin;

  beforeEach(() => {
    plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {
        user: {
          name: 'John',
          isAdmin: true,
          role: 'admin'
        },
        items: ['Apple', 'Banana', 'Cherry'],
        count: 3
      }
    });

    // 模擬 Vite 配置解析
    plugin.configResolved({ root: process.cwd() });
  });

  describe('@if 條件判斷語法', () => {
    it('應該正確轉換簡單的 @if/@endif', () => {
      const html = `
        @if (user.isAdmin)
          <p>Admin Panel</p>
        @endif
      `;

      const result = plugin.transformIndexHtml.handler(html);

      // 應該渲染 if 區塊的內容
      expect(result).toContain('Admin Panel');
    });

    it('應該正確處理 @if/@else/@endif', () => {
      const htmlTrue = `
        @if (user.isAdmin)
          <p>Is Admin</p>
        @else
          <p>Not Admin</p>
        @endif
      `;

      const resultTrue = plugin.transformIndexHtml.handler(htmlTrue);
      expect(resultTrue).toContain('Is Admin');
      expect(resultTrue).not.toContain('Not Admin');

      // 測試 false 條件
      const pluginFalse = vitePluginHtmlKit({
        data: { user: { isAdmin: false } }
      });
      pluginFalse.configResolved({ root: process.cwd() });

      const htmlFalse = `
        @if (user.isAdmin)
          <p>Is Admin</p>
        @else
          <p>Not Admin</p>
        @endif
      `;

      const resultFalse = pluginFalse.transformIndexHtml.handler(htmlFalse);
      expect(resultFalse).not.toContain('Is Admin');
      expect(resultFalse).toContain('Not Admin');
    });

    it('應該正確處理 @if/@elseif/@else/@endif', () => {
      const plugin1 = vitePluginHtmlKit({
        data: { score: 95 }
      });
      plugin1.configResolved({ root: process.cwd() });

      const html = `
        @if (score >= 90)
          <p>A</p>
        @elseif (score >= 80)
          <p>B</p>
        @elseif (score >= 70)
          <p>C</p>
        @else
          <p>F</p>
        @endif
      `;

      const result1 = plugin1.transformIndexHtml.handler(html);
      expect(result1).toContain('A');
      expect(result1).not.toContain('B');

      // 測試 elseif
      const plugin2 = vitePluginHtmlKit({
        data: { score: 85 }
      });
      plugin2.configResolved({ root: process.cwd() });

      const result2 = plugin2.transformIndexHtml.handler(html);
      expect(result2).toContain('B');
      expect(result2).not.toContain('A');

      // 測試 else
      const plugin3 = vitePluginHtmlKit({
        data: { score: 50 }
      });
      plugin3.configResolved({ root: process.cwd() });

      const result3 = plugin3.transformIndexHtml.handler(html);
      expect(result3).toContain('F');
      expect(result3).not.toContain('A');
    });

    it('應該支援巢狀的 @if 條件', () => {
      const html = `
        @if (user.isAdmin)
          <div>
            @if (user.name === 'John')
              <p>Hello John, Admin!</p>
            @endif
          </div>
        @endif
      `;

      const result = plugin.transformIndexHtml.handler(html);
      expect(result).toContain('Hello John, Admin!');
    });
  });

  describe('@foreach 迴圈語法', () => {
    it('應該支援 Blade 風格的 "items as item" 語法', () => {
      const html = `
        <ul>
          @foreach (items as item)
            <li>{{ item }}</li>
          @endforeach
        </ul>
      `;

      const result = plugin.transformIndexHtml.handler(html);

      // 應該渲染所有項目
      expect(result).toContain('<li>Apple</li>');
      expect(result).toContain('<li>Banana</li>');
      expect(result).toContain('<li>Cherry</li>');
    });

    it('應該支援 JavaScript 風格的 "item of items" 語法', () => {
      const html = `
        <ul>
          @foreach (item of items)
            <li>{{ item }}</li>
          @endforeach
        </ul>
      `;

      const result = plugin.transformIndexHtml.handler(html);

      // 應該渲染所有項目
      expect(result).toContain('<li>Apple</li>');
      expect(result).toContain('<li>Banana</li>');
      expect(result).toContain('<li>Cherry</li>');
    });

    it('應該正確處理空陣列', () => {
      const pluginEmpty = vitePluginHtmlKit({
        data: { items: [] }
      });
      pluginEmpty.configResolved({ root: process.cwd() });

      const html = `
        <ul>
          @foreach (item of items)
            <li>{{ item }}</li>
          @endforeach
        </ul>
      `;

      const result = pluginEmpty.transformIndexHtml.handler(html);

      // 不應該有 <li> 元素
      expect(result).not.toContain('<li>');
    });

    it('應該支援巢狀迴圈', () => {
      const pluginNested = vitePluginHtmlKit({
        data: {
          categories: [
            { name: 'Fruits', items: ['Apple', 'Banana'] },
            { name: 'Vegetables', items: ['Carrot', 'Potato'] }
          ]
        }
      });
      pluginNested.configResolved({ root: process.cwd() });

      const html = `
        @foreach (categories as category)
          <div>
            <h3>{{ category.name }}</h3>
            <ul>
              @foreach (category.items as item)
                <li>{{ item }}</li>
              @endforeach
            </ul>
          </div>
        @endforeach
      `;

      const result = pluginNested.transformIndexHtml.handler(html);

      expect(result).toContain('<h3>Fruits</h3>');
      expect(result).toContain('<li>Apple</li>');
      expect(result).toContain('<h3>Vegetables</h3>');
      expect(result).toContain('<li>Carrot</li>');
    });
  });

  describe('@switch Switch 語句', () => {
    it('應該正確執行 switch/case 邏輯', () => {
      const html = `
        @switch (user.role)
          @case ('admin')
            <p>Administrator</p>
          @break
          @case ('user')
            <p>Regular User</p>
          @break
          @default
            <p>Guest</p>
        @endswitch
      `;

      const result = plugin.transformIndexHtml.handler(html);

      // 應該只顯示 admin 的內容
      expect(result).toContain('Administrator');
      expect(result).not.toContain('Regular User');
      expect(result).not.toContain('Guest');
    });

    it('應該正確處理 @default 分支', () => {
      const pluginGuest = vitePluginHtmlKit({
        data: { user: { role: 'guest' } }
      });
      pluginGuest.configResolved({ root: process.cwd() });

      const html = `
        @switch (user.role)
          @case ('admin')
            <p>Administrator</p>
          @break
          @case ('user')
            <p>Regular User</p>
          @break
          @default
            <p>Guest</p>
        @endswitch
      `;

      const result = pluginGuest.transformIndexHtml.handler(html);

      // 應該顯示 default 的內容
      expect(result).toContain('Guest');
      expect(result).not.toContain('Administrator');
      expect(result).not.toContain('Regular User');
    });

    it('應該正確處理數字比較', () => {
      const pluginNum = vitePluginHtmlKit({
        data: { status: 200 }
      });
      pluginNum.configResolved({ root: process.cwd() });

      const html = `
        @switch (status)
          @case (200)
            <p>OK</p>
          @break
          @case (404)
            <p>Not Found</p>
          @break
          @case (500)
            <p>Server Error</p>
          @break
        @endswitch
      `;

      const result = pluginNum.transformIndexHtml.handler(html);

      expect(result).toContain('OK');
      expect(result).not.toContain('Not Found');
      expect(result).not.toContain('Server Error');
    });
  });

  describe('變數插值 {{ }}', () => {
    it('應該正確插值簡單變數', () => {
      const html = '<p>{{ user.name }}</p>';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<p>John</p>');
    });

    it('應該正確插值數字', () => {
      const html = '<p>Count: {{ count }}</p>';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<p>Count: 3</p>');
    });

    it('應該正確處理 Lodash 函式', () => {
      const pluginLodash = vitePluginHtmlKit({
        data: { text: 'hello world' }
      });
      pluginLodash.configResolved({ root: process.cwd() });

      const html = '<p>{{ _.capitalize(text) }}</p>';
      const result = pluginLodash.transformIndexHtml.handler(html);

      expect(result).toContain('<p>Hello world</p>');
    });

    it('應該正確處理表達式', () => {
      const html = '<p>{{ count * 2 }}</p>';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<p>6</p>');
    });
  });

  describe('混合使用多種語法', () => {
    it('應該正確處理條件 + 迴圈 + 變數插值的組合', () => {
      const html = `
        @if (items.length > 0)
          <ul>
            @foreach (items as item)
              <li>{{ item }}</li>
            @endforeach
          </ul>
          <p>Total: {{ items.length }} items</p>
        @else
          <p>No items</p>
        @endif
      `;

      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<li>Apple</li>');
      expect(result).toContain('<li>Banana</li>');
      expect(result).toContain('Total: 3 items');
      expect(result).not.toContain('No items');
    });
  });
});
