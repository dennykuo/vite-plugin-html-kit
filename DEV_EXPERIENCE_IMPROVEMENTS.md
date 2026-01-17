# 📋 開發體驗改進建議（備用）

**優先級：** 低
**狀態：** 待實施
**預估時間：** 彈性

---

## 1️⃣ 更好的除錯模式（詳細日誌）

### 目標
提供分層的除錯日誌系統，讓開發者能夠追蹤整個轉換流程。

### 實作建議

#### A. 日誌等級系統
```javascript
const LogLevel = {
  SILENT: 0,   // 無輸出
  ERROR: 1,    // 只顯示錯誤
  WARN: 2,     // 錯誤 + 警告
  INFO: 3,     // 錯誤 + 警告 + 一般資訊
  DEBUG: 4,    // 所有資訊
  TRACE: 5,    // 包含詳細追蹤
};

// 從環境變數讀取日誌等級
const logLevel = process.env.VITE_HTML_KIT_LOG_LEVEL
  ? parseInt(process.env.VITE_HTML_KIT_LOG_LEVEL)
  : LogLevel.ERROR;

class Logger {
  constructor(name) {
    this.name = name;
  }

  error(message, context = {}) {
    if (logLevel >= LogLevel.ERROR) {
      console.error(`[vite-plugin-html-kit:${this.name}] ❌ ${message}`, context);
    }
  }

  warn(message, context = {}) {
    if (logLevel >= LogLevel.WARN) {
      console.warn(`[vite-plugin-html-kit:${this.name}] ⚠️  ${message}`, context);
    }
  }

  info(message, context = {}) {
    if (logLevel >= LogLevel.INFO) {
      console.log(`[vite-plugin-html-kit:${this.name}] ℹ️  ${message}`, context);
    }
  }

  debug(message, context = {}) {
    if (logLevel >= LogLevel.DEBUG) {
      console.log(`[vite-plugin-html-kit:${this.name}] 🔍 ${message}`, context);
    }
  }

  trace(message, context = {}) {
    if (logLevel >= LogLevel.TRACE) {
      console.log(`[vite-plugin-html-kit:${this.name}] 📍 ${message}`, context);
    }
  }

  // 特殊：效能追蹤
  perf(operation, fn) {
    if (logLevel < LogLevel.DEBUG) {
      return fn();
    }

    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;

    console.log(`[vite-plugin-html-kit:${this.name}] ⏱️  ${operation}: ${duration.toFixed(2)}ms`);
    return result;
  }
}
```

#### B. 使用範例
```javascript
// 在各個函數中創建 logger
const transformLogger = new Logger('transform');
const extendsLogger = new Logger('extends');
const includeLogger = new Logger('include');

// transformIndexHtml
transformIndexHtml(html, ctx) {
  transformLogger.info(`開始轉換: ${ctx.filename}`);

  transformLogger.debug('步驟 1: 處理佈局繼承', { filename: ctx.filename });
  html = transformLogger.perf('processExtends', () => processExtends(html, filename));

  transformLogger.debug('步驟 2: 轉換邏輯標籤', { size: html.length });
  html = transformLogger.perf('transformLogicTags', () => transformLogicTags(html));

  transformLogger.debug('步驟 3: 解析 Include', { includeCount: html.match(/<include/g)?.length || 0 });
  html = transformLogger.perf('resolveIncludes', () => resolveIncludes(html, globalData, filename));

  transformLogger.info(`轉換完成: ${html.length} 字元`);
  return html;
}
```

#### C. 環境變數配置
```bash
# .env 或命令行
VITE_HTML_KIT_LOG_LEVEL=4  # DEBUG 模式

# 使用範例
VITE_HTML_KIT_LOG_LEVEL=4 npm run dev
```

#### D. 輸出範例
```
[vite-plugin-html-kit:transform] ℹ️  開始轉換: /path/to/index.html
[vite-plugin-html-kit:transform] 🔍 步驟 1: 處理佈局繼承 { filename: 'index.html' }
[vite-plugin-html-kit:extends] 🔍 載入佈局: layouts/app.html
[vite-plugin-html-kit:extends] 🔍 解析 sections: { title: '...', content: '...' }
[vite-plugin-html-kit:transform] ⏱️  processExtends: 2.34ms
[vite-plugin-html-kit:transform] 🔍 步驟 2: 轉換邏輯標籤 { size: 5432 }
[vite-plugin-html-kit:transform] ⏱️  transformLogicTags: 0.45ms
[vite-plugin-html-kit:transform] 🔍 步驟 3: 解析 Include { includeCount: 3 }
[vite-plugin-html-kit:include] 🔍 處理 include: header.html
[vite-plugin-html-kit:include] 🔍 處理 include: footer.html
[vite-plugin-html-kit:transform] ⏱️  resolveIncludes: 1.23ms
[vite-plugin-html-kit:transform] ℹ️  轉換完成: 16409 字元
```

