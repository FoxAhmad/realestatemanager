// Keeps `.ff-filled` on each `.form-group` in sync with whether its control has a value,
// so the label in floating-fields.css knows whether to rest inside the field or float up.
// Controls are updated by React (including programmatic prefills), so besides listening
// to user events this re-checks on DOM changes and on a short interval.

const CONTROLS = '.form-group > input, .form-group > select, .form-group > textarea';
const ALWAYS_FLOATED = new Set(['date', 'time', 'datetime-local', 'month', 'week', 'color', 'range']);

const hasValue = (el) => {
  if (ALWAYS_FLOATED.has(el.type)) return true;
  return el.value !== '' && el.value != null;
};

const sync = (el) => {
  const group = el.parentElement;
  if (!group) return;
  group.classList.toggle('ff-filled', hasValue(el));
};

const syncAll = () => document.querySelectorAll(CONTROLS).forEach(sync);

export const initFloatingFields = () => {
  const onEvent = (e) => {
    if (e.target && e.target.matches && e.target.matches(CONTROLS)) sync(e.target);
  };
  ['input', 'change', 'focusin', 'focusout'].forEach((type) =>
    document.addEventListener(type, onEvent, true)
  );

  let queued = false;
  const queueSync = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncAll();
    });
  };
  new MutationObserver(queueSync).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['value', 'selected', 'type'],
  });

  // Catches value changes that set the property without an event or attribute change.
  setInterval(syncAll, 400);
  syncAll();
};
