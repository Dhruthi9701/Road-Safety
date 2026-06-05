# NHAI FaceAuth — Security Architecture

This document describes the security layers, encryption protocols, access controls, and anti-spoofing policies integrated into the NHAI FaceAuth system.

---

## 1. Secure Local Database Storage

### 1.1 Full Database Encryption (AES-256)
The application secures all stored data (enrolled worker profiles, face embeddings, authentication logs, and settings) using full database encryption. 
- **Database Engine**: `@op-engineering/op-sqlite` compiled with **SQLCipher** bindings.
- **Algorithm**: **AES-256-CBC** encryption applied to all database pages.
- **Key Generation**: A cryptographically secure random 256-bit key (64 hex characters) is generated on first launch using `crypto.getRandomValues`.

### 1.2 Hardware-Backed Key Storage
The database encryption key is never written in plaintext files, preferences, or AsyncStorage. Instead, it is stored in the device's secure hardware modules using the `react-native-keychain` wrapper:
- **Android**: Stored inside **Android Keystore**, encrypted with hardware-backed keys.
- **iOS**: Stored in the **iOS Keychain** sandbox, isolated from other applications.

```
[Launch App] ──► [KeyManager] ──► Fetch AES-256 Key from Keychain/Keystore
                                           │
                                           ▼ (Decrypt on-the-fly)
                                [DatabaseManager] ──► Open Encrypted SQLite
```

---

## 2. Biometric Anti-Spoofing & Liveness Countermeasures

To protect toll stations against fraudulent check-ins (printed photos, tablet video replays, 3D masks), the biometric pipeline uses two concurrent security layers:

```
                  [Camera Video Frame]
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
     [Active Challenge]             [Passive Spoof Classifier]
   - Random 1-2 actions           - MobileNetV2 Binary Network
   - Blink, Smile, Turn, Nod      - Classifies Print vs Screen vs Mask
   - Landmarks tracking           - Softmax threshold > 0.80
            │                               │
            └───────────────┬───────────────┘
                            ▼
                  [Biometric Verdict]
```

### 2.1 Active Challenges (Landmark-Based)
The user is prompted with random challenges (e.g. smile, nod). We track 468 3D landmarks to verify motion:
- **Challenge Randomization**: Challenges are chosen randomly. A sliding window history prevents repeats within 5 minutes to prevent recording playback attacks.
- **Blink Counter-Measures**: Eye Aspect Ratio (EAR) measures blinking. If the user wears glasses, thresholds are scaled automatically to prevent occlusions from throwing false failures.

### 2.2 Passive Anti-Spoofing (Deep Learning)
A MobileNetV2 classifier processes a crop of the face. It evaluates texture, micro-reflections, and edge characteristics:
- **Spoofing Score**: The network outputs a real/spoof probability. Real score must exceed `0.80`.
- **Classification**: Detects attacks such as printed photos, tablet playbacks, or synthetic masks.

---

## 3. Lockout & Brute-Force Protection

To prevent brute-force database attacks using static photo reels or synthetic masks, a strict device lockout protocol is enforced by the `LockoutManager`:

| Consecutive Failures | Lockout Duration | Action Taken |
|---|---|---|
| **3 Failures** | **5 Minutes** | Device blocks camera frame processing. Displays lockout cooldown timer. |
| **5 Failures** | **15 Minutes** | Blocks camera processing. Cleans up stale logs to secure memory space. |
| **10 Failures** | **1 Hour** | Active lockout, alerts NHAI supervisor, and flags logs for immediate upload when online. |

---

## 4. Secure AWS Sync & Purge Protocol

- **End-to-End Encryption**: Batch payloads are compressed using Gzip, encrypted over HTTPS (TLS 1.3), and uploaded to AWS S3.
- **Upload Verification**: MD5 checksums verify data integrity between S3 and the client before logs are flagged as synced.
- **Sync & Purge Policy**: Logs are marked synced and purged locally after 7 days to prevent database bloating, preserving user privacy. Enrolled workers are never purged.
