// config.js — settings for the HOF DEAL compliance audit. SAFE TO EDIT.

const OWNERS = [
  { id: "89994865",   name: "Ambreen Sayed" },
  { id: "79152876",   name: "Insha Khan" },
  { id: "81129092",   name: "Akanksha Yadav" },
  { id: "93415418",   name: "Sneha Nair" },
  { id: "594801542",  name: "Wahab Saeed Dogar" },
  { id: "82714205",   name: "Muhammad Jalal Shah" },
  { id: "89398738",   name: "Komal Zahid" },
  { id: "78332276",   name: "Kawleen Kaur" },
  { id: "93601358",   name: "Anne Mariele De Guzman" },
  { id: "93714384",   name: "Mia Kordab" },
  { id: "2111743372", name: "Ronalyn Aguilar" },
  { id: "82756823",   name: "Arya Murali" },
  { id: "457296009",  name: "Rahul Pillai" },
  { id: "331190104",  name: "Aleen Naeem" },
  { id: "86887642",   name: "Khurram Iqbal" },
  { id: "76337310",   name: "Ahlam Khandoq" },
  { id: "76337312",   name: "Patrecia Haddad" },
  { id: "77931703",   name: "Abhi V" },
  { id: "331190099",  name: "Ayesha Anum" },
  { id: "94003500",   name: "Maaoui Chima Ines" },
  { id: "425098599",  name: "Jully Gill" },
  { id: "1186837974", name: "Asfandyar Malik" },
  { id: "93601359",   name: "Ayaat Gamal" },
  { id: "85714760",   name: "Rabbiya Mohsin" },
  { id: "83210660",   name: "Muhammad Diean" },
  { id: "84648486",   name: "Muhammad Shahzad Fiaz" },
  { id: "84172061",   name: "Ayesha Zahid" },
  { id: "84172062",   name: "Fatima Zahid" },
  { id: "85070897",   name: "Ahmad Ali" },
  { id: "83788398",   name: "Ali Raza Qureshi" },
  { id: "83788394",   name: "Mishal Naseem" },
  { id: "81515876",   name: "Hamza Mughal" },
  { id: "75852018",   name: "Fahad Butt" },
  { id: "239623628",  name: "Atika Zainab" },
  { id: "89097037",   name: "Tuba Ahmad" },
  { id: "93521996",   name: "Laraib Khalid" },
  { id: "93521993",   name: "Muhammad Hasham Azhar" },
  { id: "93521995",   name: "Ahmed Malik" },
  { id: "93521994",   name: "Laaiba Anum" },
  { id: "90507249",   name: "Muhammad Hanzla" },
  { id: "90507250",   name: "Muhammad Awaad" },
  { id: "89097036",   name: "Mashal Fatima" },
  { id: "95715299",   name: "Haleema Umar" },
  { id: "94388823",   name: "Rida Faisal" },
  { id: "96753780",   name: "Janice Noronha" },
  { id: "97131926",   name: "Insha Ali" },
  { id: "97131963",   name: "Uzma Qamar" },
];

// The 7 SALES pipelines that get audited (ids verified in portal 23735726).
// Service pipelines, Finland, Norway and Referral are deliberately excluded.
const PIPELINES = [
  { id: "26699617",  name: "HOF Sales Pipeline - Canada & AUS" },
  { id: "642383975", name: "USA NIW Sales Pipeline" },
  { id: "97449039",  name: "HOF Sales Pipeline (Visit)" },
  { id: "647754380", name: "HOF Sales - Work Permit" },
  { id: "818310187", name: "HOF Sales - Germany Opportunity Card" },
  { id: "818882472", name: "HOF Sales - Spain" },
  { id: "97796183",  name: "HOF Student" },
];

