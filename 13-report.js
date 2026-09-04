// 13-report.js — the deal compliance emails.
//
// Two audiences, one style:
//   buildReport()          the roundup for Ali — grouped, colour-coded, with totals
//   buildConsultantEmail() one consultant's own deals, same look, shorter
//
// Table-based with inline styles so it renders in Gmail and Outlook.
const { SETTINGS, STAGE_NAME } = require("./config");
const { groupSentence } = require("./12-group");

const C = {
  navy: "#1b2650", navyLite: "#2f3f87", ink: "#1f2937", body: "#3f4a5a",
  soft: "#8792a5", faint: "#c3cad6", rule: "#e6e9f0", panel: "#f7f9fc",
  critical: "#c0392b", criticalBg: "#fdecea", criticalTint: "#fef6f5",
  high: "#c2620f", highBg: "#fff4e6", highTint: "#fffaf3",
  medium: "#9a7b0a", mediumBg: "#fdf8e3", mediumTint: "#fffdf5",
  good: "#2e7d4f", goodBg: "#eaf6ec", link: "#2f6ecb",
};
const SEV = {
  critical: { fg: C.critical, bg: C.criticalBg, tint: C.criticalTint, label: "URGENT" },
  high:     { fg: C.high,     bg: C.highBg,     tint: C.highTint,     label: "HIGH" },
  medium:   { fg: C.medium,   bg: C.mediumBg,   tint: C.mediumTint,   label: "WATCH" },
  low:      { fg: C.soft,     bg: C.panel,      tint: "#ffffff",      label: "NOTE" },
};
const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dealLink = (id) => `https://app.hubspot.com/contacts/${SETTINGS.PORTAL_ID}/record/0-3/${id}`;
const n = (v) => Number(v || 0).toLocaleString("en-GB");

// ---- pieces ----------------------------------------------------------------
const chip = (severity) => {
  const s = SEV[severity] || SEV.low;
  return `<span style="display:inline-block;background:${s.fg};color:#fff;font:700 10px/1 ${F};letter-spacing:.08em;padding:4px 7px;border-radius:3px;">${s.label}</span>`;
};
const heading = (t, accent) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 12px;"><tr>
  <td style="border-left:4px solid ${accent};padding:0 0 0 10px;font:700 15px/1.3 ${F};color:${C.navy};">${esc(t)}</td></tr></table>`;
const para = (html, size = 14, colour = C.body) => `<div style="font:400 ${size}px/1.65 ${F};color:${colour};margin:0 0 12px;">${html}</div>`;

function card({ severity, title, meta, why, action, risk, deals }) {
  const s = SEV[severity] || SEV.low;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;background:${s.tint};border:1px solid ${s.bg};border-left:4px solid ${s.fg};border-radius:4px;">
  <tr><td style="padding:13px 16px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font:600 15px/1.4 ${F};color:${C.ink};">${title}</td>
      <td align="right" style="white-space:nowrap;padding-left:10px;">${chip(severity)}</td>
    </tr></table>
    ${meta ? `<div style="font:400 12px/1.5 ${F};color:${C.soft};margin-top:4px;">${meta}</div>` : ""}
    <div style="font:400 14px/1.6 ${F};color:${C.body};margin-top:9px;">${why}</div>
    <div style="font:400 13.5px/1.6 ${F};color:${C.ink};margin-top:9px;">
      <span style="display:inline-block;background:${s.fg};color:#fff;font:700 9.5px/1 ${F};letter-spacing:.06em;padding:3px 6px;border-radius:2px;vertical-align:1px;">DO</span>
      &nbsp;${esc(action || "review this deal")}</div>
    ${risk ? `<div style="font:400 13px/1.6 ${F};color:${C.soft};margin-top:6px;">
      <span style="display:inline-block;border:1px solid ${C.faint};color:${C.soft};font:700 9.5px/1 ${F};letter-spacing:.06em;padding:3px 6px;border-radius:2px;vertical-align:1px;">AVOID</span>
      &nbsp;${esc(risk)}</div>` : ""}
    ${deals ? `<div style="font:400 12.5px/1.8 ${F};margin-top:10px;padding-top:9px;border-top:1px solid ${s.bg};">${deals}</div>` : ""}
  </td></tr></table>`;
}

const dealList = (list, more) =>
  (list || []).map((d) => `<a href="${dealLink(d.caseId)}" style="color:${C.link};text-decoration:none;font-weight:500;">${esc(d.caseName || d.caseId)}</a>`)
    .join(`<span style="color:${C.faint};"> &nbsp;·&nbsp; </span>`) + (more ? `<span style="color:${C.soft};"> &nbsp;+${more} more</span>` : "");

