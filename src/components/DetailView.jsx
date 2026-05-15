import {
  Bookmark,
  ChevronLeft,
  Copy,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Play,
  Share2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parsePostId, useAppChrome } from '../context/AppChromeContext.jsx';
import {
  CategoryIcon,
  CATEGORY_GRAD_VAR,
  TOPIC_IMAGES,
  resolveTopicImageUrl,
} from '../lib/categories';
import { getDemoFeed } from '../lib/detailDemoContent.js';
import HeatBadge from './HeatBadge';
import styles from '../styles/DetailView.module.css';

function estimatePosts(heatScore) {
  const n = Math.round(Number(heatScore) * 942 + 4200);
  return n.toLocaleString('hi-IN');
}

function avatarStyle(seed) {
  const hues = [12, 48, 168, 210, 280, 330];
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h += seed.charCodeAt(i);
  const hue = hues[h % hues.length];
  return {
    background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 50% 28%))`,
  };
}

function initials(name) {
  const t = String(name || '').trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = [...parts[0]][0] || '';
    const b = [...parts[1]][0] || '';
    return (a + b).slice(0, 2);
  }
  return [...t].slice(0, 2).join('');
}

function videoThumbStyle(topic) {
  const gradVar = CATEGORY_GRAD_VAR[topic.category] || CATEGORY_GRAD_VAR['समाचार'];
  return {
    background: `linear-gradient(145deg, ${gradVar} 0%, var(--video-grad-end) 72%)`,
  };
}

function reelThumbStyle(topic) {
  const gradVar = CATEGORY_GRAD_VAR[topic.category] || CATEGORY_GRAD_VAR['समाचार'];
  return {
    background: `linear-gradient(180deg, ${gradVar} 0%, var(--reel-grad-end) 100%)`,
  };
}

function topicHash(topic) {
  const s = `${String(topic?.hashtag ?? '')}|${Number(topic?.rank)}|${Number(topic?.heatScore)}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(31, h) + s.charCodeAt(i);
  }
  return Math.abs(h);
}

function useTrendPulse(topic, t) {
  return useMemo(() => {
    const h = topicHash(topic);
    const pct = 22 + (h % 118);
    const k = 4 + (h % 19);
    const bars = Array.from({ length: 8 }, (_, i) => 20 + ((h >> (i * 2)) % 55));
    const fallbackN = 5 + (h % 6);
    return {
      velocity: t.velocityLine.replace('{pct}', String(pct)),
      postsToday: t.postsTodayLine.replace('{k}', String(k)),
      bars,
      fallbackN,
    };
  }, [topic, t]);
}

function AiSummaryBlock({ text, t }) {
  const body = text != null ? String(text) : '';
  const [open, setOpen] = useState(false);
  const long = body.length > 200;

  return (
    <>
      <div
        className={`${styles.sectionBody} ${styles.aiBody} ${long && !open ? styles.aiClamp : ''} hinBody`}
      >
        {body}
      </div>
      {long ? (
        <button type="button" className={styles.aiReadMore} onClick={() => setOpen((o) => !o)}>
          {open ? t.readLess : t.readMore}
        </button>
      ) : null}
    </>
  );
}

function BookmarkToggle({ id }) {
  const { isSaved, toggleSaved } = useAppChrome();
  const saved = isSaved(id);
  const [pop, setPop] = useState(false);

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!saved) {
      setPop(true);
      window.setTimeout(() => setPop(false), 160);
    }
    toggleSaved(id);
  };

  return (
    <button
      type="button"
      className={`${styles.bookmark} ${saved ? styles.bookmarkOn : ''} ${pop ? styles.bookmarkPop : ''}`}
      onClick={onClick}
      aria-label={saved ? 'Unsave' : 'Save'}
    >
      <Bookmark size={18} strokeWidth={2} fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}

function PostRowCard({ post }) {
  const { t } = useAppChrome();
  return (
    <div className={styles.cardShell}>
      <BookmarkToggle id={post.id} />
      <article className={styles.postCard}>
        <div className={styles.postHead}>
          <div className={styles.avatar} style={avatarStyle(post.user)} aria-hidden>
            {initials(post.user)}
          </div>
          <div className={styles.postHeadText}>
            <div className={styles.postUser}>{post.user}</div>
            <div className={`${styles.postTime} hinBody`}>{post.time}</div>
          </div>
        </div>
        <p className={`${styles.postText} hinBody`}>{post.text}</p>
        <div className={styles.postActions}>
          <span className={styles.actionItem}>
            <Heart size={16} strokeWidth={2} className={styles.actionIcon} aria-hidden />
            <span>{post.likes}</span>
          </span>
          <span className={styles.actionItem}>
            <MessageCircle size={16} strokeWidth={2} className={styles.actionIcon} aria-hidden />
            <span>{post.comments}</span>
          </span>
          <span className={styles.actionItem}>
            <Share2 size={16} strokeWidth={2} className={styles.actionIcon} aria-hidden />
            <span className="hinBody">{t.share}</span>
          </span>
        </div>
      </article>
    </div>
  );
}

