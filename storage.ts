export type HighScore = {
  score: number;
  round: number;
  date: number;
};

const KEY = 'mindmeld.highscores.v1';
const MAX = 8;

export function loadScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is HighScore =>
        s && typeof s.score === 'number' && typeof s.round === 'number' && typeof s.date === 'number',
    );
  } catch {
    return [];
  }
}

export function saveScore(entry: HighScore): HighScore[] {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {}
  return trimmed;
}

export function isNewHighScore(score: number): boolean {
  const list = loadScores();
  if (list.length < MAX) return score > 0;
  return score > list[list.length - 1].score;
}
