import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppChrome } from './context/AppChromeContext.jsx';
import DetailView from './components/DetailView.jsx';
import FeedView from './components/FeedView.jsx';
import styles from './styles/App.module.css';

const useTrendingSse = import.meta.env.VITE_TRENDING_SSE === '1';

export default function App() {
  const { t } = useAppChrome();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  /** Set while SSE per-article mode is still receiving topics (loaded < total). */
  const [streamProgress, setStreamProgress] = useState(null);
  const [selected, setSelected] = useState(null);
  /** Ignores stale fetch completions (e.g. Strict Mode abort) so loading is not cleared while a newer request runs. */
  const loadGenRef = useRef(0);
  const sseRef = useRef(null);

  const loadTopics = useCallback(
    async (refresh, signal) => {
      if (useTrendingSse) {
        const gen = ++loadGenRef.current;
        if (refresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);
        setStreamProgress(null);
        sseRef.current?.close();
        sseRef.current = null;

        const qs = new URLSearchParams();
        qs.set('stream', '1');
        if (refresh) qs.set('refresh', 'true');
        const es = new EventSource(`/api/trending?${qs.toString()}`);
        sseRef.current = es;

        es.onmessage = (ev) => {
          if (gen !== loadGenRef.current) return;
          let msg;
          try {
            msg = JSON.parse(ev.data);
          } catch {
            return;
          }

          if (msg.type === 'meta') {
            const total = Number(msg.articles) || 0;
            setStreamProgress(total > 0 ? { total, loaded: 0 } : null);
            return;
          }

          if (msg.type === 'topics') {
            if (Array.isArray(msg.topics)) {
              setTopics(msg.topics);
              setLoading(false);
              setRefreshing(false);
            }
            setStreamProgress((prev) => {
              const total = prev?.total ?? 0;
              if (!total) return prev;
              const idx = typeof msg.index === 'number' ? msg.index : 0;
              const nextLoaded = Math.min(Math.max(prev?.loaded ?? 0, idx + 1), total);
              return { total, loaded: nextLoaded };
            });
            return;
          }

          if (msg.type === 'done') {
            if (Array.isArray(msg.topics)) {
              setTopics(msg.topics);
              setLoading(false);
              setRefreshing(false);
            }
            setStreamProgress(null);
            es.close();
            if (sseRef.current === es) sseRef.current = null;
            return;
          }

          if (msg.type === 'error') {
            setStreamProgress(null);
            setError(String(msg.detail || 'Stream failed'));
            setLoading(false);
            setRefreshing(false);
            es.close();
            if (sseRef.current === es) sseRef.current = null;
          }
        };

        es.onerror = () => {
          if (gen !== loadGenRef.current) return;
          setStreamProgress(null);
          setError((prev) => (prev ? prev : 'Live feed connection error'));
          setLoading(false);
          setRefreshing(false);
          es.close();
          if (sseRef.current === es) sseRef.current = null;
        };

        return;
      }

      const gen = ++loadGenRef.current;
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const suffix = refresh ? '?refresh=true' : '';
        const res = await fetch(`/api/trending${suffix}`, {
          signal,
          headers: { Accept: 'application/json' },
        });
        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        if (!res.ok) {
          const fromJson =
            data &&
            (data.detail ||
              (typeof data.error === 'string' ? data.error : null) ||
              (data.error && data.error.message) ||
              data.message);
          const base =
            fromJson ||
            (text && text.trim().slice(0, 240)) ||
            `HTTP ${res.status}`;
          const hint = data && data.hint ? `\n\n${data.hint}` : '';
          throw new Error(String(base) + hint);
        }

        if (!Array.isArray(data)) {
          const snippet = text ? text.trim().slice(0, 160) : t.emptySnippet;
          throw new Error(t.invalidJsonResponse.replace('{snippet}', snippet));
        }

        if (gen !== loadGenRef.current) return;
        setTopics(data);
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        if (gen !== loadGenRef.current) return;
        setError(e.message || String(e));
      } finally {
        if (gen !== loadGenRef.current) return;
        if (refresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [t]
  );

  useEffect(() => {
    const ac = new AbortController();
    loadTopics(false, ac.signal);
    return () => {
      ac.abort();
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [loadTopics]);

  return (
    <div className={styles.shell}>
      <div className={styles.phone}>
        <div className={styles.views}>
          <div className={`${styles.feedPane} ${selected ? styles.feedHidden : ''}`}>
            <FeedView
              topics={topics}
              loading={loading}
              error={error}
              streamProgress={streamProgress}
              onOpenTopic={setSelected}
              onRefresh={() => loadTopics(true, null)}
              refreshing={refreshing}
            />
          </div>

          <div
            className={`${styles.detailPane} ${
              selected ? styles.detailVisible : styles.detailHidden
            }`}
          >
            {selected ? (
              <DetailView topic={selected} onBack={() => setSelected(null)} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
