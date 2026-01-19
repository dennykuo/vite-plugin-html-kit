import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexPath = path.resolve(__dirname, '../src/index.js');
const { default: vitePluginHtmlKit } = await import(indexPath);

console.log('🧪 測試 @section 簡寫語法\n');

let passedTests = 0;
let failedTests = 0;
const tests = [];

function test(description, fn) {
  tests.push({ description, fn });
}

function expect(value) {
  return {
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

const layoutsDir = path.join(partialsDir, 'layouts');
if (!fs.existsSync(layoutsDir)) {
  fs.mkdirSync(layoutsDir, { recursive: true });
}

// ========================================
// 📦 基礎測試 - 簡寫語法
// ========================================
test('應該支援 @section 簡寫語法（單引號）', () => {
  const layoutPath = path.join(layoutsDir, 'test-layout.html');
  fs.writeFileSync(layoutPath, `
    <div class="@yield('class')">
      @yield('content')
    </div>
  `);

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @extends('layouts/test-layout.html')
    @section('class', 'bg-slate-100')
    @section('content')
      <p>Test Content</p>
    @endsection
  `;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('class="bg-slate-100"');
  expect(output).toContain('<p>Test Content</p>');
  fs.unlinkSync(layoutPath);
});

test('應該支援 @section 簡寫語法（雙引號）', () => {
  const layoutPath = path.join(layoutsDir, 'test-layout.html');
  fs.writeFileSync(layoutPath, `
    <div class="@yield('class')">Content</div>
  `);

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @extends('layouts/test-layout.html')
    @section("class", "text-red-500")
  `;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('class="text-red-500"');
  fs.unlinkSync(layoutPath);
});

// ========================================
// 📦 多個簡寫 section 測試
// ========================================
test('應該支援多個簡寫 @section', () => {
  const layoutPath = path.join(layoutsDir, 'test-layout.html');
  fs.writeFileSync(layoutPath, `
    <title>@yield('title')</title>
    <div class="@yield('class')">
      @yield('content')
    </div>
  `);

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @extends('layouts/test-layout.html')
    @section('title', 'My Page')
    @section('class', 'container mx-auto')
    @section('content')
      <p>Content here</p>
    @endsection
  `;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('<title>My Page</title>');
  expect(output).toContain('class="container mx-auto"');
  expect(output).toContain('<p>Content here</p>');
  fs.unlinkSync(layoutPath);
});

// ========================================
// 📦 混合使用測試
// ========================================
test('應該支援簡寫和完整語法混用', () => {
  const layoutPath = path.join(layoutsDir, 'test-layout.html');
  fs.writeFileSync(layoutPath, `
    <title>@yield('title')</title>
    <div class="@yield('class')">
      @yield('content')
    </div>
  `);

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @extends('layouts/test-layout.html')
    @section('title', 'Short Title')
    @section('class', 'bg-white')
    @section('content')
      <div>
        <h1>Full Content</h1>
      </div>
    @endsection
  `;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('<title>Short Title</title>');
  expect(output).toContain('class="bg-white"');
  expect(output).toContain('<h1>Full Content</h1>');
  fs.unlinkSync(layoutPath);
});

// ========================================
// 📦 特殊字元測試
// ========================================
test('應該支援包含特殊字元的內容', () => {
  const layoutPath = path.join(layoutsDir, 'test-layout.html');
  fs.writeFileSync(layoutPath, `
    <div class="@yield('class')">Content</div>
  `);

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @extends('layouts/test-layout.html')
    @section('class', 'bg-slate-100/30 hover:bg-slate-200/50')
  `;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('class="bg-slate-100/30 hover:bg-slate-200/50"');
  fs.unlinkSync(layoutPath);
});

// ========================================
// 📦 空內容測試
// ========================================
test('應該支援空字串內容', () => {
  const layoutPath = path.join(layoutsDir, 'test-layout.html');
  fs.writeFileSync(layoutPath, `
    <div class="@yield('class', 'default')">Content</div>
  `);

  const plugin = vitePluginHtmlKit({
    partialsDir: 'partials',
    data: {}
  });
  plugin.configResolved({ root: process.cwd(), command: 'serve', mode: 'development' });

  const input = `
    @extends('layouts/test-layout.html')
    @section('class', '')
  `;

  const output = plugin.transformIndexHtml.handler(input, {
    filename: 'test.html',
    server: null
  });

  expect(output).toContain('class=""');
  fs.unlinkSync(layoutPath);
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
