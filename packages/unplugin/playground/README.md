# CSP Plugin Playground

This playground provides a comprehensive testing environment for the CSP Plugin with various configurations and real-world scenarios.

## 🎯 Purpose

The playground is designed to validate that the CSP Plugin correctly:

  - Tracks all types of assets during build
  - Generates proper CSP manifests
  - Handles different security configurations
  - Integrates with Vite's dev server
  - Produces consistent and predictable output

## 🏗️ Test Scenarios

### 1. Strict CSP Configuration

  - **Security Level**: Maximum security
  - **Features**: Asset tracking, CSP generation, dev server integration
  - **Settings**:
    - `strictMode: true`
    - `reportOnly: false`
    - Uses `strict-dynamic` for script-src
    - Restricts resources to `self` only

### 2. Permissive CSP Configuration

  - **Security Level**: Development-friendly
  - **Features**: Asset tracking, CSP generation, dev server integration
  - **Settings**:
    - `strictMode: false`
    - `reportOnly: true`
    - Allows `unsafe-inline` for scripts
    - Permits `https:` resources

### 3. Minimal Asset Tracking

  - **Security Level**: Basic tracking only
  - **Features**: Asset tracking, manifest generation
  - **Settings**:
    - `trackAssets: true`
    - `generateCsp: false`
    - `devServer: false`

## 🧪 Test Assets

The playground includes various asset types to test tracking:

### HTML Assets

  - External stylesheets (CDN)
  - Inline styles
  - External scripts (CDN)
  - Inline scripts
  - Images (local and external)
  - Fonts
  - Service workers

### JavaScript Assets

  - Main entry point
  - CSS imports
  - JSON data imports
  - Dynamic imports (code splitting)
  - Dynamic content generation
  - Service worker registration

### CSS Assets

  - External stylesheets
  - Inline styles
  - Dynamic style injection

## 🚀 Getting Started

### Prerequisites

  - Node.js 18+
  - pnpm

### Installation

```bash
cd packages/unplugin/playground
pnpm install
```

### Development Mode

```bash
pnpm dev
```

This starts the Vite dev server with hot reloading and CSP plugin integration.

### Build Testing

```bash
pnpm build
```

Builds the project and generates CSP manifests.

## 🧪 Running Tests

The playground uses **Vitest** for comprehensive testing instead of custom scripts.

### Quick Tests

```bash
pnpm test
```

Runs tests in watch mode for development.

### CLI E2E Tests

The playground includes comprehensive CLI end-to-end tests organized by test scenarios:

```bash
# Run all CLI e2e tests
pnpm test e2e-tests/

# Run specific test scenario
pnpm test e2e-tests/basic-processing/
pnpm test e2e-tests/no-headers/
pnpm test e2e-tests/no-html/
pnpm test e2e-tests/both-headers-and-meta/
```

### Test Scenarios

Each test scenario demonstrates different CLI behaviors:

  - **`basic-processing/`** - Default CLI behavior (headers + meta tags)
  - **`no-headers/`** - CLI with `--no-headers` flag (nonces only)
  - **`no-html/`** - CLI with `--no-html` flag (headers only)
  - **`both-headers-and-meta/`** - Generate both outputs simultaneously

### Manual Testing

Use the test runner script for manual CLI testing:

```bash
# Make executable
chmod +x e2e-tests/run-all-tests.ts

# Run all test scenarios
./e2e-tests/run-all-tests.ts

# Clean up test outputs
./e2e-tests/run-all-tests.ts cleanup

# Show help
./e2e-tests/run-all-tests.ts help
```

### Test Outputs

Each test scenario generates outputs in its own directory:

  - **`output/`** - Processed files and generated artifacts
  - **`logs/`** - CLI execution logs
  - **`expected/`** - Reference files for validation

## 📊 Test Output

### Build Output

  - `dist/` - Built assets with hashed filenames
  - `.csp-manifest-{config}/` - CSP manifests for each configuration

### Test Results

  - Console output with test results
  - Coverage reports in multiple formats
  - Detailed test failure information

## 🔍 Test Coverage

### Configuration Tests

  - Vite configuration validation
  - CSP plugin options verification
  - TypeScript type checking

### Integration Tests

  - Build process validation
  - Asset tracking verification
  - Manifest generation testing
  - Configuration switching validation

### Asset Validation

  - File structure verification
  - Asset type detection
  - Metadata validation
  - Hash generation checking

## 🛠️ Customization

### Adding New Test Assets

1. Add files to the playground directory
2. Import/use them in `main.ts` or `index.html`
3. Update snapshot files if needed

### Testing New Configurations

1. Add configuration to `cspConfigs` in `vite.config.ts`
2. Update test scenarios in test files
3. Add validation rules as needed

### Extending Test Coverage

  - Add new test files with `.test.ts` extension
  - Use Vitest's built-in assertion library
  - Leverage Vitest's mocking and setup capabilities

## 🐛 Troubleshooting

### Common Issues

#### Build Failures

  - Check that all dependencies are installed
  - Verify Vite configuration syntax
  - Ensure plugin source files are accessible

#### Test Failures

  - Clean previous builds: `rm -rf dist .csp-manifest-*`
  - Check test output for specific error messages
  - Verify manifest directory permissions

#### Asset Tracking Issues

  - Check plugin configuration options
  - Verify asset type detection logic
  - Review include/exclude patterns

### Debug Mode

Enable verbose logging by modifying test configuration or adding debug flags to the plugin configuration.

## 📈 Performance Considerations

  - Tests run with proper cleanup between runs
  - Asset hashing is asynchronous to avoid blocking
  - Large asset collections may impact test performance
  - Consider asset size limits for CI/CD environments

## 🔗 Related Documentation

  - [CSP Plugin Core](../src/)
  - [Vite Integration](../src/vite.ts)
  - [Asset Tracking](../src/asset-tracker.ts)
  - [Manifest Generation](../src/manifest-writer.ts)
  - [Vitest Testing Framework](https://vitest.dev/)
