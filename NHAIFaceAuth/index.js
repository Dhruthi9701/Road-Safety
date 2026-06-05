/**
 * NHAI FaceAuth — App Entry Point
 * @module index
 */
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// Polyfills for AWS SDK
import 'react-native-get-random-values';

AppRegistry.registerComponent(appName, () => App);
