import { useAppChrome } from '../context/AppChromeContext.jsx';
import styles from '../styles/LoadingSkeleton.module.css';

export default function LoadingSkeleton() {
  const { t } = useAppChrome();
  return (
    <div className={styles.wrap} aria-busy="true" aria-label={t.loadingAria}>
      {[0, 1, 2].map((k) => (
        <div key={k} className={styles.card}>
          <div className={styles.hero} />
          <div className={styles.body}>
            <div className={`${styles.line} ${styles.lineShort}`} />
            <div className={`${styles.line} ${styles.lineTitle}`} />
            <div className={`${styles.line} ${styles.lineTitle2}`} />
            <div className={`${styles.line} ${styles.lineShort}`} />
            <div className={styles.footerSk}>
              <div className={styles.pillSk} />
              <div className={styles.rankSk} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
