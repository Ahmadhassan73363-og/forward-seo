// Dependency-free helpers shared by server and browser (report.ts runs client-side for large crawls).
export const ratio = (num: number, den: number) => (den === 0 ? null : num / den);
export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const round1 = (x: number) => Math.round(x * 10) / 10;
