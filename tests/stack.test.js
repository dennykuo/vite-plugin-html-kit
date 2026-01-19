/**
 * @stack/@push/@prepend 語法測試
 * 測試 CSS/JS 資源管理功能
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import vitePluginHtmlKit from '../src/index.js';
import fs from 'fs';
import path from 'path';

describe('@stack/@push/@prepend 語法測試', () => {
  let plugin;
  const testDir = path.join(process.cwd(), 'test-temp-stack');
  const partialsDir = path.join(testDir, 'partials');

  beforeEach(() => {
    // 創建臨時測試目錄
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (!fs.existsSync(partialsDir)) {
      fs.mkdirSync(partialsDir, { recursive: true });
    }

    plugin = vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {}
    });

    plugin.configResolved({
      root: testDir,
      command: 'serve',
      mode: 'development'
    });
  });

  afterEach(() => {
    // 清理臨時測試目錄
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('基本 @push 功能', () => {
    test('應該將 @push 內容注入到 @stack 位置', () => {
      // 創建佈局文件
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>App</title>
  @stack('styles')
</head>
<body>
  @yield('content')
  @stack('scripts')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      const input = `@extends('layout.html')

@section('content')
  <h1>Hello World</h1>
@endsection

@push('scripts')
  <script src="/js/app.js"></script>
@endpush`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<h1>Hello World</h1>');
      expect(output).toContain('<script src="/js/app.js"></script>');
    });

    test('應該支援多次 push 到同一個 stack', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  @stack('styles')
</head>
<body>
  @yield('content')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      const input = `@extends('layout.html')

@section('content')
  <h1>Content</h1>
@endsection

@push('styles')
  <link href="/css/first.css" rel="stylesheet">
@endpush

@push('styles')
  <link href="/css/second.css" rel="stylesheet">
@endpush`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<link href="/css/first.css" rel="stylesheet">');
      expect(output).toContain('<link href="/css/second.css" rel="stylesheet">');

      // 確認順序：first 應該在 second 之前
      const firstIndex = output.indexOf('first.css');
      const secondIndex = output.indexOf('second.css');
      expect(firstIndex).toBeLessThan(secondIndex);
    });
  });

  describe('基本 @prepend 功能', () => {
    test('應該將 @prepend 內容注入到 stack 最前面', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  @stack('styles')
</head>
<body>
  @yield('content')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      const input = `@extends('layout.html')

@section('content')
  <h1>Content</h1>
@endsection

@push('styles')
  <link href="/css/normal.css" rel="stylesheet">
@endpush

@prepend('styles')
  <link href="/css/critical.css" rel="stylesheet">
@endprepend`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      // 確認順序：critical 應該在 normal 之前
      const criticalIndex = output.indexOf('critical.css');
      const normalIndex = output.indexOf('normal.css');
      expect(criticalIndex).toBeLessThan(normalIndex);
    });

    test('應該支援多次 prepend 到同一個 stack', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  @stack('styles')
</head>
<body>
  @yield('content')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      const input = `@extends('layout.html')

@section('content')
  <h1>Content</h1>
@endsection

@prepend('styles')
  <link href="/css/first-prepend.css" rel="stylesheet">
@endprepend

@prepend('styles')
  <link href="/css/second-prepend.css" rel="stylesheet">
@endprepend`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('first-prepend.css');
      expect(output).toContain('second-prepend.css');

      // 確認順序：first-prepend 應該在 second-prepend 之前
      const firstIndex = output.indexOf('first-prepend.css');
      const secondIndex = output.indexOf('second-prepend.css');
      expect(firstIndex).toBeLessThan(secondIndex);
    });
  });

  describe('@push 和 @prepend 混合使用', () => {
    test('應該正確處理 prepend 和 push 的順序', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  @stack('scripts')
</head>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      const input = `@extends('layout.html')

@push('scripts')
  <script>console.log('push 1');</script>
@endpush

@prepend('scripts')
  <script>console.log('prepend 1');</script>
@endprepend

@push('scripts')
  <script>console.log('push 2');</script>
@endpush

@prepend('scripts')
  <script>console.log('prepend 2');</script>
@endprepend`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      // 預期順序：prepend 1 -> prepend 2 -> push 1 -> push 2
      const positions = {
        prepend1: output.indexOf("console.log('prepend 1')"),
        prepend2: output.indexOf("console.log('prepend 2')"),
        push1: output.indexOf("console.log('push 1')"),
        push2: output.indexOf("console.log('push 2')")
      };

      expect(positions.prepend1).toBeLessThan(positions.prepend2);
      expect(positions.prepend2).toBeLessThan(positions.push1);
      expect(positions.push1).toBeLessThan(positions.push2);
    });
  });

  describe('多層佈局繼承', () => {
    test('應該在多層佈局中正確累積 stacks', () => {
      // 基礎佈局
      const baseLayout = `<!DOCTYPE html>
<html>
<head>
  @stack('styles')
</head>
<body>
  @yield('body')
</body>
</html>`;

      // 中間佈局
      const appLayout = `@extends('base.html')

@section('body')
  <div id="app">
    @yield('content')
  </div>
@endsection

@push('styles')
  <link href="/css/app.css" rel="stylesheet">
@endpush`;

      fs.writeFileSync(path.join(partialsDir, 'base.html'), baseLayout);
      fs.writeFileSync(path.join(partialsDir, 'app.html'), appLayout);

      const input = `@extends('app.html')

@section('content')
  <h1>Dashboard</h1>
@endsection

@push('styles')
  <link href="/css/dashboard.css" rel="stylesheet">
@endpush`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('app.css');
      expect(output).toContain('dashboard.css');

      // 確認順序：app.css 應該在 dashboard.css 之前
      const appIndex = output.indexOf('app.css');
      const dashboardIndex = output.indexOf('dashboard.css');
      expect(appIndex).toBeLessThan(dashboardIndex);
    });
  });

  describe('多個 @stack 區域', () => {
    test('應該正確處理多個不同的 stack', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <title>App</title>
  @stack('styles')
</head>
<body>
  @yield('content')
  @stack('scripts')
  @stack('footer-scripts')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      const input = `@extends('layout.html')

@section('content')
  <h1>Content</h1>
@endsection

@push('styles')
  <link href="/css/app.css" rel="stylesheet">
@endpush

@push('scripts')
  <script src="/js/app.js"></script>
@endpush

@push('footer-scripts')
  <script src="/js/analytics.js"></script>
@endpush`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('app.css');
      expect(output).toContain('app.js');
      expect(output).toContain('analytics.js');
    });
  });

  describe('空 stack 處理', () => {
    test('應該處理沒有 push/prepend 的空 stack', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  @stack('styles')
</head>
<body>
  @yield('content')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      const input = `@extends('layout.html')

@section('content')
  <h1>Content</h1>
@endsection`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('<h1>Content</h1>');
      // 空 stack 應該不會留下 @stack 標記
      expect(output).not.toContain('@stack');
    });
  });

  describe('實際使用場景', () => {
    test('應該支援 Dashboard 頁面的完整資源管理', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>@yield('title', 'My App')</title>

  <!-- 預設樣式 -->
  <link href="/css/app.css" rel="stylesheet">

  <!-- 自訂樣式堆疊 -->
  @stack('styles')
</head>
<body>
  @yield('content')

  <!-- 預設腳本 -->
  <script src="/js/app.js"></script>

  <!-- 自訂腳本堆疊 -->
  @stack('scripts')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      const input = `@extends('layout.html')

@section('title', 'Dashboard')

@push('styles')
  <link href="/css/dashboard.css" rel="stylesheet">
  <link href="/css/charts.css" rel="stylesheet">
@endpush

@push('scripts')
  <script src="/js/charts.js"></script>
  <script>
    // Dashboard specific code
    initDashboard();
  </script>
@endpush

@section('content')
  <h1>Dashboard</h1>
  <div id="charts"></div>
@endsection`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      // 檢查標題
      expect(output).toContain('<title>Dashboard</title>');

      // 檢查預設樣式
      expect(output).toContain('<link href="/css/app.css" rel="stylesheet">');

      // 檢查自訂樣式
      expect(output).toContain('dashboard.css');
      expect(output).toContain('charts.css');

      // 檢查預設腳本
      expect(output).toContain('<script src="/js/app.js"></script>');

      // 檢查自訂腳本
      expect(output).toContain('charts.js');
      expect(output).toContain('initDashboard()');

      // 檢查內容
      expect(output).toContain('<h1>Dashboard</h1>');
      expect(output).toContain('<div id="charts"></div>');
    });

    test('應該支援使用 prepend 載入 critical CSS', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  @stack('styles')
  <link href="/css/app.css" rel="stylesheet">
</head>
<body>
  @yield('content')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      const input = `@extends('layout.html')

@section('content')
  <h1>Content</h1>
@endsection

@prepend('styles')
  <!-- Critical CSS should load first -->
  <link href="/css/critical.css" rel="stylesheet">
@endprepend

@push('styles')
  <link href="/css/page.css" rel="stylesheet">
@endpush`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      // 確認順序：critical.css -> page.css -> app.css
      const criticalIndex = output.indexOf('critical.css');
      const pageIndex = output.indexOf('page.css');
      const appIndex = output.indexOf('app.css');

      expect(criticalIndex).toBeLessThan(pageIndex);
      expect(pageIndex).toBeLessThan(appIndex);
    });
  });

  describe('與其他 Blade 功能整合', () => {
    test('應該與 @if 條件語法一起工作', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  @stack('styles')
</head>
<body>
  @yield('content')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          isDevelopment: true
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `@extends('layout.html')

@section('content')
  <h1>Content</h1>
@endsection

@push('styles')
  <link href="/css/app.css" rel="stylesheet">
  @if(isDevelopment)
    <link href="/css/debug.css" rel="stylesheet">
  @endif
@endpush`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('app.css');
      expect(output).toContain('debug.css');
    });

    test('應該與 @foreach 迴圈一起工作', () => {
      const layoutContent = `<!DOCTYPE html>
<html>
<head>
  @stack('scripts')
</head>
<body>
  @yield('content')
</body>
</html>`;

      fs.writeFileSync(path.join(partialsDir, 'layout.html'), layoutContent);

      plugin = vitePluginHtmlKit({
        partialsDir: 'partials',
        data: {
          libraries: ['jquery', 'lodash', 'moment']
        }
      });

      plugin.configResolved({
        root: testDir,
        command: 'serve',
        mode: 'development'
      });

      const input = `@extends('layout.html')

@section('content')
  <h1>Content</h1>
@endsection

@push('scripts')
  @foreach(lib of libraries)
    <script src="/js/{{ lib }}.js"></script>
  @endforeach
@endpush`;

      const output = plugin.transformIndexHtml.handler(input, {
        filename: 'test.html',
        server: null
      });

      expect(output).toContain('jquery.js');
      expect(output).toContain('lodash.js');
      expect(output).toContain('moment.js');
    });
  });
});
