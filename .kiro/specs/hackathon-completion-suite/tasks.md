# Tasks: Hackathon Completion Suite

## Phase 1: Setup and Infrastructure

### Task 1.1: Install Testing Dependencies
- [ ] 1.1.1 Add @testing-library/react-native to devDependencies
- [ ] 1.1.2 Add @testing-library/jest-native to devDependencies
- [ ] 1.1.3 Configure Jest with React Native preset in package.json
- [ ] 1.1.4 Verify Jest configuration with sample test

### Task 1.2: Create Test Directory Structure
- [ ] 1.2.1 Create NHAIFaceAuth/__tests__/ directory
- [ ] 1.2.2 Create subdirectories: modules/, utils/, hooks/, integration/
- [ ] 1.2.3 Create module-specific test directories under modules/
- [ ] 1.2.4 Verify directory structure matches specification

### Task 1.3: Create Mock Data Factory
- [ ] 1.3.1 Create __tests__/utils/MockDataFactory.ts
- [ ] 1.3.2 Implement generateMockFrame(width, height)
- [ ] 1.3.3 Implement generateMockFaceDetection()
- [ ] 1.3.4 Implement generateMockLandmarks()
- [ ] 1.3.5 Implement generateMockEmbedding()
- [ ] 1.3.6 Implement generateMockUser()
- [ ] 1.3.7 Implement generateMockAuthLog()
- [ ] 1.3.8 Add validation for all generated data
- [ ] 1.3.9 Add seeded random generation for reproducibility

## Phase 2: Unit Tests - Face Detection Module

### Task 2.1: FaceDetector Unit Tests
- [ ] 2.1.1 Create __tests__/modules/faceDetection/FaceDetector.test.ts
- [ ] 2.1.2 Mock react-native-fast-tflite module
- [ ] 2.1.3 Test initialization with valid config
- [ ] 2.1.4 Test detectFace with valid frame
- [ ] 2.1.5 Test detectFace with empty frame
- [ ] 2.1.6 Test detectFace with invalid dimensions
- [ ] 2.1.7 Test performance baseline (<10ms)
- [ ] 2.1.8 Test disposal and cleanup

### Task 2.2: FaceValidator Unit Tests
- [ ] 2.2.1 Create __tests__/modules/faceDetection/FaceValidator.test.ts
- [ ] 2.2.2 Test validation with good quality face
- [ ] 2.2.3 Test validation with poor lighting
- [ ] 2.2.4 Test validation with face too small
- [ ] 2.2.5 Test validation with face too large
- [ ] 2.2.6 Test validation with extreme angles
- [ ] 2.2.7 Test validation with multiple faces

## Phase 3: Unit Tests - Liveness Detection Module

### Task 3.1: ActiveChallenge Unit Tests
- [ ] 3.1.1 Create __tests__/modules/livenessDetection/ActiveChallenge.test.ts
- [ ] 3.1.2 Test blink detection with valid sequence
- [ ] 3.1.3 Test blink detection with no blink
- [ ] 3.1.4 Test turn head challenge
- [ ] 3.1.5 Test smile challenge
- [ ] 3.1.6 Test challenge timeout handling
- [ ] 3.1.7 Test challenge state transitions

### Task 3.2: PassiveAntiSpoof Unit Tests
- [ ] 3.2.1 Create __tests__/modules/livenessDetection/PassiveAntiSpoof.test.ts
- [ ] 3.2.2 Mock AntiSpoof TFLite model
- [ ] 3.2.3 Test spoof detection with real face (high score)
- [ ] 3.2.4 Test spoof detection with photo attack (low score)
- [ ] 3.2.5 Test spoof detection with video replay
- [ ] 3.2.6 Test preprocessing pipeline
- [ ] 3.2.7 Test threshold configuration

### Task 3.3: ChallengeManager Unit Tests
- [ ] 3.3.1 Create __tests__/modules/livenessDetection/ChallengeManager.test.ts
- [ ] 3.3.2 Test challenge selection randomization
- [ ] 3.3.3 Test challenge sequencing
- [ ] 3.3.4 Test challenge validation logic
- [ ] 3.3.5 Test challenge reset
- [ ] 3.3.6 Test multiple challenge combinations

