import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexPath = path.resolve(__dirname, '../src/index.js');
const { default: vitePluginHtmlKit } = await import(indexPath);

console.log('🧪 測試 @include Blade 語法\n');

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

// 建立測試用的 partials 目錄
const partialsDir = path.resolve(process.cwd(), 'partials');
if (!fs.existsSync(partialsDir)) {
  fs.mkdirSync(partialsDir, { recursive: true });
}

// ========================================
// 📦 基礎測試 - 簡單 include
// ========================================
test('應該支援 @include("file.html") 語法', () => {
  const partialPath = path.join(partialsDir, 'header.html');
  fs.writeFileSync(partialPath, '<header>Header Content</header>');

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    <div>
      @include('header.html')
    </div>
  `;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('<header>Header Content</header>');
  fs.unlinkSync(partialPath);
});

test('應該支援單引號和雙引號', () => {
  const partialPath = path.join(partialsDir, 'footer.html');
  fs.writeFileSync(partialPath, '<footer>Footer</footer>');

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input1 = `@include('footer.html')`;
  const input2 = `@include("footer.html")`;

  const output1 = plugin.transformIndexHtml.handler(input1, {
    filename: 'test.html',
    server: null
  });

  const output2 = plugin.transformIndexHtml.handler(input2, {
    filename: 'test.html',
    server: null
  });

  expect(output1).toContain('<footer>Footer</footer>');
  expect(output2).toContain('<footer>Footer</footer>');
  fs.unlinkSync(partialPath);
});

// ========================================
// 📦 傳遞參數測試
// ========================================
test('應該支援 @include 傳遞參數', () => {
  const partialPath = path.join(partialsDir, 'card.html');
  fs.writeFileSync(partialPath, '<div class="card">{{ title }}</div>');

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `@include('card.html', { title: 'Hello' })`;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('<div class="card">Hello</div>');
  fs.unlinkSync(partialPath);
});

test('應該支援傳遞多個參數', () => {
  const partialPath = path.join(partialsDir, 'user-card.html');
  fs.writeFileSync(partialPath, '<div>{{ name }} - {{ email }}</div>');

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `@include('user-card.html', { name: 'John', email: 'john@example.com' })`;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('John - john@example.com');
  fs.unlinkSync(partialPath);
});

// ========================================
// 📦 使用全域變數測試
// ========================================
test('應該訪問全域資料', () => {
  const partialPath = path.join(partialsDir, 'greeting.html');
  fs.writeFileSync(partialPath, '<p>Hello {{ userName }}</p>');

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { userName: 'Alice' }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `@include('greeting.html')`;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('Hello Alice');
  fs.unlinkSync(partialPath);
});

test('局部變數應該覆蓋全域變數', () => {
  const partialPath = path.join(partialsDir, 'message.html');
  fs.writeFileSync(partialPath, '<p>{{ msg }}</p>');

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: { msg: 'Global' }
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `@include('message.html', { msg: 'Local' })`;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('<p>Local</p>');
  fs.unlinkSync(partialPath);
});

// ========================================
// 📦 與 Blade 語法集成測試
// ========================================
test('應該在 @include 的 partial 中使用 @if', () => {
  const partialPath = path.join(partialsDir, 'conditional.html');
  fs.writeFileSync(partialPath, `
    @if(showTitle)
      <h1>{{ title }}</h1>
    @endif
  `);

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `@include('conditional.html', { showTitle: true, title: 'Test' })`;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('<h1>Test</h1>');
  fs.unlinkSync(partialPath);
});

test('應該在 @include 的 partial 中使用 @foreach', () => {
  const partialPath = path.join(partialsDir, 'list.html');
  fs.writeFileSync(partialPath, `
    @foreach(items as item)
      <li>{{ loop.iteration }}. {{ item }}</li>
    @endforeach
  `);

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `<ul>@include('list.html', { items: ['A', 'B', 'C'] })</ul>`;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('1. A');
  expect(output).toContain('2. B');
  expect(output).toContain('3. C');
  fs.unlinkSync(partialPath);
});

// ========================================
// 📦 嵌套 include 測試
// ========================================
test('應該支援嵌套 @include', () => {
  const innerPath = path.join(partialsDir, 'inner.html');
  const outerPath = path.join(partialsDir, 'outer.html');

  fs.writeFileSync(innerPath, '<span>{{ text }}</span>');
  fs.writeFileSync(outerPath, '<div>@include("inner.html", { text: innerText })</div>');

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `@include('outer.html', { innerText: 'Nested' })`;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('<span>Nested</span>');
  fs.unlinkSync(innerPath);
  fs.unlinkSync(outerPath);
});

// ========================================
// 📦 與 <include> 標籤共存測試
// ========================================
test('應該與 <include> 標籤共存', () => {
  const partial1Path = path.join(partialsDir, 'blade-style.html');
  const partial2Path = path.join(partialsDir, 'tag-style.html');

  fs.writeFileSync(partial1Path, '<p>Blade Style</p>');
  fs.writeFileSync(partial2Path, '<p>Tag Style</p>');

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @include('blade-style.html')
    <include src="tag-style.html" />
  `;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('Blade Style');
  expect(output).toContain('Tag Style');
  fs.unlinkSync(partial1Path);
  fs.unlinkSync(partial2Path);
});

// ========================================
// 📦 效能測試
// ========================================
test('應該高效處理多個 @include', () => {
  const partialPath = path.join(partialsDir, 'perf-item.html');
  fs.writeFileSync(partialPath, '<div>{{ n }}</div>');

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  let input = '';
  for (let i = 0; i < 50; i++) {
    input += `@include('perf-item.html', { n: ${i} })\n`;
  }

  const startTime = Date.now();
  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });
  const duration = Date.now() - startTime;

  console.log(`    ℹ️  處理 50 個 @include 耗時: ${duration}ms`);

  expect(output).toContain('<div>0</div>');
  expect(output).toContain('<div>49</div>');

  if (duration > 100) {
    throw new Error(`效能測試失敗：處理 50 個 @include 耗時 ${duration}ms，超過 100ms 限制`);
  }

  fs.unlinkSync(partialPath);
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

// 清理測試目錄
if (fs.existsSync(partialsDir)) {
  fs.rmSync(partialsDir, { recursive: true, force: true });
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
