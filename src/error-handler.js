/**
 * 統一錯誤處理系統
 *
 * 提供：
 * - 結構化的錯誤碼系統
 * - 統一的錯誤訊息格式
 * - 詳細的錯誤上下文（檔案、行號等）
 * - 錯誤恢復建議
 * - 除錯模式下的詳細資訊
 */

// ====================================================================
// 錯誤碼定義
// ====================================================================

/**
 * 錯誤碼結構：Exxxx
 * - E1xxx: 循環引用相關錯誤
 * - E2xxx: 安全性相關錯誤
 * - E3xxx: 檔案系統相關錯誤
 * - E4xxx: 解析/求值相關錯誤
 * - E5xxx: 模板編譯/執行相關錯誤
 */
export const ErrorCodes = {
  // 循環引用錯誤 (E1xxx)
  CIRCULAR_LAYOUT_REFERENCE: 'E1001',
  CIRCULAR_INCLUDE_REFERENCE: 'E1002',

  // 安全性錯誤 (E2xxx)
  PATH_TRAVERSAL_LAYOUT: 'E2001',
  PATH_TRAVERSAL_INCLUDE: 'E2002',

  // 檔案系統錯誤 (E3xxx)
  LAYOUT_FILE_NOT_FOUND: 'E3001',
  INCLUDE_FILE_NOT_FOUND: 'E3002',
  FILE_READ_ERROR: 'E3003',

  // 解析/求值錯誤 (E4xxx)
  ATTRIBUTE_PARSE_ERROR: 'E4001',
  EXPRESSION_EVAL_ERROR: 'E4002',
  SECTION_PARSE_ERROR: 'E4003',

  // 模板編譯/執行錯誤 (E5xxx)
  TEMPLATE_COMPILE_ERROR: 'E5001',
  TEMPLATE_RUNTIME_ERROR: 'E5002',
  LODASH_SYNTAX_ERROR: 'E5003',
};

// ====================================================================
// 錯誤訊息模板
// ====================================================================

const ErrorMessages = {
  [ErrorCodes.CIRCULAR_LAYOUT_REFERENCE]: {
    title: '循環佈局引用',
    message: (cycle) => `檢測到循環佈局引用: ${cycle}`,
    suggestion: '請檢查佈局檔案的 @extends 指令，確保沒有形成循環依賴。',
    severity: 'error',
  },
  [ErrorCodes.CIRCULAR_INCLUDE_REFERENCE]: {
    title: '循環 Include 引用',
    message: (cycle) => `檢測到循環 include 引用: ${cycle}`,
    suggestion: '請檢查 <include> 標籤，確保沒有形成循環依賴。',
    severity: 'error',
  },
  [ErrorCodes.PATH_TRAVERSAL_LAYOUT]: {
    title: '路徑遍歷攻擊',
    message: (path) => `偵測到潛在的路徑遍歷攻擊: ${path}`,
    suggestion: '佈局檔案路徑必須在 partials 目錄內，不允許使用 ../ 跳出目錄。',
    severity: 'error',
  },
  [ErrorCodes.PATH_TRAVERSAL_INCLUDE]: {
    title: '路徑遍歷攻擊',
    message: (path) => `偵測到潛在的路徑遍歷攻擊: ${path}`,
    suggestion: 'Include 檔案路徑必須在 partials 目錄內，不允許使用 ../ 跳出目錄。',
    severity: 'error',
  },
  [ErrorCodes.LAYOUT_FILE_NOT_FOUND]: {
    title: '佈局檔案不存在',
    message: (path) => `找不到佈局檔案: ${path}`,
    suggestion: '請確認佈局檔案是否存在於 partials 目錄中，並檢查檔案路徑是否正確。',
    severity: 'warning',
  },
  [ErrorCodes.INCLUDE_FILE_NOT_FOUND]: {
    title: 'Include 檔案不存在',
    message: (path) => `找不到 include 檔案: ${path}`,
    suggestion: '請確認檔案是否存在於 partials 目錄中，並檢查檔案路徑是否正確。',
    severity: 'warning',
  },
  [ErrorCodes.FILE_READ_ERROR]: {
    title: '檔案讀取錯誤',
    message: (path, error) => `讀取檔案失敗: ${path} (${error})`,
    suggestion: '請檢查檔案權限，確保 Node.js 進程有讀取權限。',
    severity: 'error',
  },
  [ErrorCodes.ATTRIBUTE_PARSE_ERROR]: {
    title: '屬性解析錯誤',
    message: (error) => `解析 HTML 屬性時發生錯誤: ${error}`,
    suggestion: '請檢查 HTML 屬性語法是否正確，確保引號成對出現。',
    severity: 'warning',
  },
  [ErrorCodes.EXPRESSION_EVAL_ERROR]: {
    title: '表達式求值錯誤',
    message: (attr, value, error) => `無法評估屬性表達式 ${attr}="${value}": ${error}`,
    suggestion: '請檢查表達式語法，確保變數存在且類型正確。',
    severity: 'warning',
  },
  [ErrorCodes.SECTION_PARSE_ERROR]: {
    title: 'Section 解析錯誤',
    message: (error) => `解析 @section 時發生錯誤: ${error}`,
    suggestion: '請確認 @section 和 @endsection 是否成對出現。',
    severity: 'error',
  },
  [ErrorCodes.TEMPLATE_COMPILE_ERROR]: {
    title: '模板編譯錯誤',
    message: (error) => `Lodash 模板編譯失敗: ${error}`,
    suggestion: '請檢查模板語法，確保 <% %> 和 {{ }} 標籤正確閉合。',
    severity: 'error',
  },
  [ErrorCodes.TEMPLATE_RUNTIME_ERROR]: {
    title: '模板執行錯誤',
    message: (error) => `Lodash 模板執行失敗: ${error}`,
    suggestion: '請檢查模板中使用的變數是否已定義，避免訪問 undefined 的屬性。',
    severity: 'error',
  },
  [ErrorCodes.LODASH_SYNTAX_ERROR]: {
    title: 'Lodash 語法錯誤',
    message: (error) => `Lodash 模板語法錯誤: ${error}`,
    suggestion: '請檢查模板中的 JavaScript 語法是否正確。',
    severity: 'error',
  },
};

