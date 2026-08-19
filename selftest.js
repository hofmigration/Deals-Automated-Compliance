// selftest.js — the DEAL rules register, as a runnable test.
// Every agreed rule is a scenario here with the issue it MUST (or must not) produce.
// Run after any edit: node selftest.js
process.env.HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN || "selftest";

const checkCloseDate = require("./2-check-closedate");
const checkStage = require("./3-check-stage");
const checkTask = require("./4-check-task");
const checkNotes = require("./5-check-notes");
const checkComms = require("./6-check-comms");
const checkMarketing = require("./7-check-marketing");
const { composeNote } = require("./9-note");
const { SETTINGS, STAGE_NAME, stageKey } = require("./config");

const DAY = 86400000, now = Date.now();
const OK = { calls: true, emails: true, tasks: true, notes: true, whatsapps: true, contact: true };
const PRIORITY = { pipeline: 1, closedate: 2, reason: 3, call: 4, email: 5, whatsapp: 6, task: 7, payment: 8, details: 9, marketing: 10 };

const DETAILS_NOTE = "43/masters in marketing/ 14 years of exp/ since 2011 - 2018. 2022- till date in UAE. Married - bachelors - house wife. 3 kids 13 -10- 8. Reason: 2nd passport";
const PAYMENT_NOTE = "VAT INCLUSIVE. Fees 11,000 Deposit 11,000 Due Date UP";

// a fully compliant deal — each scenario breaks exactly one thing
const good = (o = {}) => ({
  available: OK, id: "5001", name: "Ahmed Khan - Canada", ownerId: "1",
  pipelineId: "26699617", pipelineName: "HOF Sales Pipeline - Canada & AUS",
  stageLabel: "Qualified Client", stage: "QUALIFIED",
  closedate: now + 10 * DAY, reason: null, dealAgeRange: "32-40", createdate: now - 5 * DAY,
  channelSeen: {}, commCount: 1,
  calls: [{ outcome: "Connected", when: now - 3600000, note: "spoke with client about Canada PR, qualified" }],
  emails: [{ when: now - 1800000, subject: "Canada PR process", body: "Hi Ahmed, here are the process details." }],
  tasks: [{ hs_task_subject: "Follow up call", hs_task_status: "NOT_STARTED", hs_timestamp: new Date(now + 3 * DAY).toISOString() }],
  notes: [{ when: now - 2 * DAY, body: DETAILS_NOTE, ownerId: "1" }],
  whatsapps: [],
  contact: { name: "Ahmed Khan", outcome: "Deal Created", ageRange: "32-40", nationality: "Pakistani", leadStage: "Qualified CAN" },
  ...o,
});

