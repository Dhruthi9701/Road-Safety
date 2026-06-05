# NHAI FaceAuth — Testing Guide

Complete guide for running unit tests, integration tests, and achieving 80%+ code coverage.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Running Tests](#running-tests)
3. [Test Coverage](#test-coverage)
4. [Writing New Tests](#writing-new-tests)
5. [Mock Data](#mock-data)
6. [Continuous Integration](#continuous-integration)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Install Dependencies

```bash
cd NHAIFaceAuth
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

---

## Running Tests

### Run All Tests

```bash
npm test
```

This runs all unit tests and integration tests using Jest.

### Run Specific Test File

```bash
npm test -- FaceDetector.test.ts
```

### Run Tests Matching Pattern

```bash
npm test -- --testNamePattern="should detect face"
```

### Run Tests for Specific Module

```bash
# Face Detection module tests
npm test -- __tests__/modules/faceDetection

# Liveness Detection module tests
npm test -- __tests__/modules/livenessDetection

# Face Recognition module tests
npm test -- __tests__/modules/faceRecognition

# Data Manager module tests
npm test -- __tests__/modules/dataManager

# Sync Service module tests
npm test -- __tests__/modules/syncService
```

### Run Integration Tests Only

```bash
npm test -- __tests__/integration
```

---

## Test Coverage

### Generate Coverage Report

```bash
npm run test:coverage
```

This generates:
- Console summary with coverage percentages
- HTML report in `coverage/lcov-report/index.html`
- LCOV file for CI/CD integration

### View HTML Coverage Report

```bash
# Open in browser
open coverage/lcov-report/index.html  # macOS
start coverage/lcov-report/index.html # Windows
xdg-open coverage/lcov-report/index.html # Linux
```

### Coverage Thresholds

The project enforces **80% coverage minimum** across:
- ✅ Branches
- ✅ Functions
- ✅ Lines
- ✅ Statements

Tests will fail if coverage drops below threshold.

### Check Coverage for Specific Module

```bash
npm test -- --coverage --collectCoverageFrom="src/modules/faceDetection/**/*.ts"
```

---

## Writing New Tests

### Test File Structure

Place tests in `__tests__/` directory matching source structure:

```
src/modules/faceDetection/FaceDetector.ts
  → __tests__/modules/faceDetection/FaceDetector.test.ts

src/modules/livenessDetection/ChallengeManager.ts
  → __tests__/modules/livenessDetection/ChallengeManager.test.ts
```

### Basic Test Template

```typescript
import { MyClass } from '../../../src/modules/myModule/MyClass';
import { MockDataFactory } from '../../utils/MockDataFactory';

// Mock dependencies
jest.mock('react-native-fast-tflite');

describe('MyClass', () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await instance.initialize();
      expect(instance.isReady()).toBe(true);
    });
  });

  describe('Core Functionality', () => {
    it('should perform operation correctly', () => {
      const input = MockDataFactory.generateMockFrame(640, 480);
      const result = instance.processInput(input);
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input', () => {
      const result = instance.processInput(null);
      expect(result).toBeNull();
    });
  });
});
```

### Testing Async Functions

```typescript
it('should complete async operation', async () => {
  const result = await instance.asyncMethod();
  expect(result).toBe('success');
});

it('should handle async errors', async () => {
  await expect(instance.failingAsyncMethod()).rejects.toThrow('Error message');
});
```

### Testing with Timers

```typescript
jest.useFakeTimers();

it('should complete after timeout', () => {
  instance.startTimer(1000);
  
  jest.advanceTimersByTime(1000);
  
  expect(instance.isComplete()).toBe(true);
});

jest.useRealTimers();
```

---

## Mock Data

### Using MockDataFactory

The `MockDataFactory` provides realistic test data:

```typescript
import { MockDataFactory } from '../utils/MockDataFactory';

// Generate mock camera frame
const frame = MockDataFactory.generateMockFrame(640, 480, 'face-like');

// Generate mock face detection result
const detection = MockDataFactory.generateMockFaceDetection(640, 480, true, 0.95);

// Generate mock face embedding
const embedding = MockDataFactory.generateMockEmbedding(128, true);

// Generate mock enrolled user
const user = MockDataFactory.generateMockUser();

