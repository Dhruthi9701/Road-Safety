# Demo Mode Guide

Enable realistic authentication demonstrations without camera or models for hackathon presentations.

## Quick Start

```typescript
import { DemoModeManager } from './src/demo';

const demo = DemoModeManager.getInstance();
await demo.initialize();
await demo.setDemoMode(true);
await demo.loadScenario('success');

const result = await demo.simulateAuthentication();
console.log(result); // { success: true, userName: "Ramesh Kumar", ... }
```

## Available Scenarios

1. **Success** - Complete successful authentication
2. **Liveness Failure** - Fails liveness challenge
3. **Spoof Detected** - Anti-spoofing detects fake face
4. **No Match** - Face not in database
5. **Multiple Faces** - Security policy violation

## Demo Users

7 pre-configured users with Indian names and realistic profiles.

## UI Integration

Toggle demo mode from AdminDashboard settings panel.
