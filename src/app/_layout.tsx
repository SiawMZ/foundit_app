import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useShareListener } from '@/lib/share';
import { StoreProvider, useStore } from '@/lib/store';
import { useColors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <StoreProvider>
      <RootStack />
    </StoreProvider>
  );
}

function RootStack() {
  const { session, authReady } = useStore();
  const c = useColors();
  useShareListener(!!session);

  useEffect(() => {
    if (authReady) SplashScreen.hideAsync();
  }, [authReady]);

  if (!authReady) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: c.bg },
        }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="index" options={{ title: 'Linkbox' }} />
          <Stack.Screen name="add" options={{ title: 'Save link', presentation: 'modal' }} />
          <Stack.Screen
            name="link/[id]"
            options={
              Platform.OS === 'web'
                ? // Web: panel over the grid (see Frame in link/[id].tsx).
                  { presentation: 'transparentModal', headerShown: false, animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }
                : { title: '' }
            }
          />
          <Stack.Screen name="folders" options={{ title: 'Folders' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
