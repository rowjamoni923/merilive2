# Visual Regression Tests

Playwright pixel-diff snapshots for public surfaces. Catches contrast and layout regressions that the static contrast guard cannot see (e.g. white-on-white only after a runtime style swap).

## Run locally

```bash
# First run / after an intentional UI change — generate baselines
npm run test:visual:update

# Verify nothing regressed
npm run test:visual

# Open last diff report
npm run test:visual:report
```

Baselines live in `tests/visual/__screenshots__/` and **must be committed** with the PR that changed the visual.

## Adding routes

Edit `PUBLIC_ROUTES` in `public-surfaces.spec.ts`. Only **unauthenticated** routes work in CI today; authenticated coverage requires a seeded test user (TBD).

## CI behavior

`.github/workflows/visual-regression.yml` runs on every PR. On failure, the diff HTML report and screenshot triplets (expected / actual / diff) are uploaded as the `playwright-report` artifact for 14 days.

## Determinism

The spec disables animations, transitions, caret blinking, and video playback before each shot, and waits for `networkidle`. Allowed pixel drift is `0.2%` (`maxDiffPixelRatio: 0.002`) to absorb sub-pixel font noise across machines.