// Generate mock authentication log
const log = MockDataFactory.generateMockAuthLog('user_1234', 'success');
```

### Seeded Random Generation

For reproducible tests, set a seed:

```typescript
MockDataFactory.setSeed(12345);

const user1 = MockDataFactory.generateMockUser();
const user2 = MockDataFactory.generateMockUser(); // Different from user1

MockDataFactory.setSeed(12345); // Reset seed
const user3 = MockDataFactory.generateMockUser(); // Same as user1
```

### Validating Mock Data

```typescript
const frame = MockDataFactory.generateMockFrame(640, 480);
expect(MockDataFactory.validateFrame(frame, 640, 480)).toBe(true);

const detection = MockDataFactory.generateMockFaceDetection(640, 480);
expect(MockDataFactory.validateFaceDetection(detection)).toBe(true);

const embedding = MockDataFactory.generateMockEmbedding(128);
expect(MockDataFactory.validateEmbedding(embedding, 128)).toBe(true);
```

---

## Mocking Strategies

### Mocking TFLite Models

```typescript
jest.mock('react-native-fast-tflite', () => ({
  loadTensorflowModel: jest.fn().mockResolvedValue({
    runSync: jest.fn().mockReturnValue([
      new Float32Array(15232), // Regressors
      new Float32Array(896),   // Classificators
    ]),
  }),
}));
```

### Mocking SQLite Database

```typescript
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn().mockReturnValue({
    execute: jest.fn(),
    executeAsync: jest.fn().mockResolvedValue({ rows: [] }),
  }),
}));
```

### Mocking AsyncStorage

```typescript
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(null),
  getItem: jest.fn().mockResolvedValue('{}'),
  removeItem: jest.fn().mockResolvedValue(null),
}));
```

### Mocking Network Requests (S3)

```typescript
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn(),
}));
```

---

## Continuous Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Run Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd NHAIFaceAuth
          npm install
      
      - name: Run tests
        run: |
          cd NHAIFaceAuth
          npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./NHAIFaceAuth/coverage/lcov.info
```

### Pre-commit Hook

Create `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

cd NHAIFaceAuth
npm test
```

---

## Troubleshooting

### Tests Failing with "Cannot find module"

**Solution**: Check module paths and ensure TypeScript paths are configured correctly in `jest.config.js`.

### Tests Timing Out

**Solution**: Increase Jest timeout:

```typescript
jest.setTimeout(10000); // 10 seconds
```

### Mock Not Working

**Solution**: Ensure mock is defined before import:

```typescript
jest.mock('module-name'); // Must be BEFORE import

import { MyClass } from './MyClass';
```

### Coverage Not Updating

**Solution**: Clear Jest cache:

```bash
npm test -- --clearCache
```

### React Native Specific Issues

**Solution**: Ensure Jest preset is set to `react-native`:

```json
{
  "jest": {
    "preset": "react-native"
  }
}
```

### Test Isolation Issues

**Solution**: Clear all mocks between tests:

```typescript
afterEach(() => {
  jest.clearAllMocks();
});
```

---

## Performance Tips

### Run Tests in Parallel

Jest runs tests in parallel by default. Adjust workers:

```bash
npm test -- --maxWorkers=4
```

### Skip Slow Tests in Development

```typescript
it.skip('slow integration test', async () => {
  // This test will be skipped
});
```

### Use Test Snapshots for UI

```typescript
it('should match snapshot', () => {
  const component = render(<MyComponent />);
  expect(component).toMatchSnapshot();
});
```

---

## Best Practices

1. ✅ **Write tests first** (TDD) for new features
2. ✅ **Keep tests focused** - one concept per test
3. ✅ **Use descriptive test names** - "should detect face in valid frame"
4. ✅ **Mock external dependencies** - TFLite, database, network
5. ✅ **Test edge cases** - null, undefined, empty, large values
6. ✅ **Test error paths** - not just happy path
7. ✅ **Use beforeEach/afterEach** for setup/cleanup
8. ✅ **Aim for 80%+ coverage** across all modules
9. ✅ **Run tests before committing** - use pre-commit hooks
10. ✅ **Keep tests fast** - mock slow operations

---

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library React Native](https://callstack.github.io/react-native-testing-library/)
- [React Native Testing Guide](https://reactnative.dev/docs/testing-overview)

---

**For hackathon judges**: Run `npm run test:coverage` to verify 80%+ code coverage across all 6 core modules.
