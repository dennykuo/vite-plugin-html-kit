# vite-plugin-html-kit

A powerful Vite plugin for HTML templating, including partials, layouts, and data injection. It supports **Blade-like logic** (`@if`, `@foreach`, `@switch`) and standard **Lodash templates** for maximum flexibility.

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
