// Pure geometry helpers for floating-bubble placement. No DOM access, so this
// module is unit-testable under `node --test`. All rects are { x, y, w, h }.

export function rectsIntersect(a, b, gap = 0) {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

export function overlapArea(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

// Pick a boundary-safe (x, y) for a w*h bubble inside a vw*vh viewport,
// avoiding `existing` rects where possible.
//   margin: min distance from any screen edge (guarantees nothing is clipped)
//   gap:    extra spacing required around each existing rect
//   tries:  number of random candidates to attempt before giving up
//   rng:    () => [0,1), injected for deterministic tests
// Returns the first non-colliding candidate; if all collide, the one with the
// least total overlap area; if no candidate was generated, the top-left corner
// of the safe box.
export function pickPosition({
  vw, vh, w, h, margin = 24, gap = 12, existing = [], tries = 30, rng = Math.random,
}) {
  const xLo = margin;
  const yLo = margin;
  // safe span = viewport - bubble - both margins (left margin = xLo, right margin = margin),
  // so a candidate in [xLo, xLo+spanX] keeps the whole bubble >= margin from every edge.
  const spanX = Math.max(0, vw - w - margin - xLo);
  const spanY = Math.max(0, vh - h - margin - yLo);

  let best = null;
  let bestOverlap = Infinity;

  for (let i = 0; i < tries; i++) {
    const x = xLo + rng() * spanX;
    const y = yLo + rng() * spanY;
    const cand = { x, y, w, h };

    let collides = false;
    let total = 0;
    for (const r of existing) {
      if (rectsIntersect(cand, r, gap)) {
        collides = true;
        total += overlapArea(cand, r);
      }
    }

    if (!collides) return { x, y };
    if (total < bestOverlap) {
      bestOverlap = total;
      best = { x, y };
    }
  }

  return best ?? { x: xLo, y: yLo };
}
