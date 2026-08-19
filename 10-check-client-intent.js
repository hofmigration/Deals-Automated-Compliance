// 10-check-client-intent.js — SCRIPT 10. READS WHAT THE CLIENT ACTUALLY SAID.
//
// Sometimes the client tells us on WhatsApp (or by email) that they cannot proceed:
// family problems, cannot afford it right now, lost their job, started with another
// agency, will do IELTS first, and so on. The consultant is then supposed to move the
// deal to Postponed or Deal Lost and mark the reason. This check catches deals that
// are still sitting in an ACTIVE stage after the client has already said no.
//
// IMPORTANT LIMITS, so nothing is over-claimed:
//  - Only TEXT can be read. Screenshots, images and attached documents are invisible
//    to this check, so a deal is never judged on content we cannot see.
//  - Only the CLIENT's words count. Logged WhatsApp lines are prefixed with the
//    sender: a PHONE NUMBER is the client, a person's NAME is the consultant.
//  - It only fires on a CLEAR statement, and only proposes a reason that exists in
//    the portal's Won/Postponed/Lost list.
const { SETTINGS, REASONS } = require("./config");

// WhatsApp exports and HubSpot logs use these for anything that is not text
const ATTACHMENT = /(image|video|audio|sticker|document|gif|file)\s*(omitted|attached)|<attached:|\battachment\b|\.(jpg|jpeg|png|pdf|docx?|xlsx?)\b/i;

const isAttachmentOnly = (text) => {
  const t = String(text || "").trim();
  if (!t) return true;
  const cleaned = t.replace(ATTACHMENT, " ").replace(/[^A-Za-z]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length < 12;                 // nothing readable left
};

// Builds the conversation for the AI, labelling who said what where we can tell.
function conversationText(d) {
  const lines = [];
  let skippedAttachments = 0;

  for (const w of (d.whatsapps || []).slice(0, 12)) {
    const body = String(w.body || "").trim();
    if (!body) continue;
    if (isAttachmentOnly(body)) { skippedAttachments++; continue; }
    lines.push(`WHATSAPP: ${body.slice(0, 500)}`);
  }
  for (const e of (d.emails || []).slice(0, 3)) {
    const body = String(e.body || "").trim();
    if (body) lines.push(`OUR EMAIL: ${String(e.subject || "")} — ${body.slice(0, 300)}`);
  }
  for (const c of (d.calls || []).slice(0, 4)) {
    if (c.note) lines.push(`CALL NOTE (${c.outcome}): ${String(c.note).slice(0, 300)}`);
  }
  return { text: lines.join("\n"), skippedAttachments, count: lines.length };
}

module.exports = async function checkClientIntent(d) {
  if (!SETTINGS.CHECK_CLIENT_INTENT || !process.env.GEMINI_KEY) return [];
  // only meaningful while the deal is still being pursued
  if (!d.stage || !SETTINGS.ACTIVE_STAGES.includes(d.stage)) return [];

  const { text, count } = conversationText(d);
  if (!count || text.replace(/\s+/g, "").length < 40) return [];

  const prompt = `You audit an immigration consultancy's CRM. Read the conversation below and decide whether THE CLIENT has clearly said they cannot go ahead right now.

The deal is still in the active stage "${d.stageLabel}". If the client has clearly said they cannot proceed, the consultant should have moved it to Postponed or Deal Lost with a reason.

HOW TO READ IT:
- Lines starting WHATSAPP: are logged WhatsApp messages. Inside them, a line prefixed with a PHONE NUMBER is the CLIENT speaking; a line prefixed with a PERSON'S NAME is our consultant.
- OUR EMAIL and CALL NOTE lines are written by our side, not the client. A call note may still report what the client said.
- Judge ONLY what the client said. Ignore our own follow-up chasing.

Reasons available in the CRM: ${REASONS.join(" | ")}

Only report a signal when the client's own words clearly show it, for example: they cannot afford it now, family problems, they lost their job, they started with another agency, they are no longer interested, they will do IELTS first, they will process it themselves, they want to delay to a later date or month. Politeness, silence, a delayed reply, or asking questions are NOT signals. If in any doubt, report false.

CONVERSATION:
${text}

Reply ONLY JSON:
{"signal": true|false, "reason": "<one reason from the list, or empty>", "suggestedStage": "Postponed" or "Deal Lost" or "", "clientSaid": "<max 15 words quoting or paraphrasing the client>"}`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SETTINGS.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    const out = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const j = JSON.parse(m[0]);
    if (!j.signal) return [];

    const reason = REASONS.find((r) => r.toLowerCase() === String(j.reason || "").toLowerCase());
    const stage = /lost/i.test(String(j.suggestedStage)) ? "Deal Lost"
      : /postpone/i.test(String(j.suggestedStage)) ? "Postponed" : null;
    if (!reason && !stage) return [];          // nothing usable, stay quiet

    const said = String(j.clientSaid || "").trim();
    const target = stage || "Postponed or Deal Lost";
    return [{
      area: "intent",
      problem: `Client has said they cannot proceed${said ? ` ("${said}")` : ""} but the deal is still ${d.stageLabel}`,
      action: reason ? `move the deal to ${target} and mark the reason as ${reason}` : `move the deal to ${target} and mark the reason`,
      line: `The client has informed${said ? ` that ${said}` : " they cannot proceed"}, kindly move the deal to ${target}${reason ? ` and mark the reason as ${reason}` : " and mark the reason"}`,
    }];
  } catch { return []; }
};

module.exports.conversationText = conversationText;
module.exports.isAttachmentOnly = isAttachmentOnly;
