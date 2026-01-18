/**
 * @unless 否定條件測試
 *
 * 測試 @unless 語法
 * 功能：@unless(condition) 等同於 @if(!condition)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 載入主程式
const indexPath = path.resolve(__dirname, '../src/index.js');
const { default: vitePluginHtmlKit } = await import(indexPath);

console.log('🧪 測試 @unless 否定條件功能\n');

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
    user: {
      name: 'John',
      isAdmin: true,
      isGuest: false,
      isActive: true
    },
    count: 5,
    isEmpty: false,
    items: ['apple', 'banana']
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
  return plugin.transformIndexHtml(html, {
    filename: 'test.html',
    server: null
  });
}

console.log('📦 基礎測試 - 簡單條件\n');

test('應該在條件為 false 時顯示內容', () => {
  const input = `
@unless(user.isGuest)
  <p>歡迎回來，{{ user.name }}</p>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '歡迎回來', '條件為 false 時應該顯示內容');
  assertIncludes(output, 'John', '變數應該被正確替換');
});

test('應該在條件為 true 時隱藏內容', () => {
  const input = `
@unless(user.isAdmin)
  <p>你不是管理員</p>
@endunless`;
  const output = transform(input);

  assertNotIncludes(output, '你不是管理員', '條件為 true 時不應該顯示內容');
});

test('應該處理簡單的布林變數', () => {
  const input = `
@unless(isEmpty)
  <p>有內容</p>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '有內容', 'isEmpty 為 false 時應該顯示');
});

console.log('\n📦 複雜條件測試\n');

test('應該處理比較運算符', () => {
  const input = `
@unless(count > 10)
  <p>數量小於或等於 10</p>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '數量小於或等於 10', '比較條件應該正確執行');
});

test('應該處理邏輯運算符 AND', () => {
  const input = `
@unless(user.isGuest && user.isActive)
  <p>不是活躍的訪客</p>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '不是活躍的訪客', 'AND 邏輯應該正確');
});

test('應該處理邏輯運算符 OR', () => {
  const input = `
@unless(user.isGuest || isEmpty)
  <p>既不是訪客也不為空</p>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '既不是訪客也不為空', 'OR 邏輯應該正確');
});

console.log('\n📦 嵌套與組合測試\n');

test('應該與 @if 混用', () => {
  const input = `
@if(user.isAdmin)
  <p>管理員</p>
@endunless
@unless(user.isGuest)
  <p>會員</p>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '管理員', '@if 應該正常工作');
  assertIncludes(output, '會員', '@unless 應該正常工作');
});

test('應該支援嵌套使用', () => {
  const input = `
@unless(user.isGuest)
  <div>
    @unless(isEmpty)
      <p>會員且有內容</p>
    @endunless
  </div>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '會員且有內容', '嵌套 @unless 應該正確執行');
});

test('應該在 @unless 內使用 @if', () => {
  const input = `
@unless(user.isGuest)
  @if(user.isAdmin)
    <p>管理員會員</p>
  @endif
@endunless`;
  const output = transform(input);

  assertIncludes(output, '管理員會員', '混合嵌套應該正確執行');
});

console.log('\n📦 多個 @unless 測試\n');

test('應該處理多個連續的 @unless', () => {
  const input = `
@unless(user.isGuest)
  <p>段落 1</p>
@endunless
@unless(isEmpty)
  <p>段落 2</p>
@endunless
@unless(user.isAdmin)
  <p>段落 3</p>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '段落 1', '第一個 @unless 應該正確');
  assertIncludes(output, '段落 2', '第二個 @unless 應該正確');
  assertNotIncludes(output, '段落 3', '第三個 @unless 應該正確（不顯示）');
});

console.log('\n📦 邊界條件測試\n');

test('應該處理空白條件', () => {
  const input = `
@unless( user.isGuest )
  <p>有空白的條件</p>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '有空白的條件', '應該忽略條件周圍的空白');
});

test('應該處理多行內容', () => {
  const input = `
@unless(user.isGuest)
  <div>
    <h1>標題</h1>
    <p>段落 1</p>
    <p>段落 2</p>
  </div>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '<h1>標題</h1>', '多行內容應該完整保留');
  assertIncludes(output, '段落 1', '多行內容應該完整保留');
  assertIncludes(output, '段落 2', '多行內容應該完整保留');
});

console.log('\n📦 與其他功能集成測試\n');

test('應該與 @foreach 配合使用', () => {
  const input = `
@unless(user.isGuest)
  <ul>
    @foreach(items as item)
      <li>{{ item }}</li>
    @endforeach
  </ul>
@endunless`;
  const output = transform(input);

  assertIncludes(output, '<li>apple</li>', '@foreach 應該在 @unless 內正常工作');
  assertIncludes(output, '<li>banana</li>', '@foreach 應該在 @unless 內正常工作');
});

test('應該與 @switch 配合使用', () => {
  const input = `
@unless(user.isGuest)
  @switch(count)
    @case(5)
      <p>數量是 5</p>
    @default
      <p>其他數量</p>
  @endswitch
@endunless`;
  const output = transform(input);

  assertIncludes(output, '數量是 5', '@switch 應該在 @unless 內正常工作');
});

test('應該在 partial 中使用', () => {
  // 創建測試 partial
  const partialsDir = path.resolve(__dirname, '../partials');
  if (!fs.existsSync(partialsDir)) {
    fs.mkdirSync(partialsDir, { recursive: true });
  }

  const partialPath = path.join(partialsDir, 'test-unless.html');
  fs.writeFileSync(partialPath, `
@unless(isGuest)
  <p>Partial 中的 @unless</p>
@endunless`);

  // 使用表達式傳遞布爾值，不是字符串
  const input = `<div><include src="test-unless.html" isGuest="{{ false }}" /></div>`;
  const output = transform(input);

  assertIncludes(output, 'Partial 中的 @unless', 'Partial 中應該可以使用 @unless');

  // 清理測試文件
  fs.unlinkSync(partialPath);
});

console.log('\n📦 效能測試\n');

test('應該高效處理大量 @unless', () => {
  let input = '<div>';
  for (let i = 0; i < 50; i++) {
    input += `
@unless(user.isGuest)
  <p>段落 ${i}</p>
@endunless`;
  }
  input += '</div>';

  const startTime = Date.now();
  const output = transform(input);
  const duration = Date.now() - startTime;

  assertIncludes(output, '段落 25', '所有內容應該被處理');

  if (duration > 100) {
    throw new Error(`處理時間過長: ${duration}ms（應該 < 100ms）`);
  }

  console.log(`    ℹ️  處理 50 個 @unless 耗時: ${duration}ms`);
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