const SCENARIOS = [
  ["compliant deal produces nothing", good(), null],

  // --- close date ---
  ["close date in the past is flagged", good({ closedate: now - 5 * DAY }), "Close date is in the past"],
  ["no close date is flagged", good({ closedate: null }), "No close date"],
  ["close date not checked on Deal Lost",
    good({ stage: "LOST", stageLabel: "Deal Lost", closedate: now - 30 * DAY, reason: "No Longer Interested", tasks: [] }), "!close date"],
  ["close date checked on Postponed",
    good({ stage: "POSTPONED", stageLabel: "Postponed", closedate: now - 3 * DAY, reason: "Delayed Decision But Will Start" }), "Close date is in the past"],

  // --- won/postponed/lost reason ---
  ["Postponed without a reason", good({ stage: "POSTPONED", stageLabel: "Postponed", reason: null }), "no Won/Postponed/Lost reason"],
  ["Deal Lost without a reason", good({ stage: "LOST", stageLabel: "Deal Lost", reason: null, tasks: [] }), "no Won/Postponed/Lost reason"],
  ["reason of Opportunity is rejected", good({ stage: "LOST", stageLabel: "Deal Lost", reason: "Opportunity", tasks: [] }), "not a closing reason"],
  ["valid lost reason is accepted", good({ stage: "LOST", stageLabel: "Deal Lost", reason: "Cannot Afford At This Time", tasks: [] }), "!reason"],
  ["reason not required on Qualified Client", good({ reason: null }), "!reason"],

  // --- follow-up task ---
  ["no follow-up task is flagged", good({ tasks: [] }), "No follow-up task"],
  ["task not required on Deal Lost", good({ stage: "LOST", stageLabel: "Deal Lost", reason: "Job Loss", tasks: [] }), "!follow-up task"],
  ["our own compliance task does not count", good({ tasks: [{ hs_task_subject: "[Compliance] Ahmed — set the close date" }] }), "No follow-up task"],

  // --- follow-up task: must be OPEN and scheduled ---
  ["open task with a future due date is fine",
    good({ tasks: [{ hs_task_subject: "Follow up call", hs_task_status: "NOT_STARTED", hs_timestamp: new Date(now + 3 * DAY).toISOString() }] }), null],
  ["only a COMPLETED task does not count",
    good({ tasks: [{ hs_task_subject: "Follow up call", hs_task_status: "COMPLETED", hs_timestamp: new Date(now - 40 * DAY).toISOString() }] }), "No open follow-up task"],
  ["completed plus open task is fine",
    good({ tasks: [
      { hs_task_subject: "Old call", hs_task_status: "COMPLETED", hs_timestamp: new Date(now - 40 * DAY).toISOString() },
      { hs_task_subject: "Next call", hs_task_status: "NOT_STARTED", hs_timestamp: new Date(now + 2 * DAY).toISOString() },
    ] }), null],
  ["open task badly overdue is flagged",
    good({ tasks: [{ hs_task_subject: "Follow up call", hs_task_status: "NOT_STARTED", hs_timestamp: new Date(now - 20 * DAY).toISOString() }] }), "overdue by"],
  ["open task overdue within the grace period is fine",
    good({ tasks: [{ hs_task_subject: "Follow up call", hs_task_status: "NOT_STARTED", hs_timestamp: new Date(now - 1 * DAY).toISOString() }] }), null],
  ["in progress task counts as scheduled",
    good({ tasks: [{ hs_task_subject: "Follow up", hs_task_status: "IN_PROGRESS", hs_timestamp: new Date(now + DAY).toISOString() }] }), null],
  ["task with no due date still counts if open",
    good({ tasks: [{ hs_task_subject: "Follow up", hs_task_status: "NOT_STARTED" }] }), null],
  ["completed task on a LOST deal is not chased",
    good({ stage: "LOST", stageLabel: "Deal Lost", reason: "Job Loss",
           tasks: [{ hs_task_subject: "Old", hs_task_status: "COMPLETED", hs_timestamp: new Date(now - 40 * DAY).toISOString() }] }), "!follow-up task"],

  // --- client details note ---
  ["missing client details note", good({ notes: [] }), "No client details note"],
  ["short chit-chat note is not client details", good({ notes: [{ when: now, body: "called client", ownerId: "1" }] }), "No client details note"],
  ["real client details note is accepted", good({ notes: [{ when: now, body: DETAILS_NOTE, ownerId: "1" }] }), "!client details"],
  ["our own compliance note is not client details",
    good({ notes: [{ when: now, body: "Hi @Ahmed Kindly mark the lead stage", ownerId: SETTINGS.NOTE_OWNER_ID }] }), "No client details note"],

  // --- proof of payment (Won only) ---
  ["won deal without proof of payment", good({ stage: "WON", stageLabel: "Payment Made/Deal Won", notes: [{ when: now, body: DETAILS_NOTE, ownerId: "1" }] }), "no proof of payment"],
  ["won deal with the fee note is accepted",
    good({ stage: "WON", stageLabel: "Payment Made/Deal Won", notes: [{ when: now, body: DETAILS_NOTE, ownerId: "1" }, { when: now, body: PAYMENT_NOTE, ownerId: "1" }] }), "!proof of payment"],
  ["proof of payment not required on Qualified Client", good(), "!proof of payment"],

  // --- comms: connected ---
  ["connected call with no email after it", good({ emails: [] }), "no email logged after it"],
  ["connected call needs no WhatsApp", good({ whatsapps: [] }), "!WhatsApp"],
  ["connected call with no description", good({ calls: [{ outcome: "Connected", when: now - 3600000, note: "" }] }), "no description logged"],
  ["connected call with NA as description", good({ calls: [{ outcome: "Connected", when: now - 3600000, note: "NA" }] }), "no description logged"],
  ["email logged before the call does not count",
    good({ calls: [{ outcome: "Connected", when: now, note: "spoke" }], emails: [{ when: now - 5 * DAY, subject: "old", body: "old" }] }), "no email logged after it"],

  // --- comms: not reached ---
  ["no answer needs email AND whatsapp",
    good({ calls: [{ outcome: "No answer", when: now - 3600000, note: "" }], emails: [], whatsapps: [] }), "no email logged after it"],
  ["no answer with email but no whatsapp",
    good({ calls: [{ outcome: "No answer", when: now - 7200000, note: "" }], emails: [{ when: now - 3600000, subject: "Sorry we missed you", body: "Hi Ahmed" }], whatsapps: [] }), "no WhatsApp logged after it"],
  ["no answer with email and whatsapp is accepted",
    good({ calls: [{ outcome: "No answer", when: now - 7200000, note: "" }],
           emails: [{ when: now - 3600000, subject: "Sorry we missed you", body: "Hi Ahmed" }],
           whatsapps: [{ when: now - 1800000, body: "Hello Mr Ahmed" }] }), null],
  ["no answer call needs no description",
    good({ calls: [{ outcome: "No answer", when: now - 7200000, note: "" }],
           emails: [{ when: now - 3600000, subject: "Sorry we missed you", body: "Hi Ahmed" }],
           whatsapps: [{ when: now - 1800000, body: "Hello" }] }), "!no description"],
  ["busy call is treated as not reached",
    good({ calls: [{ outcome: "Busy", when: now - 7200000, note: "" }], whatsapps: [] }), "no WhatsApp logged after it"],
  ["no call logged on the deal", good({ calls: [] }), "No call logged on the deal"],

  // --- WhatsApp scanned the same as on contacts ---
  ["whatsapp within 24h of a no-answer call is fine",
    good({ calls: [{ outcome: "No answer", when: now - 5 * 3600000, note: "" }],
           emails: [{ when: now - 4 * 3600000, subject: "Sorry we missed you", body: "Hi Ahmed" }],
           whatsapps: [{ when: now - 3 * 3600000, body: "Hello Mr Ahmed" }] }), null],
  ["whatsapp more than 24h after the call is flagged",
    good({ calls: [{ outcome: "No answer", when: now - 4 * DAY, note: "" }],
           emails: [{ when: now - 3 * DAY, subject: "Sorry we missed you", body: "Hi Ahmed" }],
           whatsapps: [{ when: now, body: "Hello Mr Ahmed" }] }), "after the call"],
  ["old whatsapp does not satisfy a new no-answer call",
    good({ calls: [{ outcome: "No answer", when: now - 3600000, note: "" }],
           emails: [{ when: now, subject: "Sorry we missed you", body: "Hi Ahmed" }],
           whatsapps: [{ when: now - 40 * DAY, body: "Hello" }] }), "no WhatsApp logged after it"],
  ["left voicemail also needs email and whatsapp",
    good({ calls: [{ outcome: "Left voicemail", when: now - 3600000, note: "" }], emails: [], whatsapps: [] }), "no email logged after it"],
  ["wrong number also needs a whatsapp",
    good({ calls: [{ outcome: "Wrong number", when: now - 7200000, note: "" }],
           emails: [{ when: now - 3600000, subject: "Sorry we missed you", body: "Hi Ahmed" }], whatsapps: [] }), "no WhatsApp logged after it"],
  ["broken whatsapp lookup stays silent on deals",
    good({ available: { ...OK, whatsapps: false }, calls: [{ outcome: "No answer", when: now - 7200000, note: "" }],
           emails: [{ when: now - 3600000, subject: "Sorry we missed you", body: "Hi" }], whatsapps: [] }), "!WhatsApp"],

  // --- note wording ---
  ["no answer email ask reads as a follow up, not a template name",
    good({ calls: [{ outcome: "No answer", when: now - 3600000, note: "" }], emails: [] }), "no email logged after it"],
  ["wording check", null, "WORDING"],

  // --- marketing properties ---
  ["contact outcome not Deal Created", good({ contact: { ...good().contact, outcome: "Opportunity" } }), "not Deal Created"],
  ["contact outcome blank", good({ contact: { ...good().contact, outcome: null } }), "not marked as Deal Created"],
  ["age range missing on both deal and contact", good({ dealAgeRange: null, contact: { ...good().contact, ageRange: null } }), "Age Range is not marked"],
  ["age range on the deal alone is enough", good({ dealAgeRange: "32-40", contact: { ...good().contact, ageRange: null } }), "!Age Range"],
  ["nationality missing", good({ contact: { ...good().contact, nationality: null } }), "Nationality is not marked"],

  // --- stage normalisation ---
  ["Expected Sale and Expected Sales both map", null, "STAGEMAP"],

  // --- the built-in stage map must resolve every sales stage id ---
  ["built-in stage ids all resolve", null, "STAGEIDS"],

  // --- reading the client's own words (script 10) ---
  ["attachment-only whatsapp is not readable", null, "INTENT_ATTACH"],
  ["conversation text is assembled from readable text only", null, "INTENT_TEXT"],
  ["client intent is not checked on closed stages", null, "INTENT_STAGE"],

  // --- broken lookups must never accuse anyone ---
  ["broken task lookup stays silent", good({ available: { ...OK, tasks: false }, tasks: [] }), "!follow-up task"],
  ["broken notes lookup stays silent", good({ available: { ...OK, notes: false }, notes: [] }), "!client details"],
  ["broken call lookup stays silent", good({ available: { ...OK, calls: false }, calls: [] }), "!call"],
  ["broken contact lookup stays silent", good({ available: { ...OK, contact: false }, contact: { ...good().contact, nationality: null } }), "!Nationality"],
];

