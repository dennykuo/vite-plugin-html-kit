/**
 * @verbatim 語法測試
 * 測試跳過 Blade 解析功能，與 Vue.js/Alpine.js 等前端框架整合
 */

import { describe, test, expect, beforeEach } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';

describe('@verbatim 語法測試', () => {
  let plugin;

  beforeEach(() => {
    plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {
        bladeMessage: 'This is Blade',
        user: { name: 'John' }
      }
    });

    plugin.configResolved({
      root: process.cwd(),
      command: 'serve',
      mode: 'development'
    });
  });

  test('應該保護 verbatim 區塊內的 {{ }} 語法不被處理', () => {
    const input = `
      <div>
        @verbatim
          <p>{{ vueMessage }}</p>
        @endverbatim
      </div>
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    // verbatim 區塊內的 {{ }} 應該保持原樣
    expect(output).toContain('{{ vueMessage }}');
  });

  test('應該在 verbatim 區塊外正常處理 {{ }} 語法', () => {
    const input = `
      <div>
        <p>{{ bladeMessage }}</p>
        @verbatim
          <p>{{ vueMessage }}</p>
        @endverbatim
      </div>
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    // verbatim 外的變數應該被處理
    expect(output).toContain('This is Blade');
    // verbatim 內的變數應該保持原樣
    expect(output).toContain('{{ vueMessage }}');
  });

  test('應該支援多個 verbatim 區塊', () => {
    const input = `
      @verbatim
        <div>{{ vue1 }}</div>
      @endverbatim

      <p>{{ bladeMessage }}</p>

      @verbatim
        <div>{{ vue2 }}</div>
      @endverbatim
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('{{ vue1 }}');
    expect(output).toContain('{{ vue2 }}');
    expect(output).toContain('This is Blade');
  });

  test('應該保護 verbatim 區塊內的 Blade 指令', () => {
    const input = `
      @verbatim
        @if(vueCondition)
          <p>Vue condition</p>
        @endif
      @endverbatim
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    // Blade 指令應該保持原樣，不被轉換
    expect(output).toContain('@if(vueCondition)');
    expect(output).toContain('@endif');
  });

  test('應該在 Vue.js 範例中正確工作', () => {
    const input = `
      <div id="app">
        <h1>{{ bladeMessage }}</h1>

        @verbatim
          <div>
            <p>{{ message }}</p>
            <input v-model="name">
            <p>Hello {{ name }}</p>
          </div>
        @endverbatim
      </div>
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    // Blade 變數被處理
    expect(output).toContain('This is Blade');
    // Vue.js 語法保持原樣
    expect(output).toContain('{{ message }}');
    expect(output).toContain('v-model="name"');
    expect(output).toContain('{{ name }}');
  });

  test('應該在 Alpine.js 範例中正確工作', () => {
    const input = `
      @verbatim
        <div x-data="{ open: false }">
          <button @click="open = !open">Toggle</button>
          <div x-show="open">
            <p>{{ message }}</p>
          </div>
        </div>
      @endverbatim
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('x-data="{ open: false }"');
    expect(output).toContain('@click="open = !open"');
    expect(output).toContain('x-show="open"');
    expect(output).toContain('{{ message }}');
  });

  test('應該處理 verbatim 區塊內的多行內容', () => {
    const input = `
      @verbatim
        <div id="app">
          <h1>{{ title }}</h1>
          <ul>
            <li v-for="item in items">{{ item.name }}</li>
          </ul>
          <p>{{ description }}</p>
        </div>
      @endverbatim
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('{{ title }}');
    expect(output).toContain('v-for="item in items"');
    expect(output).toContain('{{ item.name }}');
    expect(output).toContain('{{ description }}');
  });

  test('應該支援 verbatim 區塊內的特殊字元', () => {
    const input = `
      @verbatim
        <div>
          {{ user.name || 'Guest' }}
          {{ items[0] }}
          {{ count > 0 ? 'Yes' : 'No' }}
        </div>
      @endverbatim
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain("{{ user.name || 'Guest' }}");
    expect(output).toContain('{{ items[0] }}');
    expect(output).toContain("{{ count > 0 ? 'Yes' : 'No' }}");
  });

  test('應該在混合 Blade 和前端框架語法時正確工作', () => {
    const input = `
      <div>
        <!-- Blade 處理的部分 -->
        @if(user.name)
          <p>Welcome, {{ user.name }}</p>
        @endif

        <!-- Vue.js 處理的部分 -->
        @verbatim
          <div v-if="isLoggedIn">
            <p>Hello, {{ userName }}</p>
            <button @click="logout">Logout</button>
          </div>
        @endverbatim
      </div>
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    // Blade 變數被處理
    expect(output).toContain('Welcome, John');
    // Vue.js 語法保持原樣
    expect(output).toContain('v-if="isLoggedIn"');
    expect(output).toContain('{{ userName }}');
    expect(output).toContain('@click="logout"');
  });

  test('應該處理空的 verbatim 區塊', () => {
    const input = `
      @verbatim
      @endverbatim
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    // 應該不會報錯，且輸出為空
    expect(output.trim()).toBe('');
  });

  test('應該處理只有空白的 verbatim 區塊', () => {
    const input = `
      @verbatim

      @endverbatim
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    // 應該包含換行符（verbatim 區塊內的空白被保留）
    expect(output).toContain('\n');
    // 不應該包含 @verbatim 或 @endverbatim 標記
    expect(output).not.toContain('@verbatim');
    expect(output).not.toContain('@endverbatim');
  });

  test('應該支援 verbatim 區塊內的 HTML 註釋', () => {
    const input = `
      @verbatim
        <!-- Vue.js template -->
        <div>{{ message }}</div>
      @endverbatim
    `;

    const output = plugin.transformIndexHtml(input, {
      filename: 'test.html',
      server: null
    });

    expect(output).toContain('<!-- Vue.js template -->');
    expect(output).toContain('{{ message }}');
  });
});