---

## 2️⃣ 錯誤提示改進（標註錯誤位置）

### 目標
在錯誤訊息中精確標註問題所在的行號和代碼片段。

### 實作建議

#### A. 行號追蹤器
```javascript
class LineTracker {
  /**
   * 計算字串中某個位置的行號和列號
   */
  static getPosition(content, offset) {
    const lines = content.substring(0, offset).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  /**
   * 獲取特定行的內容
   */
  static getLine(content, lineNumber) {
    const lines = content.split('\n');
    return lines[lineNumber - 1] || '';
  }

  /**
   * 獲取錯誤上下文（前後各 2 行）
   */
  static getContext(content, lineNumber, contextLines = 2) {
    const lines = content.split('\n');
    const start = Math.max(0, lineNumber - contextLines - 1);
    const end = Math.min(lines.length, lineNumber + contextLines);

    const context = [];
    for (let i = start; i < end; i++) {
      const isErrorLine = i === lineNumber - 1;
      context.push({
        lineNumber: i + 1,
        content: lines[i],
        isError: isErrorLine,
      });
    }
    return context;
  }

  /**
   * 格式化錯誤上下文為可讀字串
   */
  static formatContext(content, lineNumber, columnNumber, contextLines = 2) {
    const context = this.getContext(content, lineNumber, contextLines);
    const maxLineNumWidth = String(context[context.length - 1].lineNumber).length;

    let output = '\n';
    for (const line of context) {
      const lineNum = String(line.lineNumber).padStart(maxLineNumWidth, ' ');
      const prefix = line.isError ? '>' : ' ';
      const color = line.isError ? '\x1b[31m' : '\x1b[90m';
      const reset = '\x1b[0m';

      output += `${color}${prefix} ${lineNum} | ${line.content}${reset}\n`;

      // 在錯誤行下方加上指示符
      if (line.isError && columnNumber) {
        const spaces = ' '.repeat(maxLineNumWidth + 3 + columnNumber);
        output += `${color}${spaces}^${reset}\n`;
      }
    }
    return output;
  }
}
```

#### B. 增強的錯誤訊息
```javascript
// 在 processExtends 中使用
if (!fs.existsSync(layoutFilePath)) {
  const position = LineTracker.getPosition(html, extendsMatch.index);
  const context = LineTracker.formatContext(html, position.line, position.column);

  const error = new PluginError(
    ErrorCodes.LAYOUT_FILE_NOT_FOUND,
    [layoutPath],
    {
      file: currentFile,
      line: position.line,
      column: position.column,
      source: context,
    }
  );

  logError(error);
  return error.toHTMLComment();
}
```

#### C. 輸出範例
```
[31m[vite-plugin-html-kit] 佈局檔案不存在 [E3001][0m
  找不到佈局檔案: layouts/missing.html
  📄 檔案: index.html:1:1
  💡 建議: 請確認佈局檔案是否存在於 partials 目錄中，並檢查檔案路徑是否正確。

[31m
> 1 | @extends('layouts/missing.html')
    | ^
  2 |
  3 | @section('content')
  4 |   <h1>Hello World</h1>
  5 | @endsection
[0m
```

---

## 3️⃣ 效能分析工具（運行時）

### 目標
提供運行時的效能分析工具，幫助開發者識別瓶頸。

### 實作建議

