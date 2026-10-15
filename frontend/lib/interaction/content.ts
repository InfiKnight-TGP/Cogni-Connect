export type PersonalWord = { answer: string; clue: string; clueKey?: "initial" | "place" };
export type CrosswordWord = PersonalWord & { row: number; col: number; direction: "across" | "down" };
export function summarize(text: string): string { return text.trim().split(/(?<=[.!?।])\s+/u).slice(0, 2).join(" ").slice(0, 300); }
export function crossword(words: PersonalWord[], size = 15): { grid: (string | null)[][]; words: CrosswordWord[] } {
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const placed: CrosswordWord[] = [];
  const clean = Array.from(new Map(words.map(word => ({ ...word, answer: word.answer.normalize("NFKC").toUpperCase().replace(/[^A-Z]/g, "") })).filter(word => word.answer.length >= 2 && word.answer.length <= size).map(word => [word.answer, word])).values()).sort((a, b) => b.answer.length - a.answer.length);
  const at = (r: number, c: number) => grid[r]?.[c] ?? null;
  for (const word of clean) {
    const candidates: { row: number; col: number; direction: "across" | "down" }[] = [];
    if (!placed.length) candidates.push({ row: Math.floor(size / 2), col: Math.floor((size - word.answer.length) / 2), direction: "across" });
    else for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) for (let i = 0; i < word.answer.length; i++) {
      if (grid[r][c] === word.answer[i]) candidates.push({ row: r - i, col: c, direction: "down" }, { row: r, col: c - i, direction: "across" });
    }
    for (const candidate of candidates) {
      const dr = candidate.direction === "down" ? 1 : 0, dc = 1 - dr;
      const { row, col } = candidate;
      const endR = row + dr * (word.answer.length - 1), endC = col + dc * (word.answer.length - 1);
      if (row < 0 || col < 0 || endR >= size || endC >= size || at(row - dr, col - dc) || at(endR + dr, endC + dc)) continue;
      let ok = true, intersections = 0;
      for (let i = 0; i < word.answer.length; i++) {
        const r = row + dr * i, c = col + dc * i, existing = at(r, c);
        if (existing) {
          if (existing !== word.answer[i] || at(r - dr, c - dc) || at(r + dr, c + dc)) { ok = false; break; }
          intersections++;
        } else if (at(r - dc, c - dr) || at(r + dc, c + dr)) { ok = false; break; }
      }
      if (!ok || (placed.length && !intersections)) continue;
      for (let i = 0; i < word.answer.length; i++) grid[row + dr * i][col + dc * i] = word.answer[i];
      placed.push({ ...word, ...candidate }); break;
    }
  }
  return { grid, words: placed };
}
export type Visit = { latitude: number; longitude: number; timestamp: number };
export function distance(a: Visit, b: Visit): number {
  const rad = Math.PI / 180, dLat = (a.latitude - b.latitude) * rad, dLon = (a.longitude - b.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function clusterVisits(visits: Visit[], radius = 150): { center: Visit; visits: number }[] {
  const clusters: { center: Visit; visits: number }[] = [];
  for (const visit of visits) {
    const cluster = clusters.find(c => distance(c.center, visit) <= radius);
    if (cluster) cluster.visits++; else clusters.push({ center: visit, visits: 1 });
  }
  return clusters.sort((a, b) => b.visits - a.visits);
}
