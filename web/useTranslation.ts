import { useEffect, useState } from 'react';
import { request } from './domain';

export function useTranslation<T>(path: string | null) {
  const [cache, setCache] = useState<Record<string, T>>({});
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const value = path ? cache[path] : undefined;

  useEffect(() => {
    if (!path || value !== undefined) return;
    const controller = new AbortController();
    request<T>(path, { method: 'POST', signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) {
          setCache(current => {
            const next = { ...current, [path]: result };
            const keys = Object.keys(next);
            if (keys.length > 24) delete next[keys[0]];
            return next;
          });
          setFailedPath(previous => previous === path ? null : previous);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedPath(path);
      });
    return () => controller.abort();
  }, [path, value, attempt]);

  const failed = path !== null && failedPath === path;
  return {
    value,
    failed,
    loading: path !== null && value === undefined && !failed,
    retry: () => { setFailedPath(null); setAttempt(current => current + 1); },
  };
}