function VideoRowCard({ topic, v }) {
  return (
    <div className={styles.cardShell}>
      <BookmarkToggle id={v.id} />
      <article className={styles.videoCard}>
        <div className={styles.videoThumb} style={videoThumbStyle(topic)}>
          <div className={styles.playCircle} aria-hidden>
            <Play size={22} fill="currentColor" strokeWidth={0} />
          </div>
        </div>
        <div className={`${styles.videoTitle} hinBody`}>{v.title}</div>
        <div className={`${styles.videoMeta} hinBody`}>{v.views}</div>
      </article>
    </div>
  );
}

function ReelRowCard({ topic, r }) {
  return (
    <div className={`${styles.cardShell} ${styles.reelShell}`}>
      <BookmarkToggle id={r.id} />
      <article className={styles.reelCard}>
        <div className={styles.reelThumb} style={reelThumbStyle(topic)} />
        <div className={`${styles.reelCaption} hinBody`}>{r.caption}</div>
        <div className={styles.reelHearts}>
          <Heart size={15} strokeWidth={2.2} className={styles.reelHeartIcon} />
          <span className="hinBody">{r.hearts}</span>
        </div>
      </article>
    </div>
  );
}

function useTopicFeed(topic, locale) {
  return useMemo(() => getDemoFeed(topic, locale), [topic, locale]);
}

function PostsPanel({ posts }) {
  return (
    <div className={styles.tabStack}>
      {posts.map((p, idx) => (
        <div key={p.id}>
          {idx > 0 ? <div className={styles.cardDivider} /> : null}
          <PostRowCard post={p} />
        </div>
      ))}
    </div>
  );
}

function VideoPanel({ topic, items }) {
  return (
    <div className={styles.tabStack}>
      {items.map((v, idx) => (
        <div key={v.id}>
          {idx > 0 ? <div className={styles.cardDivider} /> : null}
          <VideoRowCard topic={topic} v={v} />
        </div>
      ))}
    </div>
  );
}

function ReelPanel({ topic, items }) {
  return (
    <div className={styles.tabStack}>
      {items.map((r, idx) => (
        <div key={r.id}>
          {idx > 0 ? <div className={styles.cardDivider} /> : null}
          <ReelRowCard topic={topic} r={r} />
        </div>
      ))}
    </div>
  );
}

function SavedPanel({ topic, feed, t }) {
  const { savedPostIds } = useAppChrome();

  const rows = useMemo(() => {
    const h = String(topic.hashtag ?? '').trim();
    const out = [];
    for (const rawId of savedPostIds) {
      const p = parsePostId(rawId);
      if (!p || p.hashtag !== h) continue;
      const list = feed[p.tab];
      const item = list && list[p.index];
      if (!item) continue;
      out.push({ key: rawId, tab: p.tab, item });
    }
    return out;
  }, [savedPostIds, topic.hashtag, feed]);

  if (rows.length === 0) {
    return (
      <div className={styles.savedEmpty}>
        <Bookmark className={styles.savedEmptyIcon} size={48} strokeWidth={1.6} aria-hidden />
        <div className={styles.savedEmptyText}>{t.nothingSaved}</div>
      </div>
    );
  }

  return (
    <div className={styles.tabStack}>
      {rows.map((row, idx) => (
        <div key={row.key}>
          {idx > 0 ? <div className={styles.cardDivider} /> : null}
          {row.tab === 'posts' ? <PostRowCard post={row.item} /> : null}
          {row.tab === 'video' ? <VideoRowCard topic={topic} v={row.item} /> : null}
          {row.tab === 'reel' ? <ReelRowCard topic={topic} r={row.item} /> : null}
        </div>
      ))}
    </div>
  );
}

