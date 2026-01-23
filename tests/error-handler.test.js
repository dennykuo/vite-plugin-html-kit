#!/usr/bin/env node

/**
 * 錯誤處理系統測試
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  ErrorCodes,
  PluginError,
  createAndLogError,
  tryOrFallback,
  isDebugMode,
} from '../src/error-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 測試錯誤處理系統\n');

let testCount = 0;
let passCount = 0;

function test(description, fn) {
  testCount++;
  try {
    fn();
    console.log(`  ✓ ${description}`);
    passCount++;
  } catch (error) {
    console.log(`  ✗ ${description}`);
    console.log(`    錯誤: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || '斷言失敗');
  }
}

// ====================================================================
// 測試錯誤碼定義
// ====================================================================

console.log('📦 測試錯誤碼定義\n');

test('ErrorCodes 應該包含所有錯誤類別', () => {
  assert(ErrorCodes.CIRCULAR_LAYOUT_REFERENCE === 'E1001');
  assert(ErrorCodes.CIRCULAR_INCLUDE_REFERENCE === 'E1002');
  assert(ErrorCodes.PATH_TRAVERSAL_LAYOUT === 'E2001');
  assert(ErrorCodes.TEMPLATE_COMPILE_ERROR === 'E5001');
});

test('錯誤碼應該遵循命名規範', () => {
  // E1xxx: 循環引用
  assert(ErrorCodes.CIRCULAR_LAYOUT_REFERENCE.startsWith('E1'));
  // E2xxx: 安全性
  assert(ErrorCodes.PATH_TRAVERSAL_LAYOUT.startsWith('E2'));
  // E3xxx: 檔案系統
  assert(ErrorCodes.LAYOUT_FILE_NOT_FOUND.startsWith('E3'));
  // E4xxx: 解析
  assert(ErrorCodes.ATTRIBUTE_PARSE_ERROR.startsWith('E4'));
  // E5xxx: 模板
  assert(ErrorCodes.TEMPLATE_COMPILE_ERROR.startsWith('E5'));
});

// ====================================================================
// 測試 PluginError 類別
// ====================================================================

console.log('\n📦 測試 PluginError 類別\n');

test('應該正確創建循環引用錯誤', () => {
  const error = new PluginError(
    ErrorCodes.CIRCULAR_LAYOUT_REFERENCE,
    ['a.html → b.html → a.html'],
    { file: 'a.html' }
  );

  assert(error.code === 'E1001');
  assert(error.title === '循環佈局引用');
  assert(error.severity === 'error');
  assert(error.message.includes('a.html → b.html → a.html'));
  assert(error.context.file === 'a.html');
});

test('應該正確創建檔案不存在警告', () => {
  const error = new PluginError(
    ErrorCodes.LAYOUT_FILE_NOT_FOUND,
    ['layouts/missing.html'],
    { file: 'index.html', line: 1 }
  );

  assert(error.code === 'E3001');
  assert(error.title === '佈局檔案不存在');
  assert(error.severity === 'warning');
  assert(error.message.includes('layouts/missing.html'));
});

test('應該正確創建路徑遍歷攻擊錯誤', () => {
  const error = new PluginError(
    ErrorCodes.PATH_TRAVERSAL_LAYOUT,
    ['../../../etc/passwd']
  );

  assert(error.code === 'E2001');
  assert(error.severity === 'error');
  assert(error.message.includes('../../../etc/passwd'));
  assert(error.suggestion.includes('partials 目錄'));
});

test('format() 應該生成格式化的錯誤訊息', () => {
  const error = new PluginError(
    ErrorCodes.LAYOUT_FILE_NOT_FOUND,
    ['layouts/app.html'],
    { file: 'index.html', line: 1 }
  );

  const formatted = error.format(false);

  assert(formatted.includes('[E3001]'));
  assert(formatted.includes('佈局檔案不存在'));
  assert(formatted.includes('index.html:1'));
  assert(formatted.includes('💡 建議'));
});

test('format(verbose=true) 應該包含詳細資訊', () => {
  const originalError = new Error('Original error');
  const error = new PluginError(
    ErrorCodes.TEMPLATE_COMPILE_ERROR,
    ['Syntax error'],
    {
      file: 'index.html',
      originalError,
      source: '<% invalid syntax %>',
    }
  );

  const formatted = error.format(true);

  assert(formatted.includes('🔍 原始錯誤'));
  assert(formatted.includes('📝 來源'));
  assert(formatted.includes('<% invalid syntax %>'));
});

test('toHTMLComment() 應該生成 HTML 註釋', () => {
  const error = new PluginError(
    ErrorCodes.CIRCULAR_LAYOUT_REFERENCE,
    ['a.html → b.html']
  );

  const comment = error.toHTMLComment();

  assert(comment.startsWith('<!--'));
  assert(comment.endsWith('-->'));
  assert(comment.includes('[E1001]'));
});

// ====================================================================
// 測試工具函數
// ====================================================================

console.log('\n📦 測試工具函數\n');

test('tryOrFallback 應該在成功時返回結果', () => {
  const result = tryOrFallback(
    () => 42,
    0,
    ErrorCodes.TEMPLATE_COMPILE_ERROR
  );

  assert(result === 42);
});

test('tryOrFallback 應該在失敗時返回降級值', () => {
  const result = tryOrFallback(
    () => {
      throw new Error('Test error');
    },
    'fallback',
    ErrorCodes.TEMPLATE_COMPILE_ERROR,
    { file: 'test.html' }
  );

  assert(result === 'fallback');
});

test('isDebugMode 應該檢測除錯模式', () => {
  const originalDebug = process.env.DEBUG;
  const originalViteDebug = process.env.VITE_HTML_KIT_DEBUG;

  // 測試未設定
  delete process.env.DEBUG;
  delete process.env.VITE_HTML_KIT_DEBUG;
  assert(isDebugMode() === false);

  // 測試 DEBUG
  process.env.DEBUG = '1';
  assert(isDebugMode() === true);

  // 清理
  if (originalDebug) process.env.DEBUG = originalDebug;
  else delete process.env.DEBUG;
  if (originalViteDebug) process.env.VITE_HTML_KIT_DEBUG = originalViteDebug;
  else delete process.env.VITE_HTML_KIT_DEBUG;
});

// ====================================================================
// 測試錯誤嚴重程度
// ====================================================================

console.log('\n📦 測試錯誤嚴重程度\n');

test('循環引用錯誤應該是 error 級別', () => {
  const error1 = new PluginError(ErrorCodes.CIRCULAR_LAYOUT_REFERENCE, []);
  const error2 = new PluginError(ErrorCodes.CIRCULAR_INCLUDE_REFERENCE, []);

  assert(error1.severity === 'error');
  assert(error2.severity === 'error');
});

test('檔案不存在應該是 warning 級別', () => {
  const error1 = new PluginError(ErrorCodes.LAYOUT_FILE_NOT_FOUND, []);
  const error2 = new PluginError(ErrorCodes.INCLUDE_FILE_NOT_FOUND, []);

  assert(error1.severity === 'warning');
  assert(error2.severity === 'warning');
});

test('安全性錯誤應該是 error 級別', () => {
  const error1 = new PluginError(ErrorCodes.PATH_TRAVERSAL_LAYOUT, []);
  const error2 = new PluginError(ErrorCodes.PATH_TRAVERSAL_INCLUDE, []);

  assert(error1.severity === 'error');
  assert(error2.severity === 'error');
});

// ====================================================================
// 測試上下文資訊
// ====================================================================

console.log('\n📦 測試上下文資訊\n');

test('應該正確儲存檔案上下文', () => {
  const error = new PluginError(
    ErrorCodes.LAYOUT_FILE_NOT_FOUND,
    ['app.html'],
    { file: 'index.html', line: 10 }
  );

  assert(error.context.file === 'index.html');
  assert(error.context.line === 10);
});

test('應該正確儲存原始錯誤', () => {
  const originalError = new Error('Original');
  const error = new PluginError(
    ErrorCodes.TEMPLATE_COMPILE_ERROR,
    ['Failed'],
    { originalError }
  );

  assert(error.context.originalError === originalError);
});

test('應該正確儲存來源代碼', () => {
  const error = new PluginError(
    ErrorCodes.TEMPLATE_COMPILE_ERROR,
    ['Syntax error'],
    { source: '<% code %>' }
  );

  assert(error.context.source === '<% code %>');
});

// ====================================================================
// 測試 Astro 風格錯誤訊息改進
// ====================================================================

console.log('\n📦 測試 Astro 風格錯誤訊息');

test('應該支援列號（column）上下文', () => {
  const error = new PluginError(
    ErrorCodes.INCLUDE_FILE_NOT_FOUND,
    ['test.html'],
    { file: 'index.html', line: 10, column: 5 }
  );

  assert(error.context.column === 5);
  const formatted = error.format(false);
  assert(formatted.includes('index.html:10:5'));
});

test('應該支援列號範圍（column 和 columnEnd）', () => {
  const error = new PluginError(
    ErrorCodes.INCLUDE_FILE_NOT_FOUND,
    ['test.html'],
    { file: 'index.html', line: 10, column: 5, columnEnd: 25 }
  );

  assert(error.context.column === 5);
  assert(error.context.columnEnd === 25);
});

test('format() 應該包含拼寫建議提示（當有 missingPath 和 searchDir）', () => {
  const error = new PluginError(
    ErrorCodes.INCLUDE_FILE_NOT_FOUND,
    ['test.html'],
    {
      file: 'index.html',
      line: 10,
      missingPath: 'test.html',
      searchDir: __dirname
    }
  );

  const formatted = error.format(false);
  // 應該包含 missingPath 和 searchDir 相關的資訊
  // 即使沒有找到相似的檔案，也應該正常顯示錯誤訊息
  assert(formatted.includes('[E3002]'));
  assert(formatted.includes('Include 檔案不存在'));
});

test('應該正確處理沒有可用檔案的情況', () => {
  const error = new PluginError(
    ErrorCodes.INCLUDE_FILE_NOT_FOUND,
    ['test.html'],
    {
      file: 'index.html',
      line: 10,
      missingPath: 'test.html',
      searchDir: '/nonexistent/path'
    }
  );

  const formatted = error.format(false);
  // 不應該崩潰，應該正常顯示錯誤訊息
  assert(formatted.includes('[E3002]'));
  assert(formatted.includes('Include 檔案不存在'));
});

// ====================================================================
// 結果統計
// ====================================================================

console.log('\n' + '='.repeat(60));
console.log('📊 測試結果統計');
console.log('='.repeat(60));
console.log(`總測試數: ${testCount}`);
console.log(`通過: ${passCount} ✓`);
console.log(`失敗: ${testCount - passCount} ✗`);
console.log(`通過率: ${((passCount / testCount) * 100).toFixed(2)}%`);
console.log('='.repeat(60));

if (passCount === testCount) {
  console.log('\n✅ 所有測試通過！\n');
  process.exit(0);
} else {
  console.log(`\n❌ 有 ${testCount - passCount} 個測試失敗\n`);
  process.exit(1);
}
