// Pressing Escape closes the top-most page modal, the same as clicking outside it.
// (The confirm dialog and toasts handle Escape themselves.)
export const initModalEscape = () => {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (document.querySelector('.confirm-backdrop')) return;
    const overlays = document.querySelectorAll('.modal-overlay');
    if (!overlays.length) return;
    overlays[overlays.length - 1].click();
  });
};
