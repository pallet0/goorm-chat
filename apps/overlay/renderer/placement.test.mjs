import { test } from "node:test";
import assert from "node:assert/strict";
import { pickPosition, rectsIntersect, overlapArea } from "./placement.mjs";

// Deterministic rng: returns queued values in order (x, y, x, y, ...).
function makeRng(values) {
  let i = 0;
  return () => values[i++];
}

test("rectsIntersect detects overlap with gap", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  const b = { x: 150, y: 0, w: 100, h: 100 };
  assert.equal(rectsIntersect(a, b, 0), false);   // 50px apart
  assert.equal(rectsIntersect(a, b, 60), true);    // gap closes the 50px gap
});

test("overlapArea computes intersection area", () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  const b = { x: 50, y: 50, w: 100, h: 100 };
  assert.equal(overlapArea(a, b), 50 * 50);
});

test("returns a point inside the safe box on an empty screen", () => {
  const p = pickPosition({
    vw: 1000, vh: 800, w: 200, h: 100,
    margin: 24, gap: 12, existing: [], rng: () => 0.5,
  });
  assert.ok(p.x >= 24 && p.x <= 1000 - 200 - 24);
  assert.ok(p.y >= 24 && p.y <= 800 - 100 - 24);
});

test("avoids a single blocking rect when a free spot exists", () => {
  // try1 lands on the blocker (collides); try2 lands free and is returned.
  const rng = makeRng([0, 0, 0.9, 0.9]);
  const p = pickPosition({
    vw: 1000, vh: 1000, w: 100, h: 100,
    margin: 0, gap: 0, existing: [{ x: 0, y: 0, w: 200, h: 200 }],
    tries: 30, rng,
  });
  assert.deepEqual(p, { x: 810, y: 810 });
});

test("falls back to least-overlap when every candidate collides", () => {
  // A full-width band at the top forces every candidate to collide.
  // try1 overlaps fully (10000); try2 overlaps less (5500) -> try2 wins.
  const rng = makeRng([0, 0, 0, 0.05]);
  const p = pickPosition({
    vw: 1000, vh: 1000, w: 100, h: 100,
    margin: 0, gap: 0, existing: [{ x: 0, y: 0, w: 1000, h: 100 }],
    tries: 2, rng,
  });
  assert.equal(p.x, 0);
  assert.equal(p.y, 45);
});

test("clamps to margin when the bubble is as wide as the safe area", () => {
  // vw - w - margin == margin -> spanX is 0 -> x is always the left margin.
  const p = pickPosition({
    vw: 100, vh: 200, w: 100, h: 50,
    margin: 0, gap: 0, existing: [], rng: () => 0.5,
  });
  assert.equal(p.x, 0);
  assert.equal(p.y, 75);
});
