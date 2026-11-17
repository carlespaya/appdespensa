// Config plugin: firma el APK de release con la clave propia de Despensa.
//
// Android solo instala una versión nueva encima de la anterior (conservando los datos) si ambas están
// firmadas con la misma clave. La clave no está en el repositorio: GitHub Actions la escribe en disco
// a partir de un secreto y pasa su ruta y contraseña por variables de entorno. Sin esas variables
// (desarrollo local) se mantiene la firma de depuración que genera Expo.
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_SIGNING = `
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storeType 'pkcs12'
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            }
        }`;

function addReleaseSigning(gradle) {
  if (gradle.includes("System.getenv('ANDROID_KEYSTORE_PATH')")) return gradle;

  // 1) Bloque signingConfigs.release justo después de signingConfigs.debug.
  const debugBlock = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
  if (!debugBlock.test(gradle)) throw new Error('withReleaseSigning: no se encontró signingConfigs.debug en build.gradle');
  gradle = gradle.replace(debugBlock, `$1${RELEASE_SIGNING}`);

  // 2) buildTypes.release usa esa firma cuando hay clave.
  const releaseUsesDebug = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (!releaseUsesDebug.test(gradle)) throw new Error('withReleaseSigning: no se encontró buildTypes.release en build.gradle');
  return gradle.replace(
    releaseUsesDebug,
    "$1signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
  );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.addReleaseSigning = addReleaseSigning;
