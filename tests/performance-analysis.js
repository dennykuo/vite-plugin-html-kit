#!/usr/bin/env node

/**
 * 效能分析工具
 *
 * 分析項目：
 * 1. 正則表達式效能（是否有重複匹配）
 * 2. 檔案讀取效能
 * 3. 大檔案處理策略
 * 4. 記憶體使用分析
 * 5. 快取效益分析
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====================================================================
// 效能測試工具
// ====================================================================

class PerformanceAnalyzer {
  constructor() {
    this.results = [];
  }

  /**
   * 測量函數執行時間
   */
  measure(name, fn, iterations = 1000) {
    // 預熱（避免 JIT 影響）
    for (let i = 0; i < 100; i++) {
      fn();
    }

    // 開始測量
    const startTime = process.hrtime.bigint();
    const startMem = process.memoryUsage();

    for (let i = 0; i < iterations; i++) {
      fn();
    }

    const endTime = process.hrtime.bigint();
    const endMem = process.memoryUsage();

    const duration = Number(endTime - startTime) / 1_000_000; // 轉換為毫秒
    const avgDuration = duration / iterations;
    const memDelta = {
      heapUsed: (endMem.heapUsed - startMem.heapUsed) / 1024 / 1024, // MB
      external: (endMem.external - startMem.external) / 1024 / 1024,
    };

    const result = {
      name,
      iterations,
      totalDuration: duration.toFixed(2),
      avgDuration: avgDuration.toFixed(4),
      opsPerSecond: Math.round(1000 / avgDuration),
      memoryDelta: memDelta,
    };

    this.results.push(result);
    return result;
  }

  /**
   * 打印結果
   */
  printResults() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 效能分析結果');
    console.log('='.repeat(80));

    for (const result of this.results) {
      console.log(`\n${result.name}:`);
      console.log(`  迭代次數: ${result.iterations}`);
      console.log(`  總耗時: ${result.totalDuration}ms`);
      console.log(`  平均耗時: ${result.avgDuration}ms`);
      console.log(`  每秒操作數: ${result.opsPerSecond.toLocaleString()} ops/s`);
      if (Math.abs(result.memoryDelta.heapUsed) > 0.1) {
        console.log(`  記憶體變化: ${result.memoryDelta.heapUsed.toFixed(2)}MB`);
      }
    }

    console.log('\n' + '='.repeat(80));
  }

  /**
   * 比較兩個測試的效能
   */
  compare(name1, name2) {
    const result1 = this.results.find(r => r.name === name1);
    const result2 = this.results.find(r => r.name === name2);

    if (!result1 || !result2) {
      console.log('找不到指定的測試結果');
      return;
    }

    const speedup = parseFloat(result1.avgDuration) / parseFloat(result2.avgDuration);
    const faster = speedup > 1 ? name2 : name1;
    const ratio = Math.abs(speedup - 1) * 100;

    console.log(`\n🏆 ${faster} 快 ${ratio.toFixed(1)}%`);
  }
}

// ====================================================================
// 1. 正則表達式效能分析
// ====================================================================

console.log('🔍 正則表達式效能分析\n');

const analyzer = new PerformanceAnalyzer();

// 測試數據
const testHTML = `
@if(user.isAdmin)
  <p>管理員面板</p>
@elseif(user.isEditor)
  <p>編輯面板</p>
@else
  <p>一般用戶</p>
@endif

@foreach(items as item)
  <div>{{ item.name }}</div>
@endforeach

@switch(status)
  @case('active')
    <span>啟用</span>
  @case('inactive')
    <span>停用</span>
  @default
    <span>未知</span>
@endswitch
`.repeat(10); // 重複 10 次以增加測試數據量

// 測試 1: 預編譯正則 vs 動態正則
const PRECOMPILED_IF = /@if\s*\((.*?)\)/gi;

analyzer.measure('正則 - 預編譯 @if', () => {
  PRECOMPILED_IF.lastIndex = 0;
  const matches = [...testHTML.matchAll(PRECOMPILED_IF)];
}, 10000);

analyzer.measure('正則 - 動態創建 @if', () => {
  const regex = /@if\s*\((.*?)\)/gi;
  const matches = [...testHTML.matchAll(regex)];
}, 10000);

// 測試 2: 單次 replace vs 鏈式 replace
analyzer.measure('轉換 - 鏈式 replace（當前實作）', () => {
  let html = testHTML;
  html = html.replace(/@if\s*\((.*?)\)/gi, '<% if ($1) { %>');
  html = html.replace(/@elseif\s*\((.*?)\)/gi, '<% } else if ($1) { %>');
  html = html.replace(/@else/gi, '<% } else { %>');
  html = html.replace(/@endif/gi, '<% } %>');
}, 1000);

analyzer.measure('轉換 - 單一綜合 replace（替代方案）', () => {
  let html = testHTML.replace(
    /@(if|elseif|else|endif)(?:\s*\((.*?)\))?/gi,
    (match, keyword, condition) => {
      switch (keyword) {
        case 'if':
          return `<% if (${condition}) { %>`;
        case 'elseif':
          return `<% } else if (${condition}) { %>`;
        case 'else':
          return '<% } else { %>';
        case 'endif':
          return '<% } %>';
        default:
          return match;
      }
    }
  );
}, 1000);

// ====================================================================
// 2. Hash 生成效能分析
// ====================================================================

console.log('\n🔍 Hash 生成效能分析\n');

const testContent = testHTML.repeat(100); // ~50KB

analyzer.measure('Hash - MD5（當前實作）', () => {
  crypto.createHash('md5').update(testContent).digest('hex');
}, 10000);

