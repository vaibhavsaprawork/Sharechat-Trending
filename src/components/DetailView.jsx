import { Bookmark, ChevronLeft, Heart, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { makePostId, parsePostId, useAppChrome } from '../context/AppChromeContext.jsx';
import {
  CategoryIcon,
  CATEGORY_ACCENT_VAR,
  CATEGORY_GRAD_VAR,
  TOPIC_HERO_IMG_STYLE,
  TOPIC_IMAGES,
  resolveTopicImageUrl,
} from '../lib/categories';
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
      <Bookmark size={20} strokeWidth={2.2} fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}

function PostRowCard({ post }) {
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
            ❤️ <span>{post.likes}</span>
          </span>
          <span className={styles.actionItem}>
            💬 <span>{post.comments}</span>
          </span>
          <span className={styles.actionItem}>↗ शेयर</span>
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

function useTopicFeed(topic) {
  return useMemo(() => {
    const name = topic.hindiName;
    const tag = topic.hashtag;
    const posts = [
      {
        id: makePostId(tag, 'posts', 0),
        user: 'प्रिया शर्मा',
        time: '१८ मिनट पहले',
        text: `${name} पर आज सुबह से ही मीम्स और राय की बौछार है। लोग लिख रहे हैं कि यह ट्रेंड छोटे शहरों में भी तेज़ी से फैल रहा है। क्या आप भी इस पर अपनी बात जोड़ रहे हैं?`,
        likes: '२.३ लाख',
        comments: '४,२८९',
      },
      {
        id: makePostId(tag, 'posts', 1),
        user: 'अमित यादव · इंदौर',
        time: '१ घंटा पहले',
        text: `${tag} वाली पोस्ट्स में मज़ाक, वीडियो और ग्राउंड अपडेट सब मिल रहे हैं। किसी ने लिखा— “आज तो टाइमलाइन पूरी इसी खबर से भरी है।”`,
        likes: '१.१ लाख',
        comments: '१,९०२',
      },
      {
        id: makePostId(tag, 'posts', 2),
        user: 'नेहा 🇮🇳',
        time: 'आज सुबह',
        text: `“${name}” को लेकर परिवार वाले ग्रुप में भी चर्चा शुरू हो गई है। लोग स्रोत पूछ रहे हैं और शेयरचैट पर नई क्लिप्स लगातार आ रही हैं।`,
        likes: '८४,३१०',
        comments: '६७४',
      },
    ];
    const video = [
      {
        id: makePostId(tag, 'video', 0),
        title: `${name} — ग्राउंड रिपोर्ट जैसा शॉर्ट वीडियो`,
        views: '३.२ लाख व्यूज',
      },
      {
        id: makePostId(tag, 'video', 1),
        title: `${tag} पर फनी क्लिप; कमेंट पटा पड़ा है`,
        views: '७.६ लाख व्यूज',
      },
    ];
    const reel = [
      {
        id: makePostId(tag, 'reel', 0),
        caption: `रील #१: ${name} — १५ सेकंड में पूरा मूड`,
        hearts: '१२.४ लाख',
      },
      {
        id: makePostId(tag, 'reel', 1),
        caption: `रील #२: ${tag} पर “हुक” वाला ट्रांज़िशन`,
        hearts: '६.२ लाख',
      },
    ];
    return { posts, video, reel };
  }, [topic]);
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
  const { t } = useAppChrome();
  const [tab, setTab] = useState('posts');
  const heroSrc = resolveTopicImageUrl(topic);
  const feed = useTopicFeed(topic);
  const accent =
    CATEGORY_ACCENT_VAR[topic.category] || CATEGORY_ACCENT_VAR['समाचार'];

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <div className={styles.backZone} style={{ borderLeftColor: accent }}>
          <button type="button" className={styles.back} onClick={onBack} aria-label={t.back}>
            <ChevronLeft size={20} strokeWidth={2.4} />
          </button>
        </div>
        <div className={styles.crumb}>
          <div className={`${styles.crumbTrail} hinBody`}>
            {t.back} <span className={styles.crumbSep}>›</span>{' '}
            <span className={styles.crumbTrailAccent}>{topic.category}</span>
          </div>
          <div className={`${styles.crumbTitle} hinBody`}>{topic.hindiName}</div>
        </div>
      </div>

      <div className={styles.hero}>
        <img
          className={styles.heroImg}
          src={heroSrc}
          alt=""
          referrerPolicy="no-referrer"
          style={TOPIC_HERO_IMG_STYLE}
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
        </div>
      </div>

      <div className={styles.stats}>
        <div className={`${styles.statCard} ${styles.elevCard}`}>
          <div className={`${styles.statLabel} hinBody`}>{t.postsEst}</div>
          <div className={`${styles.statValue} hinBody`}>{estimatePosts(topic.heatScore)}</div>
        </div>
        <div className={`${styles.statCard} ${styles.elevCard}`}>
          <div className={`${styles.statLabel} hinBody`}>{t.heat}</div>
          <div className={styles.statHeat}>
            <HeatBadge score={topic.heatScore} label={topic.heatLabel} />
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.elevCard}`}>
          <div className={`${styles.statLabel} hinBody`}>{t.category}</div>
          <div className={styles.statValueRow}>
            <span className={`${styles.statIconWrap} catIconTint`} data-cat={topic.category}>
              <CategoryIcon category={topic.category} size={16} />
            </span>
            <span className={`${styles.statValue} hinBody`}>{topic.category}</span>
          </div>
        </div>
      </div>

      <div className={styles.heatBarWrap}>
        <div className={styles.heatBarHead}>
          <div className={styles.heatBarTitle}>{t.heatScore}</div>
          <HeatBadge score={topic.heatScore} label={topic.heatLabel} />
        </div>
        <div className={styles.heatBarRow}>
          <div className={styles.bar}>
            <div className={styles.barFill} style={{ width: `${topic.heatScore}%` }} />
          </div>
        </div>
      </div>

      <div className={`${styles.section} ${styles.aiSection}`}>
        <div className={styles.sectionTitle}>{t.aiAnalysis}</div>
        <div className={`${styles.sectionBody} hinBody`}>{topic.aiSummary}</div>
      </div>

      <div className={`${styles.section} ${styles.sourcesSection}`}>
        <div className={styles.sectionTitle}>{t.signalSources}</div>
        <div className={styles.sources}>
          {(topic.sources || []).slice(0, 6).map((s, i) => (
            <div key={`${i}-${s}`} className={styles.sourceRow}>
              <span className={styles.dot} />
              <div className={`${styles.sourceText} hinBody`}>{s}</div>
            </div>
          ))}
        </div>
      </div>

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
          🔖 {t.saved}
        </button>
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
