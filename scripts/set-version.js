// Fija la versión de la app a partir de la etiqueta de git (v1.2.3) antes de compilar en CI.
// versionCode = mayor*10000 + menor*100 + parche, igual que src/core/version.ts.
//   node scripts/set-version.js v1.2.3
const fs = require('fs');
const path = require('path');

function setVersion(appJson, tag) {
  const m = String(tag).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`La etiqueta debe tener la forma v1.2.3 (recibido: ${tag})`);
  const [major, minor, patch] = m.slice(1).map(Number);
  const version = `${major}.${minor}.${patch}`;
  return {
    ...appJson,
    expo: { ...appJson.expo, version, android: { ...appJson.expo.android, versionCode: major * 10000 + minor * 100 + patch } },
  };
}

if (require.main === module) {
  const file = path.join(__dirname, '..', 'app.json');
  const next = setVersion(JSON.parse(fs.readFileSync(file, 'utf8')), process.argv[2]);
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  console.log(`Versión ${next.expo.version} (versionCode ${next.expo.android.versionCode})`);
}

module.exports = { setVersion };
