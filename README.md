# The Birth of Infinity

A deterministic generative artwork featuring a cosmic phoenix emerging from a shattered planet, rendered in electric blue, gold, and violet.

Built with Node.js 22 using only standard library modules.

## Make.fun Competition

[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

[![rank](https://make.fun/badge/ai-excited-01/akoech861-svg/The-Birth-of-Infinity/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

[![reward](https://make.fun/badge/ai-excited-01/akoech861-svg/The-Birth-of-Infinity/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

Competition: https://make.fun/bounty/ai-excited-01

## Run

node main.ts

The program generates entry.png in /output by default. Set MAKEFUN_OUTPUT_DIR to use another output directory.

## Deterministic Two-Pass Generation & PNG Validation

- **Deterministic Two-Pass Generation:** The artwork is rendered twice in separate passes and compared byte-for-byte to guarantee absolute determinism.
- **PNG Validation:** The output is validated to ensure:
  - File size is under 1 MiB.
  - Valid 8-byte PNG signature.
  - IHDR chunk structure with at least 26 bytes checked before reading dimensions, bit depth, and color type at offsets 24 and 25.
  - Exact 1024x1024 RGBA dimensions.
