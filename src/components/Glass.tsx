import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, gradients, radius, shadow, space, type } from '@/theme/tokens';

// En Android el blur real exige envolver el fondo en BlurTargetView; para listas largas
// usamos un relleno translúcido equivalente, que rinde mejor y se ve casi igual sobre fondo oscuro.
const nativeBlur = Platform.OS !== 'android';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  strong?: boolean;
}

export function GlassCard({ children, style, padded = true, strong }: GlassCardProps) {
  return (
    <View style={[styles.cardOuter, style]}>
      {nativeBlur ? (
        <BlurView intensity={strong ? 40 : 24} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFallback }]} />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: strong ? colors.glassFillStrong : colors.glassFill }]} />
      {/* Borde superior iluminado: da la sensación de cristal biselado. */}
      <LinearGradient
        colors={[colors.glassHighlight, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.6 }}
        style={[StyleSheet.absoluteFill, styles.highlight]}
        pointerEvents="none"
      />
      <View style={padded && styles.padded}>{children}</View>
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'mint' | 'blue' | 'ghost';
  icon?: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function GlassButton({ label, onPress, variant = 'mint', icon, disabled, style }: ButtonProps) {
  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };
  const content = (
    <View style={styles.btnInner}>
      {icon}
      <Text style={[styles.btnLabel, { color: variant === 'ghost' ? colors.text : colors.onAccent }]}>{label}</Text>
    </View>
  );
  return (
    <Pressable
      onPress={press}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, { opacity: disabled ? 0.4 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
    >
      {variant === 'ghost' ? (
        <View style={[styles.btnFill, styles.ghost]}>{content}</View>
      ) : (
        <LinearGradient colors={variant === 'mint' ? gradients.mint : gradients.blue} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnFill}>
          {content}
        </LinearGradient>
      )}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      {color && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[type.caption, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={type.overline}>{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[type.caption, { color: colors.mint }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    ...shadow,
  },
  highlight: { opacity: 0.25, borderRadius: radius.lg },
  padded: { padding: space.lg },
  btn: { borderRadius: radius.pill, overflow: 'hidden' },
  btnFill: { paddingVertical: 15, paddingHorizontal: space.xl, borderRadius: radius.pill },
  ghost: { backgroundColor: colors.glassFillStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  btnLabel: { fontSize: 16, fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.glassFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  chipActive: { backgroundColor: 'rgba(61, 245, 176, 0.16)', borderColor: 'rgba(61, 245, 176, 0.5)' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xl, marginBottom: space.sm },
});
