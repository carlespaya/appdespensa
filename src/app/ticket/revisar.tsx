import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, GlassButton, GlassCard, SectionHeader } from '@/components/Glass';
import { Backdrop } from '@/components/Screen';
import { normalizeName, similarity } from '@/core/normalize';
import type { ReceiptLine } from '@/core/types';
import { useAppStore } from '@/store/useAppStore';
import { colors, euro, radius, space, type } from '@/theme/tokens';

const round2 = (n: number) => Math.round(n * 100) / 100;
const parseNum = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Revisión rápida tras el OCR: todo editable en línea, lo dudoso resaltado en ámbar. */
export default function ReviewReceipt() {
  const insets = useSafeAreaInsets();
  const { draft, updateDraft, commitDraft, stores, products, learnAlias } = useAppStore();
  const [openLine, setOpenLine] = useState<string | null>(null);

  if (!draft) {
    return (
      <View style={[styles.root, styles.empty]}>
        <Backdrop />
        <Text style={type.body}>No hay ningún ticket pendiente.</Text>
        <GlassButton label="Volver" variant="ghost" onPress={() => router.back()} style={{ marginTop: space.lg }} />
      </View>
    );
  }

  const sum = round2(draft.lines.reduce((a, l) => a + l.total, 0));
  const mismatch = Math.abs(sum - draft.total) > 0.05;
  const doubtful = draft.lines.filter((l) => l.confidence < 0.7 || !l.productId).length;

  const setLine = (id: string, patch: Partial<ReceiptLine>) =>
    updateDraft({
      ...draft,
      lines: draft.lines.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if ('quantity' in patch || 'unitPrice' in patch) next.total = round2(next.quantity * next.unitPrice);
        return next;
      }),
    });

  const suggestions = (raw: string) =>
    products
      .map((p) => ({ p, s: Math.max(similarity(normalizeName(raw), normalizeName(p.name)), ...p.aliases.map((a) => similarity(normalizeName(raw), a))) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 4)
      .map((x) => x.p);

  const save = () => {
    const id = commitDraft();
    if (id) router.replace({ pathname: '/ticket/[id]', params: { id } });
  };

  return (
    <View style={styles.root}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </Pressable>
          <Text style={type.title}>Revisar ticket</Text>
          <View style={{ width: 26 }} />
        </View>

        {doubtful > 0 && (
          <GlassCard style={{ marginBottom: space.md }}>
            <View style={styles.inline}>
              <Ionicons name="eye-outline" size={18} color={colors.warning} />
              <Text style={[type.caption, { flex: 1 }]}>
                {doubtful} {doubtful === 1 ? 'línea necesita' : 'líneas necesitan'} un vistazo. Toca para corregir.
              </Text>
            </View>
          </GlassCard>
        )}

        <SectionHeader title="Supermercado" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {stores.map((s) => (
            <Chip key={s.id} label={s.name} color={s.color} active={draft.storeId === s.id} onPress={() => updateDraft({ ...draft, storeId: s.id })} />
          ))}
        </ScrollView>

        <SectionHeader title="Fecha" />
        <GlassCard padded={false}>
          <TextInput
            value={draft.date}
            onChangeText={(date) => updateDraft({ ...draft, date })}
            placeholder="aaaa-mm-dd"
            placeholderTextColor={colors.textFaint}
            style={[type.body, styles.input]}
          />
        </GlassCard>

        <SectionHeader title={`Productos (${draft.lines.length})`} action="+ Añadir" onAction={() =>
          updateDraft({
            ...draft,
            lines: [...draft.lines, { id: `n${Date.now()}`, rawName: '', productId: null, quantity: 1, unit: 'ud', unitPrice: 0, total: 0, category: 'otros', confidence: 0.5 }],
          })
        } />
        <GlassCard padded={false}>
          {draft.lines.map((l, i) => {
            const warn = l.confidence < 0.7 || !l.productId;
            const open = openLine === l.id;
            const product = products.find((p) => p.id === l.productId);
            return (
              <Animated.View key={l.id} layout={LinearTransition} style={[styles.line, i > 0 && styles.divider, warn && styles.warn]}>
                <Pressable onPress={() => setOpenLine(open ? null : l.id)} style={styles.inline}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.subtitle} numberOfLines={1}>{l.rawName || 'Nuevo producto'}</Text>
                    <Text style={[type.caption, !product && { color: colors.warning }]}>
                      {product ? product.name : 'Sin emparejar'} · {l.quantity} {l.unit} × {euro(l.unitPrice)}
                    </Text>
                  </View>
                  <Text style={[type.subtitle, type.number]}>{euro(l.total)}</Text>
                </Pressable>

                {open && (
                  <Animated.View entering={FadeInDown.duration(200)} style={{ marginTop: space.md, gap: space.sm }}>
                    <TextInput value={l.rawName} onChangeText={(rawName) => setLine(l.id, { rawName })} style={[type.body, styles.field]} placeholder="Nombre" placeholderTextColor={colors.textFaint} />
                    <View style={styles.inline}>
                      <TextInput
                        defaultValue={String(l.quantity).replace('.', ',')}
                        onChangeText={(t) => setLine(l.id, { quantity: parseNum(t) })}
                        keyboardType="decimal-pad"
                        style={[type.body, styles.field, { flex: 1 }]}
                      />
                      <TextInput
                        defaultValue={l.unitPrice.toFixed(2).replace('.', ',')}
                        onChangeText={(t) => setLine(l.id, { unitPrice: parseNum(t), confidence: 1 })}
                        keyboardType="decimal-pad"
                        style={[type.body, styles.field, { flex: 1 }]}
                      />
                      <Pressable onPress={() => updateDraft({ ...draft, lines: draft.lines.filter((x) => x.id !== l.id) })} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color={colors.danger} />
                      </Pressable>
                    </View>
                    <Text style={type.overline}>¿Qué producto es?</Text>
                    <View style={styles.wrap}>
                      {suggestions(l.rawName).map((p) => (
                        <Chip
                          key={p.id}
                          label={p.name}
                          active={p.id === l.productId}
                          onPress={() => {
                            setLine(l.id, { productId: p.id, category: p.category, confidence: 1 });
                            learnAlias(l.rawName, p.id);
                          }}
                        />
                      ))}
                    </View>
                  </Animated.View>
                )}
              </Animated.View>
            );
          })}
        </GlassCard>

        <GlassCard style={{ marginTop: space.lg }}>
          <View style={styles.inline}>
            <Text style={[type.body, { flex: 1 }]}>Suma de líneas</Text>
            <Text style={[type.body, type.number]}>{euro(sum)}</Text>
          </View>
          <View style={[styles.inline, { marginTop: space.sm }]}>
            <Text style={[type.subtitle, { flex: 1 }]}>Total del ticket</Text>
            <TextInput
              defaultValue={draft.total.toFixed(2).replace('.', ',')}
              onChangeText={(t) => updateDraft({ ...draft, total: parseNum(t) })}
              keyboardType="decimal-pad"
              style={[type.subtitle, styles.totalInput, mismatch && { color: colors.warning }]}
            />
          </View>
          {mismatch && (
            <Pressable onPress={() => updateDraft({ ...draft, total: sum })}>
              <Text style={[type.caption, { color: colors.warning, marginTop: space.sm }]}>No cuadra con la suma. Toca para usar {euro(sum)}.</Text>
            </Pressable>
          )}
        </GlassCard>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <GlassButton label="Guardar ticket" onPress={save} disabled={!draft.storeId || draft.lines.length === 0} icon={<Ionicons name="checkmark" size={20} color={colors.onAccent} />} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgTop },
  empty: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.lg },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  input: { paddingHorizontal: space.lg, paddingVertical: 14 },
  line: { paddingHorizontal: space.lg, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  warn: { borderLeftWidth: 3, borderLeftColor: colors.warning },
  field: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  totalInput: { minWidth: 90, textAlign: 'right', ...type.number },
  footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0 },
});
