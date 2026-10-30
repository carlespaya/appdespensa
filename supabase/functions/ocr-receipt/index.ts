// Supabase Edge Function (Deno): recibe la foto del ticket en base64 y devuelve el texto OCR.
// La clave de Google Cloud Vision vive solo aquí (secret GOOGLE_VISION_API_KEY), nunca en la app.
//
//   supabase secrets set GOOGLE_VISION_API_KEY=...
//   supabase functions deploy ocr-receipt

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
const MAX_BASE64_BYTES = 6 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // La verificación del JWT del usuario la hace Supabase antes de invocar la función (verify_jwt = true).
  const { image } = (await req.json().catch(() => ({}))) as { image?: string };
  if (!image || image.length > MAX_BASE64_BYTES) {
    return Response.json({ error: 'Imagen ausente o demasiado grande' }, { status: 400 });
  }

  const res = await fetch(`${VISION_URL}?key=${Deno.env.get('GOOGLE_VISION_API_KEY')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: image },
          // DOCUMENT_TEXT_DETECTION conserva mejor el orden de líneas y columnas que TEXT_DETECTION.
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['es', 'ca', 'eu', 'gl'] },
        },
      ],
    }),
  });

  if (!res.ok) return Response.json({ error: `Vision ${res.status}` }, { status: 502 });
  const data = await res.json();
  const text: string = data.responses?.[0]?.fullTextAnnotation?.text ?? '';
  return Response.json({ text });
});
