import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CompareBar } from '@/components/Charts';
import { GlassButton, GlassCard, SectionHeader } from '@/components/Glass';
import { formatDate } from '@/components/ReceiptRow';
import { Screen } from '@/components/Screen';
import { CATEGORY_LABEL } from '@/core/categorize';
import { compareReceiptAcrossStores } from '@/core/stats';
import { storeById, useAppStore } from '@/store/useAppStore';
import { colors, euro, space, type } from '@/theme/tokens';

export default function ReceiptDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { receipts, stores, prices, deleteReceipt } = useAppStore();
  const receipt = receipts.find((r) => r.id === id);
  const comparison = useMemo(() => (receipt ? compareReceiptAcrossStores(receipt, stores, prices) : []), [receipt, stores, prices]);

  if (!receipt) {
    return (
      <Screen title="Ticket">
        <Text style={type.body}>Este ticket ya no existe.</Text>
      </Screen>
    );
  }
  const store = storeById(stores, receipt.storeId);
  const comparable = comparison.filter((c) => c.covered === c.totalItems && c.totalItems > 0);
  const paid = comparable[0]?.paidForSame ?? receipt.total;
  const cheapest = comparable.reduce((m, c) => (c.cost < m.cost ? c : m), comparable[0]);
  const max = Math.max(paid, ...comparable.map((c) => c.cost));

  return (
    <Screen
      subtitle={formatDate(receipt.date)}
      title={store?.name ?? 'Ticket'}
      right={
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>
      }
    >
      <GlassCard strong>
        <Text style={type.overline}>Total pagado</Text>
        <Text style={[type.display, type.number]}>{euro(receipt.total)}</Text>
      </GlassCard>

      {comparable.length > 1 && (
        <>
          <SectionHeader title="¿Cuánto habría costado en…?" />
          <GlassCard>
            {comparable.map((c) => (
              <CompareBar
                key={c.storeId}
                label={storeById(stores, c.storeId)?.name ?? c.storeId}
                value={c.storeId === receipt.storeId ? paid : c.cost}
                max={max}
                color={storeById(stores, c.storeId)?.color ?? colors.blue}
                highlight={c.storeId === cheapest.storeId}
              />
            ))}
            {cheapest.storeId !== receipt.storeId && (
              <Text style={[type.caption, { color: colors.mint }]}>
                Habrías ahorrado {euro(paid - cheapest.cost)} en {storeById(stores, cheapest.storeId)?.name}.
              </Text>
            )}
          </GlassCard>
        </>
      )}

      <SectionHeader title={`Productos (${receipt.lines.length})`} />
      <GlassCard padded={false}>
        {receipt.lines.map((l, i) => (
          <View key={l.id} style={[styles.line, i > 0 && styles.divider]}>
            <View style={{ flex: 1 }}>
              <Text style={type.body} numberOfLines={1}>{l.rawName}</Text>
              <Text style={type.caption}>
                {CATEGORY_LABEL[l.category]} · {l.quantity} {l.unit} × {euro(l.unitPrice)}
              </Text>
            </View>
            <Text style={[type.subtitle, type.number]}>{euro(l.total)}</Text>
          </View>
        ))}
      </GlassCard>

      <GlassButton
        label="Eliminar ticket"
        variant="ghost"
        style={{ marginTop: space.xl }}
        icon={<Ionicons name="trash-outline" size={18} color={colors.danger} />}
        onPress={() => {
          deleteReceipt(receipt.id);
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.glassFillStrong, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
});