const groupCard = (g) => card({
  severity: g.severity,
  title: `${esc(g.owner || "Unassigned")} <span style="font-weight:400;color:${SEV[g.severity]?.fg || C.soft};">· ${g.count} deals</span>`,
  meta: g.stage ? esc(g.stage) : "",
  why: esc(groupSentence(g)), action: g.action, risk: g.risk,
  deals: dealList(g.cases, g.moreCases),
});

const singleCard = (f) => card({
  severity: f.severity,
  title: `<a href="${dealLink(f.caseId)}" style="color:${C.ink};text-decoration:none;">${esc(f.caseName || f.caseId)}</a>`,
  meta: `${esc(f.owner || "Unassigned")}${f.stage ? ` &nbsp;·&nbsp; ${esc(f.stage)}` : ""}`,
  why: esc(f.problem), action: f.action, risk: f.risk,
});

function stats(cells) {
  const w = Math.floor(100 / cells.length);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr>
  ${cells.map((c, i) => `<td width="${w}%" align="center" style="background:${c.bg};border:1px solid ${c.border || c.bg};border-radius:4px;padding:13px 6px;">
    <div style="font:700 25px/1 ${F};color:${c.fg};">${esc(c.value)}</div>
    <div style="font:600 10px/1.3 ${F};letter-spacing:.06em;text-transform:uppercase;color:${c.fg};opacity:.85;margin-top:5px;">${esc(c.label)}</div>
  </td>${i === cells.length - 1 ? "" : '<td width="8"></td>'}`).join("")}</tr></table>`;
}

function numbers(rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;border:1px solid ${C.rule};border-radius:4px;">
    <tr><td style="background:${C.panel};padding:8px 12px;font:700 11px/1.3 ${F};letter-spacing:.06em;text-transform:uppercase;color:${C.navy};">Situation</td>
        <td align="right" style="background:${C.panel};padding:8px 12px;font:700 11px/1.3 ${F};letter-spacing:.06em;text-transform:uppercase;color:${C.navy};">Deals</td></tr>
    ${rows.map(([k, v], i) => `<tr>
      <td style="padding:8px 12px;border-top:1px solid ${C.rule};font:400 13px/1.5 ${F};color:${C.body};${i % 2 ? `background:${C.panel};` : ""}">${esc(k)}</td>
      <td align="right" style="padding:8px 12px;border-top:1px solid ${C.rule};font:700 13px/1.5 ${F};color:${C.ink};white-space:nowrap;${i % 2 ? `background:${C.panel};` : ""}">${esc(v)}</td>
    </tr>`).join("")}</table>`;
}

const shell = (title, subtitle, body) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef1f6;padding:26px 12px;margin:0;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" style="width:640px;max-width:640px;background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background-color:${C.navy};background-image:linear-gradient(120deg,${C.navy} 0%,${C.navyLite} 100%);padding:22px 26px;">
    <div style="font:700 21px/1.25 ${F};color:#ffffff;">${title}</div>
    <div style="font:400 12.5px/1.5 ${F};color:#aab6dc;margin-top:5px;">${subtitle}</div>
  </td></tr>
  <tr><td style="padding:22px 26px 26px;">${body}</td></tr>
  <tr><td style="background:${C.panel};border-top:1px solid ${C.rule};padding:16px 26px;font:400 11.5px/1.6 ${F};color:${C.soft};">
    <strong style="color:${C.body};">Ali Raza</strong> · Compliance · HOF Migration<br>
    Sent automatically from HubSpot.
  </td></tr>
</table></td></tr></table>`;

// ---- the roundup for Ali ----------------------------------------------------
function buildReport({ escalations = [], grouped = [], singles = [], counted = {}, scanned, audited, byStage = {}, dealsCopied = 0, dryRun }) {
  const flagged = escalations.reduce((a, b) => a + b.count, 0) + grouped.reduce((a, b) => a + b.count, 0) + singles.length;
  const items = [...escalations, ...grouped, ...singles];
  const urgent = items.filter((x) => x.severity === "critical").length;

  let banner;
  if (audited === 0 && scanned > 0)
    banner = { bg: C.criticalBg, fg: C.critical, text: `<strong>Nothing was actually audited.</strong> All ${n(scanned)} deals were set aside before any rule ran — this is not an all-clear.` };
  else if (escalations.length)
    banner = { bg: C.criticalBg, fg: C.critical, text: `<strong>${escalations.length} backlog${escalations.length > 1 ? "s" : ""} to plan.</strong> One consultant is carrying the same problem across many deals — that will not clear deal by deal.` };
  else if (urgent)
    banner = { bg: C.criticalBg, fg: C.critical, text: `<strong>${urgent} deal${urgent > 1 ? "s" : ""} need action today.</strong>` };
  else if (flagged)
    banner = { bg: C.highBg, fg: C.high, text: `<strong>${flagged} deal${flagged > 1 ? "s" : ""} need attention.</strong> Nothing urgent today.` };
  else
    banner = { bg: C.goodBg, fg: C.good, text: `<strong>All clear.</strong> Every deal audited came back clean.` };

  const rest = Object.entries(counted).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, String(v)]);
  const stages = Object.entries(byStage).sort((a, b) => b[1] - a[1]).map(([k, v]) => [STAGE_NAME[k] || k, String(v)]);

  const body = `