### Task 3.4: AdaptiveThreshold Unit Tests
- [ ] 3.4.1 Create __tests__/modules/livenessDetection/AdaptiveThreshold.test.ts
- [ ] 3.4.2 Test threshold adjustment based on success rate
- [ ] 3.4.3 Test threshold adjustment based on failure rate
- [ ] 3.4.4 Test threshold bounds (min/max)
- [ ] 3.4.5 Test threshold persistence
- [ ] 3.4.6 Test threshold reset to defaults

## Phase 4: Unit Tests - Face Recognition Module

### Task 4.1: FaceRecognizer Unit Tests
- [ ] 4.1.1 Create __tests__/modules/faceRecognition/FaceRecognizer.test.ts
- [ ] 4.1.2 Mock MobileFaceNet TFLite model
- [ ] 4.1.3 Test embedding generation with valid face
- [ ] 4.1.4 Test embedding generation with invalid input
- [ ] 4.1.5 Test performance baseline (<20ms)
- [ ] 4.1.6 Test embedding normalization
- [ ] 4.1.7 Test batch processing

### Task 4.2: FacePreprocessor Unit Tests
- [ ] 4.2.1 Create __tests__/modules/faceRecognition/FacePreprocessor.test.ts
- [ ] 4.2.2 Test face alignment with landmarks
- [ ] 4.2.3 Test face cropping to 112x112
- [ ] 4.2.4 Test normalization to [0, 1]
- [ ] 4.2.5 Test color space conversion
- [ ] 4.2.6 Test edge cases (extreme rotations)

### Task 4.3: FaceMatcher Unit Tests
- [ ] 4.3.1 Create __tests__/modules/faceRecognition/FaceMatcher.test.ts
- [ ] 4.3.2 Test cosine similarity calculation
- [ ] 4.3.3 Test matching with high similarity (>0.8)
- [ ] 4.3.4 Test matching with low similarity (<0.6)
- [ ] 4.3.5 Test matching against empty database
- [ ] 4.3.6 Test matching against multiple users
- [ ] 4.3.7 Test threshold configuration

### Task 4.4: EnrollmentManager Unit Tests
- [ ] 4.4.1 Create __tests__/modules/faceRecognition/EnrollmentManager.test.ts
- [ ] 4.4.2 Test enrollment with 5 photos
- [ ] 4.4.3 Test enrollment with insufficient photos
- [ ] 4.4.4 Test embedding averaging
- [ ] 4.4.5 Test enrollment validation
- [ ] 4.4.6 Test duplicate user detection
- [ ] 4.4.7 Test enrollment rollback on error

## Phase 5: Unit Tests - Data Manager Module

### Task 5.1: DatabaseManager Unit Tests
- [ ] 5.1.1 Create __tests__/modules/dataManager/DatabaseManager.test.ts
- [ ] 5.1.2 Use in-memory SQLite database (:memory:)
- [ ] 5.1.3 Test database initialization and schema creation
- [ ] 5.1.4 Test user insertion
- [ ] 5.1.5 Test user retrieval by ID
- [ ] 5.1.6 Test user update
- [ ] 5.1.7 Test user deletion
- [ ] 5.1.8 Test authentication log insertion
- [ ] 5.1.9 Test authentication log query with filters
- [ ] 5.1.10 Test transaction rollback on error
- [ ] 5.1.11 Test database cleanup

### Task 5.2: KeyManager Unit Tests
- [ ] 5.2.1 Create __tests__/modules/dataManager/KeyManager.test.ts
- [ ] 5.2.2 Test key generation
- [ ] 5.2.3 Test key storage in secure storage
- [ ] 5.2.4 Test key retrieval
- [ ] 5.2.5 Test key rotation
- [ ] 5.2.6 Test encryption with generated key
- [ ] 5.2.7 Test decryption with stored key

### Task 5.3: LockoutManager Unit Tests
- [ ] 5.3.1 Create __tests__/modules/dataManager/LockoutManager.test.ts
- [ ] 5.3.2 Test lockout trigger after 3 failures
- [ ] 5.3.3 Test lockout status check
- [ ] 5.3.4 Test lockout expiry after timeout
- [ ] 5.3.5 Test lockout reset on success
- [ ] 5.3.6 Test lockout counter increment
- [ ] 5.3.7 Test lockout persistence across restarts

