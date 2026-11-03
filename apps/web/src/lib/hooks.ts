import { useEffect, useState } from 'react';
import { MOBILE_QUERY, isMobileViewport } from './store.js';

/**
 * Returns `value` after it has stopped changing for `delay` ms. Useful for
 * gating expensive effects (network calls) on user input that may change
 * rapidly.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** True while the viewport is phone-sized (below Tailwind's `md` breakpoint). */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(isMobileViewport);
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return mobile;
}
