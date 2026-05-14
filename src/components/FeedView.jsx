import {
  Bell,
  Moon,
  RefreshCw,
  Search,
  Signal,
  Sun,
  Wifi,
  Battery,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAppChrome } from '../context/AppChromeContext.jsx';
import { CATEGORY_ORDER } from '../lib/categories';
import { pillLabel } from '../lib/translations.js';
import LoadingSkeleton from './LoadingSkeleton';
import TagCard from './TagCard';
import styles from '../styles/FeedView.module.css';

function formatClock(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function FeedView({ topics, loading, error, onOpenTopic, onRefresh, refreshing }) {
  const { t, locale, setLocaleMode, theme, toggleTheme } = useAppChrome();
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState('सभी');

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'सभी') return topics;
    return topics.filter((topic) => topic.category === filter);
  }, [topics, filter]);

  return (
    <div className={styles.root}>
      <div className={styles.statusBar}>
        <span>{formatClock(now)}</span>
        <div className={styles.statusIcons} aria-hidden>
          <Signal size={14} strokeWidth={2.2} />
          <Wifi size={14} strokeWidth={2.2} />
          <Battery size={14} strokeWidth={2.2} />
        </div>
      </div>

      <div className={styles.header}>
        <div className={styles.title}>{t.appTitle}</div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onRefresh}
            disabled={loading || refreshing}
            aria-label={t.refresh}
          >
            <RefreshCw size={18} strokeWidth={2} className={refreshing ? styles.spin : ''} />
          </button>
          <button type="button" className={styles.iconBtn} aria-label={t.search}>
            <Search size={18} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <Moon size={18} strokeWidth={2} className={styles.themeIconMoon} />
            ) : (
              <Sun size={18} strokeWidth={2} className={styles.themeIconSun} />
            )}
          </button>
          <div className={styles.langGroup} role="group" aria-label="Language">
            <button
              type="button"
              className={`${styles.langBtn} ${locale === 'hi' ? styles.langActive : styles.langIdle}`}
              onClick={() => setLocaleMode('hi')}
            >
              हिं
            </button>
            <button
              type="button"
              className={`${styles.langBtn} ${locale === 'en' ? styles.langActive : styles.langIdle}`}
              onClick={() => setLocaleMode('en')}
            >
              EN
            </button>
          </div>
          <button type="button" className={styles.iconBtn} aria-label={t.notifications}>
            <Bell size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="categories-row" role="tablist" aria-label={t.category}>
        {CATEGORY_ORDER.map((c) => {
          const active = c === filter;
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={active}
              className={`category-pill${active ? ' active' : ''}`}
              onClick={() => setFilter(c)}
            >
              {pillLabel(locale, c)}
            </button>
          );
        })}
      </div>

      <div className={`${styles.sectionLabel} hinBody`}>
        <span className={styles.sectionFlame} aria-hidden />
        <span>{t.trendingNow}</span>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          {t.errorLoad}
          <div className={`${styles.errorDetail} hinBody`}>{error}</div>
        </div>
      ) : null}

      {loading ? (
        <LoadingSkeleton />
      ) : error ? null : (
        <div className={styles.list}>
          {filtered.length === 0 ? (
            <div className={styles.error} role="status">
              {t.errorEmptyCategory}
            </div>
          ) : (
            filtered.map((topic) => (
              <TagCard key={`${topic.rank}-${topic.hashtag}`} topic={topic} onOpen={onOpenTopic} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