### Task 5.4: StorageMonitor Unit Tests
- [ ] 5.4.1 Create __tests__/modules/dataManager/StorageMonitor.test.ts
- [ ] 5.4.2 Test storage usage calculation
- [ ] 5.4.3 Test storage warning threshold
- [ ] 5.4.4 Test storage critical threshold
- [ ] 5.4.5 Test cleanup recommendation
- [ ] 5.4.6 Test storage metrics collection

## Phase 6: Unit Tests - Sync Service Module

### Task 6.1: SyncManager Unit Tests
- [ ] 6.1.1 Create __tests__/modules/syncService/SyncManager.test.ts
- [ ] 6.1.2 Test sync initialization
- [ ] 6.1.3 Test sync trigger on connectivity change
- [ ] 6.1.4 Test sync with pending logs
- [ ] 6.1.5 Test sync with no pending logs
- [ ] 6.1.6 Test sync retry on failure
- [ ] 6.1.7 Test sync status tracking
- [ ] 6.1.8 Test sync cancellation

### Task 6.2: S3Uploader Unit Tests
- [ ] 6.2.1 Create __tests__/modules/syncService/S3Uploader.test.ts
- [ ] 6.2.2 Mock AWS S3 SDK
- [ ] 6.2.3 Test successful upload
- [ ] 6.2.4 Test upload with network error
- [ ] 6.2.5 Test upload with authentication error
- [ ] 6.2.6 Test batch upload
- [ ] 6.2.7 Test upload progress tracking
- [ ] 6.2.8 Test upload cancellation

### Task 6.3: PurgeManager Unit Tests
- [ ] 6.3.1 Create __tests__/modules/syncService/PurgeManager.test.ts
- [ ] 6.3.2 Test purge of synced logs older than 30 days
- [ ] 6.3.3 Test purge with retention policy
- [ ] 6.3.4 Test purge dry run (count only)
- [ ] 6.3.5 Test purge with database transaction
- [ ] 6.3.6 Test purge status reporting

## Phase 7: Unit Tests - Utilities and Hooks

### Task 7.1: Helpers Unit Tests
- [ ] 7.1.1 Create __tests__/utils/helpers.test.ts
- [ ] 7.1.2 Test date formatting utilities
- [ ] 7.1.3 Test data transformation utilities
- [ ] 7.1.4 Test validation utilities
- [ ] 7.1.5 Test error handling utilities

### Task 7.2: useAuthenticationPipeline Hook Tests
- [ ] 7.2.1 Create __tests__/hooks/useAuthenticationPipeline.test.ts
- [ ] 7.2.2 Use @testing-library/react-hooks
- [ ] 7.2.3 Test pipeline initialization
- [ ] 7.2.4 Test pipeline state transitions
- [ ] 7.2.5 Test pipeline with successful authentication
- [ ] 7.2.6 Test pipeline with failed authentication
- [ ] 7.2.7 Test pipeline error handling
- [ ] 7.2.8 Test pipeline cleanup

## Phase 8: Integration Tests

### Task 8.1: Authentication Flow Integration Test
- [ ] 8.1.1 Create __tests__/integration/authentication.e2e.test.ts
- [ ] 8.1.2 Setup test environment with fresh database
- [ ] 8.1.3 Mock camera frame generator
- [ ] 8.1.4 Test successful authentication flow end-to-end
- [ ] 8.1.5 Test failed authentication (no match)
- [ ] 8.1.6 Test failed authentication (liveness failure)
- [ ] 8.1.7 Test failed authentication (spoof detected)
- [ ] 8.1.8 Cleanup test environment

### Task 8.2: Enrollment Flow Integration Test
- [ ] 8.2.1 Create __tests__/integration/enrollment.e2e.test.ts
- [ ] 8.2.2 Setup test environment
- [ ] 8.2.3 Simulate 5-photo capture sequence
- [ ] 8.2.4 Test embedding generation and averaging
- [ ] 8.2.5 Test user record creation in database
- [ ] 8.2.6 Test enrollment validation
- [ ] 8.2.7 Test enrollment with invalid photos
- [ ] 8.2.8 Cleanup test environment

### Task 8.3: Sync Flow Integration Test
- [ ] 8.3.1 Create __tests__/integration/sync.e2e.test.ts
- [ ] 8.3.2 Setup test environment with mock S3
- [ ] 8.3.3 Generate test authentication logs
- [ ] 8.3.4 Test sync trigger on connectivity
- [ ] 8.3.5 Test successful upload to S3
- [ ] 8.3.6 Test sync failure and retry
- [ ] 8.3.7 Test purge after successful sync
- [ ] 8.3.8 Cleanup test environment

