import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = (body.url || '').trim();
    const useSample = Boolean(body.useSample);
    const maxPages = Number(body.maxPages) || 50;
    const maxProducts = Number(body.maxProducts) || 25;
    const maxCollections = Number(body.maxCollections) || 15;

    const rootDir = path.resolve(process.cwd(), '..');
    const competitorsPath = path.join(rootDir, 'examples', 'shopify-competitors.json');
    const sampleCrawlDir = path.join(rootDir, 'examples', 'sample-shopify-crawl');

    // ─── 1. Sample fast-path (explicit opt-in only) ───────────────────────────
    if (useSample) {
      const sampleAuditPath = path.join(sampleCrawlDir, 'audit.json');
      if (fs.existsSync(sampleAuditPath)) {
        const sampleCrawl = JSON.parse(fs.readFileSync(sampleAuditPath, 'utf-8'));
        const competitors = fs.existsSync(competitorsPath)
          ? JSON.parse(fs.readFileSync(competitorsPath, 'utf-8'))
          : [];
        return NextResponse.json({ status: 'ok', isSample: true, report: { ...sampleCrawl, competitors } });
      }
    }

    // ─── 2. Validate URL ──────────────────────────────────────────────────────
    if (!rawUrl) {
      return NextResponse.json({ status: 'error', message: 'No URL provided.' }, { status: 400 });
    }
    let targetUrl = rawUrl;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    // ─── 3. Locate Python binary ──────────────────────────────────────────────
    const pythonBin = fs.existsSync(path.join(rootDir, '.venv', 'Scripts', 'python.exe'))
      ? path.join(rootDir, '.venv', 'Scripts', 'python.exe')
      : fs.existsSync(path.join(rootDir, '.venv', 'bin', 'python'))
      ? path.join(rootDir, '.venv', 'bin', 'python')
      : 'python';

    // ─── 4. Ensure reports directory exists ──────────────────────────────────
    const reportsDir = path.join(rootDir, 'reports');
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const tempOutFile = path.join(reportsDir, `audit-${Date.now()}.json`);

    // ─── 5. Run Python live crawl engine ─────────────────────────────────────
    return new Promise<Response>((resolve) => {
      const args = [
        path.join(rootDir, 'scripts', 'run_shopify_benchmark.py'),
        '--url', targetUrl,
        '--max-pages', String(maxPages),
        '--max-products', String(maxProducts),
        '--max-collections', String(maxCollections),
        '--out', tempOutFile,
        '--format', 'json',
      ];
      if (fs.existsSync(competitorsPath)) {
        args.push('--competitors', competitorsPath);
      }

      const child = spawn(pythonBin, args, { cwd: rootDir });

      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      // 5-minute hard timeout — large stores need time
      const killTimer = setTimeout(() => {
        child.kill('SIGTERM');
      }, 300_000);

      child.on('close', (code) => {
        clearTimeout(killTimer);

        // ── Success: read temp output file ────────────────────────────────────
        if (fs.existsSync(tempOutFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(tempOutFile, 'utf-8'));
            try { fs.unlinkSync(tempOutFile); } catch (_) {}
            resolve(NextResponse.json({ status: 'ok', isSample: false, report: data }));
            return;
          } catch (parseErr) {
            // fall through to error response
          }
        }

        // ── Failure: return structured error with stderr context ───────────────
        resolve(
          NextResponse.json(
            {
              status: 'error',
              message:
                `Python crawl engine exited with code ${code}. ` +
                `The store may be blocking automated requests (Cloudflare/bot protection). ` +
                `Try a different store URL.`,
              detail: stderr.slice(-2000),
            },
            { status: 502 }
          )
        );
      });
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
