# Migration Guide: Moving Tests to Fixtures

This guide helps you migrate existing e2e tests to use the centralized fixtures system.

## Before (Old Way)

```typescript
// Each test creates its own files
const testHtml = `<!doctype html>
<html>
  <head>
    <script src="./test.js"></script>
    <link rel="stylesheet" href="./test.css">
  </head>
</html>`;

writeFileSync(path.join(outputDir, 'index.html'), testHtml);
writeFileSync(path.join(outputDir, 'test.js'), 'console.log("test");');
writeFileSync(path.join(outputDir, 'test.css'), '.test { color: red; }');
```

## After (New Way)

```typescript
import { FixtureManager } from '../fixtures/fixture-manager';

const fixtureManager = new FixtureManager(path.join(__dirname, '..', 'fixtures'));

fixtureManager.createTestDirectory(outputDir, {
 title: 'My Test',
 scripts: ['test-script.js'],
 styles: ['test-style.css']
});
```

## Migration Steps

### 1. Import FixtureManager

```typescript
import { FixtureManager } from '../fixtures/fixture-manager';
```

### 2. Replace File Creation

Instead of manually creating files, use the fixture manager:

```typescript
// OLD: Manual file creation
writeFileSync(path.join(outputDir, 'index.html'), testHtml);
writeFileSync(path.join(outputDir, 'test.js'), scriptContent);

// NEW: Use fixture manager
const fixtureManager = new FixtureManager(path.join(SCRIPT_DIR, '..', 'fixtures'));
fixtureManager.createTestDirectory(outputDir, {
 scripts: ['test-script.js'],
 styles: ['test-style.css']
});
```

### 3. Update Test Configuration

Configure which fixtures to include:

```typescript
fixtureManager.createTestDirectory(outputDir, {
 title: 'Policy Strictness Test',
 scripts: ['test-script.js', 'utility-script.js'],
 styles: ['test-style.css'],
 images: ['local-image.svg'],
 fonts: ['local-font.woff2']
});
```

### 4. Remove Old Static Files

Delete the old static files from your test directory:

  - `test.js`
  - `test.css`
  - `test.html`
  - Any other static test files

### 5. Update Test Logic

If your test logic depends on specific file content, you can:

```typescript
// Get fixture content if needed
const scriptPath = fixtureManager.getFixturePath('scripts', 'test-script.js');
const scriptContent = readFileSync(scriptPath, 'utf8');

// Or use the fixture manager's list method
const availableScripts = fixtureManager.listFixtures('scripts');
```

## Benefits After Migration

1. **Cleaner test code**: No more inline HTML/CSS/JS strings
2. **Easier maintenance**: Update fixtures in one place
3. **Better cleanup**: Easy to wipe output directories
4. **Consistent testing**: All tests use the same content
5. **Reusable fixtures**: Share test files across tests

## Example: Policy Strictness Test

```typescript
// Before: 50+ lines of file creation code
// After: 5 lines of fixture configuration

const fixtureManager = new FixtureManager(path.join(SCRIPT_DIR, '..', 'fixtures'));

fixtureManager.createTestDirectory(outputDir, {
 title: 'Policy Strictness Test',
 scripts: ['test-script.js', 'utility-script.js'],
 styles: ['test-style.css'],
 images: ['local-image.svg'],
 fonts: ['local-font.woff2']
});
```

## Need New Fixtures?

If you need fixtures that don't exist:

1. Add the file to the appropriate fixtures subdirectory
2. Update the `listFixtures` method in `fixture-manager.ts`
3. Use it in your test configuration

## Questions?

See the main fixtures README or ask in the project discussions.
