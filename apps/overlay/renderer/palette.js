// MIRROR: keep this file identical to apps/phone/palette.js.

export const PALETTE = [
  "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF",
  "#B983FF", "#FF9F45", "#00C9A7", "#FF6F91",
  "#FCE38A", "#5BD5DE", "#C7F2A4", "#FFA1F5",
];

// djb2 string hash — deterministic, fits in 32 bits, fine for color bucketing.
export function djb2(s) {
  let h = 5381;
  const str = s.normalize("NFC");
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export function colorIdxFor(nickname) {
  return djb2(nickname) % PALETTE.length;
}
