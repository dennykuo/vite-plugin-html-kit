/**
 * 測試佈局繼承和槽位功能
 *
 * 驗證：
 * - @extends 佈局繼承
 * - @section/@yield 內容區塊
 * - @slot 組件槽位
 * - 循環引用檢測
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vitePluginHtmlKit from '../src/index.js';

describe('佈局繼承測試 (@extends + @section + @yield)', () => {
  const partialsDir = path.join(process.cwd(), 'test-partials-layout');

  beforeEach(() => {
    // 創建臨時測試目錄
    if (!fs.existsSync(partialsDir)) {
      fs.mkdirSync(partialsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理測試目錄
    if (fs.existsSync(partialsDir)) {
      fs.rmSync(partialsDir, { recursive: true, force: true });
    }
  });

  it('應該正確載入並應用簡單佈局', () => {
    // 創建佈局檔案
    fs.writeFileSync(
      path.join(partialsDir, 'layout.html'),
      `<!DOCTYPE html>
<html>
<head>
  <title>@yield('title', 'Default Title')</title>
</head>
<body>
  <main>
    @yield('content')
  </main>
</body>
</html>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir,
      data: {}
    });

    // 模擬 Vite config
    plugin.configResolved({ root: process.cwd() });

    const html = `@extends('layout.html')

@section('title')
  Home Page
@endsection

@section('content')
  <h1>Welcome Home</h1>
@endsection`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<title>Home Page</title>');
    expect(result).toContain('<h1>Welcome Home</h1>');
    expect(result).not.toContain('@extends');
    expect(result).not.toContain('@section');
    expect(result).not.toContain('@yield');
  });

  it('應該支援 @yield 的默認值', () => {
    // 創建佈局檔案
    fs.writeFileSync(
      path.join(partialsDir, 'layout.html'),
      `<html>
<head>
  <title>@yield('title', 'Default Title')</title>
</head>
<body>
  @yield('content')
  <footer>@yield('footer', 'Default Footer')</footer>
</body>
</html>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir
    });

    plugin.configResolved({ root: process.cwd() });

    // 只定義部分 section，其他使用默認值
    const html = `@extends('layout.html')

@section('content')
  <p>Main content</p>
@endsection`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<title>Default Title</title>');
    expect(result).toContain('<p>Main content</p>');
    expect(result).toContain('<footer>Default Footer</footer>');
  });

  it('應該支援多個 sections', () => {
    // 創建佈局檔案
    fs.writeFileSync(
      path.join(partialsDir, 'layout.html'),
      `<html>
<head>
  @yield('styles')
</head>
<body>
  @yield('header')
  @yield('content')
  @yield('footer')
  @yield('scripts')
</body>
</html>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir
    });

    plugin.configResolved({ root: process.cwd() });

    const html = `@extends('layout.html')

@section('styles')
  <link rel="stylesheet" href="app.css">
@endsection

@section('header')
  <header>Header</header>
@endsection

@section('content')
  <main>Content</main>
@endsection

@section('footer')
  <footer>Footer</footer>
@endsection

@section('scripts')
  <script src="app.js"></script>
@endsection`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<link rel="stylesheet" href="app.css">');
    expect(result).toContain('<header>Header</header>');
    expect(result).toContain('<main>Content</main>');
    expect(result).toContain('<footer>Footer</footer>');
    expect(result).toContain('<script src="app.js"></script>');
  });

  it('應該支援巢狀佈局（佈局繼承佈局）', () => {
    // 創建基礎佈局
    fs.writeFileSync(
      path.join(partialsDir, 'base.html'),
      `<!DOCTYPE html>
<html>
<head>
  <title>Site - @yield('title')</title>
</head>
<body>
  @yield('body')
</body>
</html>`
    );

    // 創建中間佈局（繼承基礎佈局）
    fs.writeFileSync(
      path.join(partialsDir, 'blog.html'),
      `@extends('base.html')

@section('body')
  <div class="blog-layout">
    <nav>Blog Nav</nav>
    <main>@yield('content')</main>
  </div>
@endsection`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir
    });

    plugin.configResolved({ root: process.cwd() });

    // 頁面繼承中間佈局
    const html = `@extends('blog.html')

@section('title')
  My Post
@endsection

@section('content')
  <article>Post content</article>
@endsection`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<title>Site - My Post</title>');
    expect(result).toContain('<div class="blog-layout">');
    expect(result).toContain('<nav>Blog Nav</nav>');
    expect(result).toContain('<article>Post content</article>');
  });

  it('應該偵測循環佈局引用', () => {
    // 創建循環引用的佈局
    fs.writeFileSync(
      path.join(partialsDir, 'layout-a.html'),
      `@extends('layout-b.html')
@section('content')A@endsection`
    );

    fs.writeFileSync(
      path.join(partialsDir, 'layout-b.html'),
      `@extends('layout-a.html')
@section('content')B@endsection`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir
    });

    plugin.configResolved({ root: process.cwd() });

    const html = `@extends('layout-a.html')`;

    const result = plugin.transformIndexHtml.handler(html);

    // 應該包含循環引用錯誤訊息
    expect(result).toContain('檢測到循環佈局引用');
    expect(result).toContain('layout-a.html');
    expect(result).toContain('layout-b.html');
  });

  it('應該在 section 內支援變數插值', () => {
    // 創建佈局檔案
    fs.writeFileSync(
      path.join(partialsDir, 'layout.html'),
      `<html>
<head><title>@yield('title')</title></head>
<body>@yield('content')</body>
</html>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir,
      data: {
        siteName: 'My Site',
        pageName: 'Home'
      }
    });

    plugin.configResolved({ root: process.cwd() });

    const html = `@extends('layout.html')

@section('title')
  {{ pageName }} - {{ siteName }}
@endsection

@section('content')
  <h1>Welcome to {{ siteName }}</h1>
@endsection`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<title>Home - My Site</title>');
    expect(result).toContain('<h1>Welcome to My Site</h1>');
  });
});

describe('槽位系統測試 (@slot)', () => {
  const partialsDir = path.join(process.cwd(), 'test-partials-slot');

  beforeEach(() => {
    // 創建臨時測試目錄
    if (!fs.existsSync(partialsDir)) {
      fs.mkdirSync(partialsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理測試目錄
    if (fs.existsSync(partialsDir)) {
      fs.rmSync(partialsDir, { recursive: true, force: true });
    }
  });

  it('應該在 include 中正確處理 @slot', () => {
    // 創建帶槽位的組件
    fs.writeFileSync(
      path.join(partialsDir, 'card.html'),
      `<div class="card">
  <div class="card-header">
    @slot('header', '<h3>Default Header</h3>')
  </div>
  <div class="card-body">
    @slot('body')
  </div>
</div>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir
    });

    plugin.configResolved({ root: process.cwd() });

    const html = `<include src="card.html">
  @slot('header')
    <h3>My Card Title</h3>
  @endslot

  @slot('body')
    <p>Card content goes here.</p>
  @endslot
</include>`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<div class="card">');
    expect(result).toContain('<h3>My Card Title</h3>');
    expect(result).toContain('<p>Card content goes here.</p>');
    expect(result).not.toContain('@slot');
    expect(result).not.toContain('@endslot');
  });

  it('應該支援槽位的默認值', () => {
    // 創建帶默認值的組件
    fs.writeFileSync(
      path.join(partialsDir, 'alert.html'),
      `<div class="alert">
  <div class="alert-icon">
    @slot('icon', '⚠️')
  </div>
  <div class="alert-message">
    @slot('message', 'No message provided')
  </div>
</div>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir
    });

    plugin.configResolved({ root: process.cwd() });

    // 只提供部分槽位，其他使用默認值
    const html = `<include src="alert.html">
  @slot('message')
    <p>Custom alert message</p>
  @endslot
</include>`;

    const result = plugin.transformIndexHtml.handler(html);

    // 檢查包含默認icon和自訂message（忽略空白和換行）
    expect(result.replace(/\s+/g, '')).toContain('<div class="alert-icon">⚠️</div>'.replace(/\s+/g, ''));
    expect(result).toContain('<p>Custom alert message</p>');
  });

  it('應該支援多個命名槽位', () => {
    // 創建多槽位組件
    fs.writeFileSync(
      path.join(partialsDir, 'panel.html'),
      `<div class="panel">
  <div class="panel-header">@slot('header')</div>
  <div class="panel-body">@slot('body')</div>
  <div class="panel-footer">@slot('footer')</div>
</div>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir
    });

    plugin.configResolved({ root: process.cwd() });

    const html = `<include src="panel.html">
  @slot('header')
    <h2>Panel Title</h2>
  @endslot

  @slot('body')
    <p>Panel content</p>
  @endslot

  @slot('footer')
    <button>Action</button>
  @endslot
</include>`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<h2>Panel Title</h2>');
    expect(result).toContain('<p>Panel content</p>');
    expect(result).toContain('<button>Action</button>');
  });

  it('應該支援槽位內的變數插值', () => {
    // 創建組件
    fs.writeFileSync(
      path.join(partialsDir, 'user-card.html'),
      `<div class="user-card">
  @slot('content')
</div>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir,
      data: {
        user: {
          name: 'John Doe',
          role: 'Admin'
        }
      }
    });

    plugin.configResolved({ root: process.cwd() });

    const html = `<include src="user-card.html">
  @slot('content')
    <h3>{{ user.name }}</h3>
    <p>Role: {{ user.role }}</p>
  @endslot
</include>`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<h3>John Doe</h3>');
    expect(result).toContain('<p>Role: Admin</p>');
  });

  it('應該支援槽位與屬性同時使用', () => {
    // 創建組件
    fs.writeFileSync(
      path.join(partialsDir, 'product.html'),
      `<div class="product {{ type }}">
  <div class="product-title">{{ title }}</div>
  <div class="product-content">
    @slot('description')
  </div>
  <div class="product-price">{{ price }}</div>
</div>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir
    });

    plugin.configResolved({ root: process.cwd() });

    const html = `<include src="product.html" type="featured" title="Product A" price="$99">
  @slot('description')
    <p>This is a featured product.</p>
  @endslot
</include>`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<div class="product featured">');
    expect(result).toContain('<div class="product-title">Product A</div>');
    expect(result).toContain('<p>This is a featured product.</p>');
    expect(result).toContain('<div class="product-price">$99</div>');
  });
});

describe('佈局與槽位整合測試', () => {
  const partialsDir = path.join(process.cwd(), 'test-partials-integration');

  beforeEach(() => {
    // 創建臨時測試目錄
    if (!fs.existsSync(partialsDir)) {
      fs.mkdirSync(partialsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理測試目錄
    if (fs.existsSync(partialsDir)) {
      fs.rmSync(partialsDir, { recursive: true, force: true });
    }
  });

  it('應該在佈局中使用槽位組件', () => {
    // 創建佈局
    fs.writeFileSync(
      path.join(partialsDir, 'layout.html'),
      `<!DOCTYPE html>
<html>
<body>
  @yield('content')
</body>
</html>`
    );

    // 創建槽位組件
    fs.writeFileSync(
      path.join(partialsDir, 'box.html'),
      `<div class="box">
  @slot('content', 'Empty box')
</div>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir
    });

    plugin.configResolved({ root: process.cwd() });

    const html = `@extends('layout.html')

@section('content')
  <include src="box.html">
    @slot('content')
      <p>Box content</p>
    @endslot
  </include>
@endsection`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<div class="box">');
    expect(result).toContain('<p>Box content</p>');
    expect(result).not.toContain('Empty box');
  });

  it('應該支援複雜的嵌套結構', () => {
    // 創建佈局
    fs.writeFileSync(
      path.join(partialsDir, 'app.html'),
      `<html>
<head><title>@yield('title', 'App')</title></head>
<body>
  <div class="container">
    @yield('content')
  </div>
</body>
</html>`
    );

    // 創建卡片組件（使用屬性接收資料）
    fs.writeFileSync(
      path.join(partialsDir, 'card.html'),
      `<div class="card">
  <h3>{{ title }}</h3>
  <div class="card-body"><p>{{ body }}</p></div>
</div>`
    );

    const plugin = vitePluginHtmlKit({
      partialsDir: partialsDir,
      data: {
        items: [
          { name: 'Item 1', desc: 'Description 1' },
          { name: 'Item 2', desc: 'Description 2' }
        ]
      }
    });

    plugin.configResolved({ root: process.cwd() });

    // 使用屬性傳遞資料（推薦方式，避免循環變數作用域問題）
    const html = `@extends('app.html')

@section('title')
  My Page
@endsection

@section('content')
  @foreach (items as item)
    <include src="card.html" title="{{ item.name }}" body="{{ item.desc }}" />
  @endforeach
@endsection`;

    const result = plugin.transformIndexHtml.handler(html);

    expect(result).toContain('<title>My Page</title>');
    expect(result).toContain('<h3>Item 1</h3>');
    expect(result).toContain('<p>Description 1</p>');
    expect(result).toContain('<h3>Item 2</h3>');
    expect(result).toContain('<p>Description 2</p>');
  });
});