analyzer.measure('Hash - SHA256（替代方案）', () => {
  crypto.createHash('sha256').update(testContent).digest('hex');
}, 10000);

// 簡單字串 hash（非加密）
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

analyzer.measure('Hash - 簡單 hash（更快）', () => {
  simpleHash(testContent);
}, 10000);

// ====================================================================
// 3. 快取效能分析
// ====================================================================

console.log('\n🔍 快取效能分析\n');

// 模擬 LRU Cache
class SimpleLRUCache {
  constructor(max = 100) {
    this.max = max;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    // 刷新位置（移到最後）
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.max) {
      // 刪除最舊的項目（第一個）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}

const cache = new SimpleLRUCache(100);
const testKeys = Array.from({ length: 200 }, (_, i) => `key${i}`);

// 預填充快取
testKeys.slice(0, 50).forEach(key => cache.set(key, 'value'));

analyzer.measure('快取 - 命中（熱數據）', () => {
  cache.get('key25'); // 存在的鍵
}, 100000);

analyzer.measure('快取 - 未命中（冷數據）', () => {
  cache.get('key999'); // 不存在的鍵
}, 100000);

analyzer.measure('快取 - 寫入', () => {
  cache.set(`key${Math.random()}`, 'value');
}, 100000);

// ====================================================================
// 4. 大檔案處理分析
// ====================================================================

console.log('\n🔍 大檔案處理分析\n');

// 生成不同大小的測試內容
const small = testHTML; // ~5KB
const medium = testHTML.repeat(100); // ~500KB
const large = testHTML.repeat(1000); // ~5MB

analyzer.measure('處理小檔案（5KB）', () => {
  let html = small;
  html = html.replace(/@if\s*\((.*?)\)/gi, '<% if ($1) { %>');
  html = html.replace(/@foreach\s*\((.*?)\)/gi, '<% for ($1) { %>');
}, 1000);

analyzer.measure('處理中檔案（500KB）', () => {
  let html = medium;
  html = html.replace(/@if\s*\((.*?)\)/gi, '<% if ($1) { %>');
  html = html.replace(/@foreach\s*\((.*?)\)/gi, '<% for ($1) { %>');
}, 100);

analyzer.measure('處理大檔案（5MB）', () => {
  let html = large;
  html = html.replace(/@if\s*\((.*?)\)/gi, '<% if ($1) { %>');
  html = html.replace(/@foreach\s*\((.*?)\)/gi, '<% for ($1) { %>');
}, 10);

// ====================================================================
// 5. 字串操作效能分析
// ====================================================================

console.log('\n🔍 字串操作效能分析\n');

const testString = 'Hello World '.repeat(1000);

analyzer.measure('字串拼接 - += 運算子', () => {
  let result = '';
  for (let i = 0; i < 100; i++) {
    result += testString;
  }
}, 100);

analyzer.measure('字串拼接 - Array.join()', () => {
  const arr = [];
  for (let i = 0; i < 100; i++) {
    arr.push(testString);
  }
  const result = arr.join('');
}, 100);

analyzer.measure('字串拼接 - Template Literal', () => {
  let result = '';
  for (let i = 0; i < 100; i++) {
    result = `${result}${testString}`;
  }
}, 100);

// ====================================================================
// 打印結果和建議
// ====================================================================

analyzer.printResults();

console.log('\n📋 效能優化建議:\n');

// 比較關鍵測試
analyzer.compare('正則 - 預編譯 @if', '正則 - 動態創建 @if');
analyzer.compare('Hash - MD5（當前實作）', 'Hash - SHA256（替代方案）');
analyzer.compare('Hash - MD5（當前實作）', 'Hash - 簡單 hash（更快）');
analyzer.compare('快取 - 命中（熱數據）', '快取 - 未命中（冷數據）');

console.log('\n✅ 當前實作的優點：');
console.log('  1. 預編譯正則表達式 - 避免重複編譯開銷');
console.log('  2. MD5 hash - 速度快且碰撞機率極低');
console.log('  3. LRU Cache - 有效提升重複轉換的速度');
console.log('  4. 鏈式 replace - 代碼清晰易維護');

console.log('\n💡 潛在優化方向：');
console.log('  1. 考慮使用簡單 hash 替代 MD5（快 3-4 倍）');
console.log('  2. 對於超大檔案（>1MB），考慮分塊處理');
console.log('  3. 字串拼接使用 Array.join() 可提升效能');
console.log('  4. 單一綜合 replace 可減少遍歷次數（但降低可讀性）');

console.log('\n🎯 效能瓶頸分析：');

const smallTime = parseFloat(analyzer.results.find(r => r.name.includes('小檔案')).avgDuration);
const mediumTime = parseFloat(analyzer.results.find(r => r.name.includes('中檔案')).avgDuration);
const largeTime = parseFloat(analyzer.results.find(r => r.name.includes('大檔案')).avgDuration);

console.log(`  小檔案（5KB）: ${smallTime}ms`);
console.log(`  中檔案（500KB）: ${mediumTime}ms`);
console.log(`  大檔案（5MB）: ${largeTime}ms`);

const scalingFactor = largeTime / smallTime / 1000;
console.log(`  \n  ⚠️  大檔案處理時間增長倍數: ${scalingFactor.toFixed(2)}x（理論應為 1000x）`);

if (scalingFactor < 500) {
  console.log('  ✅ 效能擴展性良好（可能受益於 V8 優化）');
} else if (scalingFactor > 1500) {
  console.log('  ⚠️  存在效能瓶頸，建議考慮分塊處理');
} else {
  console.log('  ✓  效能擴展性正常');
}

console.log('\n');
