// Global toast + confirm API so existing handlers can swap `alert()` / `window.confirm()`
// for a themed UI without threading context through every page. <NotifyHost /> renders them.

const listeners = new Set();
let nextId = 1;

const emit = (event) => listeners.forEach((fn) => fn(event));

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const ERROR_HINT = /error|fail|invalid|cannot|unable|denied|not allowed|required|please|must|already|exceed|insufficient/i;

const show = (type, message) => {
  emit({ kind: 'toast', toast: { id: nextId++, type, message: String(message ?? '') } });
};

// notify('msg') guesses the tone from the wording, which fits the old alert() call sites.
export const notify = (message) => show(ERROR_HINT.test(String(message)) ? 'error' : 'success', message);
notify.success = (message) => show('success', message);
notify.error = (message) => show('error', message);
notify.info = (message) => show('info', message);

// Resolves true/false. Use as: if (!(await confirmDialog('Delete this?'))) return;
export const confirmDialog = (message, options = {}) =>
  new Promise((resolve) => {
    emit({
      kind: 'confirm',
      confirm: {
        id: nextId++,
        message: String(message ?? ''),
        title: options.title || 'Please confirm',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        danger: options.danger !== false,
        resolve,
      },
    });
  });
