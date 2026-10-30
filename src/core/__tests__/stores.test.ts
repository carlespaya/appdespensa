import { describe, expect, it } from 'vitest';
import { categorize } from '../categorize';
import { chainForOsm, detectStore } from '../stores';

describe('chainForOsm', () => {
  it('asocia los nombres reales de OpenStreetMap a su cadena', () => {
    expect(chainForOsm({ brand: 'Consum', name: 'Consum' })?.id).toBe('consum');
    expect(chainForOsm({ name: 'Supermercados Charter' })?.id).toBe('consum');
    expect(chainForOsm({ brand: 'Dia', name: 'Dia' })?.id).toBe('dia');
    expect(chainForOsm({ brand: 'ALDI', name: 'ALDI' })?.id).toBe('aldi');
    expect(chainForOsm({ name: 'Carrefour express' })?.id).toBe('carrefour');
  });

  it('no confunde cadenas parecidas ni tiendas sin cadena', () => {
    expect(chainForOsm({ brand: 'Dialprix', name: 'Dialprix' })).toBeUndefined();
    expect(chainForOsm({ name: 'Herbolario Navarro' })).toBeUndefined();
  });
});

describe('detectStore', () => {
  it('reconoce cadenas aunque el OCR cambie letras por cifras', () => {
    expect(detectStore(['M3RCAD0NA, S.A.'])?.id).toBe('mercadona');
    expect(detectStore(['C0NSUM S. COOP. V.'])?.id).toBe('consum');
  });

  it('devuelve null si no hay nada que parezca un nombre', () => {
    expect(detectStore(['30/10/2026 18:42', 'C/ Mayor 3, 46001'])).toBeNull();
  });
});

describe('categorize', () => {
  it('prioriza las reglas específicas sobre las genéricas', () => {
    expect(categorize('TOMATE TRITURADO')).toBe('despensa');
    expect(categorize('TOMATE PERA')).toBe('frescos');
    expect(categorize('PASTA DIENTES')).toBe('higiene');
  });
});
