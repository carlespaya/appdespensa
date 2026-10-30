import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, gradients, space, type } from '@/theme/tokens';

/** Fondo profundo con dos "orbes" de color difuminados: lo que el cristal deja entrever. */
export function Backdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={gradients.background} style={StyleSheet.absoluteFill} />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="orbMint" cx="85%" cy="5%" r="60%">
            <Stop offset="0" stopColor={colors.orbMint} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.orbMint} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="orbBlue" cx="5%" cy="75%" r="65%">
            <Stop offset="0" stopColor={colors.orbBlue} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.orbBlue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#orbMint)" />
        <Rect width="100%" height="100%" fill="url(#orbBlue)" />
      </Svg>
    </View>
  );
}

interface ScreenProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}

export function Screen({ title, subtitle, right, children, scroll = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {subtitle && <Text style={type.overline}>{subtitle}</Text>}
        <Text style={type.display}>{title}</Text>
      </View>
      {right}
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <Backdrop />
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + 120, paddingHorizontal: space.lg }}
          showsVerticalScrollIndicator={false}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + space.lg, paddingHorizontal: space.lg }}>
          {header}
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgTop },
  header: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: space.lg, gap: space.md },
});