// Deal stage labels appear TWICE in the portal with different ids, and the wording
// differs slightly ("Expected Sales" vs "Expected Sale", "Postpone (No Specific
// Date)" vs "Postponed"). So stages are matched on the LABEL, normalised to a key.
function stageKey(label) {
  const s = String(label || "").toLowerCase().trim();
  if (!s) return null;
  if (s.includes("qualified client")) return "QUALIFIED";
  if (s.includes("ccl")) return "CCL_SENT";
  if (s.includes("rollover")) return "ROLLOVER";
  if (s.includes("expected sale")) return "EXPECTED_SALE";
  if (s.includes("payment made") || s.includes("deal won")) return "WON";
  if (s.includes("postpone")) return "POSTPONED";
  if (s.includes("deal lost")) return "LOST";
  return null;                     // service-pipeline stage: not a sales stage
}
const STAGE_NAME = {
  QUALIFIED: "Qualified Client", CCL_SENT: "CCL Sent", ROLLOVER: "Last Month Rollover",
  EXPECTED_SALE: "Expected Sales", WON: "Payment Made/Deal Won",
  POSTPONED: "Postponed", LOST: "Deal Lost",
};

function selectOwners() {
  const raw = (process.env.CONSULTANTS_INPUT || "all").trim();
  const terms = raw.split(/[|,]/).map((t) => t.trim().toLowerCase())
    .filter((t) => t && t !== "- none -" && t !== "none" && t !== "-");
  if (!terms.length || terms.includes("all")) return { owners: OWNERS, unmatched: [], all: true };
  const owners = [], unmatched = [];
  for (const term of terms) {
    const hits = OWNERS.filter((o) => o.name.toLowerCase() === term || o.name.toLowerCase().includes(term) || o.id === term);
    if (!hits.length) unmatched.push(term);
    for (const h of hits) if (!owners.some((x) => x.id === h.id)) owners.push(h);
  }
  return { owners, unmatched, all: false };
}
const SEL = selectOwners();

// The 14 "Won/Postponed/Lost - Reason" values in the portal.
const REASONS = [
  "Opportunity", "Sale", "Not Responding", "Cannot Afford At This Time",
  "Started With A Competitor", "No Longer Interested", "Family Issues",
  "Will Do IELTS First", "I Couldn't Convince", "Job Loss",
  "Delayed Decision But Will Start", "Self Processing", "Cross Sell", "Low Salary",
];

// Close-date scan filter: all | overdue | today | this_week | this_month | next_month | none
function selectCloseDate() {
  const raw = (process.env.CLOSEDATE_INPUT || "all").trim().toLowerCase();
  const map = {
    "all": null, "overdue (in the past)": "overdue", "overdue": "overdue",
    "today": "today", "this week": "this_week", "this month": "this_month",
    "next month": "next_month", "not set": "none", "none": "none",
  };
  return map[raw] !== undefined ? map[raw] : null;
}

// Reason scan filter: all | not set | one of REASONS
function selectReason() {
  const raw = (process.env.REASON_INPUT || "all").trim();
  const low = raw.toLowerCase();
  if (!raw || low === "all") return null;
  if (low === "not set" || low === "blank" || low === "none") return { blank: true, value: null };
  const match = REASONS.find((r) => r.toLowerCase() === low);
  return match ? { blank: false, value: match } : null;
}

function selectStage() {
  const raw = (process.env.DEAL_STAGE_INPUT || "all").trim().toLowerCase();
  if (!raw || raw === "all") return null;
  const key = stageKey(raw);
  return key;
}

