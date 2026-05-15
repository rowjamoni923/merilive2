// Pure pose / threshold logic for Face Verification.
// Extracted so it can be exercised by regression tests + the in-app
// "Pose Regression Runner" dev tool without touching React / camera code.

export const POSE_BASE = {
  CENTER_YAW: 22,
  CENTER_PITCH: 22,
  TURN_YAW: 14,
  TILT_PITCH: 10,
  HOLD_SEC: 0.6,
  STEP_WINDOW: 8,
} as const;

export type PoseSample = { yaw: number; pitch: number };

export type PoseCalibration = {
  baselineYaw: number;
  baselinePitch: number;
  noiseYaw: number;
  noisePitch: number;
  centerYaw: number;
  centerPitch: number;
  turnYaw: number;
  tiltPitch: number;
  holdSec: number;
  stepWindowSec: number;
  capturedAt: number;
};

export const DEFAULT_CALIB: PoseCalibration = {
  baselineYaw: 0,
  baselinePitch: 0,
  noiseYaw: 0,
  noisePitch: 0,
  centerYaw: POSE_BASE.CENTER_YAW,
  centerPitch: POSE_BASE.CENTER_PITCH,
  turnYaw: POSE_BASE.TURN_YAW,
  tiltPitch: POSE_BASE.TILT_PITCH,
  holdSec: POSE_BASE.HOLD_SEC,
  stepWindowSec: POSE_BASE.STEP_WINDOW,
  capturedAt: 0,
};

export type StepId = 'center' | 'left' | 'right';
export const STEP_IDS: StepId[] = ['center', 'left', 'right'];

export function calibrateThresholds(samples: PoseSample[]): PoseCalibration {
  if (samples.length < 4) return { ...DEFAULT_CALIB, capturedAt: Date.now() };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const std  = (xs: number[], m: number) => Math.sqrt(mean(xs.map(v => (v - m) ** 2)));
  const yaws = samples.map(s => s.yaw);
  const pitches = samples.map(s => s.pitch);
  const baselineYaw = mean(yaws);
  const baselinePitch = mean(pitches);
  const noiseYaw = std(yaws, baselineYaw);
  const noisePitch = std(pitches, baselinePitch);
  const padY = Math.min(10, Math.max(2, noiseYaw * 2));
  const padP = Math.min(10, Math.max(2, noisePitch * 2));
  const noisy = (noiseYaw + noisePitch) > 6;
  return {
    baselineYaw,
    baselinePitch,
    noiseYaw,
    noisePitch,
    centerYaw:   POSE_BASE.CENTER_YAW   + padY * 0.5,
    centerPitch: POSE_BASE.CENTER_PITCH + padP * 0.5,
    turnYaw:     POSE_BASE.TURN_YAW     + padY * 0.7,
    tiltPitch:   POSE_BASE.TILT_PITCH   + padP * 0.7,
    holdSec:     noisy ? 1.0 : POSE_BASE.HOLD_SEC,
    stepWindowSec: noisy ? 12 : POSE_BASE.STEP_WINDOW,
    capturedAt: Date.now(),
  };
}

export function evaluatePose(stepId: string, pose: PoseSample, c: PoseCalibration): boolean {
  const dy = pose.yaw - c.baselineYaw;
  const dp = pose.pitch - c.baselinePitch;
  switch (stepId) {
    case 'center': return Math.abs(dy) < c.centerYaw && Math.abs(dp) < c.centerPitch;
    case 'left':   return dy >  c.turnYaw;
    case 'right':  return dy < -c.turnYaw;
    default:       return false;
  }
}

// ── Regression replay ───────────────────────────────────────────────────────
// A "sample set" describes a recorded face-verify session under specific
// conditions (good light, low light, phone-on-lap, far distance, etc.) and
// the result we expect from the threshold logic. The runner replays the
// session through `calibrateThresholds` + `evaluatePose` and reports per-step
// pass/fail, total ticks, and whether expectations matched.

export type PoseTick = {
  step: StepId | string;
  yaw: number;
  pitch: number;
};

export type SampleSet = {
  id: string;
  label: string;                                      // e.g. "good-light-eye-level"
  description?: string;
  conditions?: { light?: string; distance?: string; angle?: string; device?: string };
  calibrationSamples: PoseSample[];                   // what we feed calibrateThresholds
  ticks: PoseTick[];                                  // sequence of polled poses
  expected: {
    stepsPassed: StepId[];                            // which step ids should pass at least once
    minPassRate?: number;                             // optional: ticks where active step passes
  };
};

