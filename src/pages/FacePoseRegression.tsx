import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  replaySampleSet,
  sampleSetFromDebugLog,
  type SampleSet,
  type ReplayResult,
} from '@/lib/face-pose';
import fixturesJson from '@/test/fixtures/face-pose-samples.json';
import { CheckCircle2, XCircle, Upload, Play, FileJson } from 'lucide-react';

const builtIn: SampleSet[] = (fixturesJson as { sets: SampleSet[] }).sets;

/**
 * Dev tool: replay recorded face-verify sample sets through the live
 * pose / threshold logic and show pass/fail per step. Accepts either the
 * built-in fixture sets, or a JSON file in two supported shapes:
 *  1) The downloaded debug log (schema "face-verify-debug/v1")
 *  2) A custom SampleSet[] / { sets: SampleSet[] } JSON
 */
const FacePoseRegression: React.FC = () => {
  const [results, setResults] = useState<ReplayResult[]>([]);
  const [importedSets, setImportedSets] = useState<SampleSet[]>([]);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);

  const allSets = useMemo(() => [...builtIn, ...importedSets], [importedSets]);

  const runAll = () => {
    setResults(allSets.map(replaySampleSet));
  };

  const importJson = (raw: string, sourceLabel: string) => {
    setError(null);
    try {
      const json = JSON.parse(raw);
      let added: SampleSet[] = [];
      if (Array.isArray(json?.sets)) {
        added = json.sets as SampleSet[];
      } else if (Array.isArray(json)) {
        added = json as SampleSet[];
      } else if (json?.schema === 'face-verify-debug/v1' || Array.isArray(json?.events)) {
        added = [sampleSetFromDebugLog(json, { label: `Imported: ${sourceLabel}` })];
      } else if (json?.id && Array.isArray(json?.ticks)) {
        added = [json as SampleSet];
      } else {
        throw new Error('Unrecognized JSON shape (expected SampleSet, {sets:[]}, or debug log v1)');
      }
      setImportedSets(prev => [...prev, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    importJson(await f.text(), f.name);
    e.target.value = '';
  };

  const passCount = results.filter(r => r.ok).length;

  return (
    <div className="container mx-auto max-w-5xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Face Pose / Threshold Regression Runner</h1>
        <p className="text-sm text-muted-foreground">
          Replay recorded face samples (different pose / light / distance / device-angle) through
          the live <code>calibrateThresholds</code> + <code>evaluatePose</code> logic and verify
          each step still passes as expected.
        </p>
      </header>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={runAll} className="gap-2">
            <Play className="w-4 h-4" /> Run all ({allSets.length})
          </Button>
          <label className="inline-flex">
            <input type="file" accept="application/json" className="hidden" onChange={onFile} />
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent text-sm cursor-pointer">
              <Upload className="w-4 h-4" /> Import JSON file
            </span>
          </label>
          {results.length > 0 && (
            <Badge variant={passCount === results.length ? 'default' : 'destructive'} className="ml-auto">
              {passCount}/{results.length} sets passed
            </Badge>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <FileJson className="w-3 h-3" /> Or paste a debug log / sample set JSON:
          </p>
          <Textarea
            value={pasted}
            onChange={e => setPasted(e.target.value)}
            rows={4}
            placeholder='{"schema":"face-verify-debug/v1","events":[...]}  or  {"sets":[...]}'
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!pasted.trim()}
            onClick={() => { importJson(pasted.trim(), 'pasted'); setPasted(''); }}
          >
            Add pasted JSON
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </Card>

      <section className="space-y-3">
        {results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Click <strong>Run all</strong> to execute the {allSets.length} sample sets currently loaded.
          </p>
        )}
        {results.map(r => (
          <Card key={r.setId} className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              {r.ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-rose-600" />}
              <h3 className="font-semibold">{r.label}</h3>
              <code className="text-xs text-muted-foreground ml-auto">{r.setId}</code>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              {r.perStep.map(s => (
                <div key={s.step} className="rounded-md border p-2">
                  <div className="font-medium capitalize">{s.step}</div>
                  <div className={s.reachedPass ? 'text-emerald-600' : 'text-rose-600'}>
                    {s.passes}/{s.ticks} pass ({(s.passRate * 100).toFixed(0)}%)
                  </div>
                  <div className="text-muted-foreground">
                    first pass tick: {s.firstPassTickIndex ?? '—'}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">
              Calibration: baseline yaw {r.calibration.baselineYaw.toFixed(2)}°, pitch {r.calibration.baselinePitch.toFixed(2)}°,
              noise yaw {r.calibration.noiseYaw.toFixed(2)} pitch {r.calibration.noisePitch.toFixed(2)},
              window {r.calibration.stepWindowSec}s · overall pass rate {(r.overallPassRate * 100).toFixed(0)}%
            </div>
            {r.errors.length > 0 && (
              <ul className="text-xs text-rose-600 list-disc pl-5">
                {r.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </Card>
        ))}
      </section>
    </div>
  );
};

export default FacePoseRegression;
