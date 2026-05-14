import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

/**
 * Guards against new text/background contrast regressions.
 * Pre-existing accepted findings live in .contrast-baseline.json.
 * To accept a new finding intentionally:
 *   1) verify visually it's fine (rare — ternary branch noise),
 *   2) run `npm run check:contrast:baseline`,
 *   3) commit the updated baseline.
 *
 * To silence one specific line, append `// dark-ok` to it.
 */
describe('readability / contrast guard', () => {
  it('finds no new text-on-background contrast bugs', () => {
    let stdout = '';
    let exitCode = 0;
    try {
      stdout = execSync('node scripts/check-contrast.mjs', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      stdout = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
      exitCode = err.status ?? 1;
    }
    if (exitCode !== 0) {
      // Surface the script's own report in the test failure output
      throw new Error('Contrast check failed:\n\n' + stdout);
    }
    expect(exitCode).toBe(0);
  }, 30_000);
});
