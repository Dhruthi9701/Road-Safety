# NHAI FaceAuth — Data Flow & Preprocessing Pipeline

This document describes the data flow, pixel formats, dimensions, and model-specific inputs/outputs in the biometric authentication pipeline.

---

## 1. Camera Frame Acquisition & Preprocessing

```
[Camera Sensor] 
      │ 
      ▼ (YUV 420_888 / RGBA Frame)
[Vision Camera Frame Processor] 
      │ 
      ▼ (worklet thread)
[vision-camera-resize-plugin] 
      │ 
      ├─► Scale to 128x128 RGB Float32 ──► [Face Detection Model]
      ├─► Crop face region (with 20% padding)
      │         │
      │         ▼
      │   Scale to 224x224 RGB Float32 ──► [Anti-Spoofing Model]
      │
      └─► Align using 5 Keypoints (Affine Warp)
                │
                ▼
          Scale to 112x112 RGB Float32 ──► [MobileFaceNet Recognition]
```

---

## 2. Preprocessing Steps & Formats

### YUV to RGB Conversion & Resizing
Android camera frames are typically emitted in `YUV_420_888` planar format, while iOS frames are emitted in `Biplanar YCbCr`. To process frames through TensorFlow Lite, they must be converted to RGB format and scaled to model-specific inputs.

We achieve this in the JSI thread using `vision-camera-resize-plugin`, which executes high-performance native YUV-to-RGB conversion and bilinear resizing.

### Normalization Formulae
Before models run, input float arrays must be scaled to expected numeric intervals:

1. **Face Detection (BlazeFace)**:
   - Target Size: 128 × 128 × 3 (RGB)
   - Value Range: `[0.0, 1.0]` or `[-1.0, 1.0]` (depending on model quantization).
   - Normalization: `pixel / 255.0`

2. **Anti-Spoofing (MobileNetV2)**:
   - Target Size: 224 × 224 × 3 (RGB)
   - Value Range: `[0.0, 1.0]`
   - Normalization: `pixel / 255.0`

3. **Face Recognition (MobileFaceNet)**:
   - Target Size: 112 × 112 × 3 (RGB)
   - Value Range: `[-1.0, 1.0]`
   - Normalization: `(pixel - 127.5) / 128.0`

---

## 3. Biometric Model Inputs & Outputs

| Model Name | Input Tensor Shape | Input Type | Output Tensor Shape | Output Meaning |
|---|---|---|---|---|
| **BlazeFace** (Short Range) | `[1, 128, 128, 3]` | `INT8` / `FP32` | `[1, 896, 16]` / `[1, 896, 1]` | Regressors (Bounding box coordinates + 6 keypoints) and Classifiers (Scores) |
| **FaceMesh** (Landmarks) | `[1, 192, 192, 3]` | `INT8` / `FP32` | `[1, 1404]` / `[1, 1]` | 468 3D landmarks (x, y, z coords) and Liveness score |
| **Anti-Spoof** (MobileNetV2) | `[1, 224, 224, 3]` | `INT8` | `[1, 2]` | `[real_face_probability, spoof_face_probability]` |
| **MobileFaceNet** (Embedding) | `[1, 112, 112, 3]` | `INT8` | `[1, 128]` | 128-dimensional face embedding vector |

---

## 4. Biometric Decisions & Match Logic

### 4.1 Eye Aspect Ratio (EAR)
Used to detect blinks. EAR is computed using 6 coordinates per eye:
$$EAR = \frac{||p_2 - p_6|| + ||p_3 - p_5||}{2 \cdot ||p_1 - p_4||}$$

- **Blink Criteria**: EAR falls below `0.21` (or `0.18` when glasses are detected) and transitions back above within 500ms.

### 4.2 Mouth Aspect Ratio (MAR)
Used to detect smiles. MAR tracks width vs height:
$$MAR = \frac{||p_{lip\_upper} - p_{lip\_lower}||}{||p_{mouth\_left} - p_{mouth\_right}||}$$
- **Smile Criteria**: MAR exceeds `0.45` and sustains for at least 300ms.

### 4.3 Cosine Similarity
Used to compare a live embedding ($A$) against an enrolled embedding ($B$):
$$Similarity = \cos(\theta) = \frac{A \cdot B}{||A|| \cdot ||B||}$$

Since both vectors are L2-normalized during embedding generation ($||A|| = 1$, $||B|| = 1$), the calculation simplifies to a simple dot product:
$$Similarity = A \cdot B = \sum_{i=1}^{128} A_i B_i$$

### 4.4 Match Threshold Classification
- **`> 0.85`**: **High Confidence Match** — access granted.
- **`0.70 - 0.85`**: **Low Confidence Match** — reject + request retry (poor lighting/angle).
- **`< 0.70`**: **No Match** — access denied.
