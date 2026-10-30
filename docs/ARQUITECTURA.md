# Despensa: diseño y plan de desarrollo

> Nombre provisional: **Despensa**. App móvil (iOS + Android, también web para pruebas) que digitaliza tickets de supermercado con OCR, compara precios entre cadenas y calcula la cesta óptima.

---

## 1. Decisiones de stack

| Capa | Elección | Por qué |
|---|---|---|
| App | **Expo SDK 58 + React Native 0.88 + TypeScript** | Un solo código para iOS/Android/web. Builds en la nube con EAS y actualizaciones OTA, sin necesidad de un Mac para Android. |
| Navegación | **Expo Router** (rutas por archivos en `src/app`) | Deep links (`despensa://ticket/123`) y rutas tipadas sin configuración extra. |
| Estado | **Zustand** + `persist` | Mínimo boilerplate; los selectores evitan renders innecesarios. |
| Persistencia local | **expo-sqlite** (`kv-store` en el MVP, tablas relacionales en la fase 2) | Funciona offline y sobrevive a reinicios. |
| Backend | **Supabase** (Postgres + PostGIS + Auth + Storage + Edge Functions) | SQL real para agregar precios por zona, RLS para la privacidad y un nivel gratuito generoso. |
| OCR | **Google Cloud Vision `DOCUMENT_TEXT_DETECTION`** desde una Edge Function, con el parser propio en el dispositivo | Es la mejor precisión en tickets térmicos. La clave nunca llega al cliente. |
| UI | `expo-blur`, `expo-linear-gradient`, `react-native-svg`, `react-native-reanimated` | Cristal, degradados, gráficos ligeros y animaciones a 60 fps en el hilo de UI. |
| Tests | **Vitest** para el núcleo de dominio (sin RN) | Todo lo que importa (parser, optimizador, estadísticas) es TypeScript puro y se prueba en milisegundos. |

---

## 2. Arquitectura

```
┌──────────────────────────── App (Expo) ─────────────────────────────┐
│  src/app/            Pantallas (Expo Router)                         │
│  src/components/     Sistema de diseño glass (GlassCard, Charts…)    │
│  src/store/          Zustand: estado + acciones + persistencia       │
│  src/services/       OCR (remoto / demo), sync con Supabase          │
│  src/core/  ◄─────── Dominio puro, sin React, 100 % testeado         │
│     receiptParser    texto OCR → ticket estructurado                 │
│     normalize        normalización + emparejamiento difuso           │
│     categorize       categoría por reglas                            │
│     basketOptimizer  cesta óptima (búsqueda exhaustiva)              │
│     stats            gasto mensual, categorías, comparativas         │
└───────────────┬─────────────────────────────────────────────────────┘
                │ HTTPS (JWT de Supabase Auth)
┌───────────────▼──────────────── Supabase ───────────────────────────┐
│  Edge Function ocr-receipt  → Google Vision                          │
│  Postgres: receipts, receipt_lines (RLS por usuario)                 │
│            price_observations → community_prices (mediana 30 días)  │
│            store_locations (PostGIS) → prices_near(lat,lng,radio)    │
│  Storage: fotos de tickets (privadas)                                │
└──────────────────────────────────────────────────────────────────────┘
```

**Regla clave:** la lógica de negocio vive en `src/core` y no importa nada de React Native. Así se puede probar, mover al backend o reutilizar en una futura web sin reescribirla.

### Flujo de escaneo

1. **Captura** (`escanear.tsx`): `CameraView` con un marco guía y una línea de escaneo animada (Reanimated).
2. **OCR** (`services/ocr.ts`): se envía la imagen en base64 a `ocr-receipt`, que devuelve texto plano. Sin backend configurado se usa `DemoOcrProvider`.
3. **Parseo** (`core/receiptParser.ts`): detecta la cadena, la fecha, las líneas (cantidad, nombre, precio unitario e importe), los productos a peso (`1,234 kg x 1,89 €/kg`), los multiplicadores (`3 x 0,65`) y el total. Calcula una **confianza por línea** y marca **descuadre** si la suma de las líneas no coincide con el total.
4. **Emparejamiento** (`core/normalize.ts`): expande las abreviaturas (`LECH ENT` → `leche entera`), quita las marcas blancas y busca el producto canónico con el coeficiente de Dice sobre bigramas (tolera erratas del OCR).
5. **Revisión** (`ticket/revisar.tsx`): todo es editable en línea. Las líneas dudosas aparecen con borde ámbar. Al asignar un producto a mano se **aprende el alias** para los siguientes tickets.
6. **Guardado**: el ticket pasa al historial y sus líneas se convierten en **observaciones de precio**, que alimentan la base comunitaria.