### Task 8.4: Lockout Flow Integration Test
- [ ] 8.4.1 Create __tests__/integration/lockout.e2e.test.ts
- [ ] 8.4.2 Setup test environment
- [ ] 8.4.3 Simulate 3 consecutive failed authentications
- [ ] 8.4.4 Verify lockout is triggered
- [ ] 8.4.5 Test authentication blocked during lockout
- [ ] 8.4.6 Test lockout expiry after timeout
- [ ] 8.4.7 Test successful authentication after expiry
- [ ] 8.4.8 Cleanup test environment

### Task 8.5: Database Encryption Integration Test
- [ ] 8.5.1 Create __tests__/integration/database.e2e.test.ts
- [ ] 8.5.2 Setup test environment with encryption
- [ ] 8.5.3 Test data encryption on write
- [ ] 8.5.4 Test data decryption on read
- [ ] 8.5.5 Test database close and reopen
- [ ] 8.5.6 Test key rotation
- [ ] 8.5.7 Cleanup test environment

## Phase 9: Demo Mode System

### Task 9.1: Demo Mode Manager Implementation
- [ ] 9.1.1 Create src/demo/DemoModeManager.ts
- [ ] 9.1.2 Implement setDemoMode(enabled)
- [ ] 9.1.3 Implement isDemoMode()
- [ ] 9.1.4 Implement loadScenario(scenario)
- [ ] 9.1.5 Implement simulateAuthentication()
- [ ] 9.1.6 Implement getDemoUsers()
- [ ] 9.1.7 Implement simulateFailure(reason)
- [ ] 9.1.8 Add AsyncStorage integration for persistence

### Task 9.2: Demo Scenarios Implementation
- [ ] 9.2.1 Create src/demo/scenarios/ directory
- [ ] 9.2.2 Implement SuccessScenario.ts
- [ ] 9.2.3 Implement LivenessFailureScenario.ts
- [ ] 9.2.4 Implement SpoofDetectionScenario.ts
- [ ] 9.2.5 Implement NoMatchScenario.ts
- [ ] 9.2.6 Implement MultipleFacesScenario.ts
- [ ] 9.2.7 Add scenario timing configuration
- [ ] 9.2.8 Add scenario visual feedback

### Task 9.3: Demo User Database
- [ ] 9.3.1 Create src/demo/DemoUserDatabase.ts
- [ ] 9.3.2 Define 5-7 demo users with metadata
- [ ] 9.3.3 Add demo user photos (stock images)
- [ ] 9.3.4 Generate pre-computed embeddings for demo users
- [ ] 9.3.5 Add demo GPS coordinates
- [ ] 9.3.6 Add demo device metadata
- [ ] 9.3.7 Implement demo database table creation

### Task 9.4: Demo Mode UI Integration
- [ ] 9.4.1 Add demo mode toggle to AdminDashboard
- [ ] 9.4.2 Add demo scenario selector
- [ ] 9.4.3 Add demo mode indicator banner
- [ ] 9.4.4 Add latency configuration slider
- [ ] 9.4.5 Add demo user list view
- [ ] 9.4.6 Add demo log viewer
- [ ] 9.4.7 Test demo mode UI interactions

### Task 9.5: Demo Mode Tests
- [ ] 9.5.1 Create __tests__/demo/DemoModeManager.test.ts
- [ ] 9.5.2 Test demo mode toggle persistence
- [ ] 9.5.3 Test scenario loading
- [ ] 9.5.4 Test authentication simulation timing
- [ ] 9.5.5 Test demo log isolation
- [ ] 9.5.6 Test demo mode with all scenarios
- [ ] 9.5.7 Test demo GPS coordinate generation

## Phase 10: Model File Validator

### Task 10.1: Model Validator Implementation
- [ ] 10.1.1 Create src/validation/ModelValidator.ts
- [ ] 10.1.2 Define MODEL_SPECS constant with all 4 models
- [ ] 10.1.3 Implement validateAllModels()
- [ ] 10.1.4 Implement validateModel(spec)
- [ ] 10.1.5 Implement getTotalModelSize()
- [ ] 10.1.6 Implement testModelLoading(modelPath)
- [ ] 10.1.7 Add file existence checks
- [ ] 10.1.8 Add file size validation
- [ ] 10.1.9 Add tensor shape validation

