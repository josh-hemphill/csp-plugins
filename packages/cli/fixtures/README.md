# E2E Test Fixtures

This directory contains centralized test fixtures that can be used across all e2e tests. This approach provides several benefits:

## Benefits

1. **Maintainability**: Single source of truth for test files
2. **Cleanup**: Easy to wipe output folders without losing source files
3. **Reusability**: Test files can be shared across different test scenarios
4. **Consistency**: All tests use the same test content

## Directory Structure

```shell
fixtures/
├── scripts/          # JavaScript files for testing
├── styles/           # CSS files for testing
├── images/           # Image files for testing
├── fonts/            # Font files for testing
├── html/             # HTML templates
└── fixture-manager.ts # Utility for managing fixtures
```

## Available Fixtures

### Scripts

  - `test-script.js` - Basic test script with module export
  - `utility-script.js` - Utility function script
  - `local-script.js` - Local script for integrity tests
  - `local-utility.js` - Local utility for integrity tests

### Styles

  - `test-style.css` - Basic test styles
  - `local-style.css` - Local styles for integrity tests
  - `local-components.css` - Component styles for integrity tests

### Images

  - `local-image.svg` - SVG image for integrity tests
  - `local-logo.png` - PNG logo for integrity tests

### Fonts

  - `local-font.woff2` - Font file for integrity tests
  - `local-icon-font.woff2` - Icon font for integrity tests

## Usage

### Basic Usage

```typescript
import { FixtureManager } from '../fixtures/fixture-manager';

const fixtureManager = new FixtureManager(path.join(__dirname, '..', 'fixtures'));

fixtureManager.createTestDirectory(outputDir, {
 title: 'My Test',
 scripts: ['test-script.js'],
 styles: ['test-style.css'],
 images: ['local-image.svg'],
 fonts: ['local-font.woff2']
});
```

### Configuration Options

```typescript
interface FixtureConfig {
 scripts?: string[]; // Script files to include
 styles?: string[]; // Style files to include
 images?: string[]; // Image files to include
 fonts?: string[]; // Font files to include
 title?: string; // Page title
}
```

### Adding New Fixtures

1. Add the file to the appropriate fixtures subdirectory
2. Update the `listFixtures` method in `fixture-manager.ts` if needed
3. Use the fixture in your test configuration

## HTML Template

The `base-template.html` file provides a template that gets customized for each test. It includes placeholders:

  - `{{TITLE}}` - Page title
  - `{{SCRIPTS}}` - Script tags
  - `{{STYLES}}` - Style link tags
  - `{{IMAGES}}` - Image tags
  - `{{FONTS}}` - Font preload tags

## Best Practices

1. **Keep fixtures simple**: Test files should be minimal and focused
2. **Use descriptive names**: File names should indicate their purpose
3. **Maintain consistency**: All fixtures should follow the same structure
4. **Document changes**: Update this README when adding new fixtures