### Cesta óptima (`core/basketOptimizer.ts`)

- **Entrada:** lista `{productId, cantidad}`, supermercados (con distancia) y precios.
- **Algoritmo:** se recorren todos los subconjuntos de hasta `maxStores` supermercados. Con 10 cadenas y como máximo 3 paradas salen 175 subconjuntos, así que es instantáneo. En cada subconjunto, cada producto va al súper más barato del grupo. La puntuación es:
  `coste de productos + km × 2 × €/km + (paradas − 1) × penalización por parada`
- **Orden:** primero el plan que deja menos productos sin cubrir y, a igualdad, el de menor puntuación. Al ser exhaustivo, siempre encuentra el óptimo, cosa que un algoritmo voraz no garantiza.
- **Salida:** el mejor plan, el mejor plan de un único súper, las alternativas y el ahorro frente al súper único y frente al más caro.
- La **penalización por parada** (1,5 € por defecto) evita sugerir tres supermercados para ahorrar 40 céntimos. Se podrá ajustar en Preferencias.

### Precios comunitarios

- Cada línea emparejada genera una fila en `price_observations` mediante un trigger en el servidor (no se confía en el cliente).
- `community_prices` usa la **mediana de 30 días** por producto, tienda y local, y exige un mínimo de 2 muestras. Es robusta frente a errores de OCR y ofertas puntuales.
- `prices_near(lat, lng, radio)` devuelve los precios y la distancia de las tiendas cercanas (PostGIS).
- **Privacidad:** las observaciones no exponen `user_id` y solo se lee la vista agregada.

---

## 3. Sistema de diseño (glass + neumorfismo sutil)

Los tokens están en `src/theme/tokens.ts`:

- **Fondo:** degradado `#060A14 → #0B1626` con dos orbes radiales (menta arriba a la derecha, azul abajo a la izquierda). Es lo que el cristal deja entrever.
- **Cristal (`GlassCard`):** `BlurView` (iOS/web, que en web usa `backdrop-filter`), relleno `rgba(255,255,255,.06)`, borde *hairline* `rgba(255,255,255,.12)` y un **bisel iluminado** (degradado blanco en el borde superior). En Android se usa un relleno translúcido equivalente: el blur real exige `BlurTargetView` y penaliza en listas largas.
- **Sombras neumórficas:** profundas y difusas (`radius 24`, `opacity .35`), nunca duras.
- **Acentos:** verde menta `#3DF5B0` para las acciones principales, el ahorro y el mes actual; azul eléctrico `#3D8BFF` para los datos y la evolución de precios; ámbar para lo que hay que revisar.
- **Tipografía:** números tabulares en todos los importes, `display` de 34 px para las cifras clave y etiquetas *overline* en mayúsculas espaciadas.
- **Movimiento:** `FadeInDown` escalonado al cargar, `LinearTransition` en las listas editables, la línea de escaneo y respuesta háptica al capturar y guardar.

### Navegación (regla de 3 toques como máximo)

```
Tabs: Inicio · Historial · [ESCANEAR] · Comparar · Cesta
```
| Función | Toques |
|---|---|
| Escanear un ticket | 1 (botón central) + disparo |
| Ver el gasto mensual o por categoría | 1 (Historial) |
| Ver el detalle de un ticket y cuánto habría costado en otro súper | 2 (Inicio o Historial → ticket) |
| Comparar un producto entre supermercados | 2 (Comparar → producto) |
| Calcular la cesta óptima | 1 (Cesta; se recalcula en vivo) |
| Corregir una línea del OCR | 1 (tocar la línea en la revisión) |

