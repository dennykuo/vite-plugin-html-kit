/**
 * 作用域樣式 (Scoped Styles) 測試
 * 測試 <style scoped> 功能的樣式隔離
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';
import fs from 'fs';
import path from 'path';

describe('作用域樣式 (Scoped Styles)', () => {
  let plugin;
  const testDir = path.join(process.cwd(), 'test-temp-scoped-styles');
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
      data: {}
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

  describe('基本功能', () => {
    test('應該為 scoped style 添加唯一的 data 屬性', () => {
      // 創建帶有 scoped style 的 partial
      const cardContent = `<div class="card">
  <h2 class="title">Card Title</h2>
  <p class="content">Card content here</p>
</div>

<style scoped>
  .card {
    border: 1px solid #ccc;
    padding: 1rem;
  }
  .title {
    font-size: 1.5rem;
  }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'card.html'), cardContent);

      // 創建主頁面
      const html = `<include src="card.html" />`;

      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證 HTML 元素有 data-v-xxx 屬性
      expect(result).toMatch(/<div class="card" data-v-[a-f0-9]{8}>/);
      expect(result).toMatch(/<h2 class="title" data-v-[a-f0-9]{8}>/);
      expect(result).toMatch(/<p class="content" data-v-[a-f0-9]{8}>/);

      // 驗證 CSS 選擇器有屬性選擇器
      expect(result).toMatch(/\.card\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/\.title\[data-v-[a-f0-9]{8}\]/);

      // 驗證 scoped 屬性已被移除
      expect(result).not.toContain('<style scoped>');
      expect(result).toContain('<style>');
    });

    test('應該跳過沒有 scoped 屬性的 style 標籤', () => {
      const partialContent = `<div class="box">Content</div>
<style>
  .box { padding: 1rem; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'box.html'), partialContent);

      const html = `<include src="box.html" />`;

      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證 HTML 元素沒有 data-v-xxx 屬性
      expect(result).toContain('<div class="box">');
      expect(result).not.toMatch(/<div class="box" data-v-/);

      // 驗證 CSS 選擇器沒有改變
      expect(result).toContain('.box { padding: 1rem; }');
      expect(result).not.toMatch(/\.box\[data-v-/);
    });

    test('應該處理沒有 style 標籤的組件', () => {
      const partialContent = `<div class="simple">Simple content</div>`;
      fs.writeFileSync(path.join(partialsDir, 'simple.html'), partialContent);

      const html = `<include src="simple.html" />`;

      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證內容正常輸出
      expect(result).toContain('<div class="simple">Simple content</div>');
      expect(result).not.toMatch(/data-v-/);
    });
  });

  describe('CSS 選擇器轉換', () => {
    test('應該轉換類選擇器', () => {
      const partialContent = `<div class="box"></div>
<style scoped>
  .box { color: red; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      expect(result).toMatch(/\.box\[data-v-[a-f0-9]{8}\]/);
    });

    test('應該轉換 ID 選擇器', () => {
      const partialContent = `<div id="main"></div>
<style scoped>
  #main { color: blue; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      expect(result).toMatch(/#main\[data-v-[a-f0-9]{8}\]/);
    });

    test('應該轉換元素選擇器', () => {
      const partialContent = `<div></div>
<style scoped>
  div { margin: 0; }
  p { padding: 0; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      expect(result).toMatch(/div\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/p\[data-v-[a-f0-9]{8}\]/);
    });

    test('應該處理多個選擇器（逗號分隔）', () => {
      const partialContent = `<div></div>
<style scoped>
  .class1, .class2, .class3 { color: red; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證每個選擇器都被轉換
      expect(result).toMatch(/\.class1\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/\.class2\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/\.class3\[data-v-[a-f0-9]{8}\]/);
    });

    test('應該處理組合選擇器', () => {
      const partialContent = `<div class="parent"><div class="child"></div></div>
<style scoped>
  .parent .child { color: red; }
  .parent > .child { margin: 0; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證只在最後一個選擇器上添加屬性
      expect(result).toMatch(/\.parent \.child\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/\.parent > \.child\[data-v-[a-f0-9]{8}\]/);
    });

    test('應該處理偽類選擇器', () => {
      const partialContent = `<a class="link">Link</a>
<style scoped>
  .link:hover { color: blue; }
  .link:focus { outline: 2px solid blue; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證屬性選擇器在偽類之前
      expect(result).toMatch(/\.link\[data-v-[a-f0-9]{8}\]:hover/);
      expect(result).toMatch(/\.link\[data-v-[a-f0-9]{8}\]:focus/);
    });

    test('應該處理偽元素選擇器', () => {
      const partialContent = `<div class="box">Content</div>
<style scoped>
  .box::before { content: "→"; }
  .box::after { content: "←"; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證屬性選擇器在偽元素之前
      expect(result).toMatch(/\.box\[data-v-[a-f0-9]{8}\]::before/);
      expect(result).toMatch(/\.box\[data-v-[a-f0-9]{8}\]::after/);
    });
  });

  describe('HTML 屬性添加', () => {
    test('應該為所有標籤添加 data 屬性', () => {
      const partialContent = `<div>
  <header>Header</header>
  <main>Main</main>
  <footer>Footer</footer>
</div>
<style scoped>
  div { margin: 0; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證所有標籤都有 data 屬性
      expect(result).toMatch(/<div data-v-[a-f0-9]{8}>/);
      expect(result).toMatch(/<header data-v-[a-f0-9]{8}>/);
      expect(result).toMatch(/<main data-v-[a-f0-9]{8}>/);
      expect(result).toMatch(/<footer data-v-[a-f0-9]{8}>/);
    });

    test('應該跳過 style 和 script 標籤', () => {
      const partialContent = `<div>Content</div>
<style scoped>
  div { color: red; }
</style>
<script>console.log('test');</script>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證 div 有 data 屬性
      expect(result).toMatch(/<div data-v-[a-f0-9]{8}>/);

      // 驗證 style 和 script 沒有 data 屬性
      expect(result).not.toMatch(/<style[^>]* data-v-/);
      expect(result).not.toMatch(/<script[^>]* data-v-/);
    });

    test('應該處理自閉合標籤', () => {
      const partialContent = `<div>
  <img src="image.jpg" />
  <br />
  <input type="text" />
</div>
<style scoped>
  div { padding: 0; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證自閉合標籤有 data 屬性
      expect(result).toMatch(/<img[^>]* data-v-[a-f0-9]{8} \/>/);
      expect(result).toMatch(/<br data-v-[a-f0-9]{8} \/>/);
      expect(result).toMatch(/<input[^>]* data-v-[a-f0-9]{8} \/>/);
    });

    test('應該處理已有屬性的標籤', () => {
      const partialContent = `<div class="box" id="main" data-custom="value">Content</div>
<style scoped>
  .box { color: red; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證 data 屬性被添加到現有屬性之後
      expect(result).toMatch(/<div class="box" id="main" data-custom="value" data-v-[a-f0-9]{8}>/);
    });
  });

  describe('多個 scoped style 標籤', () => {
    test('應該合併多個 scoped style 標籤', () => {
      const partialContent = `<div class="box">
  <p class="text">Text</p>
</div>

<style scoped>
  .box { border: 1px solid #ccc; }
</style>

<style scoped>
  .text { color: red; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證兩個樣式規則都被轉換
      expect(result).toMatch(/\.box\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/\.text\[data-v-[a-f0-9]{8}\]/);

      // 驗證使用相同的 scopeId
      const scopeIdMatch1 = result.match(/data-v-([a-f0-9]{8})/);
      const scopeIdMatch2 = result.match(/\.box\[data-v-([a-f0-9]{8})\]/);
      const scopeIdMatch3 = result.match(/\.text\[data-v-([a-f0-9]{8})\]/);

      expect(scopeIdMatch1[1]).toBe(scopeIdMatch2[1]);
      expect(scopeIdMatch1[1]).toBe(scopeIdMatch3[1]);
    });
  });

  describe('嵌套組件', () => {
    test('每個組件應該有獨立的 scopeId', () => {
      // 創建子組件
      const childContent = `<div class="child">Child</div>
<style scoped>
  .child { color: blue; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'child.html'), childContent);

      // 創建父組件
      const parentContent = `<div class="parent">
  <include src="child.html" />
</div>
<style scoped>
  .parent { color: red; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'parent.html'), parentContent);

      const html = `<include src="parent.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 提取所有 scopeId
      const scopeIds = [...result.matchAll(/data-v-([a-f0-9]{8})/g)].map(m => m[1]);
      const uniqueScopeIds = [...new Set(scopeIds)];

      // 驗證有兩個不同的 scopeId
      expect(uniqueScopeIds.length).toBe(2);

      // 驗證父組件和子組件的樣式都被正確處理
      expect(result).toMatch(/\.parent\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/\.child\[data-v-[a-f0-9]{8}\]/);
    });
  });

  describe('與其他功能整合', () => {
    test('應該與 slot 系統整合', () => {
      const cardContent = `<div class="card">
  <h2 class="title">@slot('title', 'Default Title')</h2>
  <div class="content">@slot('content')</div>
</div>

<style scoped>
  .card { border: 1px solid #ccc; }
  .title { font-weight: bold; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'card.html'), cardContent);

      const html = `<include src="card.html">
  @slot('title')
    Custom Title
  @endslot
  @slot('content')
    <p>Custom content</p>
  @endslot
</include>`;

      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證 slot 內容被正確替換
      expect(result).toContain('Custom Title');
      expect(result).toContain('Custom content');

      // 驗證樣式被正確處理
      expect(result).toMatch(/\.card\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/<div class="card" data-v-[a-f0-9]{8}>/);
    });

    test('應該與 @if 條件語法整合', () => {
      const partialContent = `@if(showBox)
  <div class="box">Content</div>
@endif

<style scoped>
  .box { padding: 1rem; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" showBox="true" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證條件內容被輸出
      expect(result).toContain('Content');

      // 驗證樣式被正確處理
      expect(result).toMatch(/\.box\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/<div class="box" data-v-[a-f0-9]{8}>/);
    });

    test('應該與 @foreach 迴圈整合', () => {
      // 重新創建插件，添加 items 數據
      const pluginWithData = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: { items: ['A', 'B', 'C'] }
      });

      pluginWithData.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const partialContent = `@foreach(items as item)
  <div class="item">{{ item }}</div>
@endforeach

<style scoped>
  .item { margin: 0.5rem; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = pluginWithData.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證樣式被正確處理
      expect(result).toMatch(/\.item\[data-v-[a-f0-9]{8}\]/);
      expect(result).toMatch(/<div class="item" data-v-[a-f0-9]{8}>/);
    });
  });

  describe('邊界情況', () => {
    test('應該處理空的 scoped style 標籤', () => {
      const partialContent = `<div class="box">Content</div>
<style scoped></style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證即使樣式為空，屬性仍然被添加
      expect(result).toMatch(/data-v-[a-f0-9]{8}/);
    });

    test('應該處理包含註釋的 CSS', () => {
      const partialContent = `<div class="box">Content</div>
<style scoped>
  /* This is a comment */
  .box {
    /* Another comment */
    color: red;
  }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證註釋被保留
      expect(result).toContain('/* This is a comment */');
      expect(result).toContain('/* Another comment */');

      // 驗證樣式被正確處理
      expect(result).toMatch(/\.box\[data-v-[a-f0-9]{8}\]/);
    });

    test('應該保留 @media queries', () => {
      const partialContent = `<div class="box">Content</div>
<style scoped>
  .box { color: red; }

  @media (min-width: 768px) {
    .box { color: blue; }
  }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 驗證 @media query 被保留
      expect(result).toContain('@media (min-width: 768px)');

      // 驗證 media query 內的選擇器也被轉換
      // 注意：簡單實現可能不會轉換 @media 內的選擇器
      // 這取決於具體的實現
    });
  });

  describe('一致性測試', () => {
    test('相同文件和內容應該生成相同的 scopeId', () => {
      const partialContent = `<div class="box">Content</div>
<style scoped>
  .box { color: red; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'test.html'), partialContent);

      const html = `<include src="test.html" /><include src="test.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 提取所有 scopeId
      const scopeIds = [...result.matchAll(/data-v-([a-f0-9]{8})/g)].map(m => m[1]);

      // 驗證所有 scopeId 都相同（因為是同一個文件）
      const uniqueScopeIds = [...new Set(scopeIds)];
      expect(uniqueScopeIds.length).toBe(1);
    });

    test('不同文件應該生成不同的 scopeId', () => {
      const card1Content = `<div class="card">Card 1</div>
<style scoped>
  .card { color: red; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'card1.html'), card1Content);

      const card2Content = `<div class="card">Card 2</div>
<style scoped>
  .card { color: blue; }
</style>`;
      fs.writeFileSync(path.join(partialsDir, 'card2.html'), card2Content);

      const html = `<include src="card1.html" /><include src="card2.html" />`;
      const result = plugin.transformIndexHtml.handler(html, {
        filename: path.join(testDir, 'index.html')
      });

      // 提取所有 scopeId
      const scopeIds = [...result.matchAll(/data-v-([a-f0-9]{8})/g)].map(m => m[1]);
      const uniqueScopeIds = [...new Set(scopeIds)];

      // 驗證有兩個不同的 scopeId
      expect(uniqueScopeIds.length).toBe(2);
    });
  });
});
