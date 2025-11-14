import { AppRegistry } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/**
 * @format
 */
import App from './App';
import { name as appName } from './app.json';

const RootApp = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <App />
  </GestureHandlerRootView>
);

AppRegistry.registerComponent(appName, () => RootApp);

