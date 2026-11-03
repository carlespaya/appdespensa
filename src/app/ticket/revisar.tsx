import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, GlassButton, GlassCard } from '@/components/Glass';
import { ProductPicker } from '@/components/ProductPicker';
import { Backdrop } from '@/components/Screen';
import { categorize } from '@/core/categorize';
import { displayName, matchProduct } from '@/core/normalize';
import { parseReceipt } from '@/core/receiptParser';
import { useAppStore, type DraftLine } from '@/store/useAppStore';
import { colors, euro, radius, space, type } from '@/theme/tokens';

const round2 = (n: number) => Math.round(n * 100) / 100;
const parseNum = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Convierte una línea de texto del ticket en una línea de producto (para rescatar lo que el lector no entendió). */
function lineFromText(text: string): DraftLine {
  const parsed = parseReceipt(text).lines[0];
  const fallbackPrice = (text.match(/\d{1,4}[.,]\d{2}(?!\d)/g) ?? []).pop();
  const rawName = parsed?.rawName ?? text.replace(/\d{1,4}[.,]\d{2}/g, '').replace(/^\s*\d{1,2}\s+/, '').trim();
  const total = parsed?.total ?? (fallbackPrice ? parseNum(fallbackPrice) : 0);
  return {
    id: newId(),
    rawName,
    productId: null,
    quantity: parsed?.quantity ?? 1,
    unit: parsed?.unit ?? 'ud',
    unitPrice: parsed?.unitPrice ?? total,
    total,
    category: categorize(rawName),
    confidence: 0.6,
  };
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={[type.subtitle, { flex: 1 }]}>{title}</Text>
    </View>
  );
}

