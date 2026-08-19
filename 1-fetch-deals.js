// 1-fetch-deals.js — SCRIPT 1. Finds sales deals worked in the audit window and
// loads everything the checks need: calls, emails, tasks, notes, WhatsApp, contact.
const { hub, assocIds, batchRead, optionLabels, newestFirst, strip, startOfTodayPkt } = require("./0-hubspot");
const { SETTINGS, PIPELINES, SELECTED_OWNERS, stageKey } = require("./config");

const OWNER_IDS = SELECTED_OWNERS.map((o) => o.id);
const PIPELINE_IDS = PIPELINES.map((p) => p.id);

const STANDARD_DISPOSITIONS = {
  "9d9162e7-6cf3-4944-bf63-4dff82258764": "Busy",
  "f240bbac-87c9-4f6e-bf70-924b57d47db7": "Connected",
  "a4c4c377-d246-4b32-a13b-75a56a4cd0ff": "Left live message",
  "b2cf5968-551e-4856-9783-52b3da59a7d0": "Left voicemail",
  "2e7360c1-6b71-40e9-ab2b-30ae98a4678c": "Meeting booked",
  "73a0d17f-1163-4015-bdd5-ec830791da20": "No answer",
  "17b47fee-58de-441e-a44c-c6300d46f273": "Wrong number",
};

function auditWindow() {
  const startToday = startOfTodayPkt(SETTINGS.TZ_OFFSET_HOURS);
  const w = String(SETTINGS.AUDIT_WINDOW || "yesterday").toLowerCase();
  if (w === "any" || w === "any time") return null;          // no window at all
  if (w === "today") return { startMs: startToday, endMs: Date.now() };
  if (w === "yesterday") return { startMs: startToday - 86400000, endMs: startToday };
  const days = parseInt(w, 10);
  if (Number.isFinite(days) && days > 0) return { startMs: startToday - days * 86400000, endMs: Date.now() };
  return { startMs: startToday - 86400000, endMs: startToday };
}

async function lookups() {
  const [stages, dispo] = await Promise.all([
    optionLabels("deals", "dealstage"),
    optionLabels("calls", "hs_call_disposition"),
  ]);
  return { stageLabel: stages, dispoLabel: { ...STANDARD_DISPOSITIONS, ...dispo } };
}

// Turns the close-date choice into a HubSpot filter.
function closeDateFilter() {
  const c = SETTINGS.ONLY_CLOSEDATE;
  if (!c) return null;
  if (c === "none") return { propertyName: "closedate", operator: "NOT_HAS_PROPERTY" };

  const startToday = startOfTodayPkt(SETTINGS.TZ_OFFSET_HOURS);
  const DAY = 86400000;
  const monthStart = (offset = 0) => {
    const n = new Date(startToday + SETTINGS.TZ_OFFSET_HOURS * 3600 * 1000);
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + offset, 1) - SETTINGS.TZ_OFFSET_HOURS * 3600 * 1000;
  };
  const between = (a, b) => ({ propertyName: "closedate", operator: "BETWEEN", value: String(a), highValue: String(b) });

  if (c === "overdue")    return { propertyName: "closedate", operator: "LT", value: String(startToday) };
  if (c === "today")      return between(startToday, startToday + DAY - 1);
  if (c === "this_week")  return between(startToday, startToday + 7 * DAY);
  if (c === "this_month") return between(monthStart(0), monthStart(1) - 1);
  if (c === "next_month") return between(monthStart(1), monthStart(2) - 1);
  return null;
}

// Turns the reason choice into a HubSpot filter.
function reasonFilter() {
  const r = SETTINGS.ONLY_REASON;
  if (!r) return null;
  if (r.blank) return { propertyName: "outcome", operator: "NOT_HAS_PROPERTY" };
  return { propertyName: "outcome", operator: "EQ", value: r.value };
}

// Stage ids for the chosen stage key. The same label exists under several ids, so
// they are all collected from the live property options.
function stageIdsFor(stageLabelMap, key) {
  return Object.entries(stageLabelMap).filter(([, label]) => stageKey(label) === key).map(([id]) => id);
}

async function fetchDeals(L) {
  const win = auditWindow();
  const filters = [
    { propertyName: "hubspot_owner_id", operator: "IN", values: OWNER_IDS },
    { propertyName: "pipeline", operator: "IN", values: PIPELINE_IDS },
  ];
  const cd = closeDateFilter();  if (cd) filters.push(cd);
  const rf = reasonFilter();     if (rf) filters.push(rf);
  if (SETTINGS.ONLY_STAGE && L?.stageLabel) {
    const ids = stageIdsFor(L.stageLabel, SETTINGS.ONLY_STAGE);
    if (ids.length) filters.push({ propertyName: "dealstage", operator: "IN", values: ids });
  }
  const props = ["dealname", "dealstage", "pipeline", "hubspot_owner_id", "closedate",
    "outcome", "age_range", "createdate", "notes_last_contacted", "hs_lastmodifieddate", "amount"];

  const out = []; let after;
  for (let page = 0; page < 200; page++) {
    const d = await hub("POST", "/crm/v3/objects/deals/search", {
      filterGroups: [{ filters }],
      sorts: [{ propertyName: "notes_last_contacted", direction: "DESCENDING" }],
      properties: props, limit: 100, after,
    });
    let stop = false;
    for (const deal of d.results || []) {
      if (win) {
        const lc = deal.properties.notes_last_contacted ? Date.parse(deal.properties.notes_last_contacted) : 0;
        if (lc >= win.endMs) continue;
        if (lc < win.startMs) { stop = true; break; }
      }
      out.push(deal);
      if (SETTINGS.LIMIT && out.length >= SETTINGS.LIMIT) { stop = true; break; }
    }
    after = d.paging?.next?.after;
    if (stop || !after) break;
  }
  return out;
}

