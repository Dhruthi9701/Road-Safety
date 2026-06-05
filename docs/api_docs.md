# NHAI FaceAuth — Module API Reference

This document details the public API interfaces, parameter lists, and return types of the core FaceAuth modules.

---

## 1. DatabaseManager API

The `DatabaseManager` is a singleton class managing the encrypted SQLite database.

```typescript
import { DatabaseManager } from './src/modules/dataManager/DatabaseManager';

const db = DatabaseManager.getInstance();
```

### `initialize(): Promise<void>`
Opens the encrypted database using the key retrieved from `KeyManager` and runs any pending schema migrations.
- **Throws**: Error if Keychain retrieval or database open fails.

### `insertUser(user: EnrolledUser): Promise<void>`
Registers a new enrolled worker inside a transaction.
- **Parameters**: `user` – `EnrolledUser` object.
- **Throws**: Error if employee ID is a duplicate.

### `getUserByEmployeeId(employeeId: string): Promise<EnrolledUser | null>`
Retrieves a worker profile by employee ID.
- **Returns**: `EnrolledUser` object or `null` if not found.

### `getAllUsers(): Promise<EnrolledUser[]>`
Retrieves all enrolled workers. Used by the face matcher during verification.

### `insertAuthLog(log: AuthLog): Promise<void>`
Persists an authentication log.
- **Parameters**: `log` – `AuthLog` object.

### `getUnsyncedLogs(limit: number): Promise<AuthLog[]>`
Fetches up to `limit` logs where `synced = 0`.

### `markLogsSynced(logIds: string[]): Promise<void>`
Marks a batch of logs as synced.

### `verifyIntegrity(): Promise<boolean>`
Runs `PRAGMA integrity_check` on the database file.

---

## 2. useAuthenticationPipeline Hook API

A custom hook used in `CameraScreen.tsx` to orchestrate authentication.

```typescript
import { useAuthenticationPipeline } from './src/hooks/useAuthenticationPipeline';

const { state, guideState, result, processFrame, initialize, reset } = useAuthenticationPipeline();
```

### Output Parameters

| Parameter | Type | Description |
|---|---|---|
| **`state`** | `PipelineState` | Current state of the pipeline (`IDLE`, `DETECTING_FACE`, `LIVENESS_CHECK`, `RECOGNIZING`, `RESULT_SUCCESS`, `RESULT_FAILURE`). |
| **`guideState`** | `FaceGuideState` | Overlay instructions (`faceAligned: boolean`, `guidanceColor: 'green'\|'yellow'\|'red'`). |
| **`instructionText`** | `string` | Text instruction to render in the UI. |
| **`challengeProgress`** | `number` | Liveness challenge progress fraction (`0.0` to `1.0`). |
| **`currentChallenge`** | `ChallengeType \| null` | Current active liveness challenge (`BLINK`, `SMILE`, `HEAD_TURN_LEFT`, etc.). |
| **`result`** | `AuthenticationResult \| null` | Verification result. |
| **`isLockedOut`** | `boolean` | `true` if the device is currently locked out. |

### Methods

#### `initialize(): Promise<void>`
Initializes the ML models. Must be called on mount.

#### `processFrame(frameData: Float32Array, width: number, height: number): Promise<void>`
Processes a frame.
- **Parameters**:
  - `frameData` – Normalized Float32Array pixels.
  - `width` – Frame width.
  - `height` – Frame height.

#### `reset(): void`
Resets the pipeline state machine back to `IDLE`.

---

## 3. SyncManager API

A singleton class orchestrating uploads to AWS S3.

```typescript
import { SyncManager } from './src/modules/syncService/SyncManager';

const syncManager = SyncManager.getInstance();
```

### `initialize(): Promise<void>`
Subscribes to NetInfo connectivity changes and reads pending logs count.

### `startSync(): Promise<SyncStatus>`
Triggers an upload cycle. Fetches unsynced logs, creates Gzip batches, uploads to S3, and purges older logs.

### `forceSync(): Promise<void>`
Manually forces a sync cycle regardless of network state.

### `getSyncStatus(): SyncStatus`
Returns the current network and synchronization status cache.
