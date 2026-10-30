// Capa OCR intercambiable. La app solo necesita texto plano: el parseo a estructura
// (`parseReceipt`) es local, determinista y testeado, así que cambiar de proveedor no afecta al resto.

export interface OcrImage {
  uri: string;
  base64?: string;
}

export interface OcrProvider {
  recognize(image: OcrImage): Promise<string>;
}

/**
 * Supabase Edge Function `ocr-receipt` (ver supabase/functions). Mantiene la clave de
 * Google Cloud Vision fuera de la app y permite cambiar de motor sin publicar versión.
 */
class RemoteOcrProvider implements OcrProvider {
  constructor(private endpoint: string, private anonKey: string) {}

  async recognize(image: OcrImage): Promise<string> {
    if (!image.base64) throw new Error('La imagen debe capturarse con base64: true');
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.anonKey}` },
      body: JSON.stringify({ image: image.base64 }),
    });
    if (!res.ok) throw new Error(`OCR ${res.status}`);
    const { text } = (await res.json()) as { text: string };
    return text;
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
PLATANO
1,234 kg   1,89 €/kg            2,33
1 DETERGENTE LIQ 40L            6,75
TOTAL (€)                      21,43
TARJETA BANCARIA               21,43`,
  `LIDL Supermercados S.A.U.
Leche entera 0,92 A
Huevos L 12 ud 2,29 A
Tomate triturado
3 x 0,62 1,86 A
Cafe molido 250g 2,95 A
Champu 400ml 1,79 A
Total 9,81
29.10.26 19:03`,
];

/** Proveedor de demo para desarrollar sin backend (Expo Go, web, CI). */
class DemoOcrProvider implements OcrProvider {
  private i = 0;
  async recognize(): Promise<string> {
    await new Promise((r) => setTimeout(r, 1400));
    return SAMPLES[this.i++ % SAMPLES.length];
  }
}

const endpoint = process.env.EXPO_PUBLIC_OCR_ENDPOINT;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const ocr: OcrProvider = endpoint && anonKey ? new RemoteOcrProvider(endpoint, anonKey) : new DemoOcrProvider();
export const isDemoOcr = !(endpoint && anonKey);
