// Runs once when the Next.js server starts: starts the scheduled-audit loop.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/engine/runner');
    startScheduler();
  }
}
