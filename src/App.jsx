import { useCallback, useEffect, useState } from 'react';
import { useAppChrome } from './context/AppChromeContext.jsx';
import DetailView from './components/DetailView.jsx';
import FeedView from './components/FeedView.jsx';
import styles from './styles/App.module.css';

export default function App() {
  const { t } = useAppChrome();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const loadTopics = useCallback(async (refresh) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const suffix = refresh ? '?refresh=true' : '';
      const res = await fetch(`/api/trending${suffix}`, {
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

      setTopics(data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      if (refresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    loadTopics(false);
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
              onOpenTopic={setSelected}
              onRefresh={() => loadTopics(true)}
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