// ====================================================================
// 錯誤處理類別
// ====================================================================

/**
 * 統一的錯誤類別
 */
export class PluginError extends Error {
  /**
   * @param {string} code - 錯誤碼（來自 ErrorCodes）
   * @param {any[]} args - 傳遞給錯誤訊息模板的參數
   * @param {Object} context - 錯誤上下文資訊
   * @param {string} [context.file] - 發生錯誤的檔案路徑
   * @param {number} [context.line] - 發生錯誤的行號
   * @param {string} [context.source] - 錯誤來源代碼片段
   * @param {Error} [context.originalError] - 原始錯誤物件
   */
  constructor(code, args = [], context = {}) {
    const template = ErrorMessages[code];

    if (!template) {
      super(`未知錯誤碼: ${code}`);
      this.code = 'E0000';
      this.severity = 'error';
      return;
    }

    const message = typeof template.message === 'function'
      ? template.message(...args)
      : template.message;

    super(message);

    this.name = 'PluginError';
    this.code = code;
    this.title = template.title;
    this.suggestion = template.suggestion;
    this.severity = template.severity;
    this.context = context;

    // 捕獲堆疊追蹤
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginError);
    }
  }

  /**
   * 格式化錯誤訊息為完整的字串
   * @param {boolean} verbose - 是否顯示詳細資訊（除錯模式）
   * @returns {string}
   */
  format(verbose = false) {
    const prefix = '[vite-plugin-html-kit]';
    const colorCode = this.severity === 'error' ? '\x1b[31m' : '\x1b[33m';
    const resetCode = '\x1b[0m';

    let output = `${colorCode}${prefix} ${this.title} [${this.code}]${resetCode}\n`;
    output += `  ${this.message}\n`;

    // 加入上下文資訊
    if (this.context.file) {
      output += `  📄 檔案: ${this.context.file}`;
      if (this.context.line) {
        output += `:${this.context.line}`;
      }
      output += '\n';
    }

    // 建議
    if (this.suggestion) {
      output += `  💡 建議: ${this.suggestion}\n`;
    }

    // 詳細模式：顯示原始錯誤和堆疊
    if (verbose) {
      if (this.context.source) {
        output += `  📝 來源:\n${this.context.source}\n`;
      }
      if (this.context.originalError) {
        output += `  🔍 原始錯誤: ${this.context.originalError.message}\n`;
        if (this.context.originalError.stack) {
          output += `  堆疊:\n${this.context.originalError.stack}\n`;
        }
      }
    }

    return output;
  }

  /**
   * 生成 HTML 錯誤註釋
   * @returns {string}
   */
  toHTMLComment() {
    return `<!-- [vite-plugin-html-kit] 錯誤 [${this.code}]: ${this.message} -->`;
  }
}

// ====================================================================
// 錯誤處理工具函數
// ====================================================================

/**
 * 記錄錯誤到控制台
 * @param {PluginError} error
 */
export function logError(error) {
  const verbose = process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG;
  console.error(error.format(verbose));
}

/**
 * 記錄警告到控制台
 * @param {PluginError} error
 */
export function logWarning(error) {
  const verbose = process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG;
  console.warn(error.format(verbose));
}

/**
 * 根據嚴重程度記錄錯誤
 * @param {PluginError} error
 */
export function logBySeverity(error) {
  if (error.severity === 'error') {
    logError(error);
  } else {
    logWarning(error);
  }
}

/**
 * 創建並記錄錯誤
 * @param {string} code - 錯誤碼
 * @param {any[]} args - 訊息參數
 * @param {Object} context - 錯誤上下文
 * @returns {PluginError}
 */
export function createAndLogError(code, args = [], context = {}) {
  const error = new PluginError(code, args, context);
  logBySeverity(error);
  return error;
}

/**
 * 檢查是否為除錯模式
 * @returns {boolean}
 */
export function isDebugMode() {
  return !!(process.env.DEBUG || process.env.VITE_HTML_KIT_DEBUG);
}

// ====================================================================
// 錯誤恢復助手
// ====================================================================

/**
 * 嘗試執行函數，失敗時返回降級值
 * @template T
 * @param {() => T} fn - 要執行的函數
 * @param {T} fallback - 降級值
 * @param {string} errorCode - 錯誤碼
 * @param {Object} context - 錯誤上下文
 * @returns {T}
 */
export function tryOrFallback(fn, fallback, errorCode, context = {}) {
  try {
    return fn();
  } catch (error) {
    createAndLogError(errorCode, [error.message], {
      ...context,
      originalError: error,
    });
    return fallback;
  }
}

/**
 * 安全地解析 JSON，失敗時返回空物件
 * @param {string} str
 * @param {Object} context
 * @returns {Object}
 */
export function safeJSONParse(str, context = {}) {
  return tryOrFallback(
    () => JSON.parse(str),
    {},
    ErrorCodes.ATTRIBUTE_PARSE_ERROR,
    context
  );
}