#### A. 效能追蹤器
```javascript
class PerformanceTracker {
  constructor() {
    this.metrics = new Map();
    this.enabled = process.env.VITE_HTML_KIT_PERF === 'true';
  }

  /**
   * 開始計時
   */
  start(name) {
    if (!this.enabled) return;

    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: -Infinity,
      });
    }

    return {
      name,
      startTime: performance.now(),
    };
  }

  /**
   * 結束計時
   */
  end(timer) {
    if (!this.enabled || !timer) return;

    const duration = performance.now() - timer.startTime;
    const metric = this.metrics.get(timer.name);

    metric.count++;
    metric.totalTime += duration;
    metric.minTime = Math.min(metric.minTime, duration);
    metric.maxTime = Math.max(metric.maxTime, duration);
  }

  /**
   * 包裝函數以自動追蹤
   */
  wrap(name, fn) {
    if (!this.enabled) {
      return fn();
    }

    const timer = this.start(name);
    try {
      const result = fn();
      this.end(timer);
      return result;
    } catch (error) {
      this.end(timer);
      throw error;
    }
  }

  /**
   * 獲取報告
   */
  getReport() {
    if (!this.enabled) return null;

    const report = [];
    for (const [name, metric] of this.metrics.entries()) {
      report.push({
        name,
        count: metric.count,
        total: metric.totalTime.toFixed(2),
        avg: (metric.totalTime / metric.count).toFixed(2),
        min: metric.minTime.toFixed(2),
        max: metric.maxTime.toFixed(2),
      });
    }

    // 按總時間排序
    return report.sort((a, b) => parseFloat(b.total) - parseFloat(a.total));
  }

  /**
   * 打印報告
   */
  printReport() {
    const report = this.getReport();
    if (!report) return;

    console.log('\n📊 [vite-plugin-html-kit] 效能報告');
    console.log('='.repeat(80));
    console.log('操作                          | 次數  | 總計(ms) | 平均(ms) | 最小(ms) | 最大(ms)');
    console.log('-'.repeat(80));

    for (const metric of report) {
      const name = metric.name.padEnd(28);
      const count = String(metric.count).padStart(5);
      const total = String(metric.total).padStart(8);
      const avg = String(metric.avg).padStart(8);
      const min = String(metric.min).padStart(8);
      const max = String(metric.max).padStart(8);

      console.log(`${name} | ${count} | ${total} | ${avg} | ${min} | ${max}`);
    }

    console.log('='.repeat(80));
  }

  /**
   * 重置所有指標
   */
  reset() {
    this.metrics.clear();
  }
}

// 全域實例
const perfTracker = new PerformanceTracker();

// 在 process 退出時打印報告
if (perfTracker.enabled) {
  process.on('beforeExit', () => {
    perfTracker.printReport();
  });
}
```

#### B. 使用範例
```javascript
// 在核心函數中使用
const transformLogicTags = (html) => {
  return perfTracker.wrap('transformLogicTags', () => {
    const cacheKey = hash(html);
    const cached = transformCache.get(cacheKey);

    if (cached !== undefined) {
      performanceStats.recordHit();
      return cached;
    }

    // ... 轉換邏輯
  });
};

const processExtends = (html, currentFile, inheritedSections) => {
  return perfTracker.wrap('processExtends', () => {
    // ... 處理邏輯
  });
};
```

#### C. 啟用方式
```bash
# 啟用效能追蹤
VITE_HTML_KIT_PERF=true npm run dev
```

#### D. 輸出範例
```
📊 [vite-plugin-html-kit] 效能報告
================================================================================
操作                          | 次數  | 總計(ms) | 平均(ms) | 最小(ms) | 最大(ms)
--------------------------------------------------------------------------------
transformIndexHtml           |   150 |   234.56 |     1.56 |     0.89 |    12.34
resolveIncludes              |   450 |   123.45 |     0.27 |     0.12 |     3.45
transformLogicTags           |   600 |    45.67 |     0.08 |     0.02 |     1.23
processExtends               |   150 |    34.56 |     0.23 |     0.15 |     2.34
parseSections                |   300 |    12.34 |     0.04 |     0.01 |     0.45
hash                         |  1200 |    56.78 |     0.05 |     0.03 |     0.12
================================================================================
```

---

## 🎯 整合建議

### 統一的除錯配置
```javascript
// vite.config.js
export default {
  plugins: [
    vitePluginHtmlKit({
      partialsDir: 'partials',
      data: { ... },

      // 除錯配置
      debug: {
        logLevel: 4,           // 日誌等級 (0-5)
        performance: true,     // 啟用效能追蹤
        showContext: true,     // 錯誤訊息顯示上下文
        contextLines: 2,       // 上下文行數
      }
    })
  ]
}
```

### 環境變數支援
```bash
# 開發模式 - 完整除錯
VITE_HTML_KIT_LOG_LEVEL=5 \
VITE_HTML_KIT_PERF=true \
npm run dev

# 生產模式 - 僅錯誤
VITE_HTML_KIT_LOG_LEVEL=1 \
npm run build
```

---

## 📊 預期效益

### 開發體驗提升
- ✅ 更容易追蹤轉換流程
- ✅ 快速定位錯誤位置
- ✅ 識別效能瓶頸
- ✅ 更好的除錯效率

### 維護性提升
- ✅ 統一的日誌系統
- ✅ 詳細的效能數據
- ✅ 清晰的錯誤上下文

---

## 🔄 實施優先順序

1. **日誌系統** - 基礎設施，優先實施
2. **錯誤位置標註** - 提升除錯體驗
3. **效能追蹤器** - 可選，用於深度優化

---

## 📝 後續工作

當決定實施時：
1. 創建 `src/logger.js` - 日誌系統
2. 創建 `src/line-tracker.js` - 行號追蹤
3. 創建 `src/performance-tracker.js` - 效能追蹤
4. 整合到 `src/index.js`
5. 更新文檔和範例
6. 編寫測試

---

**文檔創建日期：** 2026-01-17
**狀態：** 備用方案
**預估實施時間：** 2-3 小時
