// Actualizaciones de la app desde GitHub Releases (github.com/carlespaya/appdespensa).
// CI publica un APK firmado siempre con la misma clave, así que instalarlo encima conserva
// tickets, productos y ajustes. Solo aplica al APK instalado en Android, no a Expo Go ni a la web.
import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import { compareVersions } from '@/core/version';

export const REPO = 'carlespaya/appdespensa';
const LATEST_RELEASE = `https://api.github.com/repos/${REPO}/releases/latest`;
const APK_MIME = 'application/vnd.android.package-archive';
/** Intent.FLAG_GRANT_READ_URI_PERMISSION: deja que el instalador lea el APK de nuestra caché. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export interface AvailableUpdate {
  version: string;
  notes: string;
  apkUrl: string;
  /** Página de la release, por si la instalación directa falla. */
  pageUrl: string;
  sizeMb: number;
}

/** Versión instalada (la del APK; en Expo Go o web, la de app.json). */
export function installedVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
}

/** Solo el APK instalado puede actualizarse a sí mismo. */
export function canSelfUpdate(): boolean {
  return Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  const res = await fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return null; // aún no hay ninguna versión publicada
  if (!res.ok) throw new Error(`No se pudo consultar GitHub (${res.status}).`);
  const release = (await res.json()) as {
    tag_name: string;
    body?: string;
    html_url: string;
    assets: { name: string; browser_download_url: string; size: number }[];
  };
  const apk = release.assets.find((a) => a.name.endsWith('.apk'));
  const version = release.tag_name.replace(/^v/i, '');
  if (!apk || compareVersions(version, installedVersion()) <= 0) return null;
  return {
    version,
    notes: (release.body ?? '').trim(),
    apkUrl: apk.browser_download_url,
    pageUrl: release.html_url,
    sizeMb: Math.round((apk.size / 1024 / 1024) * 10) / 10,
  };
}

/**
 * Descarga el APK a la caché y abre el instalador de Android. La primera vez Android pide permitir
 * "instalar apps de esta fuente"; los datos de la app no se tocan al actualizar.
 */
export async function downloadAndInstall(update: AvailableUpdate, onProgress?: (fraction: number) => void): Promise<void> {
  const file = new File(Paths.cache, `Despensa-${update.version}.apk`);
  const apk = await File.downloadFileAsync(update.apkUrl, file, {
    idempotent: true,
    onProgress: ({ bytesWritten, totalBytes }) => totalBytes > 0 && onProgress?.(bytesWritten / totalBytes),
  });
  try {
    await startActivityAsync('android.intent.action.VIEW', {
      data: apk.contentUri,
      type: APK_MIME,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
  } catch {
    // Si el instalador no se puede abrir directamente, se descarga desde el navegador.
    await Linking.openURL(update.apkUrl);
  }
}
