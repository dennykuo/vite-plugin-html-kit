import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vitePluginHtmlKit from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 安全性測試套件
 *
 * 測試插件對安全漏洞的防護能力，特別是路徑遍歷攻擊
 */
describe('安全性測試', () => {
  const testDir = path.join(__dirname, 'fixtures', 'security');
  const partialsDir = path.join(testDir, 'partials');

  beforeEach(() => {
    // 建立測試目錄結構
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (!fs.existsSync(partialsDir)) {
      fs.mkdirSync(partialsDir, { recursive: true });
    }

    // 建立測試檔案
    fs.writeFileSync(
      path.join(partialsDir, 'safe.html'),
      '<p>Safe content</p>'
    );
  });

  afterEach(() => {
    // 清理測試檔案
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('路徑遍歷攻擊防護', () => {
    it('應該阻止使用 ../ 的路徑遍歷攻擊', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      // 模擬 Vite 配置解析
      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="../../../etc/passwd" />';
      const result = plugin.transformIndexHtml(html);

      // 應該返回錯誤訊息而非檔案內容
      expect(result).toContain('偵測到潛在的路徑遍歷攻擊');
      expect(result).toContain('<!-- [vite-plugin-html-kit] 錯誤');
    });

    it('應該阻止使用絕對路徑的攻擊', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="/etc/passwd" />';
      const result = plugin.transformIndexHtml(html);

      // 應該返回錯誤訊息
      expect(result).toContain('偵測到潛在的路徑遍歷攻擊');
    });

    it('應該阻止使用 ..\\ 的路徑遍歷攻擊（Windows 風格）', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="..\\..\\..\\Windows\\System32\\config\\sam" />';
      const result = plugin.transformIndexHtml(html);

      // 在 Linux 系統上，反斜線被視為檔案名稱的一部分，因此會返回找不到檔案
      // 在 Windows 系統上，反斜線是路徑分隔符，應該會偵測到路徑遍歷攻擊
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        expect(result).toContain('偵測到潛在的路徑遍歷攻擊');
      } else {
        // Linux/Unix 系統會將反斜線視為檔案名稱的一部分
        expect(result).toContain('找不到 include 檔案');
      }
    });

    it('應該允許讀取 partials 目錄內的合法檔案', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="safe.html" />';
      const result = plugin.transformIndexHtml(html);

      // 應該成功載入檔案內容
      expect(result).toContain('Safe content');
      expect(result).not.toContain('錯誤');
    });

    it('應該正確處理子目錄中的合法檔案', () => {
      // 建立子目錄
      const subDir = path.join(partialsDir, 'components');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(
        path.join(subDir, 'button.html'),
        '<button>Click me</button>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="components/button.html" />';
      const result = plugin.transformIndexHtml(html);

      // 應該成功載入子目錄中的檔案
      expect(result).toContain('Click me');
      expect(result).not.toContain('錯誤');
    });
  });

  describe('檔案不存在的處理', () => {
    it('應該返回友善的錯誤訊息當檔案不存在時', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: path.relative(process.cwd(), partialsDir)
      });

      plugin.configResolved({ root: process.cwd() });

      const html = '<include src="nonexistent.html" />';
      const result = plugin.transformIndexHtml(html);

      // 應該包含警告訊息
      expect(result).toContain('找不到 include 檔案');
      expect(result).toContain('nonexistent.html');
      expect(result).toContain('<!-- [vite-plugin-html-kit] 警告');
    });
  });
});
