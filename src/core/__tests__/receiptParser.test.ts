import { describe, expect, it } from 'vitest';
import { parseReceipt } from '../receiptParser';

const MERCADONA = `
MERCADONA, S.A. A-46103834
C/ COLON 34
46004 VALENCIA
TELÉFONO: 963000000
30/10/2026 18:42  OP: 123456
FACTURA SIMPLIFICADA: 2834-011-123456
Descripción        P. Unit   Importe
1 LECHE ENTERA HACEND           0,95
2 YOGUR NATURAL      1,10       2,20
1 PAN MOLDE INTEGRAL            1,35
PLATANO
1,234 kg   1,89 €/kg            2,33
TOTAL (€)                       6,83
TARJETA BANCARIA                6,83
IVA  BASE IMPONIBLE (€)  CUOTA (€)
4%   6,57                0,26
`;

const LIDL = `
LIDL Supermercados S.A.U.
Av. del Puerto 12
Leche entera 0,99 A
Huevos L 12 ud 2,49 A
Tomate triturado
3 x 0,65 1,95 A
Total 5,43
Tarjeta 5,43
29.10.26 19:03
`;

describe('parseReceipt', () => {
  it('extrae súper, fecha, líneas y total de un ticket de Mercadona', () => {
    const r = parseReceipt(MERCADONA);
    expect(r.storeId).toBe('mercadona');
    expect(r.date).toBe('2026-10-30');
    expect(r.total).toBe(6.83);
    expect(r.totalMismatch).toBe(false);
    expect(r.lines.map((l) => l.rawName)).toEqual([
      'LECHE ENTERA HACEND',
      'YOGUR NATURAL',
      'PAN MOLDE INTEGRAL',
      'PLATANO',
    ]);
    expect(r.lines[1]).toMatchObject({ quantity: 2, unitPrice: 1.1, total: 2.2 });
    expect(r.lines[3]).toMatchObject({ unit: 'kg', quantity: 1.234, unitPrice: 1.89, total: 2.33 });
  });

  it('soporta letras de IVA y multiplicadores estilo Lidl', () => {
    const r = parseReceipt(LIDL);
    expect(r.storeId).toBe('lidl');
    expect(r.date).toBe('2026-10-29');
    expect(r.total).toBe(5.43);
    expect(r.lines).toHaveLength(3);
    expect(r.lines[2]).toMatchObject({ rawName: 'Tomate triturado', quantity: 3, unitPrice: 0.65, total: 1.95 });
    expect(r.totalMismatch).toBe(false);
  });

  it('marca descuadre y baja confianza cuando el OCR lee mal', () => {
    const r = parseReceipt('MERCADONA\n2 YOG|_R NAT 1,10 2,90\nTOTAL 9,99');
    expect(r.totalMismatch).toBe(true);
    expect(r.lines[0].confidence).toBeLessThan(0.7);
  });
});
