import { describe, expect, it } from 'vitest';
import { fixOcrNumbers, parseReceipt } from '../receiptParser';

const names = (r: ReturnType<typeof parseReceipt>) => r.lines.map((l) => l.rawName);

describe('parseReceipt · Mercadona', () => {
  const T = `
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
1 PLATANO
1,234 kg   1,89 €/kg            2,33
TOTAL (€)                       6,83
TARJETA BANCARIA                6,83
IVA  BASE IMPONIBLE (€)  CUOTA (€)
4%   6,57                0,26
`;

  it('extrae tienda, fecha, líneas, peso y total', () => {
    const r = parseReceipt(T);
    expect(r.storeId).toBe('mercadona');
    expect(r.storeKnown).toBe(true);
    expect(r.date).toBe('2026-10-30');
    expect(r.total).toBe(6.83);
    expect(r.totalMismatch).toBe(false);
    expect(names(r)).toEqual(['LECHE ENTERA HACEND', 'YOGUR NATURAL', 'PAN MOLDE INTEGRAL', 'PLATANO']);
    expect(r.lines[1]).toMatchObject({ quantity: 2, unitPrice: 1.1, total: 2.2 });
    expect(r.lines[3]).toMatchObject({ unit: 'kg', quantity: 1.234, unitPrice: 1.89, total: 2.33 });
  });

  it('tolera errores típicos del OCR en importes y tabuladores', () => {
    const noisy = `MERCADONA S.A.
1\tLECHE ENTERA HACEND\t\tO,95
2\tYOGUR NATURAL\t1, 10\t2,2O
1\tACEITE OLIVA V.EXTRA\t7 ,85
TOTAL (€)\t11,0O`;
    const r = parseReceipt(noisy);
    expect(r.lines.map((l) => l.total)).toEqual([0.95, 2.2, 7.85]);
    expect(r.total).toBe(11);
    expect(r.totalMismatch).toBe(false);
  });
});

describe('parseReceipt · salida real de OCR.space (isTable)', () => {
  // Respuesta literal de la API para una foto de ticket de Mercadona.
  const T =
    'MERCADONA, S.A. A-46103834\t\r\nC/ COLON 34 46004 VALENCIA\t\r\nTELEFONO: 963000000\t\r\n28/10/2026 18:42 OP: 123456\t\r\nFACTURA SIMPLIFICADA: 2834-011-123456\t\r\nDescripcion\tP. Unit\tImporte\t\r\n1 LECHE SEMI HACEND\t0,92\t\r\n2 YOGUR GRIEGO NAT\t1,35\t2,70\t\r\n1 PAN MOLDE INTEGRAL\t1,35\t\r\n1 TOMATE TRITURADO\t0,65\t\r\n1 AC. OLIVA VIRG. EXTRA\t7,95\t\r\n1 PLATANO\t\r\n1,234 kg 1,89 EUR/kg\t2,33\t\r\n1 DETERGENTE LIQ 40D\t6,75\t\r\n3 AGUA MINERAL 1,5L\t0,29\t0,87\t\r\nTOTAL (EUR)\t23,52\t\r\nTARJETA BANCARIA\t23,52\t\r\nIVA BASE IMPONIBLE\tCUOTA\t\r\n10% 21,38\t2,14\t\r\n';

  it('lee todas las líneas, cantidades y el total sin descuadre', () => {
    const r = parseReceipt(T);
    expect(r.storeId).toBe('mercadona');
    expect(r.date).toBe('2026-10-28');
    expect(names(r)).toEqual([
      'LECHE SEMI HACEND',
      'YOGUR GRIEGO NAT',
      'PAN MOLDE INTEGRAL',
      'TOMATE TRITURADO',
      'AC. OLIVA VIRG. EXTRA',
      'PLATANO',
      'DETERGENTE LIQ 40D',
      'AGUA MINERAL 1,5L',
    ]);
    expect(r.lines[1]).toMatchObject({ quantity: 2, unitPrice: 1.35, total: 2.7 });
    expect(r.lines[5]).toMatchObject({ unit: 'kg', quantity: 1.234, total: 2.33 });
    expect(r.lines[7]).toMatchObject({ quantity: 3, unitPrice: 0.29, total: 0.87 });
    expect(r.total).toBe(23.52);
    expect(r.totalMismatch).toBe(false);
  });
});

describe('parseReceipt · Lidl', () => {
  const T = `
LIDL Supermercados S.A.U.
Av. del Puerto 12
EUR
Leche entera                1,98 A
  2 x 0,99
Huevos L 12 ud              2,49 A
Plátanos                    1,27 A
  0,512 kg x 2,49 EUR/kg
Tomate triturado
  3 x 0,65                  1,95 A
Chocolate negro             1,49 A
Descuento Lidl Plus        -0,30
Total                       8,88
Tarjeta                     8,88
29.10.26 19:03
`;

  it('aplica multiplicadores y pesos que vienen debajo del producto', () => {
    const r = parseReceipt(T);
    expect(r.storeId).toBe('lidl');
    expect(r.date).toBe('2026-10-29');
    expect(names(r)).toEqual(['Leche entera', 'Huevos L 12 ud', 'Plátanos', 'Tomate triturado', 'Chocolate negro']);
    expect(r.lines[0]).toMatchObject({ quantity: 2, unitPrice: 0.99, total: 1.98 });
    expect(r.lines[2]).toMatchObject({ unit: 'kg', quantity: 0.512, unitPrice: 2.49, total: 1.27 });
    expect(r.lines[3]).toMatchObject({ quantity: 3, unitPrice: 0.65, total: 1.95 });
  });

  it('resta los descuentos al producto anterior y cuadra el total', () => {
    const r = parseReceipt(T);
    expect(r.lines[4].total).toBe(1.19);
    expect(r.total).toBe(8.88);
    expect(r.totalMismatch).toBe(false);
  });
});

