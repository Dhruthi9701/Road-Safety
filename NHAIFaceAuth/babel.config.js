module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Reanimated plugin MUST be listed last
    'react-native-reanimated/plugin',
    [
      'module-resolver',
      {
        root: ['.'],
        extensions: ['.ios.ts', '.android.ts', '.ts', '.ios.tsx', '.android.tsx', '.tsx', '.jsx', '.js', '.json'],
        alias: {
          '@modules': './src/modules',
          '@screens': './src/screens',
          '@components': './src/components',
          '@hooks': './src/hooks',
          '@utils': './src/utils',
          '@constants': './src/constants',
          '@assets': './assets',
        },
      },
    ],
  ],
};
