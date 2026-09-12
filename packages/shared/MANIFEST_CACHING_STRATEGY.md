# Manifest Caching and Cleanup Strategy

## Overview

The CSP plugins use a sophisticated manifest caching system to track assets across multiple build tools and build runs. This document explains how the caching works and how to manage it effectively.

## Types of Caching

### 1. Filesystem Cache (`.csp-cache`)

  - **Purpose**: Caches external resources (scripts, styles, images) to avoid refetching between runs
  - **Location**: `.csp-cache` directory (configurable via `--cache-dir`)
  - **Persistence**: Designed to persist across runs for performance
  - **Cleanup**: Manual cleanup via `--clear-cache` command

### 2. Manifest Cache (`.csp-manifest`)

  - **Purpose**: Stores build manifests from various build tools (Vite, Webpack, Rollup, etc.)
  - **Location**: `.csp-manifest` directory (configurable via `--manifests-dir`)
  - **Persistence**: Should be cleaned up regularly to prevent old manifests from being consolidated
  - **Cleanup**: Automatic cleanup before consolidation + manual cleanup via `--cleanup-manifests`

## Manifest Lifecycle

### Build Time

1. Each build tool (Vite, Webpack, etc.) generates a manifest during build
2. Manifest is written to `.csp-manifest` directory with timestamp and build tool identifier
3. Old manifests from the same build tool are cleaned up automatically

### Consolidation Time

1. CLI reads all manifests from `.csp-manifest` directory
2. **NEW**: Automatic cleanup runs before consolidation to remove old manifests
3. Remaining manifests are consolidated into a single manifest
4. Consolidated manifest is used for CSP processing

## Cleanup Strategies

### Automatic Cleanup (Before Consolidation)

  - **Trigger**: Runs automatically before manifest consolidation
  - **Strategy**: Keeps only the most recent manifest per build tool
  - **Benefit**: Prevents old manifests from being included in consolidation

### Manual Cleanup

  - **Command**: `csp-process --cleanup-manifests [directory]`
  - **Strategy**: Removes manifests older than 24 hours (configurable)
  - **Use Case**: Periodic maintenance or when experiencing issues

### Build Tool Cleanup

  - **Trigger**: After each build completes
  - **Strategy**: Removes old manifests from the same build tool
  - **Benefit**: Prevents accumulation of outdated manifests

## Best Practices

### 1. Regular Cleanup

```bash
# Clean up old manifests periodically
csp-process --cleanup-manifests

# Or clean up everything
csp-process --clear-cache
csp-process --cleanup-manifests
```

### 2. Monitor Manifest Directory

```bash
# Check what manifests exist
ls -la .csp-manifest/

# Check manifest ages
find .csp-manifest/ -name "*.json" -exec ls -la {} \;
```

### 3. Understand Manifest Naming

  - Individual manifests: `{buildTool}-{contentHash}.json`
  - Consolidated manifests: `consolidated-{contentHash}.json`
  - Content hash changes when assets change, preventing stale manifests

## Troubleshooting

### Problem: Old manifests being consolidated

**Symptoms**: Consolidated manifest contains outdated asset information
**Solution**: Run `csp-process --cleanup-manifests` before processing

### Problem: Filesystem cache appears empty

**Symptoms**: `.csp-cache` directory is empty or missing
**Solution**: This is normal - cache is populated as external resources are processed

### Problem: Manifest consolidation includes wrong assets

**Symptoms**: CSP includes assets from old builds
**Solution**: Check manifest timestamps and run cleanup

## Configuration Options

### CLI Options

```bash
--cache-dir .csp-cache          # Filesystem cache directory
--manifests-dir .csp-manifest   # Manifest directory
--cleanup-manifests             # Clean up old manifests
--clear-cache                   # Clear filesystem cache
```

### Plugin Options

```typescript
{
  manifestDir: '.csp-manifest',  // Manifest output directory
  // Cleanup happens automatically after build
}
```

## Implementation Details

### Cleanup Algorithm

1. **Group by Build Tool**: Manifests are grouped by their `buildTool` field
2. **Sort by Build Time**: Within each group, manifests are sorted by `buildTime`
3. **Keep Newest**: Only the most recent manifest per build tool is retained
4. **Remove Old**: Older manifests are deleted to prevent accumulation

### Consolidation Process

1. **Pre-cleanup**: Remove old manifests before reading
2. **Read Manifests**: Load remaining manifests from disk
3. **Consolidate**: Combine all manifests into single consolidated manifest
4. **Process**: Use consolidated manifest for CSP generation

## Performance Considerations

  - **Cleanup Frequency**: Automatic cleanup runs before each consolidation
  - **Cache Persistence**: Filesystem cache persists for performance
  - **Manifest Size**: Only essential asset information is stored
  - **Build Time Impact**: Cleanup adds minimal overhead to build process

## CSP Headers Generation

### Complete Policy Inclusion

The CSP headers file now includes the same complete policy as the HTML meta tags:

  - **Base Directives**: From configuration and manifest options
  - **Asset-Based Directives**: Dynamically generated from tracked assets
  - **Hash Sources**: Includes `'sha256-{hash}'` for inline scripts and styles
  - **Asset Paths**: Includes paths for external resources (images, fonts, etc.)

### Headers File Format

```json
{
 "Content-Security-Policy": "script-src 'self' 'sha256-abc123...'; style-src 'self' 'sha256-def456...'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'",
 "Referrer-Policy": "strict-origin-when-cross-origin"
}
```

### Default Directives

When no base directives are provided, the system automatically adds secure defaults:

  - `script-src 'self'` - Only allow scripts from same origin
  - `style-src 'self'` - Only allow styles from same origin
  - `img-src 'self' data: https:` - Allow images from same origin, data URIs, and HTTPS
  - `font-src 'self' data: https:` - Allow fonts from same origin, data URIs, and HTTPS
  - `connect-src 'self'` - Only allow connections to same origin
  - `frame-ancestors 'none'` - Prevent clickjacking attacks

## Future Improvements

  - **Configurable Cleanup Policies**: Allow users to define cleanup rules
  - **Smart Cleanup**: Analyze manifest content to determine relevance
  - **Cross-Build Analysis**: Detect when manifests become obsolete
  - **Cleanup Scheduling**: Allow cleanup to run on a schedule
