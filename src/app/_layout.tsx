import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_700Bold,
  InterTight_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter-tight';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useShareListener } from '@/lib/share';
import { StoreProvider, useStore } from '@/lib/store';
import { fonts, useColors } from '@/lib/theme';

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
  const [fontsLoaded, fontError] = useFonts({
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_700Bold,
    InterTight_800ExtraBold,
  });
  const ready = authReady && (fontsLoaded || !!fontError);
  useShareListener(!!session);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontFamily: fonts.bold },
          contentStyle: { backgroundColor: c.bg },
        }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* Public, read-only shared folders — no sign-in needed. */}
        <Stack.Screen name="s/[token]" options={{ headerShown: false }} />
        {/* Invite to a collaborative folder; asks to sign in first when needed. */}
        <Stack.Screen name="join/[token]" options={{ headerShown: false }} />
        {/* Password-reset email lands here with a recovery session (or an error if the link expired). */}
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
