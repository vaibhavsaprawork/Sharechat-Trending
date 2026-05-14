import {
  CategoryIcon,
  TOPIC_HERO_IMG_STYLE,
  TOPIC_IMAGES,
  resolveTopicImageUrl,
} from '../lib/categories';
import { useAppChrome } from '../context/AppChromeContext.jsx';
import HeatBadge from './HeatBadge';
import styles from '../styles/TagCard.module.css';

export default function TagCard({ topic, onOpen }) {
  const { t } = useAppChrome();
  const cat = topic.category;
  const imgSrc = resolveTopicImageUrl(topic);

  return (
    <button type="button" className={styles.card} onClick={() => onOpen(topic)}>
      <div className={styles.heroWrap}>
        <img
          src={imgSrc}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          style={TOPIC_HERO_IMG_STYLE}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = TOPIC_IMAGES['समाचार'];
          }}
        />
      </div>

      <div className={styles.body}>
        <div className={`${styles.catLabelRow} catMetaAccent`} data-cat={cat}>
          <span className={styles.catIconInline}>
            <CategoryIcon category={cat} size={12} />
          </span>
          <span>{topic.category}</span>
        </div>

        <div className={styles.titleBlock}>
          <div className={`${styles.tagName} hinBody`}>{topic.hindiName}</div>
        </div>

        <div className={`${styles.desc} hinBody`}>{topic.description}</div>

        <div className={styles.footerRow}>
          <span className={styles.rankChip} title={`#${topic.rank} · ${t.rankChipLabel}`}>
            <span className={styles.rankNum}>#{topic.rank}</span>
            <span className={styles.rankSep}>·</span>
            <span className={styles.rankLbl}>{t.rankChipLabel}</span>
          </span>
          <HeatBadge score={topic.heatScore} />
        </div>
      </div>
    </button>
  );
}
