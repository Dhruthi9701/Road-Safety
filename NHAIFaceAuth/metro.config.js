const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration for NHAI FaceAuth
 * Configured to bundle .tflite model files as assets
 * @see https://reactnative.dev/docs/metro
 */
const config = {
  resolver: {
    // Add .tflite to the list of asset extensions so models are bundled
    assetExts: [
      ...getDefaultConfig(__dirname).resolver.assetExts,
      'tflite',
      'bin',
    ],
    // Remove .tflite from source extensions if present
    sourceExts: getDefaultConfig(__dirname).resolver.sourceExts.filter(
      ext => ext !== 'tflite',
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
