// Capa OCR intercambiable. La app solo necesita texto plano: el parseo a estructura
// (`parseReceipt`) es local, determinista y testeado, así que cambiar de proveedor no afecta al resto.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface OcrImage {
  uri: string;
}

export interface OcrOptions {
  apiKey?: string;
  /** Motor de OCR.space: 2 (rápido, 25.000/mes gratis) o 3 (más preciso, 1.000/mes gratis). */
  engine?: 2 | 3;
}

export interface OcrProvider {
  recognize(image: OcrImage, options?: OcrOptions): Promise<string>;
}

/** Clave pública de demostración de OCR.space: sirve para probar, pero con límites estrictos. */
export const OCR_SPACE_DEMO_KEY = 'helloworld';
const ENDPOINT = 'https://api.ocr.space/parse/image';
/** El plan gratuito admite imágenes de hasta 1 MB; en base64 eso son ~1,33 MB de texto. */
const MAX_BASE64 = 1_300_000;

/** Reduce y comprime la foto hasta que quepa en el límite del plan gratuito, sin perder legibilidad. */
async function prepare(uri: string): Promise<string> {
  for (const [width, compress] of [[1600, 0.7], [1300, 0.55], [1000, 0.45]] as const) {
    const ref = await ImageManipulator.manipulate(uri).resize({ width, height: null }).renderAsync();
    const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (out.base64 && out.base64.length < MAX_BASE64) return out.base64;
  }
  throw new Error('La foto es demasiado grande. Prueba a acercarte un poco más al ticket.');
}

interface OcrSpaceResponse {
  IsErroredOnProcessing: boolean;
  ErrorMessage?: string | string[];
  ParsedResults?: { ParsedText: string; FileParseExitCode: number; ErrorMessage?: string }[];
}

/**
 * OCR.space: gratuito, sin código nativo (funciona en Expo Go) y con modo `isTable`,
 * que devuelve el ticket línea a línea manteniendo nombre y precio en la misma fila.
 */
class OcrSpaceProvider implements OcrProvider {
  async recognize(image: OcrImage, { apiKey, engine = 2 }: OcrOptions = {}): Promise<string> {
    const base64 = await prepare(image.uri);
    const body = new FormData();
    body.append('base64Image', `data:image/jpeg;base64,${base64}`);
    body.append('language', engine === 2 ? 'spa' : 'auto');
    body.append('isTable', 'true');
    body.append('OCREngine', String(engine));
    body.append('scale', 'true');
    body.append('detectOrientation', 'true');

    const res = await fetch(ENDPOINT, { method: 'POST', headers: { apikey: apiKey || OCR_SPACE_DEMO_KEY }, body });
    if (res.status === 403 || res.status === 429) {
      throw new Error('Se ha superado el límite del OCR gratuito. Añade tu propia clave gratuita en Ajustes.');
    }
    if (!res.ok) throw new Error(`El servicio de OCR respondió con un error (${res.status}).`);
    const data = (await res.json()) as OcrSpaceResponse;
    if (data.IsErroredOnProcessing || !data.ParsedResults?.length) {
      const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join(' ') : data.ErrorMessage;
      throw new Error(msg || 'No se pudo leer el ticket.');
    }
    return data.ParsedResults.map((r) => r.ParsedText).join('\n');
  }
}

const SAMPLES = [
  `MERCADONA, S.A. A-46103834
C/ COLON 34 46004 VALENCIA
30/10/2026 18:42  OP: 123456
1 LECHE ENTERA HACEND           0,95
2 YOGUR NATURAL      1,10       2,20
1 PAN MOLDE INTEGRAL            1,35
1 ACEITE OLIVA V.EXTRA          7,85
1 PLATANO
1,234 kg   1,89 €/kg            2,33
1 DETERGENTE LIQ 40L            6,75
TOTAL (€)                      21,43
TARJETA BANCARIA               21,43`,
  `CONSUM S. COOP. V.
F-46078986
Fecha: 29-10-2026 Hora: 19:03
DESCRIPCION         UDS   PRECIO  IMPORTE
LECHE ENTERA CONSUM  6    0,89    5,34
HUEVOS L 12 UD       1    2,39    2,39
CAFE MOLIDO NATURAL  2    2,95    5,90
TOMATE TRITURADO     3    0,62    1,86
CHAMPU 400ML         1    1,79    1,79
TOTAL COMPRA                     17,28`,
];

/** Tickets de ejemplo para probar sin cámara (web) o sin conexión. */
class DemoOcrProvider implements OcrProvider {
  private i = 0;
  async recognize(): Promise<string> {
    await new Promise((r) => setTimeout(r, 1200));
    return SAMPLES[this.i++ % SAMPLES.length];
  }
}

export const ocr: OcrProvider = new OcrSpaceProvider();
export const demoOcr: OcrProvider = new DemoOcrProvider();