### Task 10.2: Validation Report Generator
- [ ] 10.2.1 Create src/validation/ValidationReport.ts
- [ ] 10.2.2 Implement report generation logic
- [ ] 10.2.3 Add error message formatting
- [ ] 10.2.4 Add warning message formatting
- [ ] 10.2.5 Add success message formatting
- [ ] 10.2.6 Add JSON export functionality
- [ ] 10.2.7 Add text export functionality

### Task 10.3: Model Validator CLI
- [ ] 10.3.1 Create scripts/validate-models.ts
- [ ] 10.3.2 Add command-line interface
- [ ] 10.3.3 Add colored console output
- [ ] 10.3.4 Add progress indicators
- [ ] 10.3.5 Add exit codes for CI/CD
- [ ] 10.3.6 Test CLI with valid models
- [ ] 10.3.7 Test CLI with missing models
- [ ] 10.3.8 Test CLI with invalid models

### Task 10.4: Model Validator Tests
- [ ] 10.4.1 Create __tests__/validation/ModelValidator.test.ts
- [ ] 10.4.2 Test validation with all models present
- [ ] 10.4.3 Test validation with missing model
- [ ] 10.4.4 Test validation with oversized model
- [ ] 10.4.5 Test validation with corrupted model
- [ ] 10.4.6 Test total size calculation
- [ ] 10.4.7 Test tensor shape validation
- [ ] 10.4.8 Test report generation

## Phase 11: Performance Benchmarking Framework

### Task 11.1: Benchmark Runner Implementation
- [ ] 11.1.1 Create src/benchmarking/BenchmarkRunner.ts
- [ ] 11.1.2 Implement runBenchmarks(config)
- [ ] 11.1.3 Implement benchmarkFaceDetection(iterations)
- [ ] 11.1.4 Implement benchmarkLivenessCheck(iterations)
- [ ] 11.1.5 Implement benchmarkFaceRecognition(iterations)
- [ ] 11.1.6 Implement benchmarkFullPipeline(iterations)
- [ ] 11.1.7 Implement profileMemoryUsage()
- [ ] 11.1.8 Add warmup iterations before measurement

### Task 11.2: Metrics Collector Implementation
- [ ] 11.2.1 Create src/benchmarking/MetricsCollector.ts
- [ ] 11.2.2 Implement latency measurement
- [ ] 11.2.3 Implement percentile calculation (p50, p95, p99)
- [ ] 11.2.4 Implement mean and standard deviation
- [ ] 11.2.5 Implement memory profiling
- [ ] 11.2.6 Implement device info collection
- [ ] 11.2.7 Add timestamp tracking

### Task 11.3: Benchmark Report Generator
- [ ] 11.3.1 Create src/benchmarking/ReportGenerator.ts
- [ ] 11.3.2 Implement generateReport(results)
- [ ] 11.3.3 Add device information section
- [ ] 11.3.4 Add summary section with pass/fail
- [ ] 11.3.5 Add component metrics tables
- [ ] 11.3.6 Add memory profile section
- [ ] 11.3.7 Add optimization recommendations
- [ ] 11.3.8 Add JSON export
- [ ] 11.3.9 Add Markdown export for presentations

### Task 11.4: Benchmark Scenarios
- [ ] 11.4.1 Create src/benchmarking/scenarios/ directory
- [ ] 11.4.2 Implement OptimalConditionsScenario
- [ ] 11.4.3 Implement LowLightScenario
- [ ] 11.4.4 Implement AccessoriesScenario
- [ ] 11.4.5 Implement AngleVariationScenario
- [ ] 11.4.6 Implement DistanceVariationScenario
- [ ] 11.4.7 Add scenario condition recording

### Task 11.5: Benchmark UI
- [ ] 11.5.1 Add benchmark section to AdminDashboard
- [ ] 11.5.2 Add benchmark start/stop buttons
- [ ] 11.5.3 Add progress indicators
- [ ] 11.5.4 Add live metrics display
- [ ] 11.5.5 Add results summary view
- [ ] 11.5.6 Add export report button
- [ ] 11.5.7 Add historical results viewer

