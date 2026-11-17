// The value model: what a protocol's token would be worth if its record stayed as it is.
//
// Everything here is derived from the sealed snapshot and nothing else: the protocol's TVL, its
// seven-day TVL growth and how long DefiLlama has tracked it with no token recorded. There is no
// list of names: two protocols with the same figures score the same whatever they are called.
//
//   implied = TVL x category_ratio x growth_adj x age_adj
//
// category_ratio  a prior FDV/TVL multiple for the protocol's category: what a tokenized protocol
//                 in that line of business usually trades at, expressed against its TVL. It is an
//                 assumption, stated on the dashboard, not a measurement.
// growth_adj      momentum from change_7d, clamped so a single wild week cannot own the board:
//                 1 + 0.6 x clamp(change_7d / 100, -0.5, 1.2), so 0.70x .. 1.72x.
// age_adj         how long it has run with no token: a protocol tracked for years at this TVL has
//                 already had every chance to launch, so it carries a mild premium over a protocol
//                 listed last month whose TVL has not been tested. 0.85x at day 0, 1.15x at five
//                 years or more.
//
// The number is the entry's own claim about a hypothetical token. It never says a token will be
// issued, and it is never a prediction of a price.

export type Protocol = {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
};

export type Snapshot = {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
};

export type Row = {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  multiple: number;
  on_watchlist: boolean;
};

export type Radar = {
  as_of: string;
  floor_usd: number;
  rows: Row[];
  live: Array<{ slug: string; name: string; symbol: string; tvl_usd: number; mcap_usd: number | null }>;
  watchlist_size: number;
  early_size: number;
  live_size: number;
  ratio_table: Array<{ category: string; ratio: number }>;
};

/** Categories whose products are structurally a wrapper of a token that already trades. */
const WRAPPER_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/**
 * A prior FDV/TVL multiple per category. Stated as an assumption on the dashboard, so a reader can
 * disagree with it and re-read the board with their own numbers.
 */
const CATEGORY_RATIO: Record<string, number> = {
  'Perp DEX': 1.9,
  Dexs: 1.8,
  Derivatives: 1.7,
  RWA: 1.6,
  Lending: 1.5,
  Payments: 1.4,
  'Risk Curators': 1.3,
  'Onchain Capital Allocator': 1.2,
  Yield: 1.2,
  'Yield Aggregator': 1.2,
  Restaking: 1.1,
  'Staking Pool': 1.0,
  Insurance: 1.1,
  Farm: 0.9,
  'NFT Marketplace': 1.0,
  Launchpad: 2.0,
};
const DEFAULT_RATIO = 1.1;

/** The ratio a category carries, and the whole table sorted for the dashboard. */
export function categoryRatio(category: string | null): number {
  if (category === null) return DEFAULT_RATIO;
  return CATEGORY_RATIO[category] ?? DEFAULT_RATIO;
}

function ratioTable(): Array<{ category: string; ratio: number }> {
  const rows = Object.entries(CATEGORY_RATIO).map(([category, ratio]) => ({ category, ratio }));
  rows.push({ category: 'every other category', ratio: DEFAULT_RATIO });
  rows.sort((a, b) => b.ratio - a.ratio);
  return rows;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Whole days between the snapshot's day and the day DefiLlama began tracking the protocol. */
function ageDays(p: Protocol, asOfMs: number): number {
  if (p.listed_at === null) return 365; // unknown: assume a year rather than reward or punish it
  const then = Date.parse(`${p.listed_at}T00:00:00Z`);
  if (Number.isNaN(then)) return 365;
  return Math.max(0, Math.floor((asOfMs - then) / 86_400_000));
}

function growthAdj(change: number | null): number {
  if (change === null) return 1; // unreported is not zero growth, and not a reason to move it
  return 1 + 0.6 * clamp(change / 100, -0.5, 1.2);
}

function ageAdj(days: number): number {
  return 0.85 + 0.3 * (Math.min(days, 1825) / 1825);
}

/** The implied value of a protocol's hypothetical token, in whole dollars. */
export function impliedValue(p: Protocol, asOfMs: number): { usd: number; multiple: number; age: number } {
  const ratio = categoryRatio(p.category);
  const age = ageDays(p, asOfMs);
  const multiple = ratio * growthAdj(p.change_7d) * ageAdj(age);
  const usd = Math.max(1, Math.min(100_000_000_000_000, Math.round(p.tvl_usd * multiple)));
  return { usd, multiple: Math.round(multiple * 1000) / 1000, age };
}

const money = (n: number): string => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};

/**
 * The steps to farm the protocol before or after it issues a token. Concrete: what to do, on which
 * chain, roughly what it costs and how long it takes. Built from the snapshot's own figures.
 */