export default function DetailView({ topic, onBack }) {
  const { t, locale } = useAppChrome();
  const [tab, setTab] = useState('posts');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);
  const heroSrc = resolveTopicImageUrl(topic);
  const feed = useTopicFeed(topic, locale);
  const pulse = useTrendPulse(topic, t);
  const sourceList = topic.sources || [];
  const crossN =
    sourceList.length > 0 ? Math.min(12, Math.max(sourceList.length, 3)) : pulse.fallbackN;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const shareTrend = async () => {
    const title = String(topic.hindiName || topic.hashtag || '').trim();
    const text = `${topic.hashtag}\n${String(topic.description || '').slice(0, 200)}`.trim();
    const url = typeof window !== 'undefined' ? window.location.href : '';
    setMenuOpen(false);
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        /* dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${title}\n${text}\n${url}`.trim());
    } catch {
      /* ignore */
    }
  };

  const copyHashtag = async () => {
    const h = String(topic.hashtag || '').trim();
    setMenuOpen(false);
    if (!h) return;
    try {
      await navigator.clipboard.writeText(h);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <div className={styles.backZone}>
          <button
            type="button"
            className={`navCircleBtn ${styles.back}`}
            onClick={onBack}
            aria-label={t.back}
          >
            <ChevronLeft size={22} strokeWidth={2.2} />
          </button>
        </div>
        <div className={styles.crumb}>
          <div className={`${styles.crumbTrail} hinBody`}>
            {t.back} <span className={styles.crumbSep}>›</span>{' '}
            <span className={styles.crumbTrailAccent}>{topic.category}</span>
          </div>
        </div>
        <div className={styles.navEnd} ref={menuWrapRef}>
          <button
            type="button"
            className={`navCircleBtn ${styles.moreBtn}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={t.navMore}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreHorizontal size={22} strokeWidth={2.1} />
          </button>
          {menuOpen ? (
            <div className={styles.moreMenu} role="menu">
              <button type="button" className={styles.moreMenuItem} role="menuitem" onClick={shareTrend}>
                <Share2 size={18} strokeWidth={2} aria-hidden />
                {t.share}
              </button>
              <button type="button" className={styles.moreMenuItem} role="menuitem" onClick={copyHashtag}>
                <Copy size={18} strokeWidth={2} aria-hidden />
                {t.copyHashtag}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.hero}>
        <img
          className={styles.heroImg}
          src={heroSrc}
          alt=""
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = TOPIC_IMAGES['समाचार'];
          }}
        />
        <div className={styles.heroGradTop} aria-hidden />
        <div className={styles.heroGradBottom} aria-hidden />
        <div className={styles.heroText}>
          <div className={`${styles.heroTag} hinBody`}>{topic.hindiName}</div>
          <div className={`${styles.heroSub} hinBody`}>
            {topic.hashtag} · {t.trendingNow}
          </div>
          <div className={styles.heroMetaRow} aria-label="Freshness">
            <span className={styles.heroMetaItem}>{t.updatedMoments}</span>
            <span className={styles.heroMetaDot} aria-hidden>
              ·
            </span>
            <span className={styles.heroMetaItem}>{t.highConfidence}</span>
          </div>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={`${styles.statLabel} hinBody`}>{t.postsEst}</div>
          <div className={`${styles.statValue} hinBody`}>{estimatePosts(topic.heatScore)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statLabel} hinBody`}>{t.heat}</div>
          <div className={styles.statHeat}>
            <HeatBadge score={topic.heatScore} />
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statLabel} hinBody`}>{t.category}</div>
          <div className={styles.statValueRow}>
            <span className={`${styles.statIconWrap} catIconTint`} data-cat={topic.category}>
              <CategoryIcon category={topic.category} size={14} />
            </span>
            <span className={`${styles.statValue} hinBody`}>{topic.category}</span>
          </div>
        </div>
      </div>

      <div className={styles.pulseSection}>
        <div className={styles.pulseTitle}>{t.trendPulse}</div>
        <div className={styles.pulseMain}>{pulse.velocity}</div>
        <div className={styles.pulseSub}>{pulse.postsToday}</div>
        <div className={styles.sparkRow} aria-hidden>
          {pulse.bars.map((pct, i) => (
            <span key={i} className={styles.sparkBar} style={{ height: `${pct}%` }} />
          ))}
        </div>
      </div>

      <div className={`${styles.section} ${styles.aiSection}`}>
        <div className={styles.aiTitle}>{t.aiAnalysis}</div>
        <AiSummaryBlock text={topic.aiSummary} t={t} />
      </div>

      <div className={`${styles.section} ${styles.sourcesSection}`}>
        <div className={styles.sourcesHeading}>{t.signalSources}</div>
        <div className={styles.sourcesIntro}>
          <span className={styles.sourcesCross}>{t.sourcesCrossCheck.replace('{n}', String(crossN))}</span>
        </div>
        <div className={styles.sources}>
          {sourceList.slice(0, 6).map((s, i) => (
            <div key={`${i}-${s}`} className={styles.sourceRow}>
              <span className={styles.dot} />
              <div className={`${styles.sourceText} hinBody`}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.tabsSticky}>
        <div className={styles.tabs} role="tablist" aria-label="Content">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'posts'}
            className={`${styles.tab} ${tab === 'posts' ? styles.tabActive : ''}`}
            onClick={() => setTab('posts')}
          >
            {t.posts}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'video'}
            className={`${styles.tab} ${tab === 'video' ? styles.tabActive : ''}`}
            onClick={() => setTab('video')}
          >
            {t.videos}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'reel'}
            className={`${styles.tab} ${tab === 'reel' ? styles.tabActive : ''}`}
            onClick={() => setTab('reel')}
          >
            {t.reels}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'saved'}
            className={`${styles.tab} ${tab === 'saved' ? styles.tabActive : ''}`}
            onClick={() => setTab('saved')}
          >
            {t.saved}
          </button>
        </div>
      </div>

      {tab === 'posts' ? (
        <PostsPanel posts={feed.posts} />
      ) : tab === 'video' ? (
        <VideoPanel topic={topic} items={feed.video} />
      ) : tab === 'reel' ? (
        <ReelPanel topic={topic} items={feed.reel} />
      ) : (
        <SavedPanel topic={topic} feed={feed} t={t} />
      )}

      <div className={styles.related}>
        <div className={styles.relatedTitle}>{t.relatedTags}</div>
        <div className={styles.relatedPills}>
          {(topic.relatedTags || []).map((tg) => (
            <div key={tg} className={styles.relatedPill}>
              {tg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
