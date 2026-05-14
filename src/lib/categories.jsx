import {
  CloudRain,
  Cpu,
  Film,
  Landmark,
  Newspaper,
  Star,
  TrendingUp,
  Trophy,
} from 'lucide-react';

export const CATEGORY_ORDER = [
  'सभी',
  'खेल',
  'मनोरंजन',
  'समाचार',
  'त्योहार',
  'मौसम',
  'वित्त',
  'राजनीति',
  'तकनीक',
];

/** Curated Unsplash CDN fallbacks (no API key). */
export const TOPIC_IMAGES = {
  खेल: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&q=80',
  राजनीति: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=600&q=80',
  मौसम: 'https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?w=600&q=80',
  मनोरंजन: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80',
  वित्त: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&q=80',
  त्योहार: 'https://images.unsplash.com/photo-1605101100278-5d1deb2b6498?w=600&q=80',
  समाचार: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&q=80',
  तकनीक: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80',
};

export const TOPIC_HERO_IMG_STYLE = {
  width: '100%',
  height: '160px',
  objectFit: 'cover',
  display: 'block',
};

function isValidApiImageUrl(v) {
  const s = String(v ?? '').trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  const u = s.startsWith('http://') ? `https://${s.slice(7)}` : s;
  if (!/^https:\/\//i.test(u)) return '';
  return u;
}

/**
 * 1) Valid non-empty `imageUrl` from API (e.g. NewsAPI urlToImage)
 * 2) TOPIC_IMAGES[category]
 * 3) TOPIC_IMAGES['समाचार']
 */
export function getTopicImageUrl(imageUrl, category) {
  const fromApi = isValidApiImageUrl(imageUrl);
  if (fromApi) return fromApi;

  const cat = category != null ? String(category).trim() : '';
  if (cat && TOPIC_IMAGES[cat]) return TOPIC_IMAGES[cat];
  return TOPIC_IMAGES['समाचार'];
}

export function resolveTopicImageUrl(topic) {
  if (!topic) return TOPIC_IMAGES['समाचार'];
  return getTopicImageUrl(topic.imageUrl, topic.category);
}

export const CATEGORY_STYLES = {
  खेल: { fg: '#4CAF50', bg: '#1A2E1A', emoji: '🏏' },
  समाचार: { fg: '#9C6FE4', bg: '#1E1A2E', emoji: '📰' },
  मनोरंजन: { fg: '#FF5C35', bg: '#2E1A1A', emoji: '🎬' },
  मौसम: { fg: '#4FC3F7', bg: '#1A2530', emoji: '🌧️' },
  वित्त: { fg: '#FFB74D', bg: '#2A2518', emoji: '📈' },
  त्योहार: { fg: '#E91E8C', bg: '#2E1E2A', emoji: '✨' },
  राजनीति: { fg: '#9C6FE4', bg: '#1E1A2E', emoji: '🏛️' },
  तकनीक: { fg: '#4FC3F7', bg: '#1A2530', emoji: '💻' },
};

/** CSS var names for category accent (borders, emphasis). */
export const CATEGORY_ACCENT_VAR = {
  खेल: 'var(--cat-khel-fg)',
  समाचार: 'var(--cat-samachar-fg)',
  मनोरंजन: 'var(--cat-manoranjan-fg)',
  मौसम: 'var(--cat-mausam-fg)',
  वित्त: 'var(--cat-vitt-fg)',
  त्योहार: 'var(--cat-tyohar-fg)',
  राजनीति: 'var(--cat-rajniti-fg)',
  तकनीक: 'var(--cat-taknik-fg)',
};

/** CSS var names for gradients (see `src/index.css` token definitions). */
export const CATEGORY_GRAD_VAR = {
  खेल: 'var(--cat-khel-bg)',
  समाचार: 'var(--cat-samachar-bg)',
  मनोरंजन: 'var(--cat-manoranjan-bg)',
  मौसम: 'var(--cat-mausam-bg)',
  वित्त: 'var(--cat-vitt-bg)',
  त्योहार: 'var(--cat-tyohar-bg)',
  राजनीति: 'var(--cat-rajniti-bg)',
  तकनीक: 'var(--cat-taknik-bg)',
};

export function CategoryIcon({ category, size = 18 }) {
  switch (category) {
    case 'खेल':
      return <Trophy size={size} strokeWidth={2.25} />;
    case 'समाचार':
      return <Newspaper size={size} strokeWidth={2.25} />;
    case 'मनोरंजन':
      return <Film size={size} strokeWidth={2.25} />;
    case 'मौसम':
      return <CloudRain size={size} strokeWidth={2.25} />;
    case 'वित्त':
      return <TrendingUp size={size} strokeWidth={2.25} />;
    case 'त्योहार':
      return <Star size={size} strokeWidth={2.25} />;
    case 'राजनीति':
      return <Landmark size={size} strokeWidth={2.25} />;
    case 'तकनीक':
      return <Cpu size={size} strokeWidth={2.25} />;
    default:
      return <Newspaper size={size} strokeWidth={2.25} />;
  }
}

export function categoryEmoji(category) {
  return CATEGORY_STYLES[category]?.emoji || '🔥';
}
