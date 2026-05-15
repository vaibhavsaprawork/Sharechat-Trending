import { useEffect } from 'react';
import { X } from 'lucide-react';
import styles from '../styles/BottomSheet.module.css';

/**
 * Slide-up sheet: backdrop tap + close button dismiss. Drag handle is visual (optional swipe later).
 */
export default function BottomSheet({ open, onClose, title, children, ariaLabel }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.root} role="presentation">
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || 'Panel'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.handleWrap} aria-hidden>
          <div className={styles.handle} />
        </div>
        <div className={styles.head}>
          {title ? <h2 className={`${styles.title} hinBody`}>{title}</h2> : null}
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={22} strokeWidth={2} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
