import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vitePluginHtmlKit from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PartialsDir 配置測試套件
 *
 * 測試 partialsDir 配置選項，包括：
 * - 相對路徑（相對於 root）
 * - 絕對路徑
 * - 與 vite root 配置的交互
 */
describe('PartialsDir 配置測試', () => {
  const testDir = path.join(__dirname, 'fixtures', 'partials-dir');
  const relativePartialsDir = path.join(testDir, 'partials');
  const absolutePartialsDir = path.join(__dirname, 'fixtures', 'absolute-partials');

  beforeEach(() => {
    // 建立測試目錄結構
    [testDir, relativePartialsDir, absolutePartialsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  });

  afterEach(() => {
    // 清理測試檔案
    [testDir, absolutePartialsDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('相對路徑 PartialsDir', () => {
    it('應該正確解析相對於 root 的路徑', () => {
      // 建立 partial 檔案
      fs.writeFileSync(
        path.join(relativePartialsDir, 'component.html'),
        '<div>Relative Path Component</div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials'
      });

      plugin.configResolved({ root: testDir });

      const html = '<include src="component.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<div>Relative Path Component</div>');
    });

    it('應該支援相對路徑與子目錄', () => {
      const subDir = path.join(relativePartialsDir, 'components');
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(subDir, 'card.html'),
        '<div class="card">Card Component</div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials'
      });

      plugin.configResolved({ root: testDir });

      const html = '<include src="components/card.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<div class="card">Card Component</div>');
    });

    it('應該支援深層相對路徑', () => {
      const deepPartialsDir = path.join(testDir, 'src', 'templates', 'partials');
      if (!fs.existsSync(deepPartialsDir)) {
        fs.mkdirSync(deepPartialsDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(deepPartialsDir, 'deep.html'),
        '<div>Deep Path Component</div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: 'src/templates/partials'
      });

      plugin.configResolved({ root: testDir });

      const html = '<include src="deep.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<div>Deep Path Component</div>');
    });
  });

  describe('絕對路徑 PartialsDir', () => {
    it('應該支援絕對路徑配置', () => {
      // 建立 partial 檔案
      fs.writeFileSync(
        path.join(absolutePartialsDir, 'absolute-component.html'),
        '<div>Absolute Path Component</div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: absolutePartialsDir
      });

      plugin.configResolved({ root: testDir });

      const html = '<include src="absolute-component.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<div>Absolute Path Component</div>');
    });

    it('使用絕對路徑時應該支援子目錄', () => {
      const subDir = path.join(absolutePartialsDir, 'layouts');
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(subDir, 'layout.html'),
        '<div class="layout">@yield(\'content\', \'Default Content\')</div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: absolutePartialsDir
      });

      plugin.configResolved({ root: testDir });

      const html = `
        @extends('layouts/layout.html')
        @section('content')
          <p>Custom Content</p>
        @endsection
      `;
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<div class="layout">');
      expect(result).toContain('<p>Custom Content</p>');
    });

    it('使用絕對路徑時應該正確處理 include', () => {
      fs.writeFileSync(
        path.join(absolutePartialsDir, 'header.html'),
        '<header title="{{ title }}">{{ title }}</header>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: absolutePartialsDir
      });

      plugin.configResolved({ root: testDir });

      const html = '<include src="header.html" title="My Header" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<header title="My Header">My Header</header>');
    });

    it('使用絕對路徑時應該支援 @include 指令', () => {
      fs.writeFileSync(
        path.join(absolutePartialsDir, 'nav.html'),
        '<nav>{{ navTitle }}</nav>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: absolutePartialsDir
      });

      plugin.configResolved({ root: testDir });

      const html = "@include('nav.html', { navTitle: 'Navigation' })";
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<nav>Navigation</nav>');
    });
  });

  describe('與 Vite Root 配置的交互', () => {
    it('相對路徑應該相對於 vite root 解析', () => {
      const customRoot = path.join(testDir, 'src');
      const customPartialsDir = path.join(customRoot, 'partials');

      if (!fs.existsSync(customRoot)) {
        fs.mkdirSync(customRoot, { recursive: true });
      }
      if (!fs.existsSync(customPartialsDir)) {
        fs.mkdirSync(customPartialsDir, { recursive: true });
      }

      fs.writeFileSync(
        path.join(customPartialsDir, 'custom.html'),
        '<div>Custom Root Component</div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials'  // 相對於 customRoot
      });

      plugin.configResolved({ root: customRoot });

      const html = '<include src="custom.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<div>Custom Root Component</div>');
    });

    it('絕對路徑應該不受 vite root 影響', () => {
      const customRoot = path.join(testDir, 'different-root');
      if (!fs.existsSync(customRoot)) {
        fs.mkdirSync(customRoot, { recursive: true });
      }

      fs.writeFileSync(
        path.join(absolutePartialsDir, 'independent.html'),
        '<div>Independent Component</div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: absolutePartialsDir  // 絕對路徑，不受 root 影響
      });

      plugin.configResolved({ root: customRoot });

      const html = '<include src="independent.html" />';
      const result = plugin.transformIndexHtml.handler(html);

      expect(result).toContain('<div>Independent Component</div>');
    });
  });

  describe('路徑安全性測試', () => {
    it('絕對路徑應該防止路徑遍歷攻擊', () => {
      fs.writeFileSync(
        path.join(absolutePartialsDir, 'safe.html'),
        '<div>Safe Component</div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: absolutePartialsDir
      });

      plugin.configResolved({ root: testDir });

      // 嘗試使用 ../ 逃出 partialsDir
      const html = '<include src="../../../etc/passwd" />';
      const result = plugin.transformIndexHtml.handler(html);

      // 應該顯示錯誤訊息，而不是實際檔案內容
      expect(result).toContain('<!-- [vite-plugin-html-kit] 錯誤');
      expect(result).toContain('路徑遍歷攻擊');
    });

    it('相對路徑應該防止路徑遍歷攻擊', () => {
      fs.writeFileSync(
        path.join(relativePartialsDir, 'safe.html'),
        '<div>Safe Component</div>'
      );

      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials'
      });

      plugin.configResolved({ root: testDir });

      // 嘗試使用 ../ 逃出 partialsDir
      const html = '<include src="../../../etc/passwd" />';
      const result = plugin.transformIndexHtml.handler(html);

      // 應該顯示錯誤訊息，而不是實際檔案內容
      expect(result).toContain('<!-- [vite-plugin-html-kit] 錯誤');
      expect(result).toContain('路徑遍歷攻擊');
    });
  });
});
