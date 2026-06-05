# TFLite Model Files

This directory must contain the 4 quantized INT8 TFLite models for the NHAI FaceAuth system.

## Required Models

### 1. blazeface.tflite
- **Purpose**: Face detection (BlazeFace short-range)
- **Size**: ~200 KB (max 250 KB)
- **Input**: [1, 128, 128, 3] (RGB image)
- **Output**: [1, 896, 16] (anchor boxes + keypoints)
- **Quantization**: INT8 post-training quantization

### 2. facemesh.tflite
- **Purpose**: Facial landmark detection for active liveness
- **Size**: ~2.5 MB (max 3 MB)
- **Input**: [1, 192, 192, 3] (RGB image)
- **Output**: [1, 468, 3] (468 3D facial landmarks)
- **Quantization**: INT8 post-training quantization

### 3. antispoof.tflite
- **Purpose**: Passive anti-spoofing (photo/video attack detection)
- **Size**: ~3.5 MB (max 4 MB)
- **Input**: [1, 224, 224, 3] (RGB face crop)
- **Output**: [1, 2] (spoof_prob, real_prob)
- **Quantization**: INT8 post-training quantization
- **Architecture**: MobileNetV2 binary classifier

### 4. mobilefacenet.tflite
- **Purpose**: Face recognition embedding generation
- **Size**: ~1.0 MB (max 1.5 MB)
- **Input**: [1, 112, 112, 3] (aligned RGB face)
- **Output**: [1, 128] (128D face embedding)
- **Quantization**: INT8 post-training quantization

## Total Bundle Size

- **Target**: 7.2 MB total
- **Hard Limit**: 8.0 MB total
- **Current**: Run `npm run validate:models` to check

## Generating Models

If models are missing, generate them using the Python training pipeline:

```bash
cd model_pipeline

# Activate virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Train models
python train_mobilefacenet.py
python train_antispoof.py

# Export to TFLite
python export_tflite.py

# Quantize to INT8
python quantize_model.py

# Copy to assets folder
cp output/*.tflite ../NHAIFaceAuth/assets/models/
```

## Validating Models

To verify all models are present and valid:

```bash
cd NHAIFaceAuth
npm run validate:models
```

This will check:
- ✅ File existence
- ✅ File size within limits
- ✅ TFLite loadability
- ✅ Total bundle size

## Android Configuration

Ensure `android/app/build.gradle` prevents model compression:

```groovy
android {
    aaptOptions {
        noCompress "tflite"
    }
}
```

## iOS Configuration

Models are automatically bundled. Verify they appear in Xcode project resources.

## Troubleshooting

**Model not found error:**
- Verify files are in `NHAIFaceAuth/assets/models/` directory
- Check file names match exactly (lowercase, .tflite extension)
- Run clean build: `npm run clean && npm run android`

**Model too large error:**
- Re-run quantization: `python quantize_model.py`
- Verify INT8 quantization (not FLOAT32)
- Check model architecture complexity

**Model fails to load:**
- Verify TFLite version compatibility
- Check model format (TFLite 2.x format)
- Test model in Python first: `python benchmark.py`

## Security

⚠️ **Do not commit models to public repositories** if they contain proprietary training data. Use `.gitignore`:

```
assets/models/*.tflite
```

For hackathon submission, models can be included or provided separately via secure download link.
