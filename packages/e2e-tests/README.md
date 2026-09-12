# CSP Plugins E2E Tests

This package contains comprehensive end-to-end tests for the CSP Plugins system, covering CLI functionality, integration scenarios, and edge cases.

## Test Structure

### Test Files

  - **`scenario-tests.test.ts`** - Core CSP processing workflow tests
  - **`cli-integration.test.ts`** - Basic CLI integration and functionality tests
  - **`cli-edge-cases.test.ts`** - Advanced CLI edge cases and error handling tests
  - **`cli-integration-scenarios.test.ts`** - Complex integration scenarios and workflow tests

### Test Coverage

The tests cover:

  - ✅ Basic CSP processing workflow
  - ✅ CLI flag combinations (`--no-headers`, `--no-html`, `--integrity`, `--verbose`)
  - ✅ Custom manifest handling
  - ✅ Error handling and edge cases
  - ✅ Performance and scalability testing
  - ✅ Policy strictness levels
  - ✅ Output directory handling
  - ✅ Input validation
  - ✅ Error recovery scenarios

## Running Tests

### Standard Test Run

```bash
pnpm test
```

### Watch Mode

```bash
pnpm test:watch
```

### Preserve Test Output for Inspection

```bash
# Option 1: Use the convenience script
pnpm test:output

# Option 2: Set environment variable directly
KEEP_TEST_OUTPUT=true pnpm test

# Option 3: Use the npm script
pnpm test:keep-output
```

## Output Preservation

By default, test output directories are automatically cleaned up after tests complete. To preserve them for inspection:

1. **Set the environment variable:**

   ```bash
   export KEEP_TEST_OUTPUT=true
   pnpm test
   ```

2. **Use the convenience script:**

   ```bash
   pnpm test:output
   ```

3. **Clean up manually when done:**

   ```bash
   KEEP_TEST_OUTPUT=false pnpm test
   ```

### What Gets Preserved

When `KEEP_TEST_OUTPUT=true` is set, the following directories are preserved:

  - `tests/scenario-test-output/` - Scenario test outputs
  - `tests/cli-integration-scenarios-output/` - Integration scenario outputs
  - `tests/cli-edge-cases-output/` - Edge case test outputs
  - `tests/test-output/` - Basic CLI integration outputs

### Inspecting Output

After running tests with output preservation, you can:

  - Examine generated CSP headers files (`csp-headers.json`)
  - Inspect processed HTML files with injected CSP meta tags
  - Check nonce generation and integrity attributes
  - Verify CLI output and error handling
  - Analyze test fixtures and generated content

## Test Organization

### Scenario Tests

Tests the core CSP processing workflow:

  - Basic HTML processing with CSP injection
  - Both headers and meta tags generation
  - Flag behavior testing (`--no-headers`, `--no-html`)
  - Custom manifest handling
  - Error handling and edge cases
  - Performance and scalability
  - Policy strictness levels
  - Local integrity generation

### CLI Integration Tests

Tests basic CLI functionality:

  - Help and inspection capabilities
  - HTML processing and CSP injection
  - CSP headers generation
  - Flag handling
  - Custom manifest support
  - Large asset handling
  - Invalid manifest handling
  - Nonce generation and validation
  - Integrity attribute handling

### CLI Edge Cases

Tests advanced CLI scenarios:

  - Input validation (non-existent, empty, no-HTML directories)
  - Flag combinations
  - Output directory handling (creation, relative paths)
  - Manifest edge cases (empty arrays, null values, mixed types)
  - Performance and resource limits
  - Error recovery and graceful failure

### CLI Integration Scenarios

Tests complex integration workflows:

  - End-to-end workflow completion
  - Complex HTML with multiple resource types
  - Different CSP policy configurations
  - Custom directive handling
  - Nonce consistency across runs
  - CSP header format validation
  - Build tool integration

## Debugging Tests

### Common Issues

1. **CLI not built:**

   ```bash
   cd packages/cli && pnpm run build
   ```

2. **Test app not built:**

   ```bash
   cd packages/e2e-tests/test-app && pnpm run build
   ```

3. **Output directories not found:**
   - Ensure `KEEP_TEST_OUTPUT=true` is set
   - Check that tests completed successfully
   - Look for console output showing preserved directory paths

### Manual Inspection

When tests fail or you want to inspect output:

1. Run tests with output preservation:

   ```bash
   pnpm test:output
   ```

2. Navigate to the preserved output directory:

   ```bash
   cd tests/[test-name]-output/[test-case]
   ```

3. Inspect generated files:
   - `csp-headers.json` - Generated CSP headers
   - `index.html` - Processed HTML with CSP meta tags
   - Any other generated or modified files

## Contributing

When adding new tests:

1. Follow the existing test structure and naming conventions
2. Use the `buildTestAppWithIsolation()` or `createTestFixtures()` helpers
3. Include proper cleanup in `afterAll()` hooks
4. Add descriptive test names and comments
5. Test both success and failure scenarios
6. Consider edge cases and error conditions

## Test Dependencies

  - **Vitest** - Test runner
  - **zx** - Shell scripting and process management
  - **@csp-plugins/cli** - CLI package for testing
  - **@csp-plugins/core** - Core functionality
  - **@csp-plugins/unplugin** - Plugin system
