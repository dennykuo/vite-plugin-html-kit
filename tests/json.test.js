/**
 * @json() 語法測試
 * 測試 JSON 輸出功能
 */

import { describe, test, expect, beforeEach } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';

describe('@json() 語法測試', () => {
  let plugin;

  beforeEach(() => {
    plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {
        user: { name: 'John', age: 30 },
        items: ['A', 'B', 'C'],
        config: { debug: true, port: 3000 }
      }
    });

    plugin.configResolved({
      root: process.cwd(),
      command: 'serve',
      mode: 'development'
    });
  });

  test('應該將物件轉換為 JSON 字串', () => {
    const input = `
      <script>
        const userData = @json(user);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('const userData = {"name":"John","age":30}');
  });

  test('應該將陣列轉換為 JSON 字串', () => {
    const input = `
      <script>
        const itemsList = @json(items);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('const itemsList = ["A","B","C"]');
  });

  test('應該支援格式化輸出（pretty print）', () => {
    const input = `
      <script>
        const configData = @json(config, true);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    // 格式化的 JSON 應該包含縮排
    expect(output).toContain('{\n  "debug": true,\n  "port": 3000\n}');
  });

  test('應該支援明確指定不格式化（false 參數）', () => {
    const input = `
      <script>
        const configData = @json(config, false);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    // 不格式化的 JSON 應該是緊湊的
    expect(output).toContain('const configData = {"debug":true,"port":3000}');
  });

  test('應該支援表達式', () => {
    const input = `
      <script>
        const firstItem = @json(items[0]);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('const firstItem = "A"');
  });

  test('應該支援物件屬性訪問', () => {
    const input = `
      <script>
        const userName = @json(user.name);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('const userName = "John"');
  });

  test('應該在同一個 script 標籤中支援多個 @json()', () => {
    const input = `
      <script>
        const userData = @json(user);
        const itemsList = @json(items);
        const configData = @json(config);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('const userData = {"name":"John","age":30}');
    expect(output).toContain('const itemsList = ["A","B","C"]');
    expect(output).toContain('const configData = {"debug":true,"port":3000}');
  });

  test('應該處理帶空白的表達式', () => {
    const input = `
      <script>
        const data = @json(  user  );
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('const data = {"name":"John","age":30}');
  });

  test('應該支援在 data 屬性中使用', () => {
    const input = `
      <div data-user='@json(user)'>User Info</div>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('data-user=\'{"name":"John","age":30}\'');
  });

  test('應該支援複雜的巢狀結構', () => {
    plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {
        nested: {
          level1: {
            level2: {
              value: 'deep'
            }
          }
        }
      }
    });

    plugin.configResolved({
      root: process.cwd(),
      command: 'serve',
      mode: 'development'
    });

    const input = `
      <script>
        const nestedData = @json(nested);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('{"level1":{"level2":{"value":"deep"}}}');
  });

  test('應該正確處理特殊字元', () => {
    plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {
        special: {
          quote: "It's a \"test\"",
          newline: "Line 1\nLine 2"
        }
      }
    });

    plugin.configResolved({
      root: process.cwd(),
      command: 'serve',
      mode: 'development'
    });

    const input = `
      <script>
        const specialData = @json(special);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    // JSON.stringify 會自動轉義特殊字元
    // 單引號在 JSON 中不需要轉義，雙引號需要轉義
    expect(output).toContain('It\'s a \\"test\\"');
    expect(output).toContain('Line 1\\nLine 2');
  });

  test('應該與 Blade 註釋一起正確工作', () => {
    const input = `
      <script>
        {{-- 這是註釋中的 @json(user) --}}
        const userData = @json(user);
      </script>
    `;

    const output = plugin.transformIndexHtml.handler(input, {
      filename: 'test.html',
      server: null
    });

    // 註釋應該被移除
    expect(output).not.toContain('這是註釋');
    // @json 應該正常工作
    expect(output).toContain('const userData = {"name":"John","age":30}');
  });
});
