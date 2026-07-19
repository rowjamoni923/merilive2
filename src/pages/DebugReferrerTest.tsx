/**
 * Pkg66 — Install Referrer QA Checklist.
 *
 * Step-by-step in-app guide a tester runs on a fresh Android device to
 * verify Play Store deferred deep-link referral end-to-end. Tracks
 * per-step pass/fail locally so a tester can work through it without
 * losing place between app restarts. Shows the exact console log lines,
 * localStorage keys, and screenshots/UI states to look for at each step.
 *
 * Route: /debug/referrer-test
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, XCircle, Copy, RotateCcw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

type Status = "todo" | "pass" | "fail";
const LS_KEY = "meri_referrer_qa_checklist_v1";
const PKG_ID = "com.merilive.app";

interface Step {
  id: string;
  title: string;
  goal: string;
  actions: string[];
  expectLog?: string[];
  expectStorage?: Array<{ key: string; value: string }>;
  expectUI?: string[];
  screenshot?: string;
  troubleshoot?: string[];
}

const INVITE_STEPS: Step[] = [
  {
    id: "inv-1",
    title: "Build the Play Store invitation link",
    goal: "Get a real Play Store URL carrying the inviter's app_uid as referrer.",
    actions: [
      "Sign in as the inviter on any device and copy their app_uid from Profile.",
      "Construct the URL using the template below — replace <APP_UID>.",
      "URL-encode the referrer value: ref%3D<APP_UID> (the %3D is =).",
    ],
    expectUI: [
      "Template: https://play.google.com/store/apps/details?id=com.merilive.app&referrer=ref%3D<APP_UID>",
    ],
    troubleshoot: [
      "Direct APK install (not via Play) will NOT fire the Install Referrer API — the test only works for true Play Store installs.",
    ],
  },
  {
    id: "inv-2",
    title: "Install on a fresh device via that link",
    goal: "Play Store captures and forwards the referrer to the new install.",
    actions: [
      "On a device that has NEVER installed merilive (or factory reset / uninstall + clear Play data), open the link from the previous step.",
      "Tap Install. Wait for install to finish.",
      "Open the app from Play (or home screen).",
    ],
    troubleshoot: [
      "If Play opens but no Install button appears, the package is already installed on this account → use a different device or account.",
    ],
  },
  {
    id: "inv-3",
    title: "Confirm the native plugin received the referrer",
    goal: "InstallReferrerPlugin should fire once on first launch.",
    actions: [
      "Attach the device to a Mac/PC with USB.",
      "Open chrome://inspect in Chrome → click 'inspect' on the merilive WebView.",
      "In the console, you should see the line below within ~2s of launch.",
      "Open /debug/referrer to confirm Raw + parsed ref are populated.",
    ],
    expectLog: ["[InstallReferrer] processed: ref=<APP_UID>"],
    expectStorage: [
      { key: "meri_pending_invitation_ref", value: "<APP_UID>" },
      { key: "meri_pending_referral", value: "<APP_UID>" },
      { key: "meri_install_referrer_processed", value: "1" },
    ],
    screenshot: "/debug/referrer — Raw field shows ref=<APP_UID>; Parsed tile 'ref (invitation)' shows the UID.",
    troubleshoot: [
      "Log shows '(empty)' → URL was not built via the Play Store template, or the device installed via a side-load.",
      "Log shows the value but localStorage keys are empty → the user already had the keys consumed in a previous test; reinstall to reset.",
    ],
  },
  {
    id: "inv-4",
    title: "Sign up the new invitee",
    goal: "trackUserInvitation() reads the key and writes a user_invitations row.",
    actions: [
      "Complete signup (phone or email OTP).",
      "Land on the home feed.",
      "Return to /debug/referrer.",
    ],
    expectStorage: [
      { key: "meri_pending_invitation_ref", value: "(empty — consumed)" },
    ],
    expectUI: ["The 'Invitation ref consumed' row turns green with a check."],
    troubleshoot: [
      "Key still present → trackUserInvitation didn't run; check Auth.tsx line ~367 path was hit (Auth vs AuthCallback).",
    ],
  },
  {
    id: "inv-5",
    title: "Confirm the inviter's My Invitations count bumps",
    goal: "Realtime postgres_changes pushes the new invitee within 1s.",
    actions: [
      "On the inviter's device, open /invitation.",
      "Watch the count — should increase by 1 within ~1s of step 4 signup.",
      "Verify the new invitee row shows the correct name/avatar.",
    ],
    screenshot: "/invitation — list shows new invitee row at top with timestamp matching signup time.",
    troubleshoot: [
      "Count didn't bump → check user_invitations table for a row with inviter_id = inviter's id and created_at near signup time. Missing row → step 4 failed.",
    ],
  },
];

const AGENCY_STEPS: Step[] = [
  {
    id: "ag-1",
    title: "Build the Play Store agency link",
    goal: "Get a real Play Store URL carrying the agency code.",
    actions: [
      "Copy the agency 'code' from Admin → Agencies (e.g. AG42).",
      "Construct the URL using the template below — replace <CODE>.",
    ],
    expectUI: [
      "Template: https://play.google.com/store/apps/details?id=com.merilive.app&referrer=agency%3D<CODE>",
      "Combined variant (invite + agency): &referrer=ref%3D<APP_UID>%26agency%3D<CODE>",
    ],
  },
  {
    id: "ag-2",
    title: "Install on a fresh device via that link",
    goal: "Same as invite flow — fresh install required.",
    actions: [
      "Use a device with no prior merilive install on this Google account.",
      "Install + open from Play.",
    ],
  },
  {
    id: "ag-3",
    title: "Confirm agency code parsed and stored",
    goal: "applyReferrer() writes the agency code into meri_pending_referral.",
    actions: [
      "Open chrome://inspect WebView console.",
      "Open /debug/referrer in the app.",
    ],
    expectLog: ["[InstallReferrer] processed: agency=<CODE>"],
    expectStorage: [
      { key: "meri_pending_referral", value: "<CODE>" },
      { key: "meri_install_referrer_processed", value: "1" },
    ],
    screenshot: "/debug/referrer — Parsed tile 'agencyCode' shows <CODE>; All query params row shows agency=<CODE>.",
  },
  {
    id: "ag-4",
    title: "Sign up as a female user and complete face verification",
    goal: "Female + face-approved is the gate to apply as host.",
    actions: [
      "Complete OTP signup, select gender = Female.",
      "Complete 3-angle face verification (auto-approve in ~10s if thresholds met).",
      "Wait for profile.is_host=true (DB trigger).",
    ],
    troubleshoot: [
      "Face verification below threshold → admin manual approve required; ask admin or pick another tester.",
    ],
  },
  {
    id: "ag-5",
    title: "Open Apply as Host → Join Agency",
    goal: "JoinAgency reads meri_pending_referral and pre-fills the agency code.",
    actions: [
      "Profile → Apply as Host → Join Agency.",
      "Observe the Agency Code field on mount — must already contain <CODE>.",
      "Agency card auto-renders below the field within ~1s.",
    ],
    expectUI: [
      "Agency Code input pre-filled with <CODE> on first render.",
      "Resolved agency card shows agency name, owner avatar, level.",
    ],
    expectStorage: [
      { key: "meri_pending_referral", value: "(empty — consumed after auto-fill)" },
    ],
    screenshot: "JoinAgency — input shows <CODE>, agency card visible below.",
    troubleshoot: [
      "Field is empty → meri_pending_referral was consumed earlier (e.g. user opened JoinAgency before signup completion). Reinstall to reset.",
      "Field has code but no card → code does not match any agency.code; check Admin → Agencies.",
    ],
  },
  {
    id: "ag-6",
    title: "Apply and confirm the request reaches the agency",
    goal: "get_host_agency_request inserts a row visible to the agency owner.",
    actions: [
      "Tap Apply.",
      "Toast: 'Application sent'.",
      "On the agency owner's device → Agency Dashboard → Pending Hosts: new request appears within ~1s.",
    ],
    screenshot: "Agency Dashboard → Pending Hosts list contains the new host row.",
  },
];

const ALL_GROUPS: Array<{ id: "invite" | "agency"; title: string; steps: Step[] }> = [
  { id: "invite", title: "Flow A — Invitation (My Invitations)", steps: INVITE_STEPS },
  { id: "agency", title: "Flow B — Agency code auto-fill", steps: AGENCY_STEPS },
];

const ALL_IDS = ALL_GROUPS.flatMap((g) => g.steps.map((s) => s.id));

export default function DebugReferrerTest() {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<Record<string, Status>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setStatuses(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(statuses)); } catch { /* ignore */ }
  }, [statuses]);

  const setStatus = (id: string, s: Status) =>
    setStatuses((prev) => ({ ...prev, [id]: prev[id] === s ? "todo" : s }));

  const reset = () => {
    setStatuses({});
    toast.success("Checklist reset");
  };

  const passCount = useMemo(() => ALL_IDS.filter((id) => statuses[id] === "pass").length, [statuses]);
  const failCount = useMemo(() => ALL_IDS.filter((id) => statuses[id] === "fail").length, [statuses]);
  const pct = Math.round((passCount / ALL_IDS.length) * 100);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Install Referrer · Test Checklist</h1>
          <p className="text-xs text-muted-foreground">
            Run on a fresh Android device. Tap circles to mark Pass / Fail per step.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/debug/referrer")}>
          <ExternalLink className="mr-2 h-4 w-4" />
          Live state
        </Button>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Progress</div>
              <div className="text-xs text-muted-foreground">
                {passCount}/{ALL_IDS.length} passed · {failCount} failed
              </div>
            </div>
            <Badge variant={Capacitor.isNativePlatform() ? "default" : "secondary"}>
              {Capacitor.getPlatform()}
            </Badge>
          </div>
          <Progress value={pct} />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(PKG_ID)}>
              <Copy className="mr-2 h-4 w-4" />
              Copy package id
            </Button>
          </div>
        </Card>

        <Card className="space-y-2 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Before you start
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Use a real device with Google Play Services. Emulators rarely fire Install Referrer.</li>
            <li>The device account must not have merilive currently installed (uninstall + clear Play Store data first).</li>
            <li>Make sure the latest signed APK is published to at least Internal Testing on Play Console.</li>
            <li>Have <code className="rounded bg-muted px-1">chrome://inspect</code> ready on a laptop to read WebView console logs.</li>
          </ul>
        </Card>

        {ALL_GROUPS.map((group) => (
          <section key={group.id} className="space-y-3">
            <h2 className="text-base font-semibold">{group.title}</h2>
            {group.steps.map((step, idx) => {
              const st = statuses[step.id] ?? "todo";
              return (
                <Card key={step.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setStatus(step.id, "pass")}
                        aria-label="Mark pass"
                        className="rounded-full p-1 hover:bg-muted"
                      >
                        {st === "pass" ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        onClick={() => setStatus(step.id, "fail")}
                        aria-label="Mark fail"
                        className="rounded-full p-1 hover:bg-muted"
                      >
                        {st === "fail" ? (
                          <XCircle className="h-5 w-5 text-rose-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/60" />
                        )}
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {idx + 1}. {step.title}
                      </div>
                      <div className="text-xs text-muted-foreground">{step.goal}</div>
                    </div>
                  </div>

                  <Separator />

                  <Section label="Do this">
                    <ol className="list-decimal space-y-1 pl-5 text-sm">
                      {step.actions.map((a, i) => <li key={i}>{a}</li>)}
                    </ol>
                  </Section>

                  {step.expectLog && (
                    <Section label="Console log to look for">
                      <ul className="space-y-1">
                        {step.expectLog.map((l, i) => (
                          <li key={i} className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/30 p-2">
                            <code className="break-all font-mono text-xs">{l}</code>
                            <Button size="icon" variant="ghost" onClick={() => copy(l)} aria-label="Copy">
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {step.expectStorage && (
                    <Section label="localStorage after this step">
                      <ul className="space-y-1">
                        {step.expectStorage.map((kv, i) => (
                          <li key={i} className="rounded-md border border-border bg-muted/30 p-2 font-mono text-xs">
                            <span className="text-muted-foreground">{kv.key}</span> = <span>{kv.value}</span>
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {step.expectUI && (
                    <Section label="UI to verify">
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {step.expectUI.map((u, i) => <li key={i}>{u}</li>)}
                      </ul>
                    </Section>
                  )}

                  {step.screenshot && (
                    <Section label="Screenshot to capture">
                      <p className="rounded-md border border-dashed border-border bg-muted/20 p-2 text-xs">
                        📸 {step.screenshot}
                      </p>
                    </Section>
                  )}

                  {step.troubleshoot && (
                    <Section label="If it fails">
                      <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                        {step.troubleshoot.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </Section>
                  )}
                </Card>
              );
            })}
          </section>
        ))}

        <Card className="space-y-2 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Final sign-off
          </h2>
          <p className="text-sm">
            Both flows pass end-to-end when:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Console shows <code className="rounded bg-muted px-1">[InstallReferrer] processed: …</code> with the expected value.</li>
            <li><code className="rounded bg-muted px-1">/debug/referrer</code> shows green "consumed" rows after signup / agency apply.</li>
            <li>Inviter's <code className="rounded bg-muted px-1">/invitation</code> count bumps in &lt;1s.</li>
            <li>Agency code is pre-filled in Join Agency on first open.</li>
          </ul>
        </Card>
      </main>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
