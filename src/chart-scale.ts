export function chartScale(points: {date: string; value: number}[], rank: boolean) {
  const dates = points.map(p => Date.parse(p.date));
  const start = Math.min(...dates), end = Math.max(...dates);
  const min = rank ? 1 : Math.min(0, ...points.map(p => p.value));
  const max = Math.max(min + 1, ...points.map(p => p.value));
  return {
    start, end, min, max,
    x: (date: string) => (Date.parse(date) - start) / Math.max(end - start, 1),
    y: (value: number) => rank ? (value - min) / (max - min) : 1 - (value - min) / (max - min),
  };
}