${dryRun ? para(`<span style="color:${C.medium};font-weight:600;">Dry run.</span> Nothing was posted to HubSpot and no consultant was emailed.`, 13) : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>
  <td style="background:${banner.bg};border-left:4px solid ${banner.fg};padding:13px 16px;font:400 14.5px/1.6 ${F};color:${banner.fg};">${banner.text}</td>
</tr></table>

${stats([
  { value: n(audited), label: "deals audited", fg: C.navy, bg: C.panel, border: C.rule },
  { value: n(urgent), label: "urgent", fg: urgent ? C.critical : C.soft, bg: urgent ? C.criticalBg : C.panel, border: urgent ? C.criticalBg : C.rule },
  { value: n(escalations.length), label: "backlogs", fg: escalations.length ? C.high : C.soft, bg: escalations.length ? C.highBg : C.panel, border: escalations.length ? C.highBg : C.rule },
  { value: n(flagged), label: "deals flagged", fg: flagged ? C.medium : C.soft, bg: flagged ? C.mediumBg : C.panel, border: flagged ? C.mediumBg : C.rule },
])}

${escalations.length ? heading("Plan these — a backlog, not a reminder", C.critical) + escalations.map(groupCard).join("") : ""}
${grouped.length ? heading("The same problem on several deals", C.high) + grouped.map(groupCard).join("") : ""}
${singles.length ? heading("Individual deals", C.high) + singles.map(singleCard).join("") : ""}
${flagged === 0 && audited > 0 ? para(`<span style="color:${C.good};">Nothing reached the reporting threshold today.</span>`) : ""}

${dealsCopied ? para(`<span style="color:${C.good};font-weight:600;">${dealsCopied}</span> deal(s) had the client details copied onto the deal automatically.`, 13.5) : ""}
${rest.length ? heading("Background — no action needed today", C.soft) + numbers(rest) : ""}
${stages.length ? heading("Where the pipeline sits", C.navy) + numbers(stages) : ""}
`;

  return shell("Deal Compliance",
    `${new Date().toISOString().slice(0, 10)} &nbsp;·&nbsp; ${n(audited)} deals audited &nbsp;·&nbsp; ${n(flagged)} flagged${urgent ? ` &nbsp;·&nbsp; <span style="color:#ffb4ab;font-weight:600;">${urgent} urgent</span>` : ""}`,
    body);
}

// ---- one consultant's own deals ---------------------------------------------
function buildConsultantEmail(name, items) {
  const urgent = items.filter((f) => f.severity === "critical").length;
  const first = (name || "there").split(" ")[0];
  const body = `
${para(`<span style="background:${C.panel};border-left:3px solid ${C.faint};padding:8px 12px;display:block;color:${C.soft};font-size:13px;">This is an automated compliance email. Please do not reply — for any question, contact Ali Raza directly.</span>`, 13)}
${para(`Hi ${esc(first)}, hope you are well.`)}
${para(`${items.length} of your deal${items.length > 1 ? "s" : ""} need attention${urgent ? `, including <strong style="color:${C.critical};">${urgent} urgent</strong>` : ""}. Each one below says what to do and what to avoid.`)}
${items.map(singleCard).join("")}
${para(`Thank you.`, 13.5)}
`;
  return shell("Your deals need attention",
    `${new Date().toISOString().slice(0, 10)} &nbsp;·&nbsp; ${items.length} deal${items.length > 1 ? "s" : ""}${urgent ? ` &nbsp;·&nbsp; <span style="color:#ffb4ab;font-weight:600;">${urgent} urgent</span>` : ""}`,
    body);
}

module.exports = { buildReport, buildConsultantEmail, dealLink };
