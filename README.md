# NHAI FaceAuth — Offline Facial Recognition & Liveness Detection System

An edge-AI offline facial recognition and liveness detection system built for the **NHAI Hackathon 7.0 (Challenge #3)**. Designed to operate under zero internet conditions on mid-range Android (8.0+) and iOS (12+) devices, securely saving authentication logs locally and syncing to AWS S3 when connectivity is restored.

---

## 🚀 Key Features

- **100% Offline Biometrics**: No cloud requests are made for face verification or liveness, preventing latencies or outages in remote highway plazas.
- **Dual-Layer Anti-Spoofing**:
  - **Active Liveness**: Eye Aspect Ratio (EAR) and Mouth Aspect Ratio (MAR) state machines tracking blinks, smiles, head turns, and nods.
  - **Passive Liveness**: A 3.5MB MobileNetV2 binary classifier detecting photo printouts, screen replays, and 3D mask attacks.
- **Ultra-Lightweight Engine**: The total model payload is only **7.2MB** (INT8 post-training quantized TFLite files), well within the 20MB hackathon budget.
- **Full Database Encryption**: Persists records using `SQLCipher` AES-256 page-level database encryption, secured by device keychain (Android Keystore / iOS Keychain).
- **Guaranteed Synchronization**: Automatically packages unsynced logs into Gzip-compressed batches, uploads to AWS S3 using NetInfo listeners, and purges older local logs safely.
- **Tiered Lockout Shield**: Blocks authentication attempts for 5 minutes, 15 minutes, or 1 hour upon consecutive biometric failures to prevent brute-force presentation attacks.

---

## 📂 Project Structure

```
e:\Road Safety\
├── NHAIFaceAuth/                    # React Native Application (TS)
│   ├── assets/models/               # Quantized INT8 TFLite model weights (7.2MB)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── faceDetection/       # Module 1: BlazeFace detection
│   │   │   ├── livenessDetection/   # Module 2: Active & Passive liveness
│   │   │   ├── faceRecognition/     # Module 3: MobileFaceNet embeddings
│   │   │   ├── dataManager/         # Module 4: Encrypted SQLite & Lockout
│   │   │   └── syncService/         # Module 5: AWS S3 sync & purge
│   │   ├── screens/                 # HomeScreen, CameraScreen, Enrollment, Dashboard
│   │   ├── components/              # Face oval mask, circular progress, result popup
│   │   ├── hooks/                   # useAuthenticationPipeline orchestrator
│   │   └── navigation/              # React Navigation routing
│   └── package.json
│
├── model_pipeline/                  # Python Model Training & Quantization
│   ├── train_mobilefacenet.py       # Fine-tuning embedding vector with ArcFace loss
│   ├── train_antispoof.py           # Training passive MobileNetV2 real/spoof classifier
│   ├── quantize_model.py            # Post-training INT8 Keras -> TFLite quantization
│   ├── export_tflite.py             # Float32 SavedModel -> TFLite export script
│   ├── benchmark.py                 # Execution latency & memory profiling
│   └── requirements.txt             # Python ML packages list
│
├── docs/                            # In-depth System Documentation
│   ├── architecture.md              # High-level architecture & sequence diagrams
│   ├── data_flow.md                 # Pixel dimensions, resizing, formats, & thresholds
│   ├── security.md                  # Database keys, lockouts, & anti-spoofing logic
│   └── benchmarks.md                # Accuracy and latency reports
│
└── presentation/                    # Hackathon Slide Deck
    ├── index.html                   # HTML self-contained slides
    └── generate_presentation.py     # Python pptx slide generation script
```

---

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v18+)
- Python (3.9+) with virtual environment
- Java Development Kit (JDK 17) & Android SDK (for Android build)
- Xcode (for iOS build, macOS required)

### 1. Install React Native Modules
```bash
cd NHAIFaceAuth
npm install
```

### 2. Native Configuration

#### Android Setup
Ensure your `android/app/build.gradle` has TFLite asset packaging configurations to prevent compression:
```groovy
android {
    aaptOptions {
        noCompress "tflite"
    }
}
```

#### iOS Setup
Run CocoaPods installation:
```bash
cd ios
pod install
cd ..
```

---

## 🐍 Model Training & Quantization

To fine-tune, export, and quantize the biometric models:

1. **Activate Environment & Install Requirements**:
   ```bash
   cd model_pipeline
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. **Run Model Training**:
   - Fine-tune MobileFaceNet: `python train_mobilefacenet.py`
   - Train Anti-Spoofing: `python train_antispoof.py`

3. **Convert & Quantize to INT8**:
   ```bash
   python export_tflite.py
   python quantize_model.py
   ```

4. **Benchmark Model Metrics**:
   ```bash
   python benchmark.py
   ```

---

## 📊 Biometric Model Performance

| Model | Task | File Size | Latency (Android Mid-Range) | TAR Accuracy |
|---|---|---|---|---|
| **BlazeFace** | Face Detection | 200 KB | 8.2 ms | - |
| **FaceMesh** | Active Liveness | 2.5 MB | 14.5 ms | 98.20% |
| **MobileNetV2** | Passive Liveness | 3.5 MB | 22.0 ms | 96.10% |
| **MobileFaceNet** | Face Match | 1.0 MB | 18.1 ms | 97.54% |
| **TOTAL** | **Full Pipeline** | **7.2 MB** | **63.9 ms** | **97.54%** |

---

## 🧪 Testing & Validation

### Run Unit Tests
```bash
cd NHAIFaceAuth
npm test
```

### Generate Coverage Report (80%+ target)
```bash
npm run test:coverage
```

### Validate TFLite Models
```bash
npm run validate:models
```

### Run Performance Benchmarks
```bash
npm run benchmark
```

---

## 🎬 Demo Mode

Enable demo mode for presentations without camera/models:

```typescript
import { DemoModeManager } from './src/demo';

const demo = DemoModeManager.getInstance();
await demo.setDemoMode(true);
await demo.loadScenario('success'); // or 'liveness_failure', 'spoof_detected', etc.

const result = await demo.simulateAuthentication();
```

**Available Scenarios:**
- ✅ Success Flow
- ❌ Liveness Failure
- 🚫 Spoof Detected
- 🔍 No Match
- 👥 Multiple Faces

**Demo Users:** 7 pre-configured users with realistic Indian profiles.

---

## 📜 License & Compliance

NHAI FaceAuth utilizes strictly open-source, permissive technologies:
- **Biometrics**: MediaPipe BlazeFace, MobileFaceNet, MobileNetV2 (Apache 2.0 / MIT).
- **Core Library**: React Native (MIT).
- **Storage**: SQLCipher via `@op-engineering/op-sqlite` (MIT / SQLCipher Community License).
- **Dependencies**: AWS-SDK v3 (Apache 2.0), NetInfo (MIT), Keychain (MIT), Reanimated (MIT).
