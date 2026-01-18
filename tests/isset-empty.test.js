/**
 * @isset/@empty 語法測試
 * 測試變數檢查功能
 */

import { describe, test, expect, beforeEach } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';

describe('@isset/@empty 語法測試', () => {
  describe('@isset 測試', () => {
    test('應該在變數存在時顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          user: { name: 'John' }
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @isset(user.name)
          <p>Name: {{ user.name }}</p>
        @endisset
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('Name: John');
    });

    test('應該在變數不存在時不顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          user: {}
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @isset(user.name)
          <p>Name: {{ user.name }}</p>
        @endisset
        <p>Always shown</p>
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).not.toContain('Name:');
      expect(output).toContain('Always shown');
    });

    test('應該在變數為 null 時不顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          user: { name: null }
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @isset(user.name)
          <p>Name exists</p>
        @endisset
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).not.toContain('Name exists');
    });

    test('應該支援檢查頂層變數', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          message: 'Hello'
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @isset(message)
          <p>{{ message }}</p>
        @endisset
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('Hello');
    });

    test('應該支援多層深度的屬性訪問', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          user: {
            profile: {
              contact: {
                email: 'john@example.com'
              }
            }
          }
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @isset(user.profile.contact.email)
          <p>Email: {{ user.profile.contact.email }}</p>
        @endisset
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('Email: john@example.com');
    });
  });

  describe('@empty 測試', () => {
    test('應該在變數為空陣列時顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          items: []
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @empty(items)
          <p>No items</p>
        @endempty
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('No items');
    });

    test('應該在變數有值時不顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          items: ['A', 'B', 'C']
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @empty(items)
          <p>No items</p>
        @endempty
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).not.toContain('No items');
    });

    test('應該在變數為 null 時顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          user: null
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @empty(user)
          <p>No user</p>
        @endempty
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('No user');
    });

    test('應該在變數為 undefined 時顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {}
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @empty(missingVariable)
          <p>Variable is empty</p>
        @endempty
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('Variable is empty');
    });

    test('應該在變數為空字串時顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          text: ''
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @empty(text)
          <p>No text</p>
        @endempty
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('No text');
    });

    test('應該在變數為 0 時顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          count: 0
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @empty(count)
          <p>Count is zero</p>
        @endempty
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('Count is zero');
    });

    test('應該在變數為 false 時顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          flag: false
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @empty(flag)
          <p>Flag is false</p>
        @endempty
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('Flag is false');
    });

    test('應該在物件為空時顯示內容', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          obj: {}
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @empty(obj)
          <p>Object is empty</p>
        @endempty
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('Object is empty');
    });
  });

  describe('@isset 和 @empty 整合測試', () => {
    test('應該可以同時使用 @isset 和 @empty', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          user: { name: 'John' },
          items: []
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @isset(user.name)
          <p>User: {{ user.name }}</p>
        @endisset

        @empty(items)
          <p>No items available</p>
        @endempty
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('User: John');
      expect(output).toContain('No items available');
    });

    test('應該支援巢狀使用', () => {
      const plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          user: { profile: { bio: '' } }
        }
      });

      plugin.configResolved({
        root: process.cwd(),
        command: 'serve',
        mode: 'development'
      });

      const input = `
        @isset(user.profile)
          <div>
            @empty(user.profile.bio)
              <p>No bio provided</p>
            @endempty
          </div>
        @endisset
      `;

      const output = plugin.transformIndexHtml(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('No bio provided');
    });
  });
});
