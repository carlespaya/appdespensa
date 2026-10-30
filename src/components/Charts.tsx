import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors, euro, radius, space, type } from '@/theme/tokens';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const monthLabel = (yyyyMm: string) => MONTHS[Number(yyyyMm.slice(5, 7)) - 1];

function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)] as const;
}

/** Barras de gasto mensual; el mes actual se resalta en menta. */
export function MonthlyBars({ data, height = 140 }: { data: { month: string; total: number }[]; height?: number }) {
  const [width, onLayout] = useWidth();
  const max = Math.max(1, ...data.map((d) => d.total));
  const gap = 10;
  const barW = width > 0 ? (width - gap * (data.length - 1)) / data.length : 0;
  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="mint" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.mint} />
              <Stop offset="1" stopColor={colors.mintDeep} stopOpacity={0.6} />
            </LinearGradient>
          </Defs>
          {data.map((d, i) => {
            const h = Math.max(4, (d.total / max) * (height - 8));
            const last = i === data.length - 1;
            return (
              <Rect
                key={d.month}
                x={i * (barW + gap)}
                y={height - h}
                width={barW}
                height={h}
                rx={6}
                fill={last ? 'url(#mint)' : 'rgba(255,255,255,0.14)'}
              />
            );
          })}
        </Svg>
      )}
      <View style={styles.labels}>
        {data.map((d) => (
          <Text key={d.month} style={[type.caption, styles.label]}>
            {monthLabel(d.month)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Línea de evolución de precio con área degradada. */
export function PriceLine({ points, height = 80, color = colors.blue }: { points: number[]; height?: number; color?: string }) {
  const [width, onLayout] = useWidth();
  if (points.length < 2) return <View style={{ height }} onLayout={onLayout} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * width, 6 + (1 - (p - min) / span) * (height - 12)] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill="url(#area)" />
          <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={lx} cy={ly} r={4} fill={color} />
        </Svg>
      )}
    </View>
  );
}

/** Fila de comparación horizontal: nombre del súper, barra proporcional e importe. */
export function CompareBar({ label, value, max, color, highlight, note }: { label: string; value: number; max: number; color: string; highlight?: boolean; note?: string }) {
  return (
    <View style={styles.cmpRow}>
      <View style={styles.cmpHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[type.body, { flex: 1 }, highlight && { fontWeight: '700' }]}>{label}</Text>
        <Text style={[type.subtitle, type.number, highlight && { color: colors.mint }]}>{euro(value)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(4, (value / max) * 100)}%`, backgroundColor: highlight ? colors.mint : color, opacity: highlight ? 1 : 0.55 }]} />
      </View>
      {note && <Text style={[type.caption, { marginTop: 4 }]}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  label: { flex: 1, textAlign: 'center', fontSize: 11 },
  cmpRow: { marginBottom: space.md },
  cmpHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
