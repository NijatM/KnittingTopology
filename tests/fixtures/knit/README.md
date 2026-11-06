# Knit Grammar fixtures

Written by Knit Grammar's own code (KnittingPixelArtEditor, MIT License, the same author) so that the knit program writers can be checked against the original byte for byte. The files here are not formatted by Prettier.

Generated on 2026-11-06 with `scripts/knit-grammar-fixtures.ts` from a sibling checkout at `../KnittingPixelArtEditor`:

```sh
npx rolldown scripts/knit-grammar-fixtures.ts --file /tmp/knit-grammar-fixtures.mjs --format esm --platform node
node /tmp/knit-grammar-fixtures.mjs tests/fixtures/knit
```

SHA-256 of the Knit Grammar sources used:

| file | sha256 |
| --- | --- |
| src/grammar/ops.ts | 6cc732c30ee9aa014e6dd496f6d0f2f74a715f9a131c20355bce64f16f2bb0fa |
| src/grammar/pattern.ts | 82641030a902c4391dfffbc0eba684dc8e7185ab6cba4eeed95c61c09059e2ef |
| src/grammar/io.ts | de997c17d45acb9a6030eec40382e79b426b7d8ed9b4e30d95a100f09718a704 |
| src/grammar/checks.ts | f97551bc6dcee56199db66bbfb08dae143b88bfa7cc06ba89885129324fc78b1 |
| src/grammar/structures.ts | 6327635cd55be9da5282216c070ef3cf9248f0817563540f683743bee60450d4 |
| src/export.ts | b9d161a2e74f7c7e936d28eb2050f5f68871ab487a5423281bf019aa772517be |
| src/exitcopy.ts | 72429c3faebed1bfcfbe2938ef1a5f8bafce366770edbb0da5ad1c2e0f71b4b2 |

Contents:

- `basic-all-ops`, `basic-reversed`, `two-guide`: BMP from `bmpOf` and project JSON from `toJSON` for known cells (odd widths exercise row padding; `two-guide` starts right to left).
- `checks-basic`, `checks-two` and `checks.json`: pseudo-random programs and the findings of `runChecks` with limits float 3, held 4, tucks 2.
- `structures.json`: `STRUCTURES_1`, `STRUCTURES_2` and the program `generate()` makes from a design layer of eight structures.
