/**
 * Blade 註釋功能測試
 *
 * 測試 {{-- --}} 語法
 * 功能：Blade 註釋不會出現在最終 HTML 輸出中
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 載入主程式
const indexPath = path.resolve(__dirname, '../src/index.js');
const { default: vitePluginHtmlKit } = await import(indexPath);

console.log('🧪 測試 Blade 註釋功能\n');

// 測試計數器
let totalTests = 0;
let passedTests = 0;

/**
 * 測試工具函數
 */
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

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `預期 "${expected}"，但得到 "${actual}"`);
  }
}

function assertNotIncludes(haystack, needle, message) {
  if (haystack.includes(needle)) {
    throw new Error(message || `不應該包含 "${needle}"`);
  }
}

function assertIncludes(haystack, needle, message) {
  if (!haystack.includes(needle)) {
    throw new Error(message || `應該包含 "${needle}"`);
  }
}

/**
 * 創建測試用的插件實例
 */
const plugin = vitePluginHtmlKit({
  partialsDir: 'partials',
  data: {
    user: { name: 'John', isAdmin: true },
    items: ['apple', 'banana', 'orange']
  }
});

// 模擬 viteConfig
const mockViteConfig = {
  root: path.resolve(__dirname, '../'),
  command: 'serve',
  mode: 'development'
};

// 調用 configResolved 設置配置
plugin.configResolved(mockViteConfig);

/**
 * 測試輔助函數：轉換 HTML
 */
function transform(html) {
  return plugin.transformIndexHtml.handler(html, {
    filename: 'test.html',
    server: null
  });
}

console.log('📦 基礎測試 - 單行註釋\n');

test('應該移除簡單的單行 Blade 註釋', () => {
  const input = `<div>{{-- 這是註釋 --}}<p>內容</p></div>`;
  const output = transform(input);

  assertNotIncludes(output, '這是註釋', '註釋應該被移除');
  assertIncludes(output, '<p>內容</p>', '實際內容應該保留');
});

test('應該移除包含特殊字元的註釋', () => {
  const input = `<div>{{-- TODO: 修復這個 bug! @#$%^&*() --}}<p>內容</p></div>`;
  const output = transform(input);

  assertNotIncludes(output, 'TODO', '註釋內容應該被移除');
  assertNotIncludes(output, '@#$%^&*()', '特殊字元應該被移除');
  assertIncludes(output, '<p>內容</p>', '實際內容應該保留');
});

test('應該保留 HTML 註釋', () => {
  const input = `<div><!-- HTML 註釋 -->{{-- Blade 註釋 --}}<p>內容</p></div>`;
  const output = transform(input);

  assertIncludes(output, '<!-- HTML 註釋 -->', 'HTML 註釋應該保留');
  assertNotIncludes(output, 'Blade 註釋', 'Blade 註釋應該被移除');
});

console.log('\n📦 多行註釋測試\n');

test('應該移除多行 Blade 註釋', () => {
  const input = `<div>
{{--
  這是多行註釋
  第二行
  第三行
--}}
<p>內容</p>
</div>`;
  const output = transform(input);

  assertNotIncludes(output, '這是多行註釋', '多行註釋應該被移除');
  assertNotIncludes(output, '第二行', '多行註釋應該被移除');
  assertIncludes(output, '<p>內容</p>', '實際內容應該保留');
});

test('應該處理嵌套的 {{ }} 語法', () => {
  const input = `<div>
{{-- 註釋中包含 {{ variable }} 也應該被移除 --}}
<p>{{ user.name }}</p>
</div>`;
  const output = transform(input);

  assertNotIncludes(output, '註釋中包含', '註釋應該被移除');
  assertNotIncludes(output, '{{ variable }}', '註釋中的變數語法應該被移除');
  assertIncludes(output, 'John', '真實的變數應該被處理');
});

console.log('\n📦 多個註釋測試\n');

