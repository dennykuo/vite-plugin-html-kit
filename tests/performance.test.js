import { describe, it, expect } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';

/**
 * 性能測試套件
 *
 * 驗證 LRU Cache 是否正常運作並提升性能
 */
describe('性能測試', () => {
  it('應該使用快取來提升重複轉換的性能', () => {
    const plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {
        user: {
          isAdmin: true,
          name: 'John'
        },
        items: ['item1', 'item2', 'item3']
      }
    });

    plugin.configResolved({ root: process.cwd() });

    // 創建一個包含多種語法的 HTML
    const html = `
      @if (user.isAdmin)
        <p>Welcome, {{ user.name }}!</p>
      @endif

      <ul>
        @foreach (items as item)
          <li>{{ item }}</li>
        @endforeach
      </ul>

      @switch (user.role)
        @case ('admin')
          <span>Admin</span>
        @case ('user')
          <span>User</span>
        @default
          <span>Guest</span>
      @endswitch
    `;

    // 第一次轉換（快取未命中）
    const start1 = performance.now();
    const result1 = plugin.transformIndexHtml.handler(html);
    const time1 = performance.now() - start1;

    // 第二次轉換相同內容（應該快取命中）
    const start2 = performance.now();
    const result2 = plugin.transformIndexHtml.handler(html);
    const time2 = performance.now() - start2;

    // 第三次轉換相同內容（應該快取命中）
    const start3 = performance.now();
    const result3 = plugin.transformIndexHtml.handler(html);
    const time3 = performance.now() - start3;

    // 驗證結果一致性
    expect(result1).toBe(result2);
    expect(result2).toBe(result3);

    // 驗證快取命中後的性能提升
    // 快取命中應該比第一次快很多
    expect(time2).toBeLessThan(time1);
    expect(time3).toBeLessThan(time1);

    // 快取命中的時間應該相近
    const cacheDiff = Math.abs(time2 - time3);
    expect(cacheDiff).toBeLessThan(time1 * 0.5); // 差異應該小於第一次的一半

    console.log(`\n📊 性能測試結果:`);
    console.log(`  ├─ 第一次轉換（快取未命中）: ${time1.toFixed(3)}ms`);
    console.log(`  ├─ 第二次轉換（快取命中）: ${time2.toFixed(3)}ms`);
    console.log(`  ├─ 第三次轉換（快取命中）: ${time3.toFixed(3)}ms`);
    console.log(`  └─ 性能提升: ${(time1 / time2).toFixed(1)}x`);
  });

  it('應該為不同內容使用不同的快取鍵', () => {
    const plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: { value: 'test' }
    });

    plugin.configResolved({ root: process.cwd() });

    const html1 = '@if (condition1) <p>One</p> @endif';
    const html2 = '@if (condition2) <p>Two</p> @endif';

    const result1 = plugin.transformIndexHtml.handler(html1);
    const result2 = plugin.transformIndexHtml.handler(html2);

    // 不同的 HTML 應該產生不同的結果
    expect(result1).not.toBe(result2);
    expect(result1).toContain('condition1');
    expect(result2).toContain('condition2');
  });

  it('應該正確處理大量不同的 HTML 內容', () => {
    const plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {}
    });

    plugin.configResolved({ root: process.cwd() });

    // 測試 LRU Cache 的容量限制（max: 100）
    // 創建 150 個不同的 HTML，超過快取容量
    const results = [];

    for (let i = 0; i < 150; i++) {
      const html = `@if (condition${i}) <p>Content ${i}</p> @endif`;
      const result = plugin.transformIndexHtml.handler(html);
      results.push(result);
      expect(result).toContain(`condition${i}`);
    }

    // 驗證所有結果都不同
    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBe(150);
  });
});
