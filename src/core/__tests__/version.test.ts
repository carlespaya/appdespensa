import { describe, expect, it } from 'vitest';
import { compareVersions, parseVersion, versionCode } from '../version';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { addReleaseSigning } = require('../../../plugins/withReleaseSigning');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { setVersion } = require('../../../scripts/set-version');

describe('versiones', () => {
  it('compara versiones con o sin "v" delante', () => {
    expect(compareVersions('v1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', 'v1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareVersions('basura', '1.0.0')).toBe(0);
    expect(parseVersion('2.0')).toBeNull();
  });

  it('el versionCode siempre crece con la versión', () => {
    expect(versionCode('1.0.0')).toBe(10000);
    expect(versionCode('1.2.3')).toBe(10203);
    expect(versionCode('1.10.0')).toBeGreaterThan(versionCode('1.9.99'));
  });

  it('el script de CI fija versión y versionCode en app.json con la misma fórmula', () => {
    const app = { expo: { version: '1.0.0', android: { versionCode: 1 } } };
    expect(setVersion(app, 'v1.3.2').expo).toMatchObject({ version: '1.3.2', android: { versionCode: versionCode('1.3.2') } });
    expect(() => setVersion(app, 'v1.3')).toThrow();
  });
});

describe('plugin de firma', () => {
  const GRADLE = `
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }`;

  it('firma la release con la clave de CI y deja intacta la de debug', () => {
    const out: string = addReleaseSigning(GRADLE);
    expect(out).toContain("storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))");
    expect(out).toContain("signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug");
    expect(out.match(/signingConfig signingConfigs\.debug/g)).toHaveLength(1);
    expect(addReleaseSigning(out)).toBe(out);
  });
});
