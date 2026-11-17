import { useCallback, useEffect, useState } from 'react';

import { canSelfUpdate, checkForUpdate, downloadAndInstall, type AvailableUpdate } from '@/services/updates';

type Status = 'idle' | 'checking' | 'available' | 'upToDate' | 'downloading' | 'error';

/** Una sola comprobación por arranque de la app, compartida por todas las pantallas. */
let sessionCheck: Promise<AvailableUpdate | null> | null = null;

export function useAppUpdate({ autoCheck = false } = {}) {
  const [status, setStatus] = useState<Status>(() => (autoCheck && canSelfUpdate() ? 'checking' : 'idle'));
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const check = useCallback(async (force = false) => {
    if (!canSelfUpdate()) return;
    setStatus('checking');
    try {
      if (force || !sessionCheck) sessionCheck = checkForUpdate();
      const found = await sessionCheck;
      setUpdate(found);
      setStatus(found ? 'available' : 'upToDate');
    } catch (e) {
      sessionCheck = null;
      setError(e instanceof Error ? e.message : 'No se pudo comprobar.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!autoCheck || !canSelfUpdate()) return;
    let alive = true;
    sessionCheck ??= checkForUpdate();
    sessionCheck
      .then((found) => {
        if (!alive) return;
        setUpdate(found);
        setStatus(found ? 'available' : 'upToDate');
      })
      .catch((e) => {
        sessionCheck = null;
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'No se pudo comprobar.');
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [autoCheck]);

  const install = useCallback(async () => {
    if (!update) return;
    setStatus('downloading');
    setProgress(0);
    try {
      await downloadAndInstall(update, setProgress);
      setStatus('available');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar la actualización.');
      setStatus('error');
    }
  }, [update]);

  return { supported: canSelfUpdate(), status, update, progress, error, check, install };
}
