# CSP Plugins CLI

A powerful command-line interface for post-build Content Security Policy (CSP) processing and asset management.

## Features

  - **Post-build CSP Processing**: Automatically process HTML files and inject CSP meta tags
  - **Asset Manifest Management**: Load, combine, and manage CSP manifests from multiple build tools
  - **CSP Headers Generation**: Generate CSP headers for server configuration
  - **Filesystem Caching**: Persistent caching of external resources between runs
  - **Local Script Integrity**: Enhanced security with integrity attributes for local scripts
  - **Auto-manifest Generation**: Automatically generate manifests when none are found
  - **Multi-tool Support**: Consolidate manifests from Vite, Webpack, Rollup, and other build tools

## Installation

The CLI is available as part of the CSP Plugins workspace:

```bash
# From the workspace root
pnpm install
pnpm build --filter=@csp-plugins/cli
```

## Usage

### Basic Usage

```bash
# Process a build directory
csp-cli dist/

# Process with custom output directory
csp-cli --output-dir dist-csp/ dist/

# Process with custom manifests directory
csp-cli --manifests-dir .csp-manifest dist/
```

### Command Line Options

| Option                     | Description                                               | Default            |
| -------------------------- | --------------------------------------------------------- | ------------------ |
| `--output-dir <dir>`       | Output directory for processed files                      | Input directory    |
| `--manifests-dir <dir>`    | Directory containing CSP manifest files                   | `.csp-manifest`    |
| `--cache-dir <dir>`        | Cache directory for filesystem cache                      | `.csp-cache`       |
| `--no-html`                | Skip HTML file processing                                 | `false`            |
| `--no-headers`             | Skip CSP headers generation                               | `false`            |
| `--headers-output <file>`  | Output file for CSP headers                               | `csp-headers.json` |
| `--local-script-integrity` | Enable integrity attributes for local scripts             | `false`            |
| `--auto-manifest`          | Automatically generate manifest if none found             | `false`            |
| `--csp-policy-file <file>` | JSON file containing CSP policies for auto-manifest       | None               |
| `--emit <adapters>`        | Write host files from the header map                      | None               |
| `--log-level <level>`      | Set log level: trace, debug, info, warn, error, or silent | `info`             |
| `--cache-stats`            | Show cache statistics                                     | `false`            |
| `--clear-cache`            | Clear the resource cache                                  | `false`            |
| `--cleanup-manifests`      | Manually clean up old manifest files                      | `false`            |
| `--help, -h`               | Show help message                                         | `false`            |

### Examples

#### Basic Processing

```bash
# Process a Vite build output
csp-cli dist/

# Process with custom output directory
csp-cli --output-dir dist-csp/ dist/
```

#### Manifest Management

```bash
# Use custom manifests directory
csp-cli --manifests-dir .csp-manifest dist/

# Auto-generate manifest if none found
csp-cli --auto-manifest dist/

# Auto-generate with custom CSP policies
csp-cli --auto-manifest --csp-policy-file policies.json dist/

# Write Netlify and Vercel header files
csp-cli --emit netlify,vercel dist/
```

#### Advanced Features

```bash
# Enable local script integrity (advanced security)
csp-cli --local-script-integrity dist/

# Skip HTML processing
csp-cli --no-html dist/

# Skip headers generation
csp-cli --no-headers dist/

# Custom headers output location
csp-cli --headers-output ./csp/csp-headers.json dist/
```

#### Cache Management

```bash
# View cache statistics
csp-cli --cache-stats dist/

# Clear cache
csp-cli --clear-cache dist/

# Clean up old manifests
csp-cli --cleanup-manifests dist/
```

#### Logging

```bash
# Verbose logging
csp-cli --log-level debug dist/

# Silent mode
csp-cli --log-level silent dist/
```

## Configuration

### CSP Policy File

When using `--auto-manifest`, you can provide a JSON file with CSP policies:

```json
{
 "CSP": {
  "script-src": ["self"],
  "style-src": ["self"],
  "img-src": ["self", "data:", "https:"],
  "font-src": ["self", "data:", "https:"],
  "connect-src": ["self"]
 }
}
```

