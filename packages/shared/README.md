# CSP Plugins Shared

This package contains shared utilities and types used by multiple CSP Plugins packages. It provides common functionality for filesystem operations, asset tracking, manifest management, and post-build detection.

## Purpose

The shared package centralizes common functionality to:

  - Eliminate code duplication between packages
  - Provide consistent interfaces across the ecosystem
  - Enable independent distribution of packages
  - Simplify maintenance and updates

## Exports

### Main Export

```typescript
import { AssetTracker, ManifestWriter, PostBuildDetector } from '@csp-plugins/shared';
```

### Individual Modules

```typescript
// Types and interfaces
import type { AssetManifest, TrackedAsset } from '@csp-plugins/shared/types';

// Asset tracking utilities
import { CommonAssetTracker } from '@csp-plugins/shared/asset-tracker';

// Manifest management
import { ManifestWriter } from '@csp-plugins/shared/manifest-writer';

// Post-build detection
import { PostBuildDetector } from '@csp-plugins/shared/post-build-detector';
```

## Dependencies

This package has minimal dependencies to avoid pulling in unnecessary code:

  - `obuild` - For building the package
  - `typescript` - For type definitions

## Usage

This package is primarily used internally by other CSP Plugins packages:

  - `@csp-plugins/cli` - For CLI functionality
  - `@csp-plugins/unplugin` - For plugin functionality

## Development

```bash
# Build the package
pnpm run build

# Watch mode for development
pnpm run dev
```
