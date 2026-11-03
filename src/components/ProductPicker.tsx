import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORY_LABEL } from '@/core/categorize';
import { displayName, normalizeName, rankProducts } from '@/core/normalize';
import type { Product } from '@/core/types';
import { colors, radius, space, type } from '@/theme/tokens';

interface Props {
  visible: boolean;
  title: string;
  /** Nombre tal cual sale en el ticket: sirve para ordenar las sugerencias. */
  rawName: string;
  products: Product[];
  selectedId?: string | null;
  /** Productos que no se deben ofrecer (p. ej. el propio producto al unir). */
  excludeId?: string;
  onPick: (product: Product) => void;
  /** Si se omite, no se ofrece crear un producto nuevo. */
  onCreate?: (name: string) => void;
  onClose: () => void;
}

/** Panel inferior para elegir a qué producto corresponde una línea, con buscador y "crear nuevo". */
export function ProductPicker({ visible, title, rawName, products, selectedId, excludeId, onPick, onCreate, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState<string | null>(null);

  const results = useMemo(() => {
    const pool = products.filter((p) => p.id !== excludeId);
    const q = normalizeName(query);
    if (!q) {
      // Solo sugerencias con parecido real; si no hay ninguna, los más cercanos para no dejar la lista vacía.
      const ranked = rankProducts(rawName, pool);
      const close = ranked.filter((r) => r.score >= 0.35);
      return (close.length ? close : ranked).slice(0, close.length ? 6 : 5).map((r) => r.product);
    }
    const direct = pool.filter((p) => normalizeName(p.name).includes(q) || p.aliases.some((a) => a.includes(q)));
    return (direct.length ? direct : rankProducts(query, pool).slice(0, 8).map((r) => r.product)).slice(0, 20);
  }, [query, rawName, products, excludeId]);

  const close = () => {
    setQuery('');
    setNewName(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.grabber} />
          <Text style={type.title}>{title}</Text>
          {rawName ? <Text style={[type.caption, { marginTop: 2 }]}>En el ticket: «{rawName}»</Text> : null}

          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar producto…"
              placeholderTextColor={colors.textFaint}
              style={[type.body, { flex: 1 }]}
              autoCorrect={false}
            />
          </View>

          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            <Text style={[type.overline, { marginBottom: space.xs }]}>{query ? 'Resultados' : 'Sugerencias'}</Text>
            {results.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  onPick(p);
                  close();
                }}
                style={({ pressed }) => [styles.row, p.id === selectedId && styles.rowActive, pressed && { opacity: 0.7 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={type.body}>{p.name}</Text>
                  <Text style={type.caption}>
                    {CATEGORY_LABEL[p.category]}
                    {p.names && Object.keys(p.names).length ? ` · visto en ${Object.keys(p.names).length} súper` : ''}
                  </Text>
                </View>
                {p.id === selectedId && <Ionicons name="checkmark-circle" size={22} color={colors.mint} />}
              </Pressable>
            ))}
            {results.length === 0 && <Text style={[type.caption, { paddingVertical: space.md }]}>No hay coincidencias.</Text>}
          </ScrollView>

          {onCreate &&
            (newName === null ? (
              <Pressable onPress={() => setNewName(query.trim() || displayName(rawName))} style={styles.create}>
                <Ionicons name="add-circle" size={22} color={colors.mint} />
                <Text style={[type.subtitle, { color: colors.mint }]}>Es un producto nuevo</Text>
              </Pressable>
            ) : (
              <View style={styles.createForm}>
                <Text style={type.caption}>Nombre del producto nuevo</Text>
                <View style={styles.search}>
                  <TextInput value={newName} onChangeText={setNewName} autoFocus style={[type.body, { flex: 1 }]} />
                  <Pressable
                    onPress={() => {
                      if (newName.trim()) onCreate(newName.trim());
                      close();
                    }}
                    hitSlop={8}
                  >
                    <Ionicons name="checkmark-circle" size={28} color={colors.mint} />
                  </Pressable>
                </View>
              </View>
            ))}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0E1828',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    padding: space.lg,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.glassHighlight, marginBottom: space.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.glassFill,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    marginVertical: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: space.sm, borderRadius: radius.sm },
  rowActive: { backgroundColor: 'rgba(61,245,176,0.10)' },
  create: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder, marginTop: space.sm },
  createForm: { paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder, marginTop: space.sm },
});
