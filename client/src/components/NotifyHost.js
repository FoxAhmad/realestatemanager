import React, { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe } from '../utils/notify';
import './NotifyHost.css';

const TOAST_MS = 4500;

const ICONS = {
  success: (
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 6.8" /></svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 6v5M10 14.2v.1" /></svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 9v5M10 6v.1" /></svg>
  ),
};

const NotifyHost = () => {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const queue = useRef([]);
  const confirmBtn = useRef(null);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.kind === 'toast') {
          const { toast } = event;
          setToasts((list) => [...list.slice(-3), toast]);
          setTimeout(() => dismiss(toast.id), toast.type === 'error' ? TOAST_MS + 2000 : TOAST_MS);
        } else if (event.kind === 'confirm') {
          setDialog((current) => {
            if (current) {
              queue.current.push(event.confirm);
              return current;
            }
            return event.confirm;
          });
        }
      }),
    [dismiss]
  );

  const answer = useCallback(
    (value) => {
      if (!dialog) return;
      dialog.resolve(value);
      setDialog(queue.current.shift() || null);
    },
    [dialog]
  );

  useEffect(() => {
    if (!dialog) return undefined;
    confirmBtn.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') answer(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog, answer]);

  return (
    <>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon">{ICONS[t.type]}</span>
            <p>{t.message}</p>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>

      {dialog && (
        <div className="confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && answer(false)}>
          <div className="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className={`confirm-badge ${dialog.danger ? 'danger' : ''}`} aria-hidden="true">
              {dialog.danger ? '!' : '?'}
            </div>
            <h3 id="confirm-title">{dialog.title}</h3>
            <p>{dialog.message}</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-btn ghost" onClick={() => answer(false)}>
                {dialog.cancelLabel}
              </button>
              <button
                type="button"
                ref={confirmBtn}
                className={`confirm-btn ${dialog.danger ? 'danger' : 'primary'}`}
                onClick={() => answer(true)}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NotifyHost;
