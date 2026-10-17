export const emptyReader = () => ({ favorites: [], progress: {} });

export function mergeRanges(ranges, duration = Infinity) {
  const ordered = ranges.filter(r => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[0] >= 0 && r[1] > r[0])
    .map(([a, b]) => [Math.min(a, duration), Math.min(b, duration)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of ordered) {
    const tail = merged.at(-1);
    if (tail && a <= tail[1]) tail[1] = Math.max(tail[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

export function sanitizeReader(value, lessons) {
  const result = emptyReader();
  if (!value || typeof value !== 'object') return result;
  const ids = new Set(lessons.map(l => l.id));
  result.favorites = [...new Set(Array.isArray(value.favorites) ? value.favorites.filter(id => ids.has(id)) : [])];
  for (const lesson of lessons) {
    const p = value.progress?.[lesson.id];
    if (!p || !Number.isFinite(p.seconds) || !Number.isFinite(p.updatedAt)) continue;
    const covered = mergeRanges(Array.isArray(p.covered) ? p.covered : [], lesson.durationSeconds);
    const coverage = covered.reduce((n, [a, b]) => n + b - a, 0) / lesson.durationSeconds;
    result.progress[lesson.id] = {
      seconds: Math.max(0, Math.min(p.seconds, lesson.durationSeconds)),
      updatedAt: Math.max(0, p.updatedAt), covered,
      finished: p.finished === true && coverage >= .9,
    };
  }
  return result;
}
