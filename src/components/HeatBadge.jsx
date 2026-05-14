import { useAppChrome } from '../context/AppChromeContext.jsx';
import styles from '../styles/HeatBadge.module.css';

function tierForScore(x) {
  if (x >= 90) return 'hot';
  if (x >= 75) return 'rising';
  if (x >= 60) return 'viral';
  return 'cool';
}

function heatLabelForTier(tier, t) {
  switch (tier) {
    case 'hot':
      return t.veryHot;
    case 'rising':
      return t.rising;
    case 'viral':
      return t.viral;
    case 'cool':
    default:
      return t.emerging;
  }
}

export default function HeatBadge({ score }) {
  const { t } = useAppChrome();
  const n = Number(score);
  const s = Number.isFinite(n) ? Math.round(n) : 0;
  const tier = tierForScore(s);
  const labelText = heatLabelForTier(tier, t);

  return (
    <div className={styles.heatBadge} data-tier={tier}>
      <span className={styles.lead}>
        <span
          className={styles.iconMask}
          aria-hidden
        />
        <span className={styles.score}>{s}</span>
      </span>
      <span className={styles.label}>{labelText}</span>
    </div>
  );
}