test('應該移除多個 Blade 註釋', () => {
  const input = `
<div>
  {{-- 第一個註釋 --}}
  <p>段落 1</p>
  {{-- 第二個註釋 --}}
  <p>段落 2</p>
  {{-- 第三個註釋 --}}
</div>`;
  const output = transform(input);

  assertNotIncludes(output, '第一個註釋', '所有註釋都應該被移除');
  assertNotIncludes(output, '第二個註釋', '所有註釋都應該被移除');
  assertNotIncludes(output, '第三個註釋', '所有註釋都應該被移除');
  assertIncludes(output, '段落 1', '內容應該保留');
  assertIncludes(output, '段落 2', '內容應該保留');
});

console.log('\n📦 邊界條件測試\n');

test('應該處理緊鄰的 Blade 註釋', () => {
  const input = `<div>{{-- 註釋1 --}}{{-- 註釋2 --}}<p>內容</p></div>`;
  const output = transform(input);

  assertNotIncludes(output, '註釋1', '第一個註釋應該被移除');
  assertNotIncludes(output, '註釋2', '第二個註釋應該被移除');
  assertIncludes(output, '<p>內容</p>', '內容應該保留');
});

test('應該處理空的 Blade 註釋', () => {
  const input = `<div>{{----}}<p>內容</p></div>`;
  const output = transform(input);

  assertIncludes(output, '<p>內容</p>', '內容應該保留');
});

test('應該處理只有空白的 Blade 註釋', () => {
  const input = `<div>{{--   --}}<p>內容</p></div>`;
  const output = transform(input);

  assertIncludes(output, '<p>內容</p>', '內容應該保留');
});

console.log('\n📦 與其他功能集成測試\n');

test('應該與 @if 配合使用', () => {
  const input = `
{{-- 檢查管理員權限 --}}
@if(user.isAdmin)
  <p>管理員面板</p>
@endif`;
  const output = transform(input);

  assertNotIncludes(output, '檢查管理員權限', '註釋應該被移除');
  assertIncludes(output, '管理員面板', '@if 應該正常工作');
});

test('應該與 @foreach 配合使用', () => {
  const input = `
{{-- 顯示項目列表 --}}
@foreach(items as item)
  <li>{{ item }}</li>
@endforeach`;
  const output = transform(input);

  assertNotIncludes(output, '顯示項目列表', '註釋應該被移除');
  assertIncludes(output, '<li>apple</li>', '@foreach 應該正常工作');
});

test('應該在 partial 中也能使用', () => {
  // 創建測試 partial
  const partialsDir = path.resolve(__dirname, '../partials');
  if (!fs.existsSync(partialsDir)) {
    fs.mkdirSync(partialsDir, { recursive: true });
  }

  const partialPath = path.join(partialsDir, 'test-comment.html');
  fs.writeFileSync(partialPath, `{{-- Partial 註釋 --}}<p>Partial 內容</p>`);

  const input = `<div><include src="test-comment.html" /></div>`;
  const output = transform(input);

  assertNotIncludes(output, 'Partial 註釋', 'Partial 中的註釋應該被移除');
  assertIncludes(output, 'Partial 內容', 'Partial 內容應該保留');

  // 清理測試文件
  fs.unlinkSync(partialPath);
});

console.log('\n📦 效能測試\n');

test('應該高效處理大量註釋', () => {
  let input = '<div>';
  for (let i = 0; i < 100; i++) {
    input += `{{-- 註釋 ${i} --}}<p>段落 ${i}</p>`;
  }
  input += '</div>';

  const startTime = Date.now();
  const output = transform(input);
  const duration = Date.now() - startTime;

  assertNotIncludes(output, '註釋 50', '所有註釋應該被移除');
  assertIncludes(output, '段落 50', '所有內容應該保留');

  if (duration > 100) {
    throw new Error(`處理時間過長: ${duration}ms（應該 < 100ms）`);
  }

  console.log(`    ℹ️  處理 100 個註釋耗時: ${duration}ms`);
});

// 輸出測試結果
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
