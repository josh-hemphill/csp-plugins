# @csp-plugins/unplugin

Individual build tool plugins for CSP asset tracking and dev server integration with HTML processing capabilities.

## Features

  - **Build Tool Support**: Individual plugins for Vite, Webpack, Rollup, esbuild, and Nuxt
  - **Asset Tracking**: Automatic tracking of all assets during build
  - **Dev Server Integration**: Real-time CSP processing during development
  - **HTML Processing**: Automatic CSP meta tag injection using the core library
  - **CLI Tool**: Post-build processing command for final assets
  - **Manifest Generation**: Comprehensive asset manifests for CSP generation
  - **Smart Manifest Placement**: By default, `.csp-manifest` directory is automatically placed in the build output directory

## Default Behavior

When no `manifestDir` option is specified, the plugins automatically place the `.csp-manifest` directory inside the build output directory:

  - **Vite**: Uses `dist/.csp-manifest` (or custom output directory)
  - **Webpack**: Uses `dist/.csp-manifest` (or custom output directory)
  - **Rollup**: Uses `dist/.csp-manifest` (or custom output directory)
  - **esbuild**: Uses `dist/.csp-manifest` (or custom output directory)

This ensures that CSP manifests are always generated alongside your built assets, making them easy to find and deploy together.

## Installation

```bash
npm install @csp-plugins/unplugin
```

## Usage

### Individual Build Tool Plugins

#### Vite

```typescript
import cspVitePlugin from '@csp-plugins/unplugin/vite';
import { defineConfig } from 'vite';

export default defineConfig({
 plugins: [
  cspVitePlugin({
   trackAssets: true,
   devServer: true,
   manifestDir: '.csp-manifest', // Optional: defaults to output directory
  }),
 ],
});
```

#### Webpack

```typescript
import CspWebpackPlugin from '@csp-plugins/unplugin/webpack';

export default {
 plugins: [
  new CspWebpackPlugin({
   trackAssets: true,
   devServer: true,
   manifestDir: '.csp-manifest', // Optional: defaults to output directory
  }),
 ],
};
```

#### Rollup

```typescript
import cspRollupPlugin from '@csp-plugins/unplugin/rollup';

export default {
 plugins: [
  cspRollupPlugin({
   trackAssets: true,
   manifestDir: '.csp-manifest', // Optional: defaults to output directory
  }),
 ],
};
```

#### esbuild

```typescript
import cspEsbuildPlugin from '@csp-plugins/unplugin/esbuild';

export default {
 plugins: [
  cspEsbuildPlugin({
   trackAssets: true,
   manifestDir: '.csp-manifest', // Optional: defaults to output directory
  }),
 ],
};
```

#### Nuxt

```typescript
import cspNuxtPlugin from '@csp-plugins/unplugin/nuxt';

export default defineNuxtConfig({
 modules: [
  cspNuxtPlugin({
   trackAssets: true,
   devServer: true,
   manifestDir: '.csp-manifest', // Optional: defaults to output directory
  }),
 ],
});
```

### Dev Server Integration

The dev server integration automatically processes HTML files and injects CSP meta tags during development:

```typescript
import { DevServerIntegration } from '@csp-plugins/unplugin';

const devServer = new DevServerIntegration({
 cspDirectives: {
  'default-src': ['self'],
  'script-src': ['self', 'unsafe-inline'],
  'style-src': ['self', 'unsafe-inline'],
 },
});

// Set manifest when available
devServer.setManifest(assetManifest);

// Process HTML content
const processedHTML = await devServer.processHTML(htmlContent, '/index.html');
```

### CLI Tool

Use the CLI tool for post-build processing of final assets:

```bash
# Process HTML files and generate CSP headers
npx csp-process dist/

# Process with custom manifest
npx csp-process dist/ --manifest .csp-manifest/manifest.json

# Generate headers only
npx csp-process dist/ --no-html --headers-output csp.json

# Process to different output directory
npx csp-process dist/ --output-dir dist-csp/
```

#### CLI Options

| Option                    | Type      | Default                       | Description                          |
| ------------------------- | --------- | ----------------------------- | ------------------------------------ |
| `--output-dir <dir>`      | `string`  | `input-dir`                   | Output directory for processed files |
| `--manifest <path>`       | `string`  | `.csp-manifest/manifest.json` | Path to CSP manifest file            |
| `--no-html`               | `boolean` | `false`                       | Skip HTML file processing            |
| `--no-headers`            | `boolean` | `false`                       | Skip CSP headers generation          |
| `--headers-output <file>` | `string`  | `csp-headers.json`            | Output file for CSP headers          |
| `--help, -h`              | `boolean` | `false`                       | Show help message                    |

### Configuration Options

| Option                | Type                           | Default                   | Description                                                              |
| --------------------- | ------------------------------ | ------------------------- | ------------------------------------------------------------------------ |
| `trackAssets`         | `boolean`                      | `true`                    | Whether to enable asset tracking                                         |
| `generateCsp`         | `boolean`                      | `false`                   | Whether to generate CSP directives during build                          |
| `cspProcessorOptions` | `Partial<CSPProcessorOptions>` | `{}`                      | CSP processor options                                                    |
| `manifestDir`         | `string`                       | `outputDir/.csp-manifest` | Output directory for manifest files (defaults to build output directory) |
| `devServer`           | `boolean`                      | `false`                   | Whether to enable dev server integration                                 |
| `includePatterns`     | `Array<string \| RegExp>`      | `[]`                      | Patterns to include in tracking                                          |
| `excludePatterns`     | `Array<string \| RegExp>`      | `[]`                      | Patterns to exclude from tracking                                        |
| `assetTypeDetector`   | `function`                     | `default`                 | Custom asset type detection function                                     |

## Architecture

The unplugin package provides:

1. **Build Tool Plugins**: Individual plugins for each build tool that track assets
2. **Asset Tracker**: Common asset tracking logic shared across plugins
3. **Manifest Writer**: Generates and manages asset manifests
4. **Dev Server Integration**: Real-time HTML processing during development
5. **CLI Tool**: Post-build processing for production assets
6. **Post-Build Detector**: Scans built assets for missed resources

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm run build

# Run tests
pnpm run test

# Run linter
pnpm run lint

# Development mode with watch
pnpm run dev
```

## License

MIT
