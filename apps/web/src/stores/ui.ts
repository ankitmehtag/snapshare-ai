import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface UiState {
  theme: Theme;
  language: 'en' | 'hi';
  setTheme: (theme: Theme) => void;
  setLanguage: (language: 'en' | 'hi') => void;
}

/** Per-device UI preferences (not account data — that lives on the server). */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'en',
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'snapshare-ui' },
  ),
);

export function resolveDark(theme: Theme): boolean {
  if (theme === 'system')
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return theme === 'dark';
}
