# Visual Regression — User System (admin-pro-shell)

Captures all 15 User System pages on **mobile (390px)**, **tablet (820px)**, and **desktop (1440px)** to catch color-token drift, 3D shadow gaps, and border/radius regressions across the admin shell.

## Run

```bash
# 1. First run — write baselines (commit these PNGs)
node tests/visual/user-system.spec.mjs --update

# 2. After any UI change — diff vs baselines
node tests/visual/user-system.spec.mjs
```

Exit code `1` on regression. Per-page diffs go to `tests/visual/diff/`, machine report to `tests/visual/report.json`.

## Tuning

| Env var     | Default | Purpose                                                      |
| ----------- | ------- | ------------------------------------------------------------ |
| `BASE_URL`  | `http://localhost:8080` | Where the dev server is running.                  |
| `THRESHOLD` | `0.12`  | Per-pixel color tolerance (lower = stricter).                |
| `MAX_DIFF`  | `0.5`   | Max % of pixels allowed to differ before failing the page.   |

## Diff color legend

- **Red pixels** → likely color-token mismatch (background/text/badge).
- **Blue pixels** → likely shadow / 3D-elevation gap (border, hover-lift, radius).

## Auth

Uses the sandbox-injected `LOVABLE_BROWSER_SUPABASE_*` env vars to restore the admin session before navigating. Without it, RouteGuard pages will render as login redirects (still useful for catching shell regressions on the guard surface itself).

## Stabilisation tricks

- All CSS animations + transitions are frozen via `addStyleTag` before each shot.
- Elements with `data-volatile`, `<time>`, and `.relative-time` are hidden to avoid clock-driven false positives. Add `data-volatile` to any new dynamic atom you want excluded.

## CI hook (optional)

```bash
# In CI, run after build + preview start:
node tests/visual/user-system.spec.mjs || exit 1
```
