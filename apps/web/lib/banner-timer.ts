export function scheduleBannerAdvance(onAdvance: () => void, seconds = 2) {
  const delay = Number.isFinite(seconds) ? Math.max(2, seconds) : 2;
  const timer = setTimeout(onAdvance, delay * 1000);
  return () => clearTimeout(timer);
}
