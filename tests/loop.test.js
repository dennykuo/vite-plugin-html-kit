import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexPath = path.resolve(__dirname, '../src/index.js');
const { default: vitePluginHtmlKit } = await import(indexPath);

console.log('🧪 測試 $loop 變數功能\n');

// 測試配置
let passedTests = 0;
let failedTests = 0;
const tests = [];

function test(description, fn) {
  tests.push({ description, fn });
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`期望值為 ${expected}，但得到 ${value}`);
      }
    },
    toContain(expected) {
      if (!value.includes(expected)) {
        throw new Error(`期望包含 "${expected}"，但實際值為: ${value}`);
      }
    },
    not: {
      toContain(expected) {
        if (value.includes(expected)) {
          throw new Error(`期望不包含 "${expected}"，但實際值為: ${value}`);
        }
      }
    }
  };
}

// ========================================
// 📦 基礎測試 - index, iteration, count
// ========================================
test('應該提供 loop.index（從 0 開始）', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { items: ['A', 'B', 'C'] }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @foreach(items as item)
      <div data-index="{{ loop.index }}">{{ item }}</div>
    @endforeach
  `;

  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('data-index="0">A');
  expect(output).toContain('data-index="1">B');
  expect(output).toContain('data-index="2">C');
});

test('應該提供 loop.iteration（從 1 開始）', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { items: ['A', 'B', 'C'] }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @foreach(items as item)
      <div data-iteration="{{ loop.iteration }}">{{ item }}</div>
    @endforeach
  `;

  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('data-iteration="1">A');
  expect(output).toContain('data-iteration="2">B');
  expect(output).toContain('data-iteration="3">C');
});

test('應該提供 loop.count（陣列總數）', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { items: ['A', 'B', 'C'] }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @foreach(items as item)
      <div>{{ loop.iteration }} / {{ loop.count }}</div>
    @endforeach
  `;

  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('1 / 3');
  expect(output).toContain('2 / 3');
  expect(output).toContain('3 / 3');
});

// ========================================
// 📦 布林屬性測試 - first, last
// ========================================
test('應該提供 loop.first 和 loop.last', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { items: ['A', 'B', 'C'] }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @foreach(items as item)
      <div class="{{ loop.first ? 'first' : '' }} {{ loop.last ? 'last' : '' }}">{{ item }}</div>
    @endforeach
  `;

  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('class="first ">A');
  expect(output).toContain('class=" ">B');
  expect(output).toContain('class=" last">C');
});

// ========================================
// 📦 奇偶測試 - even, odd
// ========================================
test('應該提供 loop.even 和 loop.odd', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { items: ['A', 'B', 'C', 'D'] }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @foreach(items as item)
      <div class="{{ loop.even ? 'even' : 'odd' }}">{{ item }}</div>
    @endforeach
  `;

  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });

  // iteration 1 = odd, 2 = even, 3 = odd, 4 = even
  expect(output).toContain('class="odd">A');
  expect(output).toContain('class="even">B');
  expect(output).toContain('class="odd">C');
  expect(output).toContain('class="even">D');
});

// ========================================
// 📦 remaining 測試
// ========================================
test('應該提供 loop.remaining（剩餘迭代次數）', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { items: ['A', 'B', 'C'] }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @foreach(items as item)
      <div>{{ item }} (剩餘 {{ loop.remaining }})</div>
    @endforeach
  `;

  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('A (剩餘 2)');
  expect(output).toContain('B (剩餘 1)');
  expect(output).toContain('C (剩餘 0)');
});

// ========================================
// 📦 嵌套迴圈測試 - depth, parent
// ========================================
test('應該在嵌套迴圈中提供 loop.depth', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {
      outer: ['A', 'B'],
      inner: ['1', '2']
    }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @foreach(outer as item1)
      <div data-depth="{{ loop.depth }}">
        @foreach(inner as item2)
          <span data-depth="{{ loop.depth }}">{{ item2 }}</span>
        @endforeach
      </div>
    @endforeach
  `;

  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('div data-depth="1"');
  expect(output).toContain('span data-depth="2"');
});

test('應該在嵌套迴圈中提供 loop.parent', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {
      outer: ['A', 'B'],
      inner: ['1', '2']
    }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @foreach(outer as item1)
      @foreach(inner as item2)
        <div>{{ loop.parent.iteration }}-{{ loop.iteration }}</div>
      @endforeach
    @endforeach
  `;

  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('1-1');
  expect(output).toContain('1-2');
  expect(output).toContain('2-1');
  expect(output).toContain('2-2');
});

// ========================================
// 📦 @forelse 集成測試
// ========================================
test('應該在 @forelse 中提供 $loop 變數', () => {
  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { items: ['A', 'B'] }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @forelse(items as item)
      <div>{{ loop.iteration }}. {{ item }}</div>
    @empty
      <p>無資料</p>
    @endforelse
  `;

  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('1. A');
  expect(output).toContain('2. B');
  expect(output).not.toContain('無資料');
});

// ========================================
// 📦 效能測試
// ========================================
test('應該高效處理大量迴圈', () => {
  const items = Array.from({ length: 100 }, (_, i) => `Item${i}`);

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { items }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @foreach(items as item)
      <div>{{ loop.index }}: {{ item }} ({{ loop.first ? 'F' : '' }}{{ loop.last ? 'L' : '' }})</div>
    @endforeach
  `;

  const startTime = Date.now();
  const output = plugin.transformIndexHtml(input, {
    filename: 'test.html',
    server: null
  });
  const duration = Date.now() - startTime;

  console.log(`    ℹ️  處理 100 個包含 $loop 的迭代耗時: ${duration}ms`);

  expect(output).toContain('0: Item0 (F)');
  expect(output).toContain('99: Item99 (L)');

  if (duration > 100) {
    throw new Error(`效能測試失敗：處理 100 個迭代耗時 ${duration}ms，超過 100ms 限制`);
  }
});

// ========================================
// 執行所有測試
// ========================================
for (const { description, fn } of tests) {
  try {
    console.log(`📦 ${description.split(' - ')[0]}\n`);
    fn();
    console.log(`  ✓ ${description}\n`);
    passedTests++;
  } catch (error) {
    console.log(`  ✗ ${description}`);
    console.log(`    錯誤: ${error.message}\n`);
    failedTests++;
  }
}

// ========================================
// 測試結果統計
// ========================================
console.log('============================================================');
console.log('📊 測試結果統計');
console.log('============================================================');
console.log(`總測試數: ${passedTests + failedTests}`);
console.log(`通過: ${passedTests} ✓`);
console.log(`失敗: ${failedTests} ✗`);
console.log(`通過率: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(2)}%`);
console.log('============================================================\n');

if (failedTests > 0) {
  console.log('❌ 部分測試失敗');
  process.exit(1);
} else {
  console.log('✅ 所有測試通過！');
  process.exit(0);
}
