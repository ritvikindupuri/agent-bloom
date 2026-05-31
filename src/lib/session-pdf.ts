import jsPDF from "jspdf";

type Msg = {
  id: string;
  role: "user" | "assistant" | "tool" | string;
  content?: string | null;
  tool_name?: string | null;
  tool_result?: any;
  created_at?: string;
};

type Conv = { id: string; title: string; created_at?: string; updated_at?: string };

const MARGIN = 56; // ~0.78"
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ---------- helpers ----------
function stripMd(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?|```/g, ""))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function fmtDate(s?: string) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function summarizeToolResult(name: string, r: any): string {
  if (!r) return "(no result)";
  if (r.error) return `Error: ${r.error}`;
  if (r.recorded) return "Threat recorded.";
  if (name === "search_logs") {
    const top = (r.buckets ?? [])
      .slice(0, 8)
      .map((b: any) => `  • ${b.key} — ${b.count}${b.bot ? ` [${b.category ?? "bot"}]` : ""}`)
      .join("\n");
    return `Aggregation: ${r.aggregation}\nTotal hits: ${r.total_hits}\nTop buckets:\n${top || "  (none)"}`;
  }
  if (name === "sample_requests") {
    return `Sampled ${r.count ?? 0} request(s).`;
  }
  try {
    return JSON.stringify(r, null, 2).slice(0, 1200);
  } catch {
    return String(r);
  }
}

// ---------- renderer ----------
class Renderer {
  doc: jsPDF;
  y = MARGIN;
  page = 1;

  constructor() {
    this.doc = new jsPDF({ unit: "pt", format: "a4" });
  }

  ensure(h: number) {
    if (this.y + h > PAGE_H - MARGIN - 24) this.newPage();
  }

  newPage() {
    this.footer();
    this.doc.addPage();
    this.page += 1;
    this.y = MARGIN;
  }

  footer() {
    const d = this.doc;
    d.setFont("helvetica", "normal");
    d.setFontSize(8);
    d.setTextColor(140);
    d.text(`Chaff session report  ·  page ${this.page}`, MARGIN, PAGE_H - 24);
    d.setTextColor(0);
  }

  text(
    s: string,
    opts: {
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      gap?: number;
      mono?: boolean;
      indent?: number;
    } = {},
  ) {
    const d = this.doc;
    const size = opts.size ?? 10.5;
    d.setFont(opts.mono ? "courier" : "helvetica", opts.bold ? "bold" : "normal");
    d.setFontSize(size);
    if (opts.color) d.setTextColor(...opts.color);
    else d.setTextColor(30);
    const indent = opts.indent ?? 0;
    const lines = d.splitTextToSize(s, CONTENT_W - indent);
    const lh = size * 1.35;
    for (const line of lines) {
      this.ensure(lh);
      d.text(line, MARGIN + indent, this.y);
      this.y += lh;
    }
    this.y += opts.gap ?? 4;
  }

  rule() {
    this.ensure(10);
    this.doc.setDrawColor(220);
    this.doc.line(MARGIN, this.y, MARGIN + CONTENT_W, this.y);
    this.y += 10;
  }

  h1(s: string) {
    this.ensure(34);
    this.text(s, { size: 22, bold: true, gap: 6 });
  }
  h2(s: string) {
    this.ensure(28);
    this.text(s, { size: 14, bold: true, gap: 4, color: [20, 20, 20] });
  }
  h3(s: string) {
    this.ensure(20);
    this.text(s, { size: 11.5, bold: true, gap: 2, color: [60, 60, 60] });
  }

  pill(label: string, color: [number, number, number]) {
    const d = this.doc;
    d.setFont("helvetica", "bold");
    d.setFontSize(8.5);
    const w = d.getTextWidth(label) + 12;
    this.ensure(18);
    d.setFillColor(...color);
    d.roundedRect(MARGIN, this.y - 10, w, 14, 3, 3, "F");
    d.setTextColor(255);
    d.text(label, MARGIN + 6, this.y);
    d.setTextColor(0);
    this.y += 10;
  }

  finalize() {
    this.footer();
  }
}

// ---------- main ----------
export function generateSessionPdf(conv: Conv, messages: Msg[]): Blob {
  const r = new Renderer();
  const generatedAt = new Date().toLocaleString();

  // ===== Cover / header =====
  r.text("CHAFF · BOT TRAFFIC INTELLIGENCE", {
    size: 9,
    bold: true,
    color: [120, 120, 120],
    gap: 6,
  });
  r.h1("Agent Session Report");
  r.text(conv.title || "Untitled investigation", { size: 12, color: [70, 70, 70], gap: 2 });
  r.text(`Generated: ${generatedAt}`, { size: 9, color: [120, 120, 120], gap: 2 });
  r.text(`Session started: ${fmtDate(conv.created_at)}`, {
    size: 9,
    color: [120, 120, 120],
    gap: 2,
  });
  r.text(`Last activity: ${fmtDate(conv.updated_at)}`, { size: 9, color: [120, 120, 120], gap: 8 });
  r.rule();

  // ===== Session metrics =====
  const userMsgs = messages.filter((m) => m.role === "user");
  const asstMsgs = messages.filter((m) => m.role === "assistant" && (m.content ?? "").trim());
  const toolMsgs = messages.filter((m) => m.role === "tool");
  const threatsRecorded = toolMsgs.filter(
    (m) => m.tool_name === "record_threat" && (m.tool_result as any)?.recorded,
  ).length;
  const toolErrors = toolMsgs.filter((m) => (m.tool_result as any)?.error).length;
  const toolBreakdown: Record<string, number> = {};
  for (const t of toolMsgs) {
    const k = t.tool_name ?? "unknown";
    toolBreakdown[k] = (toolBreakdown[k] ?? 0) + 1;
  }

  r.h2("Session at a Glance");
  r.text(
    `• User prompts: ${userMsgs.length}\n` +
      `• Agent responses: ${asstMsgs.length}\n` +
      `• Tool invocations: ${toolMsgs.length}\n` +
      `• Threats recorded: ${threatsRecorded}\n` +
      `• Tool errors: ${toolErrors}`,
    { size: 10.5, gap: 8 },
  );
  if (Object.keys(toolBreakdown).length) {
    r.h3("Tool usage breakdown");
    r.text(
      Object.entries(toolBreakdown)
        .map(([k, v]) => `• ${k}: ${v}`)
        .join("\n"),
      { size: 10, gap: 8 },
    );
  }
  r.rule();

  // ===== Executive summary =====
  r.h2("Executive Summary");
  const firstQ = userMsgs[0]?.content?.trim() ?? "—";
  const lastA = [...asstMsgs].reverse()[0]?.content?.trim() ?? "";
  r.h3("Initial objective");
  r.text(firstQ, { size: 10.5, gap: 6, color: [40, 40, 40] });

  r.h3("Key outcome");
  const outcomeBlurb = lastA
    ? stripMd(lastA).split("\n").slice(0, 8).join("\n")
    : "The agent did not produce a final narrative answer for this session.";
  r.text(outcomeBlurb, { size: 10.5, gap: 6, color: [40, 40, 40] });

  r.h3("Headline findings");
  const recordedThreats = toolMsgs
    .filter((m) => m.tool_name === "record_threat")
    .map((m) => {
      const args = (m as any).tool_calls ?? {};
      const tr = (m as any).tool_result ?? {};
      return { recorded: !!tr.recorded, error: tr.error, args };
    });
  if (recordedThreats.length) {
    r.text(
      recordedThreats
        .map(
          (t, i) =>
            `${i + 1}. ${t.recorded ? "Recorded threat" : t.error ? `Failed (${t.error})` : "Attempted threat record"}`,
        )
        .join("\n"),
      { size: 10.5, gap: 8 },
    );
  } else {
    r.text("No threats were recorded during this session.", {
      size: 10.5,
      gap: 8,
      color: [80, 80, 80],
    });
  }
  r.rule();

  // ===== Full transcript =====
  r.h2("Full Transcript");
  r.text(
    "Every prompt, agent response, and tool call from this session is reproduced below verbatim.",
    { size: 9.5, color: [110, 110, 110], gap: 8 },
  );

  messages.forEach((m, idx) => {
    const ts = fmtDate(m.created_at);
    r.ensure(24);
    if (m.role === "user") {
      r.text(`#${idx + 1}  USER  ·  ${ts}`, { size: 9, bold: true, color: [70, 90, 180], gap: 2 });
      r.text(m.content ?? "", { size: 10.5, gap: 10 });
    } else if (m.role === "assistant") {
      const c = (m.content ?? "").trim();
      if (!c) return; // tool-call-only assistant turn; tool entries cover it
      r.text(`#${idx + 1}  AGENT  ·  ${ts}`, { size: 9, bold: true, color: [40, 130, 90], gap: 2 });
      r.text(stripMd(c), { size: 10.5, gap: 10 });
    } else if (m.role === "tool") {
      const tr = m.tool_result ?? {};
      const errored = !!tr.error;
      r.text(
        `#${idx + 1}  TOOL · ${m.tool_name ?? "?"} ${errored ? "(error)" : tr.recorded ? "(threat recorded)" : ""}  ·  ${ts}`,
        { size: 9, bold: true, color: errored ? [180, 60, 60] : [120, 90, 30], gap: 2 },
      );
      r.text(summarizeToolResult(m.tool_name ?? "", tr), {
        size: 9,
        mono: true,
        indent: 8,
        gap: 6,
        color: [60, 60, 60],
      });
    }
  });

  r.rule();

  // ===== Conclusion =====
  r.h2("Conclusion");
  const conclusion = lastA
    ? `The investigation "${conv.title || "Untitled"}" produced a substantive answer from the Chaff agent after ${toolMsgs.length} tool call(s) across ${userMsgs.length} user prompt(s). ` +
      (threatsRecorded
        ? `${threatsRecorded} threat finding(s) were committed to the threats register and are now visible on the Threats page for triage. `
        : `No threats were promoted to the threats register; the agent assessed observed patterns as benign or inconclusive. `) +
      (toolErrors
        ? `Note: ${toolErrors} tool call(s) returned errors — review the transcript above to determine whether the underlying data sources need attention. `
        : `All tool calls completed successfully. `) +
      `The final agent response (above) should be treated as the authoritative narrative for this session.`
    : `This session ended before the agent produced a final narrative answer. Review the transcript above — particularly any tool errors — and consider re-running the investigation with a more specific prompt.`;

  r.text(conclusion, { size: 10.5, gap: 6 });

  r.h3("Recommended next steps");
  const nextSteps = [
    threatsRecorded
      ? "Triage the new threat findings on the Threats page and decide on blocking rules."
      : "Consider running a broader time window if no threats surfaced in this session.",
    "Cross-reference findings with the Campaigns view to identify coordinated activity.",
    "If the agent issued tool errors, verify the Elasticsearch connection and field mappings on the Onboard page.",
    "Export or share this report with your security team as the authoritative session artifact.",
  ];
  r.text(nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n"), { size: 10.5, gap: 8 });

  r.finalize();
  return r.doc.output("blob");
}

export function downloadSessionPdf(conv: Conv, messages: Msg[]) {
  const blob = generateSessionPdf(conv, messages);
  const safeTitle = (conv.title || "session").replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chaff-session-${safeTitle}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
