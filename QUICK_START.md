# ⚡ Quick Start - 5 Minutes to Running App

**Get your NHAI FaceAuth system running in 5 minutes!**

---

## 🚀 Super Fast Setup

```bash
# 1. Install dependencies (2 minutes)
cd NHAIFaceAuth
npm install

# 2. Run tests to verify (1 minute)
npm test

# 3. Validate system (30 seconds)
npm run validate:models

# 4. Start app (30 seconds)
npm start &
npm run android  # or npm run ios

# Done! App should launch in 5 minutes total
```

---

## ✅ What You Should See

### After `npm install`:
```
✓ Installed 45 packages
✓ @testing-library/react-native@12.4.3
✓ react-native-fast-tflite@3.0.1
✓ @op-engineering/op-sqlite@16.2.0
✓ All dependencies installed
```

### After `npm test`:
```
PASS  __tests__/modules/faceDetection/FaceDetector.test.ts
PASS  __tests__/modules/faceRecognition/FaceMatcher.test.ts  
PASS  __tests__/demo/DemoModeManager.test.ts
PASS  __tests__/integration/authentication.e2e.test.ts

Test Suites: 5 passed, 5 total
Tests:       42 passed, 42 total
✅ ALL TESTS PASSING
```

### After `npm run validate:models`:
```
🔍 NHAI FaceAuth Model Validator

Overall Status: ✅ PASS (or ⚠️ WARN if models missing)
Total Bundle Size: 7.2 MB / 7.2 MB

If models missing:
❌ Run: cd ../model_pipeline && python quantize_model.py
```

### After `npm run android`:
```
✓ Metro bundler started
✓ Building APK...
✓ Installing on device...
✓ App launched successfully!

You should see:
📱 Splash screen (2s) → Home screen with 3 buttons
```

---

## 🎬 For Hackathon Demo (30 Seconds)

```bash
# Enable demo mode - NO CAMERA NEEDED!
# 1. Launch app
# 2. Tap "Dashboard"
# 3. Enable "Demo Mode" toggle
# 4. Back to home → Tap "Authenticate"
# 5. Watch realistic 800ms authentication
# 6. See "Welcome, Ramesh Kumar!" ✅

# Switch scenarios:
# Dashboard → Demo Settings → Select scenario:
# - Success Flow (shows happy path)
# - Spoof Detected (shows security)
# - Liveness Failure (shows robustness)
```

---

## 📊 Quick Verification

```bash
# All green? You're ready! 🎉
npm test                    # ✅ Should show: Tests: X passed
npm run test:coverage       # ✅ Should show: >80% coverage
npm run validate:models     # ✅ Should show: All models valid
```

---

## 🆘 If Something Fails

### Tests Fail?
```bash
npm test -- --clearCache
npm install
npm test
```

### Models Missing?
```bash
# Models are in model_pipeline output
# Copy them to assets:
cp ../model_pipeline/output/*.tflite assets/models/
npm run validate:models
```

### App Won't Build?
```bash
# Android:
cd android && ./gradlew clean && cd ..
npm run android

# iOS:
cd ios && pod install && cd ..
npm run ios
```

---

## 🏆 You're Ready When:

- ✅ `npm test` shows all passing
- ✅ `npm run validate:models` shows ✅ PASS
- ✅ App launches to home screen
- ✅ Demo mode works (enable in Dashboard)

**That's it! Your hackathon submission is ready! 🚀**

---

## 📞 Need Help?

1. Check `COMPLETE_SETUP_GUIDE.md` for detailed troubleshooting
2. Check `IMPLEMENTATION_SUMMARY.md` for what was built
3. Check `docs/testing_guide.md` for testing details
4. Check `HACKATHON_SUBMISSION.md` for criteria checklist
