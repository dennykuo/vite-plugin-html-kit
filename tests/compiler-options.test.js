/**
 * 測試 compilerOptions 自訂編譯選項
 *
 * 驗證：
 * - 默認 {{ }} 語法
 * - Lodash 原生 <%= %> 語法
 * - 自訂語法 [[ ]]
 */

import { describe, it, expect } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';

describe('Compiler Options - 自訂變數插值語法', () => {

  it('應該支援默認的 {{ }} 語法', () => {
    const plugin = vitePluginHtmlKit({
      data: {
        site: 'My Awesome Site',
        version: '1.0.0'
      }
    });

    const html = `
      <h1>{{ site }}</h1>
      <p>Version: {{ version }}</p>
    `;

    const result = plugin.transformIndexHtml(html);

    expect(result).toContain('<h1>My Awesome Site</h1>');
    expect(result).toContain('<p>Version: 1.0.0</p>');
    expect(result).not.toContain('{{');
  });

  it('應該支援 Lodash 原生的 <%= %> 語法', () => {
    const plugin = vitePluginHtmlKit({
      data: {
        site: 'My Awesome Site',
        version: '1.0.0'
      },
      compilerOptions: {
        interpolate: /<%=([\s\S]+?)%>/g  // 啟用 <%= %> 語法
      }
    });

    const html = `
      <h1><%= site %></h1>
      <p>Version: <%= version %></p>
    `;

    const result = plugin.transformIndexHtml(html);

    expect(result).toContain('<h1>My Awesome Site</h1>');
    expect(result).toContain('<p>Version: 1.0.0</p>');
    expect(result).not.toContain('<%=');
  });

  it('應該支援自訂的 [[ ]] 語法', () => {
    const plugin = vitePluginHtmlKit({
      data: {
        site: 'My Custom Site',
        author: 'Denny'
      },
      compilerOptions: {
        interpolate: /\[\[([\s\S]+?)\]\]/g  // 自訂 [[ ]] 語法
      }
    });

    const html = `
      <h1>[[ site ]]</h1>
      <p>By: [[ author ]]</p>
    `;

    const result = plugin.transformIndexHtml(html);

    expect(result).toContain('<h1>My Custom Site</h1>');
    expect(result).toContain('<p>By: Denny</p>');
    expect(result).not.toContain('[[');
  });

  it('自訂語法後，默認 {{ }} 語法應該失效', () => {
    const plugin = vitePluginHtmlKit({
      data: {
        site: 'Test Site'
      },
      compilerOptions: {
        interpolate: /<%=([\s\S]+?)%>/g  // 改用 <%= %> 語法
      }
    });

    // 使用 {{ }} 應該不會被轉換
    const html = '<h1>{{ site }}</h1>';
    const result = plugin.transformIndexHtml(html);

    // {{ }} 不應該被轉換，仍然保留在輸出中
    expect(result).toContain('{{ site }}');
    expect(result).not.toContain('Test Site');
  });

  it('應該支援表達式和物件屬性存取', () => {
    const plugin = vitePluginHtmlKit({
      data: {
        user: {
          name: 'John Doe',
          age: 30
        },
        items: ['A', 'B', 'C']
      },
      compilerOptions: {
        interpolate: /<%=([\s\S]+?)%>/g
      }
    });

    const html = `
      <p>Name: <%= user.name %></p>
      <p>Age: <%= user.age + 5 %></p>
      <p>Items: <%= items.length %></p>
      <p>First: <%= items[0] %></p>
    `;

    const result = plugin.transformIndexHtml(html);

    expect(result).toContain('<p>Name: John Doe</p>');
    expect(result).toContain('<p>Age: 35</p>');
    expect(result).toContain('<p>Items: 3</p>');
    expect(result).toContain('<p>First: A</p>');
  });

  it('應該支援在 @if 邏輯中使用自訂語法', () => {
    const plugin = vitePluginHtmlKit({
      data: {
        isAdmin: true,
        username: 'Admin User'
      },
      compilerOptions: {
        interpolate: /<%=([\s\S]+?)%>/g
      }
    });

    const html = `
      @if (isAdmin)
        <div class="admin-panel">
          <h1>Welcome, <%= username %></h1>
        </div>
      @endif
    `;

    const result = plugin.transformIndexHtml(html);

    expect(result).toContain('Welcome, Admin User');
    expect(result).toContain('<div class="admin-panel">');
  });

  it('應該支援在 @foreach 迴圈中使用自訂語法', () => {
    const plugin = vitePluginHtmlKit({
      data: {
        products: [
          { name: 'Product A', price: 100 },
          { name: 'Product B', price: 200 }
        ]
      },
      compilerOptions: {
        interpolate: /<%=([\s\S]+?)%>/g
      }
    });

    const html = `
      <ul>
        @foreach (products as product)
          <li><%= product.name %>: $<%= product.price %></li>
        @endforeach
      </ul>
    `;

    const result = plugin.transformIndexHtml(html);

    expect(result).toContain('<li>Product A: $100</li>');
    expect(result).toContain('<li>Product B: $200</li>');
  });

  it('應該在多層巢狀中正確處理自訂語法', () => {
    const plugin = vitePluginHtmlKit({
      data: {
        categories: [
          {
            name: 'Tech',
            items: ['Laptop', 'Phone']
          },
          {
            name: 'Books',
            items: ['Novel', 'Magazine']
          }
        ]
      },
      compilerOptions: {
        interpolate: /\[\[([\s\S]+?)\]\]/g  // 使用 [[ ]] 語法
      }
    });

    const html = `
      @foreach (categories as category)
        <div class="category">
          <h2>[[ category.name ]]</h2>
          <ul>
            @foreach (category.items as item)
              <li>[[ item ]]</li>
            @endforeach
          </ul>
        </div>
      @endforeach
    `;

    const result = plugin.transformIndexHtml(html);

    expect(result).toContain('<h2>Tech</h2>');
    expect(result).toContain('<li>Laptop</li>');
    expect(result).toContain('<li>Phone</li>');
    expect(result).toContain('<h2>Books</h2>');
    expect(result).toContain('<li>Novel</li>');
    expect(result).toContain('<li>Magazine</li>');
  });
});
