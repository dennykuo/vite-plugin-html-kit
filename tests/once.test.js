/**
 * @once 防止重複輸出測試
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexPath = path.resolve(__dirname, '../src/index.js');
const { default: vitePluginHtmlKit } = await import(indexPath);

console.log('🧪 測試 @once 防止重複輸出功能\n');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    錯誤: ${error.message}`);
  }
}

function assertIncludes(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(message || `應該包含 "${needle}"`);
  }
}

function countOccurrences(str, substring) {
  return (str.match(new RegExp(substring, 'g')) || []).length;
}

const plugin = vitePluginHtmlKit({
  partialsDir: 'partials',
  data: {
    users: ['Alice', 'Bob', 'Charlie']
  }
});

const mockViteConfig = {
  root: path.resolve(__dirname, '../'),
  command: 'serve',
  mode: 'development'
};

plugin.configResolved(mockViteConfig);

function transform(html) {
  return plugin.transformIndexHtml(html, {
    filename: 'test.html',
    server: null
  });
}

const partialsDir = path.resolve(__dirname, '../partials');
if (!fs.existsSync(partialsDir)) {
  fs.mkdirSync(partialsDir, { recursive: true });
}

console.log('📦 基礎測試 - 單個 include 多次使用\n');

test('應該只輸出一次 @once 區塊內容', () => {
  const partialPath = path.join(partialsDir, 'test-once-basic.html');
  fs.writeFileSync(partialPath, `
<div class="alert">{{ message }}</div>
@once
<script src="/js/alert.js"></script>
@endonce`);

  const input = `
<include src="test-once-basic.html" message="警告 1" />
<include src="test-once-basic.html" message="警告 2" />
<include src="test-once-basic.html" message="警告 3" />`;

  const output = transform(input);

  assertIncludes(output, '警告 1', '應該顯示第一個警告');
  assertIncludes(output, '警告 2', '應該顯示第二個警告');
  assertIncludes(output, '警告 3', '應該顯示第三個警告');

  const scriptCount = countOccurrences(output, '/js/alert.js');
  if (scriptCount !== 1) {
    throw new Error(`腳本應該只出現 1 次，但出現了 ${scriptCount} 次`);
  }

  fs.unlinkSync(partialPath);
});

console.log('\n📦 多個不同 @once 區塊\n');

test('應該分別追蹤不同的 @once 區塊', () => {
  const partial1Path = path.join(partialsDir, 'test-once-multi1.html');
  fs.writeFileSync(partial1Path, `
<div>組件 A</div>
@once
<script src="/js/component-a.js"></script>
@endonce`);

  const partial2Path = path.join(partialsDir, 'test-once-multi2.html');
  fs.writeFileSync(partial2Path, `
<div>組件 B</div>
@once
<script src="/js/component-b.js"></script>
@endonce`);

  const input = `
<include src="test-once-multi1.html" />
<include src="test-once-multi2.html" />
<include src="test-once-multi1.html" />
<include src="test-once-multi2.html" />`;

  const output = transform(input);

  const countA = countOccurrences(output, 'component-a.js');
  const countB = countOccurrences(output, 'component-b.js');

  if (countA !== 1) {
    throw new Error(`component-a.js 應該只出現 1 次，但出現了 ${countA} 次`);
  }
  if (countB !== 1) {
    throw new Error(`component-b.js 應該只出現 1 次，但出現了 ${countB} 次`);
  }

  fs.unlinkSync(partial1Path);
  fs.unlinkSync(partial2Path);
});

console.log('\n📦 多行內容測試\n');

test('應該處理多行 @once 內容', () => {
  const partialPath = path.join(partialsDir, 'test-once-multiline.html');
  fs.writeFileSync(partialPath, `
<div>內容</div>
@once
<link rel="stylesheet" href="/css/style.css">
<script src="/js/jquery.js"></script>
<script src="/js/app.js"></script>
@endonce`);

  const input = `
<include src="test-once-multiline.html" />
<include src="test-once-multiline.html" />`;

  const output = transform(input);

  const cssCount = countOccurrences(output, 'style.css');
  const jqueryCount = countOccurrences(output, 'jquery.js');
  const appCount = countOccurrences(output, 'app.js');

  if (cssCount !== 1 || jqueryCount !== 1 || appCount !== 1) {
    throw new Error(`所有資源都應該只出現 1 次`);
  }

  fs.unlinkSync(partialPath);
});

console.log('\n📦 嵌套 partial 測試\n');

test('應該在嵌套 partial 中正確處理 @once', () => {
  const innerPath = path.join(partialsDir, 'test-once-inner.html');
  fs.writeFileSync(innerPath, `
<span>內層</span>
@once
<script src="/js/inner.js"></script>
@endonce`);

  const outerPath = path.join(partialsDir, 'test-once-outer.html');
  fs.writeFileSync(outerPath, `
<div>外層 <include src="test-once-inner.html" /></div>`);

  const input = `
<include src="test-once-outer.html" />
<include src="test-once-outer.html" />`;

  const output = transform(input);

  const count = countOccurrences(output, 'inner.js');
  if (count !== 1) {
    throw new Error(`inner.js 應該只出現 1 次，但出現了 ${count} 次`);
  }

  fs.unlinkSync(innerPath);
  fs.unlinkSync(outerPath);
});

console.log('\n📦 @once 與其他語法集成\n');

test('應該與 @if 配合使用', () => {
  const partialPath = path.join(partialsDir, 'test-once-if.html');
  fs.writeFileSync(partialPath, `
@if(show)
  <div>顯示</div>
  @once
  <script src="/js/conditional.js"></script>
  @endonce
@endif`);

  const input = `
<include src="test-once-if.html" show="{{ true }}" />
<include src="test-once-if.html" show="{{ true }}" />`;

  const output = transform(input);

  const count = countOccurrences(output, 'conditional.js');
  if (count !== 1) {
    throw new Error(`腳本應該只出現 1 次，但出現了 ${count} 次`);
  }

  fs.unlinkSync(partialPath);
});

console.log('\n📦 效能測試\n');

test('應該高效處理大量包含 @once 的 include', () => {
  const partialPath = path.join(partialsDir, 'test-once-perf.html');
  fs.writeFileSync(partialPath, `
<div>項目</div>
@once
<script src="/js/perf.js"></script>
@endonce`);

  let input = '<div>';
  for (let i = 0; i < 50; i++) {
    input += `<include src="test-once-perf.html" />`;
  }
  input += '</div>';

  const startTime = Date.now();
  const output = transform(input);
  const duration = Date.now() - startTime;

  const count = countOccurrences(output, 'perf.js');
  if (count !== 1) {
    throw new Error(`腳本應該只出現 1 次，但出現了 ${count} 次`);
  }

  if (duration > 100) {
    throw new Error(`處理時間過長: ${duration}ms`);
  }

  console.log(`    ℹ️  處理 50 個包含 @once 的 include 耗時: ${duration}ms`);

  fs.unlinkSync(partialPath);
});

console.log('\n' + '='.repeat(60));
console.log('📊 測試結果統計');
console.log('='.repeat(60));
console.log(`總測試數: ${totalTests}`);
console.log(`通過: ${passedTests} ✓`);
console.log(`失敗: ${totalTests - passedTests} ✗`);
console.log(`通過率: ${((passedTests / totalTests) * 100).toFixed(2)}%`);
console.log('='.repeat(60));

if (passedTests === totalTests) {
  console.log('\n✅ 所有測試通過！');
  process.exit(0);
} else {
  console.log('\n❌ 部分測試失敗');
  process.exit(1);
}
