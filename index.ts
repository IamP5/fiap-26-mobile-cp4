import { registerRootComponent } from 'expo';

import App from './App';
import { registerBackgroundHandler } from './src/services/push/nativeMessaging';

// FCM requires its background handler to be registered at startup, outside
// any component (it also runs when the app is woken in the background).
registerBackgroundHandler();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
