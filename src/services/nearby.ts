// Supermercados cercanos con OpenStreetMap (API Overpass): gratuita, sin clave y con buena
// cobertura de cadenas en España. Devuelve la distancia al local más cercano de cada cadena.
import * as Location from 'expo-location';

import { chainForOsm, slugify } from '@/core/stores';
import type { Store } from '@/core/types';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

export interface NearbyChain {
  id: string;
  name: string;
  color: string;
  distanceKm: number;
}

interface OsmElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Asocia un local de OSM a una cadena conocida o a una tienda creada por el usuario (por nombre). */
function chainFor(tags: Record<string, string>, custom: Store[]) {
  const known = chainForOsm(tags);
  if (known) return { id: known.id, name: known.name, color: known.color };
  const own = custom.find((s) => tags.name && slugify(tags.name).includes(s.id));
  return own ? { id: own.id, name: own.name, color: own.color } : null;
}

export async function findNearbyChains(stores: Store[], radiusKm = 5): Promise<NearbyChain[]> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) throw new Error('Necesitamos tu ubicación para saber qué supermercados tienes cerca.');
  const pos = (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  const { latitude: lat, longitude: lon } = pos.coords;

  const r = Math.round(radiusKm * 1000);
  const query = `[out:json][timeout:25];(node["shop"="supermarket"](around:${r},${lat},${lon});way["shop"="supermarket"](around:${r},${lat},${lon}););out center tags;`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    // Overpass rechaza (406) peticiones sin una aplicación identificada.
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'Despensa/1.0 (comparador de precios)' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error('No se pudo consultar el mapa. Inténtalo de nuevo en un momento.');
  const { elements } = (await res.json()) as { elements: OsmElement[] };

  const best = new Map<string, NearbyChain>();
  for (const el of elements) {
    const p = el.center ?? (el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : null);
    if (!p || !el.tags) continue;
    const chain = chainFor(el.tags, stores);
    if (!chain) continue;
    const distanceKm = Math.round(haversineKm(lat, lon, p.lat, p.lon) * 10) / 10;
    const prev = best.get(chain.id);
    if (!prev || distanceKm < prev.distanceKm) best.set(chain.id, { ...chain, distanceKm });
  }
  return [...best.values()].sort((a, b) => a.distanceKm - b.distanceKm);
}
