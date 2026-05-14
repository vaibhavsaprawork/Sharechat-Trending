import {
  CategoryIcon,
  TOPIC_HERO_IMG_STYLE,
  TOPIC_IMAGES,
  resolveTopicImageUrl,
} from '../lib/categories';
import HeatBadge from './HeatBadge';
import styles from '../styles/TagCard.module.css';

export default function TagCard({ topic, onOpen }) {
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
        <div className={styles.heroGradTop} aria-hidden />
        <div className={styles.heroGradBottom} aria-hidden />
      </div>

      <div className={styles.body}>
        <span className={`${styles.catIcon} catIconTint`} data-cat={cat}>
          <CategoryIcon category={cat} size={18} />
        </span>

        <div className={styles.mainCol}>
          <div className={styles.rowTitle}>
            <div className={`${styles.tagName} hinBody`}>{topic.hindiName}</div>
            <span className={styles.rankInline}>#{topic.rank}</span>
          </div>

          <div className={styles.rowMeta}>
            <span className={`${styles.pill} catPill hinBody`} data-cat={cat}>
              {topic.category}
            </span>
            <HeatBadge score={topic.heatScore} label={topic.heatLabel} />
          </div>

          <div className={`${styles.desc} hinBody`}>{topic.description}</div>
        </div>
      </div>
    </button>
  );
}