async function attach(deal, L) {
  const [callA, emailA, taskA, noteA, commA, contactA] = await Promise.all([
    assocIds("deals", deal.id, "calls"), assocIds("deals", deal.id, "emails"),
    assocIds("deals", deal.id, "tasks"), assocIds("deals", deal.id, "notes"),
    assocIds("deals", deal.id, "communications"), assocIds("deals", deal.id, "contacts"),
  ]);
  const [callR, emailR, taskR, noteR, commR, contactR] = await Promise.all([
    batchRead("calls", callA.ids, ["hs_call_body", "hs_call_title", "hs_call_disposition", "hs_timestamp"]),
    batchRead("emails", emailA.ids, ["hs_email_subject", "hs_email_text", "hs_email_html", "hs_email_direction", "hs_timestamp"]),
    batchRead("tasks", taskA.ids, ["hs_task_subject", "hs_task_status", "hs_timestamp"]),
    batchRead("notes", noteA.ids, ["hs_note_body", "hs_timestamp", "hubspot_owner_id"]),
    batchRead("communications", commA.ids, ["hs_communication_channel_type", "hs_communication_body", "hs_body_preview", "hs_timestamp"]),
    batchRead("contacts", contactA.ids, ["firstname", "lastname", "outcome", "age_range", "nationality", "lead_stage"]),
  ]);

  const available = {
    calls: callA.ok && callR.ok, emails: emailA.ok && emailR.ok, tasks: taskA.ok && taskR.ok,
    notes: noteA.ok && noteR.ok, whatsapps: commA.ok && commR.ok, contact: contactA.ok && contactR.ok,
  };

  // tolerant WhatsApp classification (a blank channel type still counts)
  const channelSeen = {};
  const wa = commR.records.filter((x) => {
    const ch = String(x.properties.hs_communication_channel_type || "").trim().toUpperCase();
    channelSeen[ch || "(blank)"] = (channelSeen[ch || "(blank)"] || 0) + 1;
    if (/WHATS/.test(ch)) return true;
    if (!ch) return true;
    return !/SMS|LINKEDIN/.test(ch);
  });

  const p = deal.properties;
  const label = L.stageLabel[p.dealstage] || p.dealstage;
  const contact = contactR.records[0]?.properties || null;

  return {
    id: deal.id,
    name: p.dealname || `Deal ${deal.id}`,
    ownerId: p.hubspot_owner_id,
    pipelineId: p.pipeline,
    pipelineName: (PIPELINES.find((x) => x.id === p.pipeline) || {}).name || p.pipeline,
    stageLabel: label,
    stage: stageKey(label),
    closedate: p.closedate ? Date.parse(p.closedate) : null,
    reason: p.outcome || null,          // deal "Won/Postponed/Lost - Reason"
    dealAgeRange: p.age_range || null,
    createdate: p.createdate ? Date.parse(p.createdate) : null,
    available, channelSeen, commCount: commR.records.length,
    calls: newestFirst(callR.records).map((x) => ({
      outcome: L.dispoLabel[x.properties.hs_call_disposition] || x.properties.hs_call_disposition || "",
      when: Date.parse(x.properties.hs_timestamp || 0),
      note: strip(x.properties.hs_call_body || x.properties.hs_call_title),
    })),
    emails: newestFirst(emailR.records.filter((e) => (e.properties.hs_email_direction || "") !== "INCOMING_EMAIL"))
      .map((x) => ({ when: Date.parse(x.properties.hs_timestamp || 0), subject: x.properties.hs_email_subject || "", body: strip(x.properties.hs_email_text || x.properties.hs_email_html) })),
    tasks: taskR.records.map((x) => x.properties),
    notes: newestFirst(noteR.records).map((x) => ({ when: Date.parse(x.properties.hs_timestamp || 0), body: strip(x.properties.hs_note_body), ownerId: x.properties.hubspot_owner_id })),
    whatsapps: newestFirst(wa).map((x) => ({ when: Date.parse(x.properties.hs_timestamp || 0), body: strip(x.properties.hs_communication_body || x.properties.hs_body_preview) })),
    contact: contact ? {
      name: [contact.firstname, contact.lastname].filter(Boolean).join(" ").trim(),
      outcome: contact.outcome || null, ageRange: contact.age_range || null,
      nationality: contact.nationality || null, leadStage: contact.lead_stage || null,
    } : null,
  };
}

module.exports = { fetchDeals, attach, lookups, auditWindow };