(async () => {
  let pass = 0, fail = 0;
  console.log(`DEAL RULES SELF-TEST — ${SCENARIOS.length} scenarios\n`);

  for (const [label, d, must] of SCENARIOS) {
    if (must === "INTENT_ATTACH") {
      const { isAttachmentOnly } = require("./10-check-client-intent");
      const unreadable = ["image omitted", "\u200e<attached: 00000042-PHOTO.jpg>", "document omitted", "  ", "IMG_2043.jpg", "video omitted"];
      const readable = ["I cannot proceed due to family problems", "sorry sir, I lost my job last month", "we will start after IELTS"];
      const ok = unreadable.every(isAttachmentOnly) && readable.every((t) => !isAttachmentOnly(t));
      console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); ok ? pass++ : fail++;
      continue;
    }
    if (must === "INTENT_TEXT") {
      const { conversationText } = require("./10-check-client-intent");
      const r = conversationText(good({
        whatsapps: [
          { when: now, body: "[19:19, 7/22/2026] +971 54 423 2552: sir I cannot proceed now, family problems" },
          { when: now - DAY, body: "image omitted" },
        ],
        emails: [{ when: now, subject: "Canada PR", body: "Hi Ahmed, details attached." }],
        calls: [{ outcome: "Connected", when: now, note: "client said he will decide later" }],
      }));
      const ok = r.skippedAttachments === 1 && /family problems/.test(r.text)
        && !/image omitted/.test(r.text) && /CALL NOTE/.test(r.text) && /OUR EMAIL/.test(r.text);
      console.log(`${ok ? "PASS" : "FAIL"}  ${label} (${r.count} readable lines, ${r.skippedAttachments} attachment skipped)`);
      ok ? pass++ : fail++;
      continue;
    }
    if (must === "INTENT_STAGE") {
      const checkIntent = require("./10-check-client-intent");
      const say = { whatsapps: [{ when: now, body: "[19:19] +971 54 423 2552: I cannot proceed, family problems" }] };
      const lost = await checkIntent(good({ ...say, stage: "LOST", stageLabel: "Deal Lost", reason: "Family Issues", tasks: [] }));
      const won = await checkIntent(good({ ...say, stage: "WON", stageLabel: "Payment Made/Deal Won" }));
      const post = await checkIntent(good({ ...say, stage: "POSTPONED", stageLabel: "Postponed", reason: "Family Issues" }));
      const ok = lost.length === 0 && won.length === 0 && post.length === 0;
      console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); ok ? pass++ : fail++;
      continue;
    }
    if (must === "WORDING") {
      const checkComms = require("./6-check-comms");
      const d0 = good({ calls: [{ outcome: "No answer", when: now - 3600000, note: "" }], emails: [], whatsapps: [] });
      const found = await checkComms(d0);
      const emailIssue = found.find((i) => i.area === "email");
      const note = composeNote("Muhammad Diean", found.slice(0, 2));
      const ok = emailIssue && /follow up email/i.test(emailIssue.action)
        && !/no answer email/i.test(emailIssue.action)
        && /as the call was no answer, kindly send a follow up email/i.test(note);
      console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
      if (!ok) console.log(`        got: ${note}`);
      ok ? pass++ : fail++;
      continue;
    }
    if (must === "STAGEIDS") {
      const src = require("fs").readFileSync("./1-fetch-deals.js", "utf8");
      const block = src.slice(src.indexOf("const STANDARD_STAGES"), src.indexOf("};", src.indexOf("const STANDARD_STAGES")));
      const pairs = [...block.matchAll(/"(\d+)":\s*"([^"]+)"/g)];
      const keys = new Set(pairs.map(([, , label]) => stageKey(label)));
      const ok = pairs.length === 14 && keys.size === 7 && !keys.has(null);
      console.log(`${ok ? "PASS" : "FAIL"}  ${label} (${pairs.length} ids -> ${keys.size} stages)`);
      ok ? pass++ : fail++;
      continue;
    }
    if (must === "STAGEMAP") {
      const ok = stageKey("Expected Sale") === "EXPECTED_SALE" && stageKey("Expected Sales") === "EXPECTED_SALE"
        && stageKey("Postpone (No Specific Date)") === "POSTPONED" && stageKey("Postponed") === "POSTPONED"
        && stageKey("Petition Filed") === null;
      console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); ok ? pass++ : fail++;
      continue;
    }
    let issues = [];
    try {
      // exactly how the runner calls them, so an un-awaited async check is caught here
      const results = await Promise.all([
        checkCloseDate(d), checkStage(d), checkTask(d), checkNotes(d), checkComms(d), checkMarketing(d),
      ]);
      issues = results.flat().filter(Boolean);
    } catch (e) { console.log(`FAIL  ${label}\n        crashed: ${e.message}`); fail++; continue; }

    // every finding must be {problem, action} strings — a Promise or stray value fails here
    const malformed = issues.filter((i) => typeof i?.problem !== "string" || typeof i?.action !== "string");
    if (malformed.length) {
      console.log(`FAIL  ${label}\n        a check returned ${malformed.length} malformed finding(s) — likely an un-awaited async check`);
      fail++; continue;
    }
    issues.sort((a, b) => (PRIORITY[a.area] || 99) - (PRIORITY[b.area] || 99));
    const text = issues.map((i) => i.problem).join("; ");

    let ok;
    if (must === null) ok = issues.length === 0;
    else if (String(must).startsWith("!")) ok = !text.toLowerCase().includes(String(must).slice(1).toLowerCase());
    else ok = text.toLowerCase().includes(String(must).toLowerCase());

    if (ok) { pass++; console.log(`PASS  ${label}`); }
    else {
      fail++;
      console.log(`FAIL  ${label}`);
      console.log(`        expected: ${must === null ? "no issues" : String(must).startsWith("!") ? `NO issue containing "${String(must).slice(1)}"` : `an issue containing "${must}"`}`);
      console.log(`        got:      ${text || "(no issues)"}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) { console.log(`\nA deal rule stopped working. Fix it before auditing for real.`); process.exit(1); }
  console.log(`\nExample note:\n  ${composeNote("Ayesha Anum", [
    { action: "update the close date" }, { action: "schedule a follow-up task on the deal" },
  ])}`);
})();
