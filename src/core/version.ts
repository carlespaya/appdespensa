// Versiones "1.2.3" de la app. La misma fórmula de versionCode la usa scripts/set-version.js en CI:
// Android exige que cada APK nuevo tenga un versionCode mayor que el instalado.

export function parseVersion(v: string): [number, number, number] | null {
  const m = v.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** >0 si a es más nueva que b, <0 si es más antigua, 0 si son iguales (o alguna no es válida). */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** 1.2.3 → 10203. Admite hasta 99 en menor y parche. */
export function versionCode(v: string): number {
  const p = parseVersion(v);
  if (!p) throw new Error(`Versión no válida: ${v}`);
  return p[0] * 10000 + p[1] * 100 + p[2];
}
