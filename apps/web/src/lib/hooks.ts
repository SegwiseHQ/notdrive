import { useEffect, useState } from 'react';

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
