import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 循環引用檢測測試套件
 *
 * 驗證插件能正確偵測和處理循環引用情況
 */
describe('循環引用檢測', () => {
  const partialsDir = path.join(__dirname, 'fixtures', 'circular-test');

  beforeEach(() => {
    // 創建測試用的 partials 目錄
    if (!fs.existsSync(partialsDir)) {
      fs.mkdirSync(partialsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理測試檔案
    if (fs.existsSync(partialsDir)) {
      fs.rmSync(partialsDir, { recursive: true, force: true });
    }
  });

  it('應該偵測直接循環引用（A → B → A）', () => {
    // 創建循環引用的檔案
    // a.html includes b.html
    fs.writeFileSync(
      path.join(partialsDir, 'a.html'),
      '<div>A start</div><include src="b.html" /><div>A end</div>'
    );

    // b.html includes a.html（形成循環）
    fs.writeFileSync(
      path.join(partialsDir, 'b.html'),
      '<div>B start</div><include src="a.html" /><div>B end</div>'
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: path.relative(process.cwd(), partialsDir),
      data: {}
    });

    plugin.configResolved({ root: process.cwd() });

    const html = '<include src="a.html" />';
    const result = plugin.transformIndexHtml(html);

    // 應該包含循環引用錯誤訊息
    expect(result).toContain('檢測到循環 include 引用');
    // 應該顯示循環路徑
    expect(result).toContain('a.html');
    expect(result).toContain('b.html');
  });

  it('應該偵測間接循環引用（A → B → C → A）', () => {
    // 創建間接循環引用
    // a.html → b.html → c.html → a.html
    fs.writeFileSync(
      path.join(partialsDir, 'a.html'),
      '<div>A</div><include src="b.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'b.html'),
      '<div>B</div><include src="c.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'c.html'),
      '<div>C</div><include src="a.html" />'
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: path.relative(process.cwd(), partialsDir),
      data: {}
    });

    plugin.configResolved({ root: process.cwd() });

    const html = '<include src="a.html" />';
    const result = plugin.transformIndexHtml(html);

    // 應該包含循環引用錯誤訊息
    expect(result).toContain('檢測到循環 include 引用');
    // 應該顯示完整的循環路徑
    expect(result).toContain('a.html');
    expect(result).toContain('b.html');
    expect(result).toContain('c.html');
  });

  it('應該允許多次引用同一檔案（非循環）', () => {
    // 創建合法的多次引用
    // index.html includes a.html 和 b.html
    // a.html includes c.html
    // b.html includes c.html
    // 這不是循環引用，因為 c.html 沒有再引用回去

    fs.writeFileSync(
      path.join(partialsDir, 'a.html'),
      '<div>A</div><include src="c.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'b.html'),
      '<div>B</div><include src="c.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'c.html'),
      '<div>C - Common Component</div>'
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: path.relative(process.cwd(), partialsDir),
      data: {}
    });

    plugin.configResolved({ root: process.cwd() });

    const html = `
      <include src="a.html" />
      <include src="b.html" />
    `;
    const result = plugin.transformIndexHtml(html);

    // 不應該有循環引用錯誤
    expect(result).not.toContain('檢測到循環 include 引用');
    // 應該正確渲染所有內容
    expect(result).toContain('A');
    expect(result).toContain('B');
    // c.html 應該被 include 兩次
    const matches = result.match(/C - Common Component/g);
    expect(matches).toHaveLength(2);
  });

  it('應該在主 HTML 檔案中偵測自我引用', () => {
    // 創建自我引用的情況
    // 如果主 HTML 名為 index.html，它 include 自己會形成循環

    // 但實際上這個測試有點特殊，因為主 HTML 通常不會被當作 partial
    // 我們用一個 partial 自我引用來模擬
    fs.writeFileSync(
      path.join(partialsDir, 'self.html'),
      '<div>Self</div><include src="self.html" />'
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: path.relative(process.cwd(), partialsDir),
      data: {}
    });

    plugin.configResolved({ root: process.cwd() });

    const html = '<include src="self.html" />';
    const result = plugin.transformIndexHtml(html);

    // 應該偵測到自我引用
    expect(result).toContain('檢測到循環 include 引用');
    expect(result).toContain('self.html');
  });

  it('應該在深層嵌套中正確追蹤檔案堆疊', () => {
    // 創建深層但非循環的嵌套
    // index → a → b → c → d → e
    fs.writeFileSync(
      path.join(partialsDir, 'a.html'),
      '<div>A</div><include src="b.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'b.html'),
      '<div>B</div><include src="c.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'c.html'),
      '<div>C</div><include src="d.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'd.html'),
      '<div>D</div><include src="e.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'e.html'),
      '<div>E - End</div>'
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: path.relative(process.cwd(), partialsDir),
      data: {}
    });

    plugin.configResolved({ root: process.cwd() });

    const html = '<include src="a.html" />';
    const result = plugin.transformIndexHtml(html);

    // 不應該有循環引用錯誤
    expect(result).not.toContain('檢測到循環 include 引用');
    // 應該正確渲染所有層級
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
    expect(result).toContain('D');
    expect(result).toContain('E - End');
  });

  it('應該在部分路徑中偵測循環（A → B → C → B）', () => {
    // 創建部分循環
    // a.html → b.html → c.html → b.html（B 和 C 之間循環）
    fs.writeFileSync(
      path.join(partialsDir, 'a.html'),
      '<div>A</div><include src="b.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'b.html'),
      '<div>B</div><include src="c.html" />'
    );

    fs.writeFileSync(
      path.join(partialsDir, 'c.html'),
      '<div>C</div><include src="b.html" />'
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: path.relative(process.cwd(), partialsDir),
      data: {}
    });

    plugin.configResolved({ root: process.cwd() });

    const html = '<include src="a.html" />';
    const result = plugin.transformIndexHtml(html);

    // 應該偵測到循環引用
    expect(result).toContain('檢測到循環 include 引用');
    // 應該顯示循環部分
    expect(result).toContain('b.html');
    expect(result).toContain('c.html');
  });
});
