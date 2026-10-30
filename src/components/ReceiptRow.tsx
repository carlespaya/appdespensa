import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Receipt } from '@/core/types';
import { storeById, useAppStore } from '@/store/useAppStore';
import { colors, euro, space, type } from '@/theme/tokens';

export const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export function ReceiptRow({ receipt, divider }: { receipt: Receipt; divider?: boolean }) {
  const store = storeById(useAppStore((s) => s.stores), receipt.storeId);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/ticket/[id]', params: { id: receipt.id } })}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.logo, { backgroundColor: `${store?.color ?? colors.blue}26` }]}>
        <Text style={[styles.initial, { color: store?.color ?? colors.blue }]}>{store?.name[0] ?? '?'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.subtitle}>{store?.name ?? 'Desconocido'}</Text>
        <Text style={type.caption}>
          {formatDate(receipt.date)} · {receipt.lines.length} productos
        </Text>
      </View>
      <Text style={[type.subtitle, type.number]}>{euro(receipt.total)}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  logo: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 18, fontWeight: '800' },
});
