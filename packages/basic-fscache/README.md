# @csp-plugins/basic-fscache

A simple filesystem-based cache implementation for the CSP plugins core package. This package provides persistent caching for external resources while keeping the core package filesystem-agnostic.

## Features

  - **Persistent Caching**: Cache external resources between runs to avoid unnecessary refetching
  - **Filesystem Storage**: Stores cache data in JSON files with safe filenames
  - **Automatic Cleanup**: Provides methods to clear and manage the cache
  - **Statistics**: Get cache usage statistics and entry information
  - **Error Handling**: Gracefully falls back to memory-only caching if filesystem operations fail

## Installation

```bash
pnpm add @csp-plugins/basic-fscache
```

## Usage

### Basic Usage

```typescript
import { SimpleFilesystemCache } from '@csp-plugins/basic-fscache';
import { CSPProcessor } from '@csp-plugins/core';

// Create a filesystem cache instance
const cache = new SimpleFilesystemCache('./.csp-cache');

// Use with CSP processor
const processor = new CSPProcessor({
 externalSources: {
  resourceManager: {
   filesystemCache: cache,
  },
 },
});
```

### CLI Integration

The CLI automatically uses filesystem caching when processing directories:

```bash
# Process with automatic filesystem caching
csp-process dist/

# View cache statistics
csp-process --cache-stats dist/

# Clear the cache
csp-process --clear-cache dist/
```

### Cache Directory Structure

The cache creates a directory structure like:

```sh
.csp-cache/
├── script_https_example_com_script_js_a1b2c3d4.json
├── style_https_example_com_style_css_e5f6g7h8.json
└── image_https_example_com_image_png_i9j0k1l2.json
```

Each cache file contains:

  - `content`: The cached resource content
  - `hash`: SHA-256 hash of the content
  - `timestamp`: When the resource was cached
  - `sourceType`: Type of resource (script, style, image, etc.)

## API Reference

### SimpleFilesystemCache

#### Constructor

```typescript
constructor(cacheDir: string)
```

  - `cacheDir`: Directory path where cache files will be stored

#### Methods

##### `read(key: string)`

Read a cached resource from the filesystem.

```typescript
const entry = await cache.read('https://example.com/script.js');
if (entry) {
 console.log('Cached content:', entry.content);
 console.log('Cached at:', new Date(entry.timestamp));
}
```

##### `write(key: string, data: CacheEntry)`

Write a resource to the filesystem cache.

```typescript
await cache.write('https://example.com/script.js', {
 content: 'console.log("Hello World");',
 hash: 'sha256-hash-here',
 timestamp: Date.now(),
 sourceType: 'script',
});
```

##### `exists(key: string)`

Check if a cached resource exists.

```typescript
const exists = await cache.exists('https://example.com/script.js');
console.log('Resource cached:', exists);
```

##### `clear()`

Clear all cached resources.

```typescript
await cache.clear();
console.log('Cache cleared');
```

##### `getStats()`

Get cache statistics and entry information.

```typescript
const stats = await cache.getStats();
console.log(`Total entries: ${stats.size}`);
stats.entries.forEach((entry) => {
 console.log(`${entry.key} - ${entry.sourceType}`);
});
```

## Error Handling

The cache implementation is designed to be robust and will:

  - Silently fall back to memory-only caching if filesystem operations fail
  - Log warnings for filesystem errors without crashing the application
  - Continue functioning even if the cache directory is inaccessible

## Performance Considerations

  - **Memory Loading**: Cached entries are loaded into memory when accessed
  - **Lazy Initialization**: Filesystem operations are only performed when needed
  - **Safe Filenames**: Resource URLs are converted to safe filenames using hashing
  - **JSON Storage**: Cache data is stored in human-readable JSON format

## Security

  - **Safe Filenames**: Resource URLs are sanitized to prevent path traversal
  - **Content Validation**: Cached data is validated before use
  - **Hash Verification**: Content hashes are stored for integrity checking

## License

MIT