export type StepReplayStat = {
  step: string;
  ticks: number;
  passes: number;
  passRate: number;
  firstPassTickIndex: number | null;
  reachedPass: boolean;
};

export type ReplayResult = {
  setId: string;
  label: string;
  calibration: PoseCalibration;
  perStep: StepReplayStat[];
  stepsPassed: string[];
  expectedStepsPassed: string[];
  missingSteps: string[];
  unexpectedPasses: string[];
  overallPassRate: number;
  ok: boolean;
  errors: string[];
};

export function replaySampleSet(set: SampleSet): ReplayResult {
  const errors: string[] = [];
  const calibration = calibrateThresholds(set.calibrationSamples);

  const perStepMap = new Map<string, StepReplayStat>();
  set.ticks.forEach((tick, idx) => {
    const cur = perStepMap.get(tick.step) ?? {
      step: tick.step, ticks: 0, passes: 0, passRate: 0,
      firstPassTickIndex: null, reachedPass: false,
    };
    cur.ticks++;
    const passed = evaluatePose(tick.step, { yaw: tick.yaw, pitch: tick.pitch }, calibration);
    if (passed) {
      cur.passes++;
      if (cur.firstPassTickIndex === null) cur.firstPassTickIndex = idx;
      cur.reachedPass = true;
    }
    perStepMap.set(tick.step, cur);
  });
  const perStep = [...perStepMap.values()].map(s => ({
    ...s, passRate: s.ticks ? s.passes / s.ticks : 0,
  }));

  const stepsPassed: string[] = perStep.filter(s => s.reachedPass).map(s => s.step);
  const expectedStepsPassed: string[] = set.expected.stepsPassed.slice();
  const missingSteps = expectedStepsPassed.filter(s => !stepsPassed.includes(s));
  const unexpectedPasses = stepsPassed.filter(s => !expectedStepsPassed.includes(s));

  const overallPassRate = perStep.length
    ? perStep.reduce((s, x) => s + x.passRate, 0) / perStep.length
    : 0;

  if (missingSteps.length) errors.push(`missing expected passes: ${missingSteps.join(', ')}`);
  if (unexpectedPasses.length) errors.push(`unexpected passes: ${unexpectedPasses.join(', ')}`);
  if (set.expected.minPassRate != null && overallPassRate < set.expected.minPassRate) {
    errors.push(`overall pass rate ${overallPassRate.toFixed(2)} < min ${set.expected.minPassRate}`);
  }

  return {
    setId: set.id,
    label: set.label,
    calibration,
    perStep,
    stepsPassed,
    expectedStepsPassed,
    missingSteps,
    unexpectedPasses,
    overallPassRate,
    ok: errors.length === 0,
    errors,
  };
}

// Convert a downloaded debug log (schema "face-verify-debug/v1") into a
// SampleSet so users can replay real failed sessions through the runner.
export function sampleSetFromDebugLog(json: unknown, opts?: { label?: string; expectedStepsPassed?: StepId[] }): SampleSet {
  const log = json as { events?: Array<Record<string, unknown>>; calibration?: PoseCalibration };
  const events = Array.isArray(log?.events) ? log.events : [];
  const calibrationSamples: PoseSample[] = [];
  const ticks: PoseTick[] = [];
  for (const ev of events) {
    if (ev.kind === 'tick' && typeof ev.yaw === 'number' && typeof ev.pitch === 'number' && typeof ev.instruction === 'string') {
      ticks.push({ step: ev.instruction as StepId, yaw: ev.yaw as number, pitch: ev.pitch as number });
    }
  }
  // Synthesize calibration samples from baseline if present (debug log doesn't keep raw samples)
  if (log.calibration) {
    const { baselineYaw, baselinePitch, noiseYaw = 0, noisePitch = 0 } = log.calibration;
    for (let i = 0; i < 8; i++) {
      const jitterY = (Math.random() - 0.5) * noiseYaw * 2;
      const jitterP = (Math.random() - 0.5) * noisePitch * 2;
      calibrationSamples.push({ yaw: baselineYaw + jitterY, pitch: baselinePitch + jitterP });
    }
  }
  const stepIds = new Set(ticks.map(t => t.step));
  const expectedStepsPassed = opts?.expectedStepsPassed ?? (Array.from(stepIds) as StepId[]);
  return {
    id: `debug-log-${Date.now()}`,
    label: opts?.label ?? 'Imported debug log',
    description: 'Replayed from face-verify-debug/v1 export',
    calibrationSamples,
    ticks,
    expected: { stepsPassed: expectedStepsPassed },
  };
}
