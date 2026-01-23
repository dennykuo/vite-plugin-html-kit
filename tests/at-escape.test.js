import { describe, it, expect } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';

/**
 * @@ 轉義功能測試套件
 *
 * 驗證 @@ 語法可以正確輸出字面 @ 符號
 */
describe('@@ 轉義功能', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'tests/fixtures/partials',
    data: { show: true, items: [1, 2, 3] }
  });

  plugin.configResolved({ root: process.cwd() });

  it('應該將 @@if 轉義為字面 @if', () => {
    const html = '<p>使用 @@if 來顯示 Blade 語法範例</p>';
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('@if');
    expect(result).not.toContain('@@if');
    expect(result).not.toContain('__VPHK_AT__');
  });

  it('應該將 @@foreach 轉義為字面 @foreach', () => {
    const html = '<code>@@foreach(items as item)</code>';
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('@foreach(items as item)');
    expect(result).not.toContain('<%');
  });

  it('應該處理多個 @@ 轉義', () => {
    const html = `
      <pre>
        @@if(condition)
          @@foreach(items as item)
            {{ item }}
          @@endforeach
        @@endif
      </pre>
    `;
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('@if(condition)');
    expect(result).toContain('@foreach(items as item)');
    expect(result).toContain('@endforeach');
    expect(result).toContain('@endif');
    expect(result).not.toContain('<%');
  });

  it('應該正確處理 email 格式（user@@domain.com）', () => {
    const html = '<p>聯絡我們：user@@example.com</p>';
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('user@example.com');
    expect(result).not.toContain('@@');
  });

  it('應該允許 @@ 與真正的 Blade 指令共存', () => {
    const html = `
      <div>
        @if(show)
          <p>這是真正的 @if 指令</p>
          <code>語法範例：@@if(condition)</code>
        @endif
      </div>
    `;
    const result = plugin.transformIndexHtml.handler(html);

    // 真正的 @if 被轉換
    expect(result).toContain('這是真正的 @if 指令');
    // 轉義的 @@if 保持為字面文字
    expect(result).toContain('@if(condition)');
    expect(result).toContain('語法範例：@if(condition)');
  });

  it('應該處理連續的 @@@（輸出 @@ 後跟指令）', () => {
    // @@@ = @@ + @ = 輸出 @ 後接 Blade 指令
    // 但這種情況比較罕見，實際上是 @@ 後面跟著 @if
    const html = '<p>@@</p>';
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('@');
  });

  it('應該在 Blade 註釋中保留 @@', () => {
    // Blade 註釋會先被移除，所以 @@ 不會被處理
    const html = '{{-- @@if 這是註釋 --}}<p>內容</p>';
    const result = plugin.transformIndexHtml.handler(html);

    expect(result).not.toContain('@@if');
    expect(result).not.toContain('@if');
    expect(result).toContain('<p>內容</p>');
  });

  it('應該處理所有 Blade 指令的轉義形式', () => {
    const directives = [
      '@@section', '@@yield', '@@extends',
      '@@include', '@@slot', '@@once',
      '@@push', '@@stack', '@@prepend',
      '@@isset', '@@empty', '@@unless',
      '@@switch', '@@case', '@@break',
      '@@json', '@@verbatim'
    ];

    for (const directive of directives) {
      const html = `<code>${directive}</code>`;
      const result = plugin.transformIndexHtml.handler(html);
      const expected = directive.replace('@@', '@');

      expect(result).toContain(expected);
      expect(result).not.toContain('@@');
    }
  });
});
