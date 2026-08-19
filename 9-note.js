// 9-note.js — SCRIPT 9. Writes the compliance note on the DEAL in Ali's wording,
// with a real HubSpot mention, posted as Ali, plus a task assigned to the consultant.
// (HubSpot does not notify for API-created mentions, so the task is what reaches them.)
const { hub } = require("./0-hubspot");
const { SETTINGS } = require("./config");

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const mentionHtml = (ownerId, fullName) => {
  const n = esc(fullName);
  return `<strong><span data-mention-id="${esc(ownerId)}" data-mention-name="${n}" style="color: #425b76;font-weight: 600;">@${n}</span></strong>`;
};

const joinActions = (a) =>
  a.length === 1 ? a[0] : a.length === 2 ? `${a[0]} and also ${a[1]}` : `${a.slice(0, -1).join(", ")} and also ${a[a.length - 1]}`;

function buildNoteHtml(ownerId, fullName, issues) {
  const P = (i) => `<p style="margin:0;">${i}</p>`;
  const actions = [...new Set(issues.map((i) => i.action))];
  const lines = [P(`Hi ${mentionHtml(ownerId, fullName)}`)];
  actions.forEach((a, i) => lines.push(P(esc(i === 0 ? `Kindly ${a}` : `Also ${a}`))));
  lines.push(P("Thank you"));
  return `<div style="" dir="auto" data-top-level="true">${lines.join("")}</div>`;
}

const composeNote = (fullName, issues) => {
  const actions = [...new Set(issues.map((i) => i.action))];
  return `Hi @${fullName} | ` + actions.map((a, i) => (i === 0 ? `Kindly ${a}` : `Also ${a}`)).join(" | ") + " | Thank you";
};

async function postNote(dealId, ownerId, ownerName, issues) {
  await hub("POST", "/crm/v3/objects/notes", {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: buildNoteHtml(ownerId, ownerName, issues),
      hubspot_owner_id: String(SETTINGS.NOTE_OWNER_ID),
      hs_at_mentioned_owner_ids: String(ownerId),
    },
    // 214 = note -> deal
    associations: [{ to: { id: String(dealId) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }] }],
  });
}

async function createComplianceTask(dealId, ownerId, dealName, issues) {
  const actions = [...new Set(issues.map((i) => i.action))];
  const due = new Date(Date.now() + SETTINGS.TASK_DUE_IN_HOURS * 3600 * 1000);
  await hub("POST", "/crm/v3/objects/tasks", {
    properties: {
      hs_timestamp: due.toISOString(),
      hs_task_subject: `${SETTINGS.TASK_PREFIX} ${dealName || "Deal"} — ${joinActions(actions)}`.slice(0, 250),
      hs_task_body: `Compliance check on ${dealName || "this deal"}. Kindly ${joinActions(actions)}.`,
      hs_task_status: "NOT_STARTED", hs_task_priority: "HIGH", hs_task_type: "TODO",
      hubspot_owner_id: String(ownerId),
    },
    // 216 = task -> deal
    associations: [{ to: { id: String(dealId) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 216 }] }],
  });
}

module.exports = { composeNote, buildNoteHtml, postNote, createComplianceTask };
