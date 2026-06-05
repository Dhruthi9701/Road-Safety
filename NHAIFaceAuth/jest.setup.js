// Mock React Native modules
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  },
}));

// Mock op-sqlite
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(),
    executeAsync: jest.fn(() => Promise.resolve({ rows: { _array: [] } })),
    close: jest.fn(),
  })),
}));

// Mock TFLite model files
jest.mock('../assets/models/face_detection_short_range.tflite', () => ({}));
jest.mock('../assets/models/face_landmark_192.tflite', () => ({}));
jest.mock('../assets/models/mobilefacenet_int8.tflite', () => ({}));
jest.mock('../assets/models/antispoof_mobilenetv2_int8.tflite', () => ({}));

// Mock react-native-vision-camera
jest.mock('react-native-vision-camera', () => ({
  Camera: {
    getAvailableCameraDevices: jest.fn(() => Promise.resolve([])),
  },
  useCameraDevices: jest.fn(() => ({ back: null, front: null })),
  useFrameProcessor: jest.fn(),
}));

// Mock react-native-fast-tflite
jest.mock('react-native-fast-tflite', () => ({
  TensorflowModel: {
    loadModel: jest.fn(),
  },
}));

// Mock react-native-fs
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/path',
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
  writeFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('')),
  unlink: jest.fn(() => Promise.resolve()),
}));

// Mock other native modules
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(() => Promise.resolve()),
  getGenericPassword: jest.fn(() => Promise.resolve({ password: 'mock' })),
  resetGenericPassword: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-device-info', () => ({
  getUniqueId: jest.fn(() => Promise.resolve('mock-device-id')),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
  addEventListener: jest.fn(),
}));
