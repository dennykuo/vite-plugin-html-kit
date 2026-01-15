# vite-plugin-html-kit

[![NPM version](https://img.shields.io/npm/v/vite-plugin-html-kit.svg?style=flat)](https://www.npmjs.com/package/vite-plugin-html-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Downloads](https://img.shields.io/npm/dm/vite-plugin-html-kit.svg)](https://www.npmjs.com/package/vite-plugin-html-kit)

A powerful Vite plugin for HTML templating, including partials, layouts, and data injection. It supports **Blade-like logic** (`@if`, `@foreach`, `@switch`) and standard **Lodash templates** for maximum flexibility.

> 🚀 **91.97% test coverage** | ⚡ **Fast HMR support** | 🔒 **Built-in security protection**

## Features

- 🧩 **Partials**: Easily organize your HTML into reusable components (`<include src="..." />`).
- 💉 **Data Injection**: Pass data to partials via attributes or global configuration.
- 🛠 **Blade-like Syntax**: Clean and readable control structures (`@if`, `@foreach`, `@switch`).
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
      // Configuration Options
      partialsDir: 'partials', // Directory for partial files (default: 'partials')
      data: {                  // Global data available in all templates
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
  <h1>Welcome to <%= site %></h1>
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

### 3. Control Structures (Blade-style)

This plugin supports clean, Blade-inspired syntax for common logic.

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

## Configuration Reference

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `partialsDir` | `string` | `'partials'` | Directory relative to `root` where partial files are stored. |
| `data` | `object` | `{}` | Global data object injected into all templates. |
| `compilerOptions` | `object` | `{}` | Lodash template compiler options (see [Lodash docs](https://lodash.com/docs/4.17.15#template)). |

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

## Plugin Variants

This package includes three variants for different use cases:

### Main Version (Default)
Full-featured plugin with Blade-style syntax support.

```js
import vitePluginHtmlKit from 'vite-plugin-html-kit';
```

**Features:**
- ✅ Partial includes
- ✅ Blade syntax (`@if`, `@foreach`, `@switch`)
- ✅ Lodash template engine
- ✅ Variable interpolation (`{{ }}`)
- ✅ Data passing via attributes
- ✅ HMR support

### XML-Style Variant
Uses XML-like tags instead of Blade syntax.

```js
import vitePluginHtmlKit from 'vite-plugin-html-kit/src/vite-plugin-html-kit-xml-style.js';
```

**Syntax Example:**
```html
<if condition="user.isLoggedIn">
  <p>Welcome back!</p>
</if>

<each loop="item in items">
  <li>{{ item.name }}</li>
</each>
```

### Lite Version
Ultra-lightweight version with only include functionality.

```js
import vitePluginHtmlKit from 'vite-plugin-html-kit/src/vite-plugin-html-kit-lite.js';
```

**Features:**
- ✅ Partial includes only
- ❌ No templating engine (pure HTML merging)
- ❌ No variables, no logic
- ⚡ Smallest bundle size, fastest execution

## Performance

| Metric | Value |
| :--- | :--- |
| **Test Coverage** | 91.97% (49 tests passing) |
| **Bundle Size** | ~15KB (main), ~13KB (lite) |
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
1. Make sure you're using the full version, not the lite version
2. Check that data is passed correctly in the config:

```js
vitePluginHtmlKit({
  data: {
    variable: 'value'  // This should be available in templates
  }
})
```

3. For variables in partials, pass them via attributes:

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
```bash
cd playground
npm install
npm run dev               # Start dev server
npm run build             # Build for production
```

### Code Style

- Use Traditional Chinese (繁體中文) for code comments
- Follow existing code formatting
- Add JSDoc comments for new functions
- Write tests for new features

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes with clear commit messages
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Update documentation if needed
7. Submit a pull request

### Reporting Issues

When reporting issues, please include:
- Vite version
- Plugin version
- Minimal reproduction code
- Expected vs actual behavior
- Error messages or console output

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