function farmSteps(p: Protocol, age: number, multiple: number, floor: number): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const tvl = money(p.tvl_usd);
  const depth = `${Math.round(Math.max(3, Math.min(45, Math.sqrt(p.tvl_usd / 1e6) * 0.6)))} minutes`;
  const moving = p.change_7d === null ? 'flat' : p.change_7d > 0 ? 'rising' : 'falling';
  const cat = (p.category ?? 'protocol').toLowerCase();

  const steps: string[] = [
    `Open a dedicated wallet on ${chain} and bridge roughly $200-$2,000 of blue-chip collateral in; the bridge fee is usually $2-$8 and settles in 3-10 minutes.`,
    `Deposit into ${p.name} (${cat}, ${tvl} of TVL recorded) and keep the position open across at least two full weekly epochs so the activity is not a one-day artifact.`,
    `Do ${depth} of real activity weekly: a swap, a borrow-and-repay, or a rebalance, whichever the ${cat} actually counts, and never only the cheapest possible transaction.`,
  ];

  if (p.change_7d !== null) {
    steps.push(
      p.change_7d > 0
        ? `TVL is ${moving} (${p.change_7d.toFixed(2)}% over 7 days): deposit while it climbs, because farm weight per dollar tends to fall as the pool fills.`
        : `TVL is ${moving} (${p.change_7d.toFixed(2)}% over 7 days): deposits after a drawdown earn the same points on cheaper capital, so size up here rather than chasing a rising pool.`,
    );
  }

  if (p.change_7d !== null && p.change_7d <= -25) {
    steps.splice(2, 0, `TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in seven days, so capital is leaving: farm a third of the intended size now and add the rest once the outflow stops, because a protocol still bleeding deposits usually cuts its incentive budget next.`);
  }

  if (p.chains.length > 1) {
    steps.push(
      `${p.name} runs on ${p.chains.length} chains (${p.chains.slice(0, 4).join(', ')}): farm the chain where ${p.name}'s TVL is thinnest, since points per dollar are usually best where the protocol is least crowded.`,
    );
  }

  if (p.tvl_usd < floor) {
    steps.push(
      `This protocol sits below the house floor of ${money(floor)} at ${tvl}: the radar ranks it because a small protocol can still issue a token, but size the position for thinner liquidity and expect more slippage on the way out.`,
    );
  }

  steps.push(
    age >= 730
      ? `DefiLlama has tracked ${p.name} for ${Math.floor(age / 365)} years with no token recorded: treat any future issue as a mature distribution, and keep the wallet tidy rather than expecting a fast flip.`
      : `DefiLlama began tracking ${p.name} only ${age} days ago: early-stage protocols weight early wallets hardest, so the first weeks carry most of the upside.`,
  );
  steps.push(
    `Budget for gas and slippage of roughly 1-3% of the position, and plan to hold ${Math.round(60 + multiple * 30)} days: a farm measured on an implied value of ${money(Math.round(p.tvl_usd * multiple))} is not a same-week trade.`,
  );
  steps.push(
    `Keep a written record of every transaction hash. If a token is never issued, the position is still a yield position; do not borrow against it to fund the next farm.`,
  );

  return steps.map((s) => (s.length < 20 ? `${s} Hold at least one epoch.` : s.slice(0, 600)));
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

/**
 * Scores every pre-token protocol and ranks them. Protocols that record a token are set aside as the
 * live board: they are the comparison, not the radar.
 */
export function buildRadar(snapshot: Snapshot): Radar {
  const asOfMs = Date.parse(`${snapshot.as_of}T00:00:00Z`);
  const watch = new Set(snapshot.watchlist);
  const rows: Row[] = [];
  const live: Radar['live'] = [];

  for (const p of snapshot.protocols) {
    const hasToken = p.gecko_id !== null || p.symbol !== null;
    if (hasToken) {
      live.push({ slug: p.slug, name: p.name, symbol: p.symbol ?? '', tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd });
      continue;
    }
    if (p.category !== null && WRAPPER_CATEGORIES.has(p.category)) continue; // a wrapper is not a subject
    const { usd, multiple, age } = impliedValue(p, asOfMs);
    rows.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: usd,
      farm_steps: farmSteps(p, age, multiple, snapshot.floor_usd),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      multiple,
      on_watchlist: watch.has(p.slug),
    });
  }

  // Rank by implied value; ties broken by TVL then slug so two runs always agree.
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  live.sort((a, b) => b.tvl_usd - a.tvl_usd);

  return {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    rows,
    live,
    watchlist_size: snapshot.watchlist.length,
    early_size: rows.filter((r) => r.on_watchlist).length,
    live_size: live.length,
    ratio_table: ratioTable(),
  };
}

/** The dashboard's data file: the same board the gate reads, plus what a reader needs beside it. */
export function dataScript(radar: Radar): string {
  const payload = {
    asOf: radar.as_of,
    floorUsd: radar.floor_usd,
    watchlistSize: radar.watchlist_size,
    ratioTable: radar.ratio_table,
    rows: radar.rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      rank: r.rank,
      implied: r.implied_value_usd,
      category: r.category,
      chains: r.chains,
      tvl: r.tvl_usd,
      change7d: r.change_7d,
      ageDays: r.age_days,
      multiple: r.multiple,
      watch: r.on_watchlist,
      steps: r.farm_steps,
    })),
    live: radar.live.slice(0, 120),
  };
  return `window.RADAR = ${JSON.stringify(payload)};\n`;
}
