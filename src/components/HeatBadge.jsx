import styles from '../styles/HeatBadge.module.css';

function tierForScore(x) {
  if (x >= 90) return 'hot';
  if (x >= 75) return 'rising';
  if (x >= 60) return 'viral';
  return 'cool';
}

export default function HeatBadge({ score, label }) {
  const n = Number(score);
  const s = Number.isFinite(n) ? n : 0;
  const tier = tierForScore(s);

  return (
    <div className={styles.heatBadge} data-tier={tier}>
      <span>🔥</span>
      <span>{s}</span>
      <span className={styles.divider} aria-hidden />
      <span className={styles.label}>{label != null ? String(label) : ''}</span>
    </div>
  );
}
