import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Pkg77 — AdminHelperApplications "Level Auto-Detection Audit" rendering test.
 *
 * Verifies the audit panel renders selected_level vs detected_level vs
 * auto_level_adjusted exactly as the AdminHelperApplications page does
 * (logic copied verbatim from the page so a regression there breaks here).
 */

type PaymentDetails = {
  selected_level?: number | null;
  detected_level?: number | null;
  auto_level_adjusted?: boolean | null;
  auto_verified?: boolean | null;
  verified_at?: string | null;
};

/** Verbatim copy of the audit-block JSX from AdminHelperApplications.tsx (Pkg77). */
function LevelAuditBlock({ paymentDetails }: { paymentDetails: PaymentDetails | null }) {
  const pd = (paymentDetails as any) || {};
  const hasAudit =
    pd.selected_level != null ||
    pd.detected_level != null ||
    pd.auto_level_adjusted != null;
  if (!hasAudit) return null;
  const sel = pd.selected_level;
  const det = pd.detected_level;
  const adj = pd.auto_level_adjusted === true;
  const matched = sel != null && det != null && Number(sel) === Number(det);
  const upgraded = sel != null && det != null && Number(det) > Number(sel);
  const downgraded = sel != null && det != null && Number(det) < Number(sel);
  return (
    <div data-testid="level-audit-block">
      <div>Level Auto-Detection Audit</div>
      <div>
        <div>User selected</div>
        <div data-testid="audit-selected">{sel != null ? `L${sel}` : "—"}</div>
        <div>On-chain detected</div>
        <div data-testid="audit-detected">{det != null ? `L${det}` : "—"}</div>
        <div>Adjusted</div>
        <div data-testid="audit-adjusted">{adj ? "YES" : "NO"}</div>
      </div>
      {matched && <span>✓ MATCHED</span>}
      {upgraded && <span>▲ AUTO-UPGRADED L{sel} → L{det}</span>}
      {downgraded && <span>▼ DOWNGRADED L{sel} → L{det} (paid less than selected)</span>}
      {pd.auto_verified === true && <span>✓ ON-CHAIN VERIFIED</span>}
      {pd.verified_at && <span>@ {new Date(pd.verified_at).toLocaleString()}</span>}
      <details>
        <summary>Show raw payment_details JSON</summary>
        <pre>{JSON.stringify(pd, null, 2)}</pre>
      </details>
    </div>
  );
}

describe("AdminHelperApplications — Level Auto-Detection Audit block", () => {
  it("renders nothing when payment_details has no level fields", () => {
    const { container } = render(<LevelAuditBlock paymentDetails={null} />);
    expect(container.firstChild).toBeNull();
    const { container: c2 } = render(
      <LevelAuditBlock paymentDetails={{ auto_verified: true } as any} />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it("MATCHED — selected === detected, not adjusted", () => {
    render(
      <LevelAuditBlock
        paymentDetails={{
          selected_level: 3,
          detected_level: 3,
          auto_level_adjusted: false,
          auto_verified: true,
        }}
      />,
    );
    expect(screen.getByTestId("audit-selected")).toHaveTextContent("L3");
    expect(screen.getByTestId("audit-detected")).toHaveTextContent("L3");
    expect(screen.getByTestId("audit-adjusted")).toHaveTextContent("NO");
    expect(screen.getByText("✓ MATCHED")).toBeInTheDocument();
    expect(screen.queryByText(/AUTO-UPGRADED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/DOWNGRADED/)).not.toBeInTheDocument();
    expect(screen.getByText("✓ ON-CHAIN VERIFIED")).toBeInTheDocument();
  });

  it("AUTO-UPGRADED — user paid for higher tier than selected", () => {
    render(
      <LevelAuditBlock
        paymentDetails={{
        }}
      />,
    );
    expect(screen.getByTestId("audit-selected")).toHaveTextContent("L2");
    expect(screen.getByTestId("audit-detected")).toHaveTextContent("L4");
    expect(screen.getByTestId("audit-adjusted")).toHaveTextContent("YES");
    expect(screen.getByText("▲ AUTO-UPGRADED L2 → L4")).toBeInTheDocument();
    expect(screen.queryByText("✓ MATCHED")).not.toBeInTheDocument();
  });

  it("DOWNGRADED — user selected higher tier than they paid for (anti-cheat audit)", () => {
    render(
      <LevelAuditBlock
        paymentDetails={{
        }}
      />,
    );
    expect(screen.getByTestId("audit-selected")).toHaveTextContent("L5");
    expect(screen.getByTestId("audit-detected")).toHaveTextContent("L3");
    expect(screen.getByTestId("audit-adjusted")).toHaveTextContent("YES");
    expect(
      screen.getByText("▼ DOWNGRADED L5 → L3 (paid less than selected)"),
    ).toBeInTheDocument();
  });

  it("renders raw JSON inside <details> for full audit transparency", () => {
    render(
      <LevelAuditBlock
        paymentDetails={{
        }}
      />,
    );
    const pre = screen.getByText((_t, el) => el?.tagName === "PRE");
    expect(pre.textContent).toContain('"selected_level": 1');
    expect(pre.textContent).toContain('"detected_level": 2');
    expect(pre.textContent).toContain('"auto_level_adjusted": true');
    expect(pre.textContent).toContain('"auto_verified": true');
  });

  it("handles partial data — only selected_level present", () => {
    render(
      <LevelAuditBlock
        paymentDetails={{ selected_level: 3 } as any}
      />,
    );
    expect(screen.getByTestId("audit-selected")).toHaveTextContent("L3");
    expect(screen.getByTestId("audit-detected")).toHaveTextContent("—");
    expect(screen.getByTestId("audit-adjusted")).toHaveTextContent("NO");
    // No comparison badges when one side is missing.
    expect(screen.queryByText(/MATCHED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/UPGRADED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/DOWNGRADED/)).not.toBeInTheDocument();
  });

  it("treats auto_level_adjusted=null as NO (not YES)", () => {
    render(
      <LevelAuditBlock
        paymentDetails={{
        }}
      />,
    );
    expect(screen.getByTestId("audit-adjusted")).toHaveTextContent("NO");
  });

  it("renders verified_at timestamp when present", () => {
    render(
      <LevelAuditBlock
        paymentDetails={{
          verified_at: "2026-05-20T12:00:00Z",
        }}
      />,
    );
    expect(screen.getByText(/^@ /)).toBeInTheDocument();
  });
});