---

## 4. Estructura del repositorio

```
src/
  app/
    _layout.tsx              Stack raíz (modal de revisión, detalle)
    (tabs)/_layout.tsx       Tab bar de cristal flotante + botón central
    (tabs)/index.tsx         Inicio: gasto del mes, ahorro potencial, últimos tickets
    (tabs)/historial.tsx     Filtros por súper y categoría, gráficos, lista por mes
    (tabs)/escanear.tsx      Cámara + OCR + animaciones
    (tabs)/comparar.tsx      Cesta habitual por súper, buscador, evolución de precio
    (tabs)/cesta.tsx         Lista de la compra + cesta óptima
    ticket/revisar.tsx       Corrección manual tras el OCR
    ticket/[id].tsx          Detalle y "¿cuánto habría costado en…?"
  components/                Glass, Screen, Charts, ReceiptRow
  core/                      Dominio puro + __tests__
  data/seed.ts               Cadenas, catálogo, precios y tickets de demo
  services/ocr.ts            Proveedores de OCR
  store/useAppStore.ts       Estado global persistido
  theme/tokens.ts            Tokens de diseño
supabase/
  migrations/0001_init.sql   Esquema, RLS, trigger de observaciones, vista y RPC geo
  functions/ocr-receipt/     Edge Function de OCR
```

---

## 5. Hoja de ruta

| Fase | Duración | Entregables |
|---|---|---|
| **0. Base** ✅ | Hecha | Proyecto Expo, sistema de diseño, navegación, núcleo de dominio con tests, todas las pantallas con datos de demo, esquema de Supabase y función OCR. |
| **1. MVP real** | 2–3 semanas | Supabase Auth (Apple, Google y enlace por email); Edge Function desplegada; subida de la foto a Storage; sincronización bidireccional de tickets (cola offline con `syncedAt`); development build con EAS. |
| **2. Datos locales serios** | 1–2 semanas | Migrar de `kv-store` a tablas SQLite relacionales (tickets, líneas, precios) con índices; paginación del historial; búsqueda por texto. |
| **3. Comunidad y ubicación** | 2–3 semanas | `expo-location` + `prices_near`; catálogo y alias compartidos (votación de alias); refresco de `community_prices` con pg_cron; moderación de valores atípicos (descartar precios a más de 3 MAD de la mediana). |
| **4. OCR robusto** | 2 semanas | Recorte y enderezado automático del ticket (detección de bordes); plantillas de parser por cadena; fallback a un LLM con visión para tickets difíciles, que devuelva JSON estructurado; métricas de precisión por cadena. |
| **5. Pulido y lanzamiento** | 2 semanas | Onboarding, tema claro, accesibilidad (VoiceOver/TalkBack, Dynamic Type), Sentry, analítica respetuosa, fichas de las tiendas de apps, beta con TestFlight y Play Internal. |

### Riesgos y mitigaciones

- **Calidad del OCR en papel térmico** → guía visual de encuadre, aviso de baja luz, revisión rápida y aprendizaje de alias. El usuario nunca queda bloqueado.
- **Productos distintos entre cadenas** (marcas blancas, formatos) → catálogo canónico por *equivalencia funcional* (p. ej. "Leche entera 1L") y comparación por precio unitario (€/L, €/kg) en la fase 3.
- **Pocos datos al principio** → semilla con precios públicos y cobertura mostrada siempre ("faltan 2 productos"). Nunca se oculta.
- **Privacidad (RGPD)** → los tickets son privados por RLS, las observaciones son anónimas y se ofrece exportación y borrado de cuenta.

---

## 6. Cómo ejecutar

```bash
npm install
npm start            # Expo: pulsa w (web), a (Android) o i (iOS)
npm test             # tests del núcleo
npm run typecheck
```

Sin variables de entorno, la app usa el **OCR de demo** ("Usar ticket de ejemplo"). Para el OCR real, copia `.env.example` a `.env` y despliega `supabase/functions/ocr-receipt`. La cámara necesita un dispositivo físico; en web aparece el botón de ejemplo.
