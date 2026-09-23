// Keep release handling independent of the canvas capture lifecycle.
export function bindPointer(canvas, host, { begin, move, release, cancel }) {
  let active = null;
  const clear = () => {
    const id = active;
    active = null;
    if (id !== null && canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
  };
  const abort = () => { if (active !== null) { clear(); cancel(); } };
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || active !== null || !begin(e)) return;
    active = e.pointerId;
    try { canvas.setPointerCapture(active); } catch { /* Window listeners still finish this gesture. */ }
    e.preventDefault();
  });
  host.addEventListener('pointermove', e => {
    if (e.pointerId !== active) return;
    // Recover a missed release instead of extending an already released gesture.
    if (e.pointerType === 'mouse' && e.buttons === 0) { clear(); release(e, true); return; }
    move(e);
    e.preventDefault();
  }, true);
  host.addEventListener('pointerup', e => {
    if (e.pointerId !== active) return;
    clear(); release(e);
  }, true);
  host.addEventListener('pointercancel', e => { if (e.pointerId === active) abort(); }, true);
  host.addEventListener('blur', abort);
  // lostpointercapture is not a cancelled gesture: pointerup may still follow
  // on another element. Do not silently discard the visible selection here.
  return { cancel: clear };
}