const SETTINGS = {
  // true = safe test (writes nothing). Manual runs choose in the dropdown; the
  // scheduled run uses the fallback below. Change to false to make the daily run live.
  DRY_RUN: process.env.DRY_RUN_INPUT ? process.env.DRY_RUN_INPUT === "true" : true,

  // HOW FAR BACK TO SCAN, in HOURS. Type any number in the workflow: 1, 18, 24, 72...
  // 0 (or "any") means no time window at all — use that when scanning by close date,
  // stage or reason across every deal.
  AUDIT_HOURS: (() => {
    const raw = String(process.env.HOURS_INPUT ?? "24").trim().toLowerCase();
    if (!raw) return 24;                               // box left empty -> safe default
    if (raw === "any" || raw === "0") return 0;        // only an explicit 0/any = no window
    const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 24;       // anything unreadable -> 24h
  })(),
  AUDIT_HOURS_RAW: String(process.env.HOURS_INPUT ?? "24").trim(),
  LIMIT: (() => { const r = (process.env.LIMIT_INPUT || "all").toLowerCase(); if (!r || r === "all" || r === "0") return 0; const n = parseInt(r, 10); return n > 0 ? n : 0; })(),
  ONLY_STAGE: selectStage(),
  ONLY_CLOSEDATE: selectCloseDate(),   // null | overdue | today | this_week | this_month | next_month | none
  ONLY_REASON: selectReason(),         // null | { blank:true } | { value:"Job Loss" }
  PRINT_SAMPLE: 20,

  ALI_EMAIL: "razaali@hofmigration.com",
  FROM_EMAIL: "onboarding@resend.dev",
  PORTAL_ID: "23735726",
  NOTE_OWNER_ID: "86250521",          // notes are posted as Ali Raza

  CREATE_TASK_FOR_CONSULTANT: true,
  TASK_PREFIX: "[Compliance]",
  TASK_DUE_IN_HOURS: 24,

  MAX_ISSUES_PER_DEAL: 3,
  TZ_OFFSET_HOURS: 5,
  GEMINI_MODEL: "gemini-flash-lite-latest",

  // ---- rules ----
  // Close date must not be in the past, in every stage EXCEPT these:
  CLOSEDATE_SKIP_STAGES: ["LOST"],
  // Follow-up task required in every stage EXCEPT these.
  // WON is skipped too: once payment is made and the sale is closed there is nothing
  // left for the consultant to chase — the case managers take it from there.
  TASK_SKIP_STAGES: ["LOST", "WON"],
  // A completed task is not a scheduled follow-up. Also flag when every open task is
  // overdue by more than the grace period (set CHECK_TASK_OVERDUE false to ignore).
  CHECK_TASK_OVERDUE: true,
  TASK_OVERDUE_GRACE_DAYS: 2,
  // Won/Postponed/Lost reason required in these stages, and must not be "Opportunity":
  REASON_REQUIRED_STAGES: ["POSTPONED", "LOST"],
  REASON_FORBIDDEN: ["Opportunity"],
  // Client details note required, except:
  DETAILS_NOTE_SKIP_STAGES: ["LOST"],
  // Proof of payment note required in:
  PAYMENT_PROOF_STAGES: ["WON"],

  // Stages where the deal is still being pursued. Script 10 reads the client's own
  // WhatsApp / email / call text and flags a deal still sitting here after the client
  // has said they cannot proceed.
  ACTIVE_STAGES: ["QUALIFIED", "CCL_SENT", "ROLLOVER", "EXPECTED_SALE"],

  // Call outcomes that mean the client was actually reached.
  REACHED_OUTCOMES: ["Connected", "Meeting booked"],

  // WhatsApp is scanned exactly as on contacts: it must be logged after a call where
  // the client was not reached, sent within this many hours, and (optionally) checked
  // for spelling. Spelling is OFF, same as the contact pipeline.
  WHATSAPP_DELAY_HOURS: 24,
  CHECK_WHATSAPP_SPELLING: false,

  // ---- toggles ----
  CHECK_CLOSEDATE: true,
  CHECK_REASON: true,
  CHECK_TASK: true,
  CHECK_DETAILS_NOTE: true,
  CHECK_PAYMENT_PROOF: true,
  CHECK_COMMS: true,
  CHECK_MARKETING: true,
  CHECK_PIPELINE_MATCH: true,     // AI: is the pipeline right for what was discussed
  CHECK_CLIENT_INTENT: true,      // AI: client said they cannot proceed but deal is still active

  // Consultants sometimes write the client details on the CONTACT rather than the
  // deal — in the contact's notes or its call log. Without this the audit reported
  // "no client details" on cases where the work had actually been done.
  CHECK_CONTACT_FOR_DETAILS: true,
  CONTACT_RECORDS_TO_READ: 25,   // most recent notes / calls read per contact

  // When the client details are typed into the CALL DESCRIPTION instead of a note,
  // copy them into a proper note on the deal automatically (live runs only).
  // Set false to go back to just asking the consultant to do it.
  COPY_CLIENT_DETAILS_TO_NOTE: true,
  CHECK_CALL_DESCRIPTION: true,

  // Safety net: if a whole run reads ZERO WhatsApp messages while many deals needed
  // one, assume we cannot see WhatsApp rather than blaming everybody.
  WHATSAPP_SANITY_NET: true,
};

module.exports = {
  OWNERS, PIPELINES, SETTINGS, stageKey, STAGE_NAME, REASONS,
  SELECTED_OWNERS: SEL.owners, UNMATCHED_NAMES: SEL.unmatched, ALL_OWNERS_SELECTED: SEL.all,
};
