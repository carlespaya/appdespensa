import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Chip, GlassButton, GlassCard, SectionHeader } from '@/components/Glass';
import { Screen } from '@/components/Screen';
import { findNearbyChains } from '@/services/nearby';
import { useAppStore } from '@/store/useAppStore';
import { colors, radius, space, type } from '@/theme/tokens';

const toNumber = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const fmt = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','));

/** Campo numérico que deja escribir con coma y vacía = sin valor. */
function NumberField({ value, onChange, suffix, placeholder }: { value?: number; onChange: (n?: number) => void; suffix: string; placeholder?: string }) {
  const [text, setText] = useState(fmt(value));
  return (
    <View style={styles.numField}>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          onChange(toNumber(t));
        }}
        keyboardType="decimal-pad"
        placeholder={placeholder ?? '—'}
        placeholderTextColor={colors.textFaint}
        style={[type.body, type.number, styles.numInput]}
      />
      <Text style={type.caption}>{suffix}</Text>
    </View>
  );
}

function Row({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{title}</Text>
        {subtitle && <Text style={type.caption}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

const switchColors = { trackColor: { true: colors.mintDeep, false: 'rgba(255,255,255,0.15)' }, thumbColor: colors.text };

export default function Settings() {
  const { settings, updateSettings, stores, updateStore, applyNearby, clearDemoData, receipts } = useAppStore();
  const [nearby, setNearby] = useState<{ loading: boolean; message?: string }>({ loading: false });
  const demoCount = receipts.filter((r) => r.id.startsWith('demo-')).length;
  const sortedStores = [...stores].sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));

  const detectNearby = async () => {
    setNearby({ loading: true });
    try {
      const chains = await findNearbyChains(stores);
      applyNearby(chains);
      setNearby({
        loading: false,
        message: chains.length
          ? `Encontrados ${chains.length} supermercados a menos de 5 km. Distancias actualizadas.`
          : 'No hemos encontrado supermercados conocidos a menos de 5 km.',
      });
    } catch (e) {
      setNearby({ loading: false, message: e instanceof Error ? e.message : 'No se pudo obtener la ubicación.' });
    }
  };

  return (
    <Screen
      subtitle="Personaliza Despensa"
      title="Ajustes"
      right={
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      }
    >
      <SectionHeader title="Perfil" />
      <GlassCard>
        <Text style={type.caption}>¿Cómo te llamamos?</Text>
        <TextInput
          value={settings.userName}
          onChangeText={(userName) => updateSettings({ userName })}
          placeholder="Tu nombre"
          placeholderTextColor={colors.textFaint}
          style={[type.subtitle, styles.textField]}
        />
      </GlassCard>

      <SectionHeader title="Límites de gasto" />
      <GlassCard>
        <Row title="Límite mensual" subtitle="Te avisamos al llegar al 80 %">
          <NumberField value={settings.monthlyLimit} onChange={(monthlyLimit) => updateSettings({ monthlyLimit })} suffix="€/mes" placeholder="Sin límite" />
        </Row>
        <Text style={[type.overline, { marginTop: space.lg, marginBottom: space.xs }]}>Por supermercado</Text>
        {stores
          .filter((s) => s.enabled !== false)
          .map((s) => (
            <Row key={s.id} title={s.name}>
              <NumberField value={s.monthlyLimit} onChange={(monthlyLimit) => updateStore(s.id, { monthlyLimit })} suffix="€/mes" />
            </Row>
          ))}
      </GlassCard>

      <SectionHeader title="Mis supermercados" />
      <GlassCard>
        <GlassButton
          variant="blue"
          label={nearby.loading ? 'Buscando…' : 'Detectar cercanos con mi ubicación'}
          icon={nearby.loading ? <ActivityIndicator color={colors.onAccent} /> : <Ionicons name="location" size={18} color={colors.onAccent} />}
          onPress={detectNearby}
          disabled={nearby.loading}
        />
        {nearby.message && <Text style={[type.caption, { marginTop: space.sm }]}>{nearby.message}</Text>}
        <Text style={[type.caption, { marginTop: space.md }]}>
          ★ marca tus favoritos. Desactiva los que no quieras que te sugiramos. La distancia (km) se usa para decidir si compensa ir.
        </Text>
        {sortedStores.map((s) => (
          <View key={s.id} style={[styles.storeRow, s.enabled === false && { opacity: 0.45 }]}>
            <Pressable onPress={() => updateStore(s.id, { preferred: !s.preferred })} hitSlop={8}>
              <Ionicons name={s.preferred ? 'star' : 'star-outline'} size={20} color={s.preferred ? colors.warning : colors.textFaint} />
            </Pressable>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{s.name}</Text>
            <NumberField key={`${s.id}-${s.distanceKm}`} value={s.distanceKm} onChange={(distanceKm) => updateStore(s.id, { distanceKm })} suffix="km" />
            <Switch value={s.enabled !== false} onValueChange={(enabled) => updateStore(s.id, { enabled })} {...switchColors} />
          </View>
        ))}
      </GlassCard>

      <SectionHeader title="Cesta óptima" />
      <GlassCard>
        <Text style={type.caption}>Máximo de supermercados por compra</Text>
        <View style={styles.chips}>
          {[1, 2, 3].map((n) => (
            <Chip key={n} label={n === 1 ? 'Solo uno' : `Hasta ${n}`} active={settings.maxStores === n} onPress={() => updateSettings({ maxStores: n })} />
          ))}
        </View>
        <Text style={[type.caption, { marginTop: space.md }]}>¿Cuánto ahorro mínimo compensa una parada extra?</Text>
        <View style={styles.chips}>
          {[0, 1.5, 3, 5].map((n) => (
            <Chip key={n} label={n === 0 ? 'Cualquiera' : `${fmt(n)} €`} active={settings.extraStorePenalty === n} onPress={() => updateSettings({ extraStorePenalty: n })} />
          ))}
        </View>
        <Row title="Tener en cuenta la distancia" subtitle="Suma el coste de desplazarte">
          <Switch value={settings.useLocation} onValueChange={(useLocation) => updateSettings({ useLocation })} {...switchColors} />
        </Row>
        <Row title="Solo mis favoritos" subtitle="Calcula la cesta solo con los marcados con ★">
          <Switch value={settings.onlyPreferred} onValueChange={(onlyPreferred) => updateSettings({ onlyPreferred })} {...switchColors} />
        </Row>
      </GlassCard>

      <SectionHeader title="Lectura de tickets" />
      <GlassCard>
        <Text style={type.body}>Clave de OCR.space</Text>
        <Text style={type.caption}>
          El escaneo usa OCR.space (gratis, 25.000 tickets/mes). Sin clave se usa la de demostración, que es compartida y puede saturarse. Consigue la tuya gratis en un minuto.
        </Text>
        <TextInput
          value={settings.ocrApiKey}
          onChangeText={(ocrApiKey) => updateSettings({ ocrApiKey: ocrApiKey.trim() })}
          placeholder="Pega aquí tu clave (opcional)"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={[type.body, styles.textField]}
        />
        <Pressable onPress={() => Linking.openURL('https://ocr.space/ocrapi/freekey')} style={{ marginTop: space.sm }}>
          <Text style={[type.caption, { color: colors.mint }]}>Conseguir clave gratuita →</Text>
        </Pressable>
      </GlassCard>

      {demoCount > 0 && (
        <>
          <SectionHeader title="Datos" />
          <GlassButton
            variant="ghost"
            label={`Borrar ${demoCount} tickets de ejemplo`}
            icon={<Ionicons name="trash-outline" size={18} color={colors.danger} />}
            onPress={clearDemoData}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassFillStrong, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  textField: { marginTop: space.sm, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 12 },
  numField: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  numInput: { width: 72, textAlign: 'right', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 8 },
  storeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  dot: { width: 10, height: 10, borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginBottom: space.sm },
});
