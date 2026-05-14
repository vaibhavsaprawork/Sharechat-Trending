import styles from '../styles/LoadingSkeleton.module.css';

export default function LoadingSkeleton() {
  return (
    <div className={styles.wrap} aria-busy="true" aria-label="लोड हो रहा है">
      {[0, 1, 2].map((k) => (
        <div key={k} className={styles.card}>
          <div className={styles.hero} />
          <div className={styles.body}>
            <div className={styles.icon} />
            <div className={styles.lines}>
              <div className={styles.line} />
              <div className={`${styles.line} ${styles.lineShort}`} />
              <div className={styles.line} />
            </div>
            <div className={styles.rank} />
          </div>
        </div>
      ))}
    </div>
  );
}
