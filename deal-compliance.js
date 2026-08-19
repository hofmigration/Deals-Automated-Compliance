// deal-compliance.js — THE RUNNER for the deal audit. Connects the pipeline:
//   1-fetch-deals -> 2-closedate -> 3-stage -> 4-task -> 5-notes -> 6-comms
//   -> 7-marketing -> 8-pipeline (AI) -> 9-note
// Only the 7 SALES pipelines are audited; service pipelines are ignored.
// SAFE MODE: DRY_RUN=true prints a report and writes nothing.

const { SETTINGS, SELECTED_OWNERS, UNMATCHED_NAMES, ALL_OWNERS_SELECTED, STAGE_NAME, PIPELINES } = require("./config");
const { hub, preflight } = require("./0-hubspot");
const { fetchDeals, attach, lookups, auditWindow } = require("./1-fetch-deals");
const checkCloseDate = require("./2-check-closedate");
const checkStage = require("./3-check-stage");
const checkTask = require("./4-check-task");
const checkNotes = require("./5-check-notes");
const checkComms = require("./6-check-comms");
const checkMarketing = require("./7-check-marketing");
const checkPipeline = require("./8-check-pipeline");
const { composeNote, postNote, createComplianceTask } = require("./9-note");

const OWNER_NAME = Object.fromEntries(SELECTED_OWNERS.map((o) => [o.id, o.name]));

// what loses the sale first
const PRIORITY = { pipeline: 1, closedate: 2, reason: 3, call: 4, email: 5, whatsapp: 6, task: 7, payment: 8, details: 9, marketing: 10 };

async function ownerEmails() {
  const map = {}; let after;
  for (let i = 0; i < 10; i++) {
    const d = await hub("GET", `/crm/v3/owners/?limit=100${after ? `&after=${after}` : ""}`);
    for (const o of d.results || []) map[String(o.id)] = o.email;
    after = d.paging?.next?.after; if (!after) break;
  }
  return map;
}
async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_KEY) { console.log(`  (no RESEND_KEY — would have emailed ${to})`); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: SETTINGS.FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) { console.log(`  ! email to ${to} failed: ${res.status}`); return false; }
  return true;
}
const dealLink = (id) => `https://app.hubspot.com/contacts/${SETTINGS.PORTAL_ID}/record/0-3/${id}`;

