// Pressing Escape closes the top-most page modal. Modals close in different ways (a close
// button, a Cancel/Discard button, or a click on the backdrop), so try them in that order.
// (The confirm dialog and toasts handle Escape themselves.)
export const initModalEscape = () => {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (document.querySelector('.confirm-backdrop')) return;
    const overlays = document.querySelectorAll('.modal-overlay');
    if (!overlays.length) return;
    const overlay = overlays[overlays.length - 1];

    const closeBtn = overlay.querySelector('.close-modal-btn, [aria-label="Close"]');
    if (closeBtn) {
      closeBtn.click();
      return;
    }
    const dismiss = [...overlay.querySelectorAll('button')].find((b) => /^\s*(cancel|close|discard)\b/i.test(b.innerText || ''));
    if (dismiss) {
      dismiss.click();
      return;
    }
    overlay.click();
  });
};
