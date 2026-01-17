/**
 * @forelse 空資料處理測試
 * 測試 @forelse/@empty/@endforelse 語法
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const indexPath = path.resolve(__dirname, '../src/index.js');
const { default: vitePluginHtmlKit } = await import(indexPath);

console.log('🧪 測試 @forelse 空資料處理功能\n');

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

function assertNotIncludes(haystack, needle, message) {
  if (haystack.includes(needle)) {
    throw new Error(message || `不應該包含 "${needle}"`);
  }
}

const plugin = vitePluginHtmlKit({
  partialsDir: 'partials',
  data: {
    users: [
      { name: 'Alice', role: 'admin' },
      { name: 'Bob', role: 'user' }
    ],
    emptyArray: [],
    products: ['Apple', 'Banana', 'Orange']
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

console.log('📦 基礎測試 - 有資料時顯示迴圈\n');

test('應該在陣列有資料時顯示迴圈內容', () => {
  const input = `
@forelse(users as user)
  <li>{{ user.name }}</li>
@empty
  <p>沒有使用者</p>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, 'Alice', '應該顯示第一個使用者');
  assertIncludes(output, 'Bob', '應該顯示第二個使用者');
  assertNotIncludes(output, '沒有使用者', '不應該顯示空資料訊息');
});

test('應該正確處理複雜物件屬性', () => {
  const input = `
@forelse(users as user)
  <div>{{ user.name }} - {{ user.role }}</div>
@empty
  <p>無資料</p>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, 'Alice - admin', '應該顯示完整資訊');
  assertIncludes(output, 'Bob - user', '應該顯示完整資訊');
});

console.log('\n📦 基礎測試 - 空陣列時顯示 @empty\n');

test('應該在陣列為空時顯示 @empty 內容', () => {
  const input = `
@forelse(emptyArray as item)
  <li>{{ item }}</li>
@empty
  <p>列表是空的</p>
@endforelse`;
  const output = transform(input);

  assertNotIncludes(output, '<li>', '不應該有列表項');
  assertIncludes(output, '列表是空的', '應該顯示空資料訊息');
});

test('應該在未定義變數時顯示 @empty', () => {
  const input = `
@forelse(undefinedVar as item)
  <li>{{ item }}</li>
@empty
  <p>變數未定義</p>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, '變數未定義', '應該顯示空資料訊息');
});

console.log('\n📦 支援不同語法風格\n');

test('應該支援 JavaScript 風格 (item of items)', () => {
  const input = `
@forelse(product of products)
  <span>{{ product }}</span>
@empty
  <p>無產品</p>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, 'Apple', '應該顯示產品');
  assertIncludes(output, 'Banana', '應該顯示產品');
  assertNotIncludes(output, '無產品', '不應該顯示空資料');
});

console.log('\n📦 嵌套測試\n');

test('應該支援嵌套 @forelse', () => {
  const input = `
@forelse(users as user)
  <div>
    {{ user.name }}
    @forelse(emptyArray as item)
      <span>{{ item }}</span>
    @empty
      <span>無項目</span>
    @endforelse
  </div>
@empty
  <p>無使用者</p>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, 'Alice', '外層迴圈應該執行');
  assertIncludes(output, '無項目', '內層應該顯示空資料');
  assertNotIncludes(output, '無使用者', '外層不應該顯示空資料');
});

console.log('\n📦 與其他語法集成\n');

test('應該與 @if 配合使用', () => {
  const input = `
@forelse(users as user)
  @if(user.role === 'admin')
    <p>管理員: {{ user.name }}</p>
  @endif
@empty
  <p>無使用者</p>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, '管理員: Alice', '@if 應該正常工作');
});

test('應該在 @forelse 內使用 @unless', () => {
  const input = `
@forelse(users as user)
  @unless(user.role === 'admin')
    <p>一般用戶: {{ user.name }}</p>
  @endunless
@empty
  <p>無使用者</p>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, '一般用戶: Bob', '@unless 應該正常工作');
  assertNotIncludes(output, '一般用戶: Alice', 'Alice 是管理員');
});

console.log('\n📦 多個 @forelse 測試\n');

test('應該處理多個連續的 @forelse', () => {
  const input = `
@forelse(users as user)
  <div>{{ user.name }}</div>
@empty
  <p>無使用者</p>
@endforelse

@forelse(emptyArray as item)
  <span>{{ item }}</span>
@empty
  <p>無項目</p>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, 'Alice', '第一個 @forelse 應該顯示資料');
  assertIncludes(output, '無項目', '第二個 @forelse 應該顯示空資料');
});

console.log('\n📦 邊界條件\n');

test('應該處理多行內容', () => {
  const input = `
@forelse(users as user)
  <div class="user">
    <h3>{{ user.name }}</h3>
    <p>角色: {{ user.role }}</p>
  </div>
@empty
  <div class="empty">
    <h3>暫無資料</h3>
    <p>請稍後再試</p>
  </div>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, '<h3>Alice</h3>', '多行內容應該完整');
  assertNotIncludes(output, '暫無資料', '不應該顯示空資料');
});

test('應該處理空白字元', () => {
  const input = `
@forelse( users as user )
  <li>{{ user.name }}</li>
@empty
  <p>空</p>
@endforelse`;
  const output = transform(input);

  assertIncludes(output, 'Alice', '應該忽略空白');
});

console.log('\n📦 效能測試\n');

test('應該高效處理多個 @forelse', () => {
  let input = '<div>';
  for (let i = 0; i < 30; i++) {
    input += `
@forelse(users as user)
  <p>使用者 ${i}: {{ user.name }}</p>
@empty
  <p>空 ${i}</p>
@endforelse`;
  }
  input += '</div>';

  const startTime = Date.now();
  const output = transform(input);
  const duration = Date.now() - startTime;

  assertIncludes(output, '使用者 15', '所有 @forelse 應該被處理');

  if (duration > 100) {
    throw new Error(`處理時間過長: ${duration}ms`);
  }

  console.log(`    ℹ️  處理 30 個 @forelse 耗時: ${duration}ms`);
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
