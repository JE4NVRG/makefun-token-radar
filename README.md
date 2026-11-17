# makefun-token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/JE4NVRG/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/JE4NVRG/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Protocols that record no token, ranked by the value a token would imply today.

The radar reads the sealed snapshot and keeps every protocol whose record shows no token. Each one
gets an implied value, `TVL × category ratio × growth adjustment × age adjustment`, built only from
its own figures: no name, no outside price and no hardcoded list of favourites enters the number.
Every row also carries a farm plan written from that protocol's TVL, its seven-day change and how
long it has run with no token. Protocols that record a token, and those whose product wraps a token
that already trades, are set aside as the live comparison rather than ranked.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18 or later, standard library only, no dependencies to install and no network at run time.
The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the
output directory.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
