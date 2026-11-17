# Despensa

App móvil (Expo · iOS/Android) para escanear tickets de supermercado, comparar precios entre cadenas y calcular la cesta óptima.

- Diseño, arquitectura y hoja de ruta: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)

## Instalar en Android

Descarga el último `Despensa-x.y.z.apk` de [Releases](https://github.com/carlespaya/appdespensa/releases/latest) desde el móvil y ábrelo. La primera vez Android pedirá permitir instalar apps de esa fuente.

Cuando se publica una versión nueva, la app lo avisa en Inicio («Nueva versión disponible») y se actualiza con un toque. **Los datos se conservan**: todas las versiones se firman con la misma clave, así que Android instala encima sin borrar nada.

## Desarrollo

```bash
npm install
npm start        # w = web, a = Android (Expo Go), i = iOS
npm test
```

## Publicar una versión

```bash
git tag -a v1.1.0 -m "Novedades de esta versión (se muestran en el aviso de la app)"
git push origin v1.1.0
```

GitHub Actions ([release.yml](.github/workflows/release.yml)) compila el APK firmado, comprueba la firma y crea la release con el APK adjunto. La versión y el `versionCode` salen de la etiqueta (`scripts/set-version.js`), así que cada etiqueta debe ser mayor que la anterior.

La clave de firma **no** está en el repositorio: está en los secretos del repositorio (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`) y en una copia local fuera del proyecto. Si se pierde, las nuevas versiones no podrán instalarse encima de las anteriores sin desinstalar (y perder los datos).
