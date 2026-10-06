import './src/global.css';

import { PortalHost } from '@rn-primitives/portal';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/contexts/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeProvider, useThemeContext } from './src/theme/ThemeContext';

const ThemedRoot: React.FC = () => {
  const { scheme } = useThemeContext();
  return (
    <View className="bg-background flex-1">
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
      <PortalHost />
    </View>
  );
};

const App: React.FC = () => (
  <SafeAreaProvider>
    <ThemeProvider>
      <AuthProvider>
        <ThemedRoot />
      </AuthProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

export default App;