/** Revisión tras escanear: cada producto se puede corregir, quitar o añadir en uno o dos toques. */
export default function ReviewReceipt() {
  const insets = useSafeAreaInsets();
  const { draft, updateDraft, commitDraft, stores, products, learnAlias, addStore } = useAppStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState<DraftLine | null>(null);
  const [newStoreName, setNewStoreName] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);

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
  const diff = round2(draft.total - sum);
  const fits = Math.abs(diff) <= 0.05;
  const storeChips = draft.newStore ? [draft.newStore, ...stores] : stores;
  const unused = draft.unusedLines ?? [];

  const setLine = (id: string, patch: Partial<DraftLine>) =>
    updateDraft({
      ...draft,
      lines: draft.lines.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if ('quantity' in patch || 'unitPrice' in patch) next.total = round2(next.quantity * next.unitPrice);
        return next;
      }),
    });
  const removeLine = (id: string) => updateDraft({ ...draft, lines: draft.lines.filter((l) => l.id !== id) });
  const addLine = (line: DraftLine, fromUnused?: string) => {
    updateDraft({ ...draft, lines: [...draft.lines, line], unusedLines: fromUnused ? unused.filter((u) => u !== fromUnused) : unused });
    if (!line.rawName) setEditing(line.id);
  };

  const createStore = () => {
    if (newStoreName?.trim()) {
      const store = addStore(newStoreName);
      updateDraft({ ...draft, storeId: store.id });
    }
    setNewStoreName(null);
  };

  const save = () => {
    const id = commitDraft();
    if (id) router.replace({ pathname: '/ticket/[id]', params: { id } });
  };

  return (
    <View style={styles.root}>
      <Backdrop />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.lg, paddingBottom: 150 }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={type.title}>Revisa tu ticket</Text>
            <Text style={type.caption}>Corrige lo que no esté bien y guarda</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* ── 1 · Supermercado y fecha ── */}
        <StepTitle n={1} title="¿Dónde compraste?" />
        {draft.newStore && draft.storeId === draft.newStore.id && (
          <Text style={[type.caption, { color: colors.mint, marginBottom: space.sm }]}>Supermercado nuevo: se añadirá «{draft.newStore.name}» al guardar.</Text>
        )}
        {!draft.storeId && <Text style={[type.caption, { color: colors.warning, marginBottom: space.sm }]}>No lo hemos reconocido. Elígelo o créalo.</Text>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {storeChips.map((s) => (
            <Chip
              key={s.id}
              label={s === draft.newStore ? `${s.name} · nuevo` : s.name}
              color={s.color}
              active={draft.storeId === s.id}
              onPress={() => updateDraft({ ...draft, storeId: s.id })}
            />
          ))}
          <Chip label="+ Otro" onPress={() => setNewStoreName('')} />
        </ScrollView>
        {newStoreName !== null && (
          <View style={[styles.inputRow, { marginTop: space.sm }]}>
            <TextInput
              autoFocus
              value={newStoreName}
              onChangeText={setNewStoreName}
              onSubmitEditing={createStore}
              placeholder="Nombre del supermercado"
              placeholderTextColor={colors.textFaint}
              style={[type.body, { flex: 1 }]}
            />
            <Pressable onPress={createStore} hitSlop={8}>
              <Ionicons name="checkmark-circle" size={26} color={colors.mint} />
            </Pressable>
          </View>
        )}
        <View style={[styles.inputRow, { marginTop: space.sm }]}>
          <Ionicons name="calendar-outline" size={18} color={colors.textFaint} />
          <TextInput
            value={draft.date}
            onChangeText={(date) => updateDraft({ ...draft, date })}
            placeholder="aaaa-mm-dd"
            placeholderTextColor={colors.textFaint}
            style={[type.body, { flex: 1 }]}
          />
        </View>

        {/* ── 2 · Productos ── */}
        <StepTitle n={2} title={`Productos (${draft.lines.length})`} />
        <Text style={[type.caption, { marginBottom: space.sm }]}>Toca un producto para editarlo. Usa la papelera si una línea no es un producto.</Text>
        <GlassCard padded={false}>
          {draft.lines.map((l, i) => {
            const product = products.find((p) => p.id === l.productId);
            const open = editing === l.id;
            const doubtful = l.confidence < 0.7;
            return (
              <Animated.View
                key={l.id}
                layout={LinearTransition}
                entering={FadeIn}
                exiting={FadeOut}
                style={[styles.line, i > 0 && styles.divider, doubtful && styles.doubtful]}
              >
                <View style={styles.lineTop}>
                  <Pressable onPress={() => setEditing(open ? null : l.id)} style={{ flex: 1 }}>
                    <Text style={type.subtitle} numberOfLines={open ? undefined : 1}>
                      {l.quantity !== 1 && (
                        <Text style={{ color: colors.mint }}>
                          {String(l.quantity).replace('.', ',')}
                          {l.unit === 'kg' ? ' kg ' : '× '}
                        </Text>
                      )}
                      {l.rawName || 'Producto sin nombre'}
                    </Text>
                  </Pressable>
                  <Text style={[type.subtitle, type.number]}>{euro(l.total)}</Text>
                  <Pressable onPress={() => removeLine(l.id)} hitSlop={10} style={styles.trash} accessibilityLabel="Quitar producto">
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>

                <Pressable onPress={() => setPicking(l)} style={styles.match}>
                  <Ionicons name={product ? 'link' : 'sparkles'} size={14} color={product ? colors.mint : colors.blue} />
                  <Text style={[type.caption, { flex: 1, color: product ? colors.textMuted : colors.blue }]} numberOfLines={1}>
                    {product ? `Es: ${product.name}` : `Producto nuevo: ${l.newProductName ?? displayName(l.rawName || 'sin nombre')}`}
                  </Text>
                  <Text style={[type.caption, { color: colors.mint }]}>Cambiar</Text>
                </Pressable>

                {doubtful && !open && <Text style={[type.caption, { color: colors.warning, marginTop: 4 }]}>Revisa esta línea: puede estar mal leída</Text>}

                {open && (
                  <Animated.View entering={FadeInDown.duration(180)} style={{ marginTop: space.md, gap: space.sm }}>
                    <Text style={type.overline}>Nombre en el ticket</Text>
                    <TextInput
                      value={l.rawName}
                      onChangeText={(rawName) => {
                        // Mientras el usuario no haya elegido el producto a mano, se empareja según escribe.
                        const match = l.manualMatch ? null : matchProduct(rawName, products);
                        setLine(l.id, {
                          rawName,
                          confidence: 1,
                          ...(l.manualMatch ? {} : { productId: match?.product.id ?? null, category: match?.product.category ?? categorize(rawName) }),
                        });
                      }}
                      style={[type.body, styles.field]}
                      placeholder="Nombre"
                      placeholderTextColor={colors.textFaint}
                      autoFocus={!l.rawName}
                    />
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                      <View style={{ flex: 1 }}>
                        <Text style={type.overline}>{l.unit === 'kg' ? 'Kilos' : 'Cantidad'}</Text>
                        <TextInput
                          defaultValue={String(l.quantity).replace('.', ',')}
                          onChangeText={(t) => setLine(l.id, { quantity: parseNum(t) || 1, confidence: 1 })}
                          keyboardType="decimal-pad"
                          style={[type.body, styles.field]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={type.overline}>Precio {l.unit === 'kg' ? '€/kg' : 'unidad'}</Text>
                        <TextInput
                          defaultValue={l.unitPrice ? l.unitPrice.toFixed(2).replace('.', ',') : ''}
                          placeholder="0,00"
                          placeholderTextColor={colors.textFaint}
                          onChangeText={(t) => setLine(l.id, { unitPrice: parseNum(t), confidence: 1 })}
                          keyboardType="decimal-pad"
                          style={[type.body, styles.field]}
                        />
                      </View>
                    </View>
                    <Pressable onPress={() => setEditing(null)} style={{ alignSelf: 'flex-end' }} hitSlop={8}>
                      <Text style={[type.subtitle, { color: colors.mint }]}>Listo</Text>
                    </Pressable>
                  </Animated.View>
                )}
              </Animated.View>
            );
          })}
          {draft.lines.length === 0 && <Text style={[type.caption, { padding: space.lg, textAlign: 'center' }]}>No hay productos. Añádelos abajo.</Text>}
        </GlassCard>

        <GlassButton
          variant="ghost"
          label="Añadir producto que falta"
          icon={<Ionicons name="add" size={20} color={colors.text} />}
          onPress={() =>
            addLine({ id: newId(), rawName: '', productId: null, quantity: 1, unit: 'ud', unitPrice: 0, total: 0, category: 'otros', confidence: 1 })
          }
          style={{ marginTop: space.md }}
        />

        {unused.length > 0 && (
          <Animated.View entering={FadeInDown}>
            <GlassCard style={{ marginTop: space.md }}>
              <View style={styles.inline}>
                <Ionicons name="help-circle" size={20} color={colors.warning} />
                <Text style={[type.subtitle, { flex: 1 }]}>Líneas que no hemos entendido</Text>
              </View>
              <Text style={[type.caption, { marginVertical: space.sm }]}>Si alguna es un producto, tócala para añadirla.</Text>
              {unused.map((u) => (
                <Pressable key={u} onPress={() => addLine(lineFromText(u), u)} style={({ pressed }) => [styles.unused, pressed && { opacity: 0.6 }]}>
                  <Text style={[styles.mono, { flex: 1 }]} numberOfLines={1}>
                    {u}
                  </Text>
                  <Ionicons name="add-circle" size={22} color={colors.mint} />
                </Pressable>
              ))}
            </GlassCard>
          </Animated.View>
        )}

        {/* ── 3 · Total ── */}
        <StepTitle n={3} title="Total" />
        <GlassCard>
          <View style={styles.inline}>
            <Text style={[type.body, { flex: 1 }]}>Suma de los productos</Text>
            <Text style={[type.body, type.number]}>{euro(sum)}</Text>
          </View>
          <View style={[styles.inline, { marginTop: space.sm }]}>
            <Text style={[type.subtitle, { flex: 1 }]}>Total del ticket</Text>
            <TextInput
              key={draft.total}
              defaultValue={draft.total.toFixed(2).replace('.', ',')}
              onEndEditing={(e) => updateDraft({ ...draft, total: parseNum(e.nativeEvent.text) })}
              keyboardType="decimal-pad"
              style={[type.subtitle, styles.totalInput]}
            />
          </View>
          <View style={[styles.status, { backgroundColor: fits ? 'rgba(61,245,176,0.12)' : 'rgba(255,181,71,0.12)' }]}>
            <Ionicons name={fits ? 'checkmark-circle' : 'alert-circle'} size={18} color={fits ? colors.mint : colors.warning} />
            <Text style={[type.caption, { flex: 1, color: colors.text }]}>
              {fits
                ? 'Todo cuadra con el total del ticket.'
                : diff > 0
                  ? `Faltan ${euro(diff)}: puede que falte algún producto.`
                  : `Sobran ${euro(-diff)}: puede que haya una línea que no es un producto.`}
            </Text>
          </View>
          {!fits && (
            <Pressable onPress={() => updateDraft({ ...draft, total: sum })} style={{ marginTop: space.sm }}>
              <Text style={[type.caption, { color: colors.mint }]}>Usar la suma ({euro(sum)}) como total</Text>
            </Pressable>
          )}
        </GlassCard>

        {draft.ocrText ? (
          <Pressable onPress={() => setShowText(!showText)} style={[styles.inline, { marginTop: space.lg }]}>
            <Ionicons name={showText ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} />
            <Text style={type.caption}>Ver el texto leído del ticket</Text>
          </Pressable>
        ) : null}
        {showText && (
          <GlassCard style={{ marginTop: space.sm }}>
            <Text style={styles.mono} selectable>
              {draft.ocrText}
            </Text>
          </GlassCard>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <GlassButton
          label={draft.storeId ? `Guardar ticket · ${euro(sum)}` : 'Elige el supermercado'}
          onPress={save}
          disabled={!draft.storeId || draft.lines.length === 0}
          icon={<Ionicons name="checkmark" size={20} color={colors.onAccent} />}
        />
      </View>

      <ProductPicker
        visible={!!picking}
        title="¿Qué producto es?"
        rawName={picking?.rawName ?? ''}
        products={products}
        selectedId={picking?.productId}
        onPick={(p) => {
          if (!picking) return;
          setLine(picking.id, { productId: p.id, category: p.category, newProductName: undefined, manualMatch: true });
          learnAlias(picking.rawName, p.id);
        }}
        onCreate={(name) => picking && setLine(picking.id, { productId: null, newProductName: name, category: categorize(name), manualMatch: true })}
        onClose={() => setPicking(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgTop },
  empty: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassFillStrong, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl, marginBottom: space.sm },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: colors.onAccent, fontWeight: '800', fontSize: 13 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.glassFill,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  line: { paddingHorizontal: space.lg, paddingVertical: 12 },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  doubtful: { borderLeftWidth: 3, borderLeftColor: colors.warning },
  trash: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,107,122,0.10)' },
  match: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingVertical: 4 },
  field: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10, marginTop: 4 },
  unused: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  mono: { fontFamily: 'monospace', fontSize: 12, color: colors.textMuted },
  totalInput: { minWidth: 90, textAlign: 'right', ...type.number },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.sm, padding: space.md, marginTop: space.md },
  footer: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0 },
});