`'unsafe-inline'` / `'unsafe-eval'` are not part of the auto-manifest default. Add them only when a policy file opts in (for example a development policy).

### Directory Structure

The CLI expects the following directory structure:

```shell
project/
├── dist/                    # Build output (input directory)
├── .csp-manifest/          # CSP manifests (default)
│   ├── vite-manifest.json
│   └── webpack-manifest.json
├── .csp-cache/             # Filesystem cache (default)
└── dist-csp/               # Processed output (optional)
```

## Programmatic Usage

### CliProcessor

```typescript
import { CliProcessor } from '@csp-plugins/cli';

const processor = new CliProcessor({
 inputDir: 'dist/',
 outputDir: 'dist-csp/',
 processHTML: true,
 generateHeaders: true,
 autoManifest: true
});

await processor.loadManifest();
await processor.processDirectory();
processor.cleanup();
```

### CliUtils

```typescript
import { CliUtils } from '@csp-plugins/cli';

const utils = new CliUtils('.csp-manifest');

// Process all manifests and detect untracked assets
const result = await utils.processAllManifests(['dist/']);

// Generate CSP directives from assets
const directives = utils.generateCspDirectives(result.detectedAssets);

// Generate comprehensive report
const reportPath = await utils.generateReport('dist/');
```

## Output Files

### CSP Headers (`csp-headers.json`)

```json
{
 "Content-Security-Policy": "script-src 'self' 'sha256-abc123...'; style-src 'self' 'sha256-def456...'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self'",
 "Referrer-Policy": "strict-origin-when-cross-origin"
}
```

### Consolidated Manifest (`manifest.json`)

```json
{
 "buildTool": "vite+webpack",
 "buildTime": 1703123456789,
 "outputDir": "dist/",
 "assets": [
  {
   "id": "index.js",
   "path": "index.js",
   "type": "script",
   "inline": false,
   "hash": "sha256-abc123...",
   "mimeType": "application/javascript"
  }
 ],
 "cspProcessorOptions": {
  "baseDirectives": {
   "CSP": {
    "script-src": ["self"],
    "style-src": ["self"]
   }
  }
 }
}
```

## Security Features

### Local Script Integrity

When enabled with `--local-script-integrity`, the CLI adds integrity attributes to local script files:

```html
<script src="app.js" integrity="sha256-abc123..." crossorigin="anonymous"></script>
```

### External Resource Hashing

The CLI automatically hashes external resources and adds them to CSP directives:

```html
<meta
 http-equiv="Content-Security-Policy"
 content="script-src 'self' 'sha256-abc123...'; style-src 'self' 'sha256-def456...'"
/>
```

## Integration with Build Tools

The CLI integrates seamlessly with various build tools through their manifest files:

  - **Vite**: Uses `.csp-manifest/vite-manifest.json`
  - **Webpack**: Uses `.csp-manifest/webpack-manifest.json`
  - **Rollup**: Uses `.csp-manifest/rollup-manifest.json`
  - **esbuild**: Uses `.csp-manifest/esbuild-manifest.json`

## Performance

  - **Filesystem Caching**: Persistent caching between runs reduces network requests
  - **Incremental Processing**: Only processes changed files
  - **Parallel Processing**: Concurrent processing of multiple files
  - **Memory Efficient**: Streams large files to avoid memory issues

## Troubleshooting

### Common Issues

1. **No manifests found**: Use `--auto-manifest` to generate one automatically
2. **HTML not processed**: Ensure `--no-html` is not set and manifests are loaded
3. **Cache issues**: Use `--clear-cache` to reset the filesystem cache
4. **Permission errors**: Check write permissions for output and cache directories

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
csp-cli --log-level debug dist/
```

## Contributing

See the main [CONTRIBUTING.md](../../.github/CONTRIBUTING.md) file for contribution guidelines.

## License

This package is part of the CSP Plugins project. See the main [LICENSE](../../LICENSE) file for details.
