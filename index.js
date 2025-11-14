import 'react-native-reanimated';
import { AppRegistry } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * @format
 */
import App from './App';

const RootApp = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <App />
  </GestureHandlerRootView>
);

AppRegistry.registerComponent('DocScanPro3Temp', () => RootApp);

