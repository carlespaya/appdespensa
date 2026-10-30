import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';

import { colors, gradients } from '@/theme/tokens';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={String(color)} size={size} />;
  };
}

/** Botón central de escaneo: la acción principal está siempre a un toque. */
function ScanIcon() {
  return (
    <LinearGradient colors={gradients.mint} style={styles.scan}>
      <Ionicons name="scan" size={26} color={colors.onAccent} />
    </LinearGradient>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.mint,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: styles.bar,
        tabBarBackground: () =>
          Platform.OS === 'android' ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFallback }]} />
          ) : (
            <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
          ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="historial" options={{ title: 'Historial', tabBarIcon: icon('receipt-outline') }} />
      <Tabs.Screen name="escanear" options={{ title: '', tabBarIcon: () => <ScanIcon />, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="comparar" options={{ title: 'Comparar', tabBarIcon: icon('git-compare-outline') }} />
      <Tabs.Screen name="cesta" options={{ title: 'Cesta', tabBarIcon: icon('basket-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    height: 74,
    paddingTop: 8,
    paddingBottom: 14,
    borderRadius: 28,
    overflow: 'hidden',
    borderTopWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  scan: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    shadowColor: colors.mint,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
});
