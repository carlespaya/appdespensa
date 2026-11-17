import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { GlassButton, GlassCard } from '@/components/Glass';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { installedVersion } from '@/services/updates';
import { colors, radius, space, type } from '@/theme/tokens';

/** Aviso en Inicio cuando hay una versión nueva del APK publicada en GitHub. */
export function UpdateBanner() {
  const { status, update, progress, error, install } = useAppUpdate({ autoCheck: true });
  const [hidden, setHidden] = useState(false);
  if (hidden || !update || !['available', 'downloading', 'error'].includes(status)) return null;

  return (
    <Animated.View entering={FadeInDown} exiting={FadeOut} style={{ marginBottom: space.lg }}>
      <GlassCard strong>
        <View style={styles.row}>
          <View style={styles.icon}>
            <Ionicons name="arrow-down-circle" size={22} color={colors.mint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.subtitle}>Nueva versión {update.version}</Text>
            <Text style={type.caption}>
              Tienes la {installedVersion()} · {update.sizeMb} MB · tus datos se conservan
            </Text>
          </View>
          {status !== 'downloading' && (
            <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityLabel="Más tarde">
              <Ionicons name="close" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        </View>
        {!!update.notes && (
          <Text style={[type.caption, { marginTop: space.md, color: colors.text }]} numberOfLines={4}>
            {update.notes}
          </Text>
        )}
        {status === 'downloading' ? (
          <View style={{ marginTop: space.md }}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.max(4, progress * 100)}%` }]} />
            </View>
            <Text style={[type.caption, { marginTop: 6 }]}>Descargando… {Math.round(progress * 100)} %</Text>
          </View>
        ) : (
          <GlassButton label="Actualizar ahora" onPress={install} style={{ marginTop: space.md }} icon={<Ionicons name="download-outline" size={18} color={colors.onAccent} />} />
        )}
        {status === 'error' && <Text style={[type.caption, { color: colors.warning, marginTop: space.sm }]}>{error}</Text>}
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(61,245,176,0.12)' },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.mint },
});