### Task 11.6: Benchmark Tests
- [ ] 11.6.1 Create __tests__/benchmarking/BenchmarkRunner.test.ts
- [ ] 11.6.2 Test benchmark execution with 100 iterations
- [ ] 11.6.3 Test percentile calculations
- [ ] 11.6.4 Test pass/fail threshold detection
- [ ] 11.6.5 Test memory profiling
- [ ] 11.6.6 Test device info collection
- [ ] 11.6.7 Test report generation
- [ ] 11.6.8 Test scenario recording

## Phase 12: Coverage and Quality Assurance

### Task 12.1: Coverage Analysis
- [ ] 12.1.1 Run jest --coverage on entire test suite
- [ ] 12.1.2 Review coverage report for each module
- [ ] 12.1.3 Identify uncovered lines and branches
- [ ] 12.1.4 Add tests for uncovered code
- [ ] 12.1.5 Verify 80% coverage threshold is met
- [ ] 12.1.6 Generate HTML coverage report

### Task 12.2: Test Quality Review
- [ ] 12.2.1 Review all test files for completeness
- [ ] 12.2.2 Verify all edge cases are covered
- [ ] 12.2.3 Verify all error paths are tested
- [ ] 12.2.4 Check test naming consistency
- [ ] 12.2.5 Check test isolation
- [ ] 12.2.6 Verify no flaky tests

### Task 12.3: Performance Validation
- [ ] 12.3.1 Run unit tests and measure total execution time
- [ ] 12.3.2 Verify face detection tests < 10ms
- [ ] 12.3.3 Verify face recognition tests < 20ms
- [ ] 12.3.4 Optimize slow tests
- [ ] 12.3.5 Verify parallel test execution works

### Task 12.4: Integration Validation
- [ ] 12.4.1 Run all integration tests
- [ ] 12.4.2 Verify test isolation (no shared state)
- [ ] 12.4.3 Verify cleanup after each test
- [ ] 12.4.4 Test with real device if possible
- [ ] 12.4.5 Document any environment-specific requirements

## Phase 13: Documentation and Finalization

### Task 13.1: Testing Documentation
- [ ] 13.1.1 Create docs/testing_guide.md
- [ ] 13.1.2 Document how to run unit tests
- [ ] 13.1.3 Document how to run integration tests
- [ ] 13.1.4 Document how to generate coverage reports
- [ ] 13.1.5 Document test data generation
- [ ] 13.1.6 Document mocking strategies

### Task 13.2: Demo Mode Documentation
- [ ] 13.2.1 Create docs/demo_mode_guide.md
- [ ] 13.2.2 Document how to enable demo mode
- [ ] 13.2.3 Document available demo scenarios
- [ ] 13.2.4 Document demo user profiles
- [ ] 13.2.5 Document demo mode for presentations

### Task 13.3: Validation Documentation
- [ ] 13.3.1 Create docs/model_validation.md
- [ ] 13.3.2 Document model specifications
- [ ] 13.3.3 Document validation process
- [ ] 13.3.4 Document how to run validator
- [ ] 13.3.5 Document error messages and recovery

### Task 13.4: Benchmarking Documentation
- [ ] 13.4.1 Create docs/benchmarking_guide.md
- [ ] 13.4.2 Document how to run benchmarks
- [ ] 13.4.3 Document benchmark scenarios
- [ ] 13.4.4 Document how to interpret results
- [ ] 13.4.5 Document optimization recommendations
- [ ] 13.4.6 Include sample benchmark reports

### Task 13.5: Update Main README
- [ ] 13.5.1 Add testing section to README.md
- [ ] 13.5.2 Add demo mode section
- [ ] 13.5.3 Add validation section
- [ ] 13.5.4 Add benchmarking section
- [ ] 13.5.5 Add badges for test coverage
- [ ] 13.5.6 Add quick start guide for judges

### Task 13.6: Final Validation
- [ ] 13.6.1 Run complete test suite and verify all pass
- [ ] 13.6.2 Run model validator and verify all models valid
- [ ] 13.6.3 Run benchmarks on target device
- [ ] 13.6.4 Test demo mode with all scenarios
- [ ] 13.6.5 Verify all documentation is accurate
- [ ] 13.6.6 Create presentation slides with results
- [ ] 13.6.7 Prepare demo for hackathon judges
