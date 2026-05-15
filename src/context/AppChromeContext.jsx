import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { T } from '../lib/translations.jsx';

const STORAGE_THEME = 'sharechat-theme';
const STORAGE_LOCALE = 'sharechat-locale';
const STORAGE_SAVED = 'sharechat-saved-posts';

const ChromeContext = createContext(null);

function readSavedIds() {
  try {
    const raw = localStorage.getItem(STORAGE_SAVED);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function makePostId(hashtag, tab, index) {
  const h = String(hashtag ?? '').trim();
  return `${encodeURIComponent(h)}::${tab}::${Number(index)}`;
}

export function parsePostId(id) {
  const parts = String(id).split('::');
  if (parts.length < 3) return null;
  const tab = parts[1];
  const index = Number(parts[2]);
  let hashtag = '';
  try {
    hashtag = decodeURIComponent(parts[0]);
  } catch {
    hashtag = parts[0];
  }
  if (!hashtag || !Number.isFinite(index)) return null;
  if (tab !== 'posts' && tab !== 'video' && tab !== 'reel') return null;
  return { hashtag, tab, index };
}

export function AppChromeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const v = localStorage.getItem(STORAGE_THEME);
    return v === 'light' || v === 'dark' ? v : 'dark';
  });
  const [locale, setLocale] = useState(() => {
    const v = localStorage.getItem(STORAGE_LOCALE);
    return v === 'en' || v === 'hi' ? v : 'hi';
  });
  const [savedPostIds, setSavedPostIds] = useState(readSavedIds);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setThemeMode = useCallback((mode) => {
    const next = mode === 'light' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(STORAGE_THEME, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeMode(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setThemeMode]);

  const setLocaleMode = useCallback((loc) => {
    const next = loc === 'en' ? 'en' : 'hi';
    setLocale(next);
    localStorage.setItem(STORAGE_LOCALE, next);
  }, []);

  const t = useMemo(() => T[locale] || T.hi, [locale]);

  const isSaved = useCallback(
    (id) => savedPostIds.includes(String(id)),
    [savedPostIds]
  );

  const toggleSaved = useCallback((id) => {
    const sid = String(id);
    setSavedPostIds((prev) => {
      const has = prev.includes(sid);
      const next = has ? prev.filter((x) => x !== sid) : [...prev, sid];
      localStorage.setItem(STORAGE_SAVED, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setThemeMode,
      toggleTheme,
      locale,
      setLocaleMode,
      t,
      savedPostIds,
      isSaved,
      toggleSaved,
    }),
    [
      theme,
      setThemeMode,
      toggleTheme,
      locale,
      setLocaleMode,
      t,
      savedPostIds,
      isSaved,
      toggleSaved,
    ]
  );

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

export function useAppChrome() {
  const ctx = useContext(ChromeContext);
  if (!ctx) {
    throw new Error('useAppChrome must be used within AppChromeProvider');
  }
  return ctx;
}
