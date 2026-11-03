import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassButton, GlassCard } from '@/components/Glass';
import { Backdrop } from '@/components/Screen';
import { parseReceipt } from '@/core/receiptParser';
import { demoOcr, ocr } from '@/services/ocr';
import { useAppStore } from '@/store/useAppStore';
import { colors, radius, space, type } from '@/theme/tokens';

type Phase = 'camera' | 'processing' | 'error';

const FRAME_H = 440;

/** Línea de escaneo que recorre el marco: feedback visual de que la cámara está "leyendo". */
function ScanLine({ active }: { active: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = 0;
    y.value = withRepeat(withTiming(FRAME_H - 4, { duration: active ? 900 : 2200, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [active, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[styles.scanLine, style]} />;
}

export default function Scan() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('camera');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const camera = useRef<CameraView>(null);
  const setDraft = useAppStore((s) => s.setDraftFromParsed);
  const ocrApiKey = useAppStore((s) => s.settings.ocrApiKey);

  // Al volver a la pestaña se reinicia el estado (la cámara se monta solo con foco).
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setPhase('camera');
      return () => setFocused(false);
    }, []),
  );

  const process = async (image: { uri: string }, demo = false) => {
    setPhase('processing');
    try {
      let text = demo ? await demoOcr.recognize(image) : await ocr.recognize(image, { apiKey: ocrApiKey, engine: 2 });
      let parsed = parseReceipt(text);
      // Si la lectura rápida sale pobre, se reintenta con el motor de mayor precisión.
      if (!demo && (parsed.lines.length < 2 || parsed.totalMismatch)) {
        const retryText = await ocr.recognize(image, { apiKey: ocrApiKey, engine: 3 }).catch(() => null);
        const retry = retryText ? parseReceipt(retryText) : null;
        if (retry && retryText && (retry.lines.length > parsed.lines.length || (!retry.totalMismatch && parsed.totalMismatch))) {
          parsed = retry;
          text = retryText;
        }
      }
      if (parsed.lines.length === 0) throw new Error('No hemos encontrado productos. Prueba con más luz, el ticket estirado y sin sombras.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDraft(parsed, image.uri, text);
      router.push('/ticket/revisar');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al leer el ticket');
      setPhase('error');
    }
  };

  const capture = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const photo = await camera.current?.takePictureAsync({ quality: 0.85 });
    if (photo) process(photo);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled && result.assets[0]) process({ uri: result.assets[0].uri });
  };

  const canUseCamera = Platform.OS !== 'web' && permission?.granted;

  return (
    <View style={styles.root}>
      <Backdrop />
      {canUseCamera && focused && (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
      )}
      <View style={[styles.overlay, { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.navigate('/')} style={styles.close} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <Text style={type.subtitle}>Escanear ticket</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <ScanLine active={phase === 'processing'} />
          {!canUseCamera && phase === 'camera' && (
            <View style={styles.center}>
              <Ionicons name="receipt-outline" size={48} color={colors.textFaint} />
              <Text style={[type.caption, { textAlign: 'center', marginTop: space.md }]}>
                {Platform.OS === 'web' ? 'La cámara está disponible en la app móvil.' : 'Necesitamos acceso a la cámara para leer tus tickets.'}
              </Text>
            </View>
          )}
        </View>

        {phase === 'processing' && (
          <Animated.View entering={FadeIn}>
            <GlassCard strong>
              <View style={styles.status}>
                <ActivityIndicator color={colors.mint} />
                <Text style={type.subtitle}>Leyendo productos y precios…</Text>
              </View>
            </GlassCard>
          </Animated.View>
        )}
        {phase === 'error' && (
          <GlassCard strong>
            <View style={styles.status}>
              <Ionicons name="alert-circle" size={20} color={colors.warning} />
              <Text style={[type.body, { flex: 1 }]}>{error}</Text>
            </View>
          </GlassCard>
        )}

        {phase !== 'processing' && (
          <View style={styles.actions}>
            {canUseCamera ? (
              <Pressable onPress={capture} disabled={!ready} style={[styles.shutter, !ready && { opacity: 0.4 }]}>
                <View style={styles.shutterInner} />
              </Pressable>
            ) : Platform.OS !== 'web' && !permission?.granted ? (
              <GlassButton label="Permitir cámara" onPress={requestPermission} />
            ) : null}
            <View style={styles.row}>
              <GlassButton
                variant="ghost"
                label="Galería"
                icon={<Ionicons name="images-outline" size={18} color={colors.text} />}
                onPress={pickFromGallery}
                style={{ flex: 1 }}
              />
              <GlassButton variant="ghost" label="Ejemplo" onPress={() => process({ uri: '' }, true)} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const C = 28;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  frame: { height: FRAME_H, marginHorizontal: space.md, borderRadius: radius.lg, overflow: 'hidden' },
  corner: { position: 'absolute', width: C, height: C, borderColor: colors.mint },
  tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: radius.lg },
  tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: radius.lg },
  bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: radius.lg },
  br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: radius.lg },
  scanLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.mint,
    shadowColor: colors.mint,
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  actions: { alignItems: 'center', gap: space.md },
  row: { flexDirection: 'row', gap: space.md, alignSelf: 'stretch' },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.mint },
});
