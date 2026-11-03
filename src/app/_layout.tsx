import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgTop } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ticket/revisar" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="ticket/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ajustes" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="productos" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="producto/[id]" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}
