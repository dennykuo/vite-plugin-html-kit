import { describe, it, expect } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';

/**
 * @class() 條件類名功能測試套件
 *
 * 驗證 @class() 語法可以正確生成動態 CSS 類名
 */
describe('@class() 條件類名功能', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'tests/fixtures/partials',
    data: {
      isPrimary: true,
      isDisabled: false,
      isActive: true,
      isLarge: false,
      status: 'success'
    }
  });

  plugin.configResolved({ root: process.cwd() });

  it('應該處理純字串類名（永遠包含）', () => {
    const html = `<div @class(['btn', 'container'])>內容</div>`;
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('class="btn container"');
  });

  it('應該處理條件類名（PHP 箭頭語法）', () => {
    const html = `<div @class([
      'btn',
      'btn-primary' => isPrimary,
      'btn-disabled' => isDisabled
    ])>按鈕</div>`;
    const result = plugin.transformIndexHtml.handler(html);

    // isPrimary=true，所以包含 btn-primary
    // isDisabled=false，所以不包含 btn-disabled
    expect(result).toContain('btn');
    expect(result).toContain('btn-primary');
    expect(result).not.toMatch(/btn-disabled/);
  });

  it('應該處理條件類名（JS 冒號語法）', () => {
    const html = `<div @class([
      'card',
      'card-active': isActive,
      'card-large': isLarge
    ])>卡片</div>`;
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('card');
    expect(result).toContain('card-active');
    expect(result).not.toMatch(/card-large(?!-)/); // 不包含 card-large
  });

  it('應該支援混合使用純字串和條件類名', () => {
    const html = `<button @class([
      'btn',
      'btn-lg',
      'btn-primary' => isPrimary,
      'disabled' => isDisabled
    ])>送出</button>`;
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('btn');
    expect(result).toContain('btn-lg');
    expect(result).toContain('btn-primary');
    expect(result).not.toMatch(/\bdisabled\b/);
  });

  it('應該支援雙引號字串', () => {
    const html = `<div @class(["container", "mx-auto", "active" => isActive])>內容</div>`;
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('container');
    expect(result).toContain('mx-auto');
    expect(result).toContain('active');
  });

  it('應該支援表達式作為條件', () => {
    const html = `<div @class([
      'alert',
      'alert-success' => status === 'success',
      'alert-error' => status === 'error'
    ])>訊息</div>`;
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('alert');
    expect(result).toContain('alert-success');
    expect(result).not.toMatch(/alert-error/);
  });

  it('應該處理空陣列', () => {
    const html = `<div @class([])>空類名</div>`;
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('class=""');
  });

  it('應該正確處理單一類名', () => {
    const html = `<span @class(['badge'])>標籤</span>`;
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('class="badge"');
  });

  it('應該支援否定條件', () => {
    const html = `<div @class([
      'visible' => !isDisabled,
      'hidden' => isDisabled
    ])>內容</div>`;
    const result = plugin.transformIndexHtml.handler(html);

    // isDisabled=false，所以 !isDisabled=true
    expect(result).toContain('visible');
    expect(result).not.toMatch(/\bhidden\b/);
  });

  it('應該與其他屬性共存', () => {
    const html = `<button id="submit-btn" @class(['btn', 'btn-primary' => isPrimary]) type="submit">送出</button>`;
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('id="submit-btn"');
    expect(result).toContain('class="btn btn-primary"');
    expect(result).toContain('type="submit"');
  });
});
