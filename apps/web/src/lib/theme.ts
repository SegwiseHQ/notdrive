import { useEffect } from 'react';
import { useUi } from './store.js';

export function useApplyTheme() {
  const dark = useUi((s) => s.darkOverride);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const on = dark === 'dark' || (dark === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', on);
    };
    apply();
    if (dark === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
  }, [dark]);
}