describe('parseReceipt · Carrefour', () => {
  const T = `
CARREFOUR EXPRESS
CENTROS COMERCIALES CARREFOUR S.A.
NIF A28425270
8410128000011 LECHE SEMI CARREFOUR 1L      0,79
8480000123456 ARROZ REDONDO 1KG            1,39
2 x 1,15
8480000654321 GALLETAS MARIA               2,30
8410000000000 DETERGENTE COLON 40D         7,95
DTO. 2a UNIDAD                            -1,99
TOTAL A PAGAR                             10,44
ENTREGADO                                 20,00
CAMBIO                                     9,56
05/10/2026
`;

  it('quita códigos EAN y aplica el multiplicador al producto que corresponde', () => {
    const r = parseReceipt(T);
    expect(r.storeId).toBe('carrefour');
    expect(names(r)).toEqual(['LECHE SEMI CARREFOUR 1L', 'ARROZ REDONDO 1KG', 'GALLETAS MARIA', 'DETERGENTE COLON 40D']);
    expect(r.lines[2]).toMatchObject({ quantity: 2, unitPrice: 1.15, total: 2.3 });
    expect(r.lines[3].total).toBe(5.96);
    expect(r.total).toBe(10.44);
    expect(r.totalMismatch).toBe(false);
  });
});

describe('parseReceipt · Consum y otros formatos', () => {
  it('reconoce Consum (cooperativa) y la cantidad en columna', () => {
    const r = parseReceipt(`
CONSUM S. COOP. V.
F-46078986
C/ Mayor 5 - 46900 Torrent
Fecha: 12-10-2026 Hora: 10:22
DESCRIPCION         UDS   PRECIO  IMPORTE
CAFE MOLIDO NATURAL  2    2,95    5,90
LEJIA CONSUM 2L      1    0,99    0,99
PAN BARRA            3    0,45    1,35
TOTAL COMPRA                      8,24
`);
    expect(r.storeId).toBe('consum');
    expect(r.storeName).toBe('Consum');
    expect(r.date).toBe('2026-10-12');
    expect(names(r)).toEqual(['CAFE MOLIDO NATURAL', 'LEJIA CONSUM 2L', 'PAN BARRA']);
    expect(r.lines.map((l) => l.quantity)).toEqual([2, 1, 3]);
    expect(r.totalMismatch).toBe(false);
  });

  it('deduce la cantidad cuando solo hay precio unitario e importe', () => {
    const r = parseReceipt('DIA RETAIL ESPAÑA S.A.U.\nAGUA MINERAL 1,5L   0,35   2,10\nTOTAL 2,10');
    expect(r.storeId).toBe('dia');
    expect(r.lines[0]).toMatchObject({ quantity: 6, unitPrice: 0.35, total: 2.1 });
  });

  it('une nombres partidos en dos líneas y acepta el total en la línea siguiente', () => {
    const r = parseReceipt(`ALDI SUPERMERCADOS
TOMATE TRITURADO
EXTRA FINO           0,69 A
PECHUGA POLLO 500G   3,49 A
TOTAL
4,18
VISA ****1234`);
    expect(names(r)).toEqual(['TOMATE TRITURADO EXTRA FINO', 'PECHUGA POLLO 500G']);
    expect(r.total).toBe(4.18);
  });

  it('ignora todo lo que va después del total (IVA, pago, puntos)', () => {
    const r = parseReceipt(`EROSKI
QUESO TIERNO  3,20
TOTAL  3,20
10% IVA BASE 2,91 CUOTA 0,29
CLUB EROSKI SALDO 1,25
GRACIAS POR SU VISITA`);
    expect(r.lines).toHaveLength(1);
  });

  it('marca descuadre y baja confianza cuando el OCR lee mal', () => {
    const r = parseReceipt('MERCADONA\n2 YOG|_R NAT 1,10 2,90\nTOTAL 9,99');
    expect(r.totalMismatch).toBe(true);
    expect(r.lines[0].confidence).toBeLessThan(0.7);
  });
});

describe('detección de tiendas desconocidas', () => {
  it('deduce el nombre comercial de la cabecera para crear la tienda', () => {
    const r = parseReceipt(`SUPERMERCADOS LA PLAZA S.L.
B-12345678
Av. Andalucía 3, 29001 Málaga
Tel. 952000000
MANZANA GOLDEN  1,80
TOTAL 1,80`);
    expect(r.storeKnown).toBe(false);
    expect(r.storeName).toBe('Supermercados la Plaza');
    expect(r.storeId).toBe('supermercados-la-plaza');
    expect(names(r)).toEqual(['MANZANA GOLDEN']);
  });
});

describe('fixOcrNumbers', () => {
  it('corrige letras confundidas con cifras solo en importes', () => {
    expect(fixOcrNumbers('LECHE SOJA O,95')).toBe('LECHE SOJA 0,95');
    expect(fixOcrNumbers('PAN 1 ,35')).toBe('PAN 1,35');
    expect(fixOcrNumbers('OLIVAS 2,l5')).toBe('OLIVAS 2,15');
  });
});
