// Token launch radar — an entry for make.fun's "Build the best token launch radar" bounty.
//
// Reads the sealed snapshot, scores every protocol that records no token, ranks them by the implied
// value of the token each one may issue, and writes the four things the gate reads:
//
//   /output/board.json      the ranked board, in the shape the scorer accepts
//   /output/data.js         the same board for the page, so page and file cannot disagree
//   /output/dashboard/      the static page: index.html, app.css, app.js
//   /output/screenshots/    three captures of that page
//   /output/dossier.json    what the judge reads, written by the vendored make.fun library
//
// Standard library only. No network, no clock, no randomness: the same snapshot always produces the
// same bytes, which is what `run_deterministic` asks of it.
//
// Outside the grader's container, point it at a directory of your own:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar, dataScript, parseSnapshot, type Radar, type Snapshot } from './lib/radar.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

/** Caps the scorer enforces; the text cap changes the dossier's bytes, the rest refuse the entry. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const FILE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function flag(name: string, fallback: string): string {
  const pair = process.argv.indexOf(`--${name}`);
  if (pair >= 0 && pair + 1 < process.argv.length) return process.argv[pair + 1]!;
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const inputArg = flag('input', '/input');
const snapshotPath = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  process.stderr.write(
    `token radar: no snapshot at ${snapshotPath}. Pass --input <snapshot.json|directory> or mount the sealed /input.\n`,
  );
  process.exit(2);
}
const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot: Snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const radar: Radar = buildRadar(snapshot);
const board = radar.rows;

// The gate's own rules, checked here so a bad board never leaves the program: a rank per row, no
// gaps, implied value falling as the rank rises, every watchlist protocol present, farm plans of
// three to twelve steps.
function boardProblem(rows: typeof board, snap: Snapshot): string | null {
  if (rows.length < 100) return `only ${rows.length} rows; the gate wants at least 100`;
  const seen = new Set<string>();
  for (const [i, row] of rows.entries()) {
    if (seen.has(row.slug)) return `duplicate slug ${row.slug}`;
    seen.add(row.slug);
    if (row.rank !== i + 1) return `rank ${row.rank} at position ${i + 1}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `bad implied value on ${row.slug}`;
    if (i > 0 && row.implied_value_usd > rows[i - 1]!.implied_value_usd) return `implied value rises at ${row.slug}`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const t = step.trim();
      if (t.length < 20 || t.length > 600) return `${row.slug} has a ${t.length}-character farm step`;
    }
    if (row.name.length === 0) return `empty name on ${row.slug}`;
  }
  const known = new Set(snap.protocols.map((p) => p.slug));
  for (const slug of seen) if (!known.has(slug)) return `${slug} is not in the snapshot`;
  for (const slug of snap.watchlist) if (!seen.has(slug)) return `watchlist protocol ${slug} is missing`;
  const values = new Set(rows.map((r) => r.implied_value_usd));
  if (rows.length >= 2 && values.size === 1) return 'every implied value is the same';
  return null;
}

const problem = boardProblem(board, snapshot);
if (problem !== null) fail(`the board the model produced breaks a gate rule: ${problem}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board }, null, 0)}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copies one directory's regular files, skipping dotfile entries, and returns the names copied. */
function publish(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

publish(join(ROOT, 'dashboard'), join(outDir, 'dashboard'));
const shots = publish(join(ROOT, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3 || shots.length > SCREENSHOT_CAPS.max) {
  fail(`screenshots/ holds ${shots.length}: hand in 3 or 4 (the board, a detail view, a filtered view)`);
}
for (const name of shots) {
  if (!FILE_NAME.test(name)) fail(`screenshots/${name}: names are letters, digits and . _ -, 1 to 128 characters`);
  if (statSync(join(outDir, 'screenshots', name)).size > SCREENSHOT_CAPS.max_bytes) {
    fail(`screenshots/${name} is past the 512 KiB cap`);
  }
}

// Written last, and rebuilt from /output exactly as the scorer rebuilds it.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

const top = board[0]!;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols read, ${board.length} ranked, ` +
    `${radar.early_size} of ${radar.watchlist_size} watchlist protocols on the board, ${radar.live_size} already trading set aside\n` +
    `token radar: top of the board ${top.name} at $${top.implied_value_usd.toLocaleString('en-US')} implied\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${readdirSync(join(outDir, 'dashboard')).length} files), ` +
    `screenshots/ (${shots.length}), dossier.json into ${outDir}\n`,
);
