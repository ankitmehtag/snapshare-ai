import { Button } from '@snapshare/ui';
import { Moon, Sun } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveDark, useUiStore } from '../stores/ui';

/** Applies theme + language preferences to <html>. Mounted once at the root. */
export function PreferencesEffect() {
  const { theme, language } = useUiStore();
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolveDark(theme));
  }, [theme]);
  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language, i18n]);
  return null;
}

export function PreferenceControls() {
  const { t } = useTranslation();
  const { theme, setTheme, language, setLanguage } = useUiStore();
  const dark = resolveDark(theme);
  const next = dark ? 'light' : 'dark';
  return (
    <div className="flex items-center gap-1">
      <label className="sr-only" htmlFor="lang">
        {t('language.label')}
      </label>
      <select
        id="lang"
        value={language}
        onChange={(e) => setLanguage(e.target.value as 'en' | 'hi')}
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
      >
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
      </select>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('theme.toggle', { mode: t(`theme.${next}`) })}
        onClick={() => setTheme(next)}
      >
        {dark ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}