async function main() {
  if (!process.env.HUBSPOT_TOKEN) throw new Error("Missing HUBSPOT_TOKEN");
  console.log(`=== HOF Deal Compliance — ${new Date().toISOString()} ===  DRY_RUN=${SETTINGS.DRY_RUN}`);

  if (!SELECTED_OWNERS.length) {
    console.log(`ERROR: none of the names entered matched a consultant. Nothing audited.`);
    if (UNMATCHED_NAMES.length) console.log(`Not found: ${UNMATCHED_NAMES.join(", ")}`);
    return;
  }
  if (UNMATCHED_NAMES.length) console.log(`NOTE: no consultant matched: ${UNMATCHED_NAMES.join(", ")}`);

  const win = auditWindow();
  const day = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ");
  console.log(`Consultants: ${ALL_OWNERS_SELECTED ? `ALL (${SELECTED_OWNERS.length})` : SELECTED_OWNERS.map((o) => o.name).join(", ")}`);
  console.log(`Window:      ${win ? `${day(win.startMs)} .. ${day(win.endMs)} UTC` : "any time (window ignored)"}`);
  console.log(`Close date:  ${SETTINGS.ONLY_CLOSEDATE || "any"}`);
  console.log(`Reason:      ${SETTINGS.ONLY_REASON ? (SETTINGS.ONLY_REASON.blank ? "not set" : SETTINGS.ONLY_REASON.value) : "any"}`);
  console.log(`Deal stage:  ${SETTINGS.ONLY_STAGE ? STAGE_NAME[SETTINGS.ONLY_STAGE] : "all sales stages"}`);
  console.log(`Pipelines:   ${PIPELINES.length} sales pipelines (service pipelines are not audited)`);
  console.log(`Limit:       ${SETTINGS.LIMIT === 0 ? "no limit" : SETTINGS.LIMIT}`);

  const L = await lookups();
  const deals = await fetchDeals(L);
  console.log(`\nDeals worked in this window: ${deals.length}`);
  if (deals.length) await preflight(deals[0].id);

  const flagged = [];
  let audited = 0, skippedStage = 0, waSeen = 0, waExpected = 0, commSeen = 0;
  const channelTally = {}, stageTally = {}, unresolved = {};

  for (const raw of deals) {
    if (SETTINGS.LIMIT && audited >= SETTINGS.LIMIT) break;

    let d;
    try { d = await attach(raw, L); }
    catch (e) { console.log(`fetch error ${raw.id}: ${e.message}`); continue; }

    if (!d.stage) {                                                   // not a sales stage
      skippedStage++;
      const key = `${d.stageLabel}`;
      unresolved[key] = (unresolved[key] || 0) + 1;
      continue;
    }
    if (SETTINGS.ONLY_STAGE && d.stage !== SETTINGS.ONLY_STAGE) { skippedStage++; continue; }
    audited++;
    stageTally[STAGE_NAME[d.stage]] = (stageTally[STAGE_NAME[d.stage]] || 0) + 1;

    commSeen += d.commCount || 0;
    waSeen += (d.whatsapps || []).length;
    for (const [k, n] of Object.entries(d.channelSeen || {})) channelTally[k] = (channelTally[k] || 0) + n;
    const lc = d.calls[0];
    if (lc && lc.outcome && !SETTINGS.REACHED_OUTCOMES.map((x) => x.toLowerCase()).includes(String(lc.outcome).toLowerCase())) waExpected++;

    let issues = [];
    try {
      // Promise.all resolves plain arrays too, so a check can be sync or async and
      // this still works. (A previously un-awaited async check crashed the run.)
      const results = await Promise.all([
        checkCloseDate(d), checkStage(d), checkTask(d), checkNotes(d),
        checkComms(d), checkMarketing(d), checkPipeline(d),
      ]);
      issues = results.flat().filter(Boolean);
    } catch (e) { console.log(`check error ${d.id}: ${e.message}`); }

    // guard: never let a malformed finding reach the summary or a note
    const bad = issues.filter((i) => typeof i?.problem !== "string" || typeof i?.action !== "string");
    if (bad.length) {
      console.log(`!! ${bad.length} malformed finding(s) on deal ${d.id} were dropped (a check returned the wrong shape).`);
      issues = issues.filter((i) => typeof i?.problem === "string" && typeof i?.action === "string");
    }
    if (!issues.length) continue;

    issues.sort((a, b) => (PRIORITY[a.area] || 99) - (PRIORITY[b.area] || 99));
    const top = issues.slice(0, SETTINGS.MAX_ISSUES_PER_DEAL);
    const ownerName = OWNER_NAME[d.ownerId] || `owner ${d.ownerId}`;
    flagged.push({ ...d, ownerName, top, all: issues, note: composeNote(ownerName, top) });
  }

  // ---- WhatsApp sanity net ----
  if (SETTINGS.WHATSAPP_SANITY_NET && waSeen === 0 && waExpected >= 5) {
    let dropped = 0;
    for (const f of flagged) {
      const before = f.all.length;
      f.all = f.all.filter((i) => !(i.area === "whatsapp"));
      f.top = f.top.filter((i) => !(i.area === "whatsapp"));
      dropped += before - f.all.length;
      f.note = f.top.length ? composeNote(f.ownerName, f.top) : "";
    }
    const still = flagged.filter((f) => f.top.length);
    flagged.length = 0; flagged.push(...still);
    console.log(`\n!! WHATSAPP NOT VISIBLE: 0 WhatsApp messages read across ${audited} deals, but`);
    console.log(`   ${waExpected} had a call where the client was not reached. ${dropped} finding(s) DROPPED.`);
  }

  // ---- post ----
  if (!SETTINGS.DRY_RUN) {
    for (const f of flagged) {
      try { await postNote(f.id, f.ownerId, f.ownerName, f.top); }
      catch (e) { console.log(`note error ${f.id}: ${e.message}`); }
      if (SETTINGS.CREATE_TASK_FOR_CONSULTANT) {
        try { await createComplianceTask(f.id, f.ownerId, f.name, f.top); }
        catch (e) { console.log(`task error ${f.id}: ${e.message}`); }
      }
    }
  }

  // ---- summary ----
  const perOwner = {}, perProblem = {};
  for (const f of flagged) {
    perOwner[f.ownerName] = (perOwner[f.ownerName] || 0) + 1;
    for (const i of f.all) perProblem[i.problem.split("(")[0].trim()] = (perProblem[i.problem.split("(")[0].trim()] || 0) + 1;
  }
  const desc = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);
  console.log(`\nWhatsApp visibility: ${commSeen} communication record(s) read, ${waSeen} counted as WhatsApp.`);
  if (commSeen) console.log(`  channel types seen: ${Object.entries(channelTally).map(([k, n]) => `${k}=${n}`).join(", ")}`);

  console.log(`\n===== SUMMARY =====`);
  console.log(`Deals in window ${deals.length} | not a sales stage ${skippedStage} | audited ${audited} | FLAGGED ${flagged.length}`);
  if (skippedStage) {
    const top = Object.entries(unresolved).sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log(`\nSkipped stage values (top ${top.length}):`);
    for (const [v, n] of top) console.log(`  ${String(n).padStart(4)}  ${v}`);
    if (audited === 0)
      console.log(`\n!! NOTHING WAS AUDITED. If the values above look like plain numbers, the stage\n   labels could not be read — check the private app has deal schema/pipeline read access.`);
  }
  console.log(`\nAudited by stage:`); for (const [s, n] of desc(stageTally)) console.log(`  ${String(n).padStart(4)}  ${s}`);
  console.log(`\nIssues by type:`);   for (const [p, n] of desc(perProblem)) console.log(`  ${String(n).padStart(4)}  ${p}`);
  console.log(`\nFlagged per consultant:`); for (const [o, n] of desc(perOwner)) console.log(`  ${String(n).padStart(4)}  ${o}`);
  console.log(`\nSample (first ${SETTINGS.PRINT_SAMPLE}):`);
  for (const f of flagged.slice(0, SETTINGS.PRINT_SAMPLE)) {
    console.log(`\n• ${f.ownerName} — ${f.name}  [${STAGE_NAME[f.stage]} / ${f.pipelineName}]`);
    console.log(`  note:   ${f.note}`);
    console.log(`  issues: ${f.all.map((i) => i.problem).join("; ")}`);
    console.log(`  link:   ${dealLink(f.id)}`);
  }

  if (SETTINGS.DRY_RUN) { console.log(`\nDRY RUN: nothing posted or emailed.`); return; }

  // ---- emails ----
  const byOwner = {}; for (const f of flagged) (byOwner[f.ownerId] ||= []).push(f);
  const emails = await ownerEmails();
  for (const [ownerId, items] of Object.entries(byOwner)) {
    const to = emails[ownerId], ownerName = OWNER_NAME[ownerId] || ownerId;
    if (!to) { console.log(`No email for ${ownerName}`); continue; }
    const list = items.map((it) => `<p><a href="${dealLink(it.id)}">${it.name}</a> (${STAGE_NAME[it.stage]})<ul>${it.top.map((i) => `<li>${i.problem}</li>`).join("")}</ul></p>`).join("");
    await sendEmail(to, `[Automated] ${items.length} of your deals need attention`, `<p>Hi ${ownerName.split(" ")[0]},</p>${list}<p>Thank you.</p>`);
  }
  const roundup = Object.entries(byOwner).map(([oid, items]) =>
    `<h3>${OWNER_NAME[oid] || oid} (${items.length})</h3>` +
    items.map((it) => `<p><a href="${dealLink(it.id)}">${it.name}</a>: ${it.top.map((i) => i.problem).join("; ")}</p>`).join("")).join("");
  await sendEmail(SETTINGS.ALI_EMAIL, `Deal compliance — ${flagged.length} flagged`, roundup || "<p>Nothing flagged.</p>");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
