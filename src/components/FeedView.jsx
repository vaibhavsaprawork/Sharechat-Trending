import {
  Bell,
  CirclePlus,
  Flame,
  Home,
  Moon,
  RefreshCw,
  Search,
  Signal,
  Sun,
  User,
  Wifi,
  Battery,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppChrome } from '../context/AppChromeContext.jsx';
import { CATEGORY_ORDER } from '../lib/categories';
import { pillLabel } from '../lib/translations.jsx';
import BottomSheet from './BottomSheet.jsx';
import LoadingSkeleton from './LoadingSkeleton';
import StreamingFeedLoader from './StreamingFeedLoader.jsx';
import TagCard from './TagCard';
import styles from '../styles/FeedView.module.css';

function formatClock(d) {
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function FeedView({
  topics,
  loading,
  error,
  streamProgress,
  onOpenTopic,
  onRefresh,
  refreshing,
}) {
  const { t, locale, setLocaleMode, theme, toggleTheme, savedPostIds } = useAppChrome();
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState('सभी');
  const [sheet, setSheet] = useState(null);
  const [toastOpen, setToastOpen] = useState(false);
  const scrollBodyRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const scrollFeedTop = useCallback(() => {
    scrollBodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const showComingSoonToast = useCallback(() => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastOpen(true);
    toastTimerRef.current = window.setTimeout(() => {
      setToastOpen(false);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const onHome = useCallback(() => {
    setSheet(null);
    setFilter('सभी');
    scrollFeedTop();
  }, [scrollFeedTop]);

  const onTrendingNav = useCallback(() => {
    setSheet(null);
    scrollFeedTop();
  }, [scrollFeedTop]);

  const filtered = useMemo(() => {
    if (filter === 'सभी') return topics;
    return topics.filter((topic) => topic.category === filter);
  }, [topics, filter]);

  return (
    <div className={styles.root}>
      <div className={styles.topChrome}>
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
              className="navCircleBtn navCircleBtnSm"
              onClick={onRefresh}
              disabled={loading || refreshing}
              aria-label={t.refresh}
            >
              <RefreshCw size={17} strokeWidth={2} className={refreshing ? styles.spin : ''} />
            </button>
            <button type="button" className="navCircleBtn navCircleBtnSm" aria-label={t.search}>
              <Search size={17} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="navCircleBtn navCircleBtnSm"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? (
                <Moon size={17} strokeWidth={2} className={styles.themeIconMoon} />
              ) : (
                <Sun size={17} strokeWidth={2} className={styles.themeIconSun} />
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
            <button type="button" className="navCircleBtn navCircleBtnSm" aria-label={t.notifications}>
              <Bell size={17} strokeWidth={2} />
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
      </div>

      <div ref={scrollBodyRef} className={styles.scrollBody}>
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
                {filter === 'सभी' && topics.length === 0
                  ? t.emptyFeedNoData
                  : t.errorEmptyCategory}
              </div>
            ) : (
              filtered.map((topic) => (
                <TagCard key={`${topic.rank}-${topic.hashtag}`} topic={topic} onOpen={onOpenTopic} />
              ))
            )}
            {topics.length > 0 &&
            streamProgress &&
            streamProgress.loaded < streamProgress.total ? (
              <StreamingFeedLoader loaded={streamProgress.loaded} total={streamProgress.total} />
            ) : null}
          </div>
        )}
      </div>

      <nav className={styles.bottomDock} aria-label={t.navMain}>
        <button type="button" className={styles.bottomNavItem} onClick={onHome}>
          <Home size={22} strokeWidth={2} className={styles.bottomNavIcon} aria-hidden />
          <span className={styles.bottomNavLabel}>{t.navHome}</span>
        </button>
        <button
          type="button"
          className={`${styles.bottomNavItem} ${styles.bottomNavItemActive}`}
          aria-current="page"
          onClick={onTrendingNav}
        >
          <Flame size={22} strokeWidth={2.2} className={styles.bottomNavIcon} aria-hidden />
          <span className={styles.bottomNavLabel}>{t.navTrending}</span>
        </button>
        <button type="button" className={styles.bottomNavItem} onClick={() => setSheet('create')}>
          <CirclePlus size={24} strokeWidth={2} className={styles.bottomNavIcon} aria-hidden />
          <span className={styles.bottomNavLabel}>{t.navCreate}</span>
        </button>
        <button type="button" className={styles.bottomNavItem} onClick={() => setSheet('notifications')}>
          <Bell size={22} strokeWidth={2} className={styles.bottomNavIcon} aria-hidden />
          <span className={styles.bottomNavLabel}>{t.notifications}</span>
        </button>
        <button type="button" className={styles.bottomNavItem} onClick={() => setSheet('profile')}>
          <User size={22} strokeWidth={2} className={styles.bottomNavIcon} aria-hidden />
          <span className={styles.bottomNavLabel}>{t.navProfile}</span>
        </button>
      </nav>

      {toastOpen ? (
        <div className={styles.toast} role="status">
          {t.toastComingSoon}
        </div>
      ) : null}

      <BottomSheet
        open={sheet === 'create'}
        onClose={() => setSheet(null)}
        title={t.sheetCreateTitle}
        ariaLabel={t.sheetCreateTitle}
      >
        <div className={styles.createGrid}>
          <button
            type="button"
            className={styles.createCard}
            onClick={showComingSoonToast}
          >
            {t.createOptText}
          </button>
          <button
            type="button"
            className={styles.createCard}
            onClick={showComingSoonToast}
          >
            {t.createOptPhoto}
          </button>
          <button
            type="button"
            className={styles.createCard}
            onClick={showComingSoonToast}
          >
            {t.createOptVideo}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={sheet === 'notifications'}
        onClose={() => setSheet(null)}
        title={t.sheetNotifTitle}
        ariaLabel={t.sheetNotifTitle}
      >
        <ul className={styles.notifList}>
          <li className={styles.notifRow}>
            <span className={styles.notifDot} aria-hidden />
            <div className={styles.notifBody}>
              <p className={`${styles.notifText} hinBody`}>{t.notifMock1}</p>
              <time className={styles.notifTime}>{t.notifMock1Time}</time>
            </div>
          </li>
          <li className={styles.notifRow}>
            <span className={styles.notifDot} aria-hidden />
            <div className={styles.notifBody}>
              <p className={`${styles.notifText} hinBody`}>{t.notifMock2}</p>
              <time className={styles.notifTime}>{t.notifMock2Time}</time>
            </div>
          </li>
          <li className={styles.notifRow}>
            <span className={styles.notifDot} aria-hidden />
            <div className={styles.notifBody}>
              <p className={`${styles.notifText} hinBody`}>
                {t.notifMock3.replace('{n}', String(savedPostIds.length))}
              </p>
              <time className={styles.notifTime}>{t.notifMock3Time}</time>
            </div>
          </li>
        </ul>
      </BottomSheet>

      <BottomSheet
        open={sheet === 'profile'}
        onClose={() => setSheet(null)}
        title={t.sheetProfileTitle}
        ariaLabel={t.sheetProfileTitle}
      >
        <div className={styles.profileCard}>
          <div className={styles.profileAvatar} aria-hidden>
            {t.profileDisplayName.slice(0, 2).toUpperCase()}
          </div>
          <div className={styles.profileMeta}>
            <div className={styles.profileName}>{t.profileDisplayName}</div>
            <div className={`${styles.profileLine} hinBody`}>
              {t.profileSavedLine.replace('{n}', String(savedPostIds.length))}
            </div>
            <div className={styles.profileLine}>
              {t.profileLangLabel}: {locale === 'hi' ? t.langHiLabel : t.langEnLabel}
            </div>
            <div className={styles.profileLine}>
              {t.profileThemeLabel}: {theme === 'dark' ? t.themeDark : t.themeLight}
            </div>
            <button
              type="button"
              className={styles.profileLinkBtn}
              onClick={() => window.open('https://sharechat.com', '_blank', 'noopener,noreferrer')}
            >
              {t.profileOpenApp}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
