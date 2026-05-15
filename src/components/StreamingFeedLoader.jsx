import { Loader2 } from 'lucide-react';
import { useAppChrome } from '../context/AppChromeContext.jsx';
import styles from '../styles/StreamingFeedLoader.module.css';

function fillPlaceholders(str, loaded, total) {
  return String(str).replaceAll('{loaded}', String(loaded)).replaceAll('{total}', String(total));
}

/**
 * Shown at the bottom of the feed while SSE per-article mode is still fetching more topics.
 */
export default function StreamingFeedLoader({ loaded, total }) {
  const { t } = useAppChrome();
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeLoaded = Math.min(Math.max(0, Number(loaded) || 0), safeTotal);

  return (
    <div className={styles.wrap} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.inner}>
        <div className={styles.topRow}>
          <div className={styles.spinner} aria-hidden>
            <Loader2 size={20} strokeWidth={2.4} />
          </div>
          <div className={styles.copy}>
            <div className={`${styles.title} hinBody`}>{t.streamMoreHeadlines}</div>
            <div className={`${styles.hint} hinBody`}>
              {fillPlaceholders(t.streamProgressHint, safeLoaded, safeTotal)}
            </div>
            <div className={`${styles.sub} hinBody`}>{t.streamMoreSub}</div>
          </div>
        </div>
        <div className={styles.dots} aria-hidden>
          {Array.from({ length: safeTotal }, (_, i) => {
            const filled = i < safeLoaded;
            const pulse = i === safeLoaded && safeLoaded < safeTotal;
            return (
              <span
                key={i}
                className={`${styles.dot}${filled ? ` ${styles.dotFilled}` : ''}${pulse ? ` ${styles.dotPulse}` : ''}`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
