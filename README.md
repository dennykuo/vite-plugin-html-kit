# vite-plugin-html-kit

[![NPM version](https://img.shields.io/npm/v/vite-plugin-html-kit.svg?style=flat)](https://www.npmjs.com/package/vite-plugin-html-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Downloads](https://img.shields.io/npm/dm/vite-plugin-html-kit.svg)](https://www.npmjs.com/package/vite-plugin-html-kit)

A powerful Vite plugin for HTML templating, including partials, layouts, and data injection. It supports **Blade-like logic** (`@if`, `@foreach`, `@switch`) and standard **Lodash templates** for maximum flexibility.

> 🚀 **79 tests passing** | ⚡ **Fast HMR support** | 🔒 **Built-in security protection**

## Features

- 🧩 **Partials**: Easily organize your HTML into reusable components (`<include src="..." />`).
- 💉 **Data Injection**: Pass data to partials via attributes or global configuration.
- 🛠 **Blade-like Syntax**: Clean and readable control structures (`@if`, `@foreach`, `@switch`).
- 📐 **Layout Inheritance**: Laravel Blade style layouts with `@extends`, `@section`, and `@yield`.
- 🎰 **Component Slots**: Pass content blocks to components using `@slot`.
- ⚡ **Vite Integration**: Seamless integration with Vite's dev server and build process.
- 🎨 **Zero Config Required**: Works out of the box, but highly customizable.

## Installation

```bash
npm install vite-plugin-html-kit --save-dev
```

## Usage

### 1. Vite Configuration

Add the plugin to your `vite.config.js`:

```js
import { defineConfig } from 'vite';
import vitePluginHtmlKit from 'vite-plugin-html-kit';

export default defineConfig({
  plugins: [
    vitePluginHtmlKit({
      // Configuration Options (all optional)
      partialsDir: 'partials', // (optional) Directory for partial files (default: 'partials')
      data: {                  // (optional) Global data available in all templates
        site: 'My Awesome Site',
        author: 'Denny'
      }
    })
  ]
});
```

### 2. Basic HTML Templating

#### Includes & Partials
Use the `<include>` tag to inject other HTML files. You can pass data via attributes.

```html
<!-- index.html -->
<include src="header.html" title="Home Page" active="home" />

<main>
  <h1>Welcome to {{ site }}</h1>
</main>

<include src="footer.html" />
```

#### Output Variables
Use `<%= variableName %>` to output data.
Use `{{ variableName }}` to output data.

```html
<p>Author: {{ author }}</p>
<p>Page Title: {{ title }}</p> <!-- 'title' passed from <include> attribute -->
```

### 3. Control Structures (Laravel Blade style)

This plugin supports clean, Laravel Blade inspired syntax for common logic.

#### Conditionals (`@if`)

```html
@if (user.isLoggedIn)
  <div class="user-panel">Hello, {{ user.name }}</div>
@elseif (user.isGuest)
  <button>Login as Guest</button>
@else
  <a href="/login">Login</a>
@endif
```

#### Loops (`@foreach`)

Supports both "Blade style" and "JS style" syntax.

```html
<!-- Style 1: "as" (Blade-like) -->
<ul>
  @foreach (items as item)
    <li>{{ item.name }}</li>
  @endforeach
</ul>

<!-- Style 2: "of" (JavaScript standard) -->
<ul>
  @foreach (item of items)
    <li>{{ item.price }}</li>
  @endforeach
</ul>
```

#### Switch Statements (`@switch`)

```html
@switch (status)
  @case ('success')
    <span class="text-green-500">Completed</span>
  @case ('error')
    <span class="text-red-500">Failed</span>
  @default
    <span class="text-gray-500">Pending...</span>
@endswitch
```

### 4. Layout Inheritance & Slots

Organize your HTML with powerful layout inheritance (Laravel Blade style).

#### Layout Inheritance (`@extends`, `@section`, `@yield`)

Create reusable layouts and extend them in child pages.

**Layout File** (`partials/layouts/app.html`):
```html
<!DOCTYPE html>
<html>
<head>
  <title>@yield('title', 'My Site')</title>
  @yield('styles')
</head>
<body>
  <header>@yield('header')</header>
  <main>@yield('content')</main>
  <footer>@yield('footer', '<p>&copy; 2026</p>')</footer>
  @yield('scripts')
</body>
</html>
```

**Child Page** (`index.html`):
```html
@extends('layouts/app.html')

@section('title')
  Home Page
@endsection

@section('content')
  <h1>Welcome to my site</h1>
  <p>This is the home page content.</p>
@endsection

@section('scripts')
  <script src="/home.js"></script>
@endsection
```

**Key Features:**
- `@extends('path')` - Inherit from a layout file
- `@section('name')...@endsection` - Define content blocks
- `@yield('name')` - Output section content (use in layouts)
- `@yield('name', 'default')` - Yield with default value
- Supports **nested layouts** (layouts can extend other layouts)

#### Component Slots (`@slot`)

Pass content blocks to reusable components.

**Component File** (`partials/components/card.html`):
```html
<div class="card">
  <div class="card-header">
    @slot('header', '<h3>Default Title</h3>')
  </div>
  <div class="card-body">
    @slot('body')
  </div>
  <div class="card-footer">
    @slot('footer')
  </div>
</div>
```

**Using Components with Slots**:

**Important:** Slots only work with `<include>` tag, not with `@include` directive.

```html
<!-- ✅ Correct: Using <include> tag with slots -->
<include src="components/card.html">
  @slot('header')
    <h3>Product Name</h3>
  @endslot

  @slot('body')
    <p>Product description here.</p>
    <p class="price">$49.99</p>
  @endslot

  @slot('footer')
    <button>Add to Cart</button>
  @endslot
</include>
```

**@include vs `<include>` for different use cases:**

```html
<!-- ✅ Use @include for simple includes without slots -->
@include('header.html', { title: 'Home', active: 'home' })

<!-- ✅ Use <include> tag when you need slots -->
<include src="card.html">
  @slot('title')Product@endslot
</include>
```

**Key Features:**
- `@slot('name')...@endslot` - Define content to pass to component
- `@slot('name', 'default')` - Define slot with default value in component
- **Only `<include>` tag supports slots** (not `@include` directive)
- `@include` directive converts to self-closing tag
- Slots are optional - use defaults if not provided

**Note**: When using components inside loops with dynamic data, pass data via attributes instead of slots to avoid variable scope issues:

```html
<!-- ✅ Recommended: Pass data via attributes -->
@foreach (items as item)
  <include src="card.html" title="{{ item.name }}" body="{{ item.desc }}" />
@endforeach
```

## Configuration Reference

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `partialsDir` | `string` | `'partials'` | Directory relative to `root` where partial files are stored. |
| `data` | `object` | `{}` | Global data object injected into all templates. |
| `compilerOptions` | `object` | `{}` | Lodash template compiler options (see [Lodash docs](https://lodash.com/docs/4.17.15#template)). |

### Custom Variable Syntax

By default, this plugin uses `{{ }}` for variable interpolation. If you prefer Lodash's native `<%= %>` syntax or want to use a custom syntax, you can configure it via `compilerOptions`:

**Using Lodash native syntax (`<%= %>`)**
```js
vitePluginHtmlKit({
  compilerOptions: {
    interpolate: /<%=([\s\S]+?)%>/g  // Enable <%= %> syntax
  }
})
```

**Using custom bracket syntax (`[[ ]]`)**
```js
vitePluginHtmlKit({
  compilerOptions: {
    interpolate: /\[\[([\s\S]+?)\]\]/g  // Enable [[ ]] syntax
  }
})
```

**Syntax comparison:**
```html
<!-- Default: {{ }} syntax -->
<h1>{{ site }}</h1>

<!-- Lodash native: <%= %> syntax -->
<h1><%= site %></h1>

<!-- Custom: [[ ]] syntax -->
<h1>[[ site ]]</h1>
```

**Note:** The `compilerOptions` object is passed directly to Lodash's `_.template()` function, so you can use any options from the [Lodash template documentation](https://lodash.com/docs/4.17.15#template).

## Real-World Examples

### Example 1: Blog Post Template

```html
<!-- blog-post.html -->
<!DOCTYPE html>
<html>
<head>
  <title>{{ post.title }} - {{ siteName }}</title>
</head>
<body>
  <include src="partials/nav.html" />

  <article>
    <h1>{{ post.title }}</h1>

    <include src="partials/post-meta.html"
             author="{{ post.author }}"
             date="{{ post.date }}"
             tags="{{ post.tags }}" />

    <div class="content">
      {{ post.content }}
    </div>

    @if (post.comments && post.comments.length > 0)
      <section class="comments">
        <h2>Comments ({{ post.comments.length }})</h2>
        @foreach (post.comments as comment)
          <div class="comment">
            <strong>{{ comment.author }}</strong>
            <p>{{ comment.text }}</p>
          </div>
        @endforeach
      </section>
    @endif
  </article>

  <include src="partials/footer.html" />
</body>
</html>
```

```html
<!-- partials/post-meta.html -->
<div class="meta">
  <span class="author">{{ author }}</span>
  <span class="date">{{ date }}</span>

  @if (tags && tags.length > 0)
    <div class="tags">
      @foreach (tags as tag)
        <span class="tag">{{ tag }}</span>
      @endforeach
    </div>
  @endif
</div>
```

### Example 2: E-commerce Product Grid

```html
<!-- products.html -->
<div class="product-grid">
  @foreach (products as product)
    <include src="partials/product-card.html"
             name="{{ product.name }}"
             price="{{ product.price }}"
             image="{{ product.image }}"
             onSale="{{ product.onSale }}"
             stock="{{ product.stock }}" />
  @endforeach
</div>
```

```html
<!-- partials/product-card.html -->
<div class="product-card">
  <img src="{{ image }}" alt="{{ name }}">
  <h3>{{ name }}</h3>
  <p class="price">${{ price }}</p>

  @if (onSale)
    <span class="badge sale">SALE</span>
  @endif

  @if (stock > 0)
    <button class="add-to-cart">Add to Cart</button>
  @else
    <button disabled class="out-of-stock">Out of Stock</button>
  @endif
</div>
```

### Example 3: Multi-language Support

```js
// vite.config.js
import { defineConfig } from 'vite';
import vitePluginHtmlKit from 'vite-plugin-html-kit';

// Load translations
import enTranslations from './locales/en.json';
import zhTranslations from './locales/zh.json';

const locale = process.env.LOCALE || 'en';
const translations = locale === 'zh' ? zhTranslations : enTranslations;

export default defineConfig({
  plugins: [
    vitePluginHtmlKit({
      partialsDir: 'partials',
      data: {
        t: translations,
        locale: locale
      }
    })
  ]
});
```

```html
<!-- index.html -->
<h1>{{ t.welcome }}</h1>
<p>{{ t.description }}</p>

<include src="partials/language-switcher.html" />
```

## Performance

| Metric | Value |
| :--- | :--- |
| **Test Coverage** | 79 tests passing (8 test suites) |
| **Bundle Size** | ~15KB |
| **Build Speed** | Negligible overhead on Vite builds |
| **HMR Performance** | Instant hot reload on partial changes |
| **Memory Usage** | Minimal (caches compiled templates) |

## Comparison with Other Plugins

| Feature | vite-plugin-html-kit | vite-plugin-html | posthtml-include |
| :--- | :---: | :---: | :---: |
| HTML Partials | ✅ | ✅ | ✅ |
| Data Injection | ✅ | ⚠️ Limited | ❌ |
| Blade-style Syntax | ✅ | ❌ | ❌ |
| Lodash Templates | ✅ | ❌ | ❌ |
| Recursive Includes | ✅ | ✅ | ✅ |
| HMR Support | ✅ | ✅ | ⚠️ Limited |
| TypeScript Types | ✅ | ⚠️ Partial | ❌ |
| Security Protection | ✅ Built-in | ❌ | ❌ |
| Active Maintenance | ✅ 2026 | ✅ | ⚠️ Limited |

## Troubleshooting

### Issue: Include tags not being replaced

**Symptoms:** `<include src="...">` appears in the browser output unchanged.

**Solutions:**
1. Check that your `partialsDir` path is correct relative to project root
2. Verify the partial file exists at the specified path
3. Ensure the plugin is loaded before other HTML transformers in `vite.config.js`
4. Check browser console for error messages

```js
// Correct configuration
vitePluginHtmlKit({
  partialsDir: 'src/partials'  // Relative to project root
})
```

### Issue: Variables showing as `{{ variable }}` in output

**Symptoms:** Variables are not interpolated, appearing literally as `{{ variable }}`.

**Solutions:**
1. Check that data is passed correctly in the config:

```js
vitePluginHtmlKit({
  data: {
    variable: 'value'  // This should be available in templates
  }
})
```

2. For variables in partials, pass them via attributes:

```html
<include src="header.html" title="{{ pageTitle }}" />
```

### Issue: Path traversal security warning

**Symptoms:** Console shows `路徑遍歷攻擊偵測` error message.

**Solutions:**
This is a security feature preventing directory traversal attacks. Make sure:
1. All partial paths are relative (no `../` to go outside partialsDir)
2. No absolute paths (like `/etc/passwd`)
3. Partial files are located within the configured `partialsDir`

```html
<!-- ✅ Good -->
<include src="header.html" />
<include src="components/nav.html" />

<!-- ❌ Bad - triggers security warning -->
<include src="../../../etc/passwd" />
<include src="/etc/passwd" />
```

### Issue: HMR not working for partials

**Symptoms:** Changes to partial files don't trigger browser reload.

**Solutions:**
1. Ensure you're using Vite's dev server (not build mode)
2. Check that partial files are inside the configured `partialsDir`
3. Try restarting the dev server
4. Clear Vite's cache: `rm -rf node_modules/.vite`

### Issue: Blade syntax not working in partials

**Symptoms:** `@if`, `@foreach` appearing literally in partial output.

**Solution:**
This is expected behavior! Blade syntax is only transformed in the main HTML files, not in partials. Use Lodash template syntax in partials instead:

```html
<!-- In partials, use: -->
<% if (condition) { %>
  ...
<% } %>

<!-- Or use variable interpolation: -->
{{ variable }}
```

### Issue: TypeScript errors with plugin config

**Symptoms:** TypeScript shows type errors when configuring the plugin.

**Solution:**
Import the type definitions:

```typescript
import vitePluginHtmlKit, { VitePluginHtmlKitOptions } from 'vite-plugin-html-kit';

const config: VitePluginHtmlKitOptions = {
  partialsDir: 'partials',
  data: {
    siteName: 'My Site'
  }
};

export default defineConfig({
  plugins: [vitePluginHtmlKit(config)]
});
```

## Security

This plugin includes built-in security features:

- 🔒 **Path Traversal Protection**: Prevents reading files outside `partialsDir`
- 🛡️ **Absolute Path Blocking**: Rejects absolute file paths
- ✅ **Safe File Resolution**: Uses Node's `path.resolve()` with validation
- 📝 **Error Logging**: Security violations are logged to console

Example of blocked attempts:
```html
<!-- These will be rejected with error messages -->
<include src="../../../etc/passwd" />
<include src="/etc/passwd" />
<include src="..\..\..\Windows\System32\config\sam" />
```

## Contributing

Contributions are welcome! Please follow these guidelines:

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/dennykuo/vite-plugin-html-kit.git
cd vite-plugin-html-kit
```

2. Install dependencies:
```bash
npm install
```

3. Run tests:
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:ui           # UI mode
npm run test:coverage     # Coverage report
```

4. Test in playground:

**Method 1: Using npm scripts from project root**
```bash
npm run play              # Start dev server (from root)
npm run build-play        # Build for production (from root)
```

**Method 2: Change directory to playground**
```bash
cd playground
npm install
npm run dev               # Start dev server
npm run build             # Build for production
```

## License

[MIT](LICENSE) © 2026 Denny

## Acknowledgments

- Inspired by Laravel Blade templating syntax
- Built on top of [Lodash template engine](https://lodash.com/docs/4.17.15#template)
- Designed for [Vite](https://vitejs.dev/) build tool

## Links

- [GitHub Repository](https://github.com/dennykuo/vite-plugin-html-kit)
- [NPM Package](https://www.npmjs.com/package/vite-plugin-html-kit)
- [Issue Tracker](https://github.com/dennykuo/vite-plugin-html-kit/issues)
- [Changelog](https://github.com/dennykuo/vite-plugin-html-kit/releases)
