// 6-check-comms.js — SCRIPT 6. Every conversation must be logged on the deal.
//
// Rules, exactly as agreed (same treatment as the contact audit):
//   CONNECTED / MEETING BOOKED  -> an EMAIL must be logged after the call (process
//                      details shared) and the call must carry a brief description.
//                      NO WhatsApp required.
//   NO RESPONSE FROM THE CLIENT (No answer / Busy / Left voicemail / Left live
//                      message / Wrong number) -> a no-answer EMAIL must be logged
//                      AND a WhatsApp must be logged. WhatsApp is then scanned the
//                      same way as on contacts: it must arrive within
//                      WHATSAPP_DELAY_HOURS of the call, and can be spell-checked.
//   In both cases the email / WhatsApp must come AFTER that call, otherwise older
//   activity would satisfy today's call.
// A follow-up task is required too — that is script 4.
// Stays silent wherever a lookup failed.
const { SETTINGS } = require("./config");

const PLACEHOLDER = /^(na|n\/a|n\.a\.?|none|nil|-+|\.+|x+)$/i;
const hasDescription = (t) => { const s = String(t || "").trim(); return s.length >= 3 && !PLACEHOLDER.test(s); };

async function gemini(text) {
  if (!process.env.GEMINI_KEY || !text || !text.trim()) return [];
  const prompt = `You are a STRICT QA auditor. List ONLY clear spelling mistakes in this WhatsApp message from a consultant to a client. Ignore casual tone, greetings and emoji. Reply ONLY a JSON array of short strings (max 3), or [] if clean. Text:\n"""${String(text).slice(0, 1500)}"""`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SETTINGS.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    const t = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const m = t.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  } catch { return []; }
}

module.exports = async function checkComms(d) {
  if (!SETTINGS.CHECK_COMMS || !d.available.calls) return [];
  const issues = [];

  if (!d.calls.length)
    return [{ area: "call", problem: "No call logged on the deal", action: "log the call on the deal" }];

  const latest = d.calls[0];
  const reached = SETTINGS.REACHED_OUTCOMES.map((s) => s.toLowerCase()).includes(String(latest.outcome).toLowerCase());

  // a call where the client was reached must carry a description
  if (SETTINGS.CHECK_CALL_DESCRIPTION && reached && !hasDescription(latest.note))
    issues.push({ area: "call", problem: `"${latest.outcome}" call but no description logged`, action: "log the call description" });

  // an email is required either way, and must follow the call.
  // The note names the call outcome so the consultant knows WHY they are being asked,
  // e.g. "As the call was no answer, kindly send a follow up email to the client".
  if (d.available.emails && !d.emails.some((e) => e.when >= latest.when)) {
    const outcome = String(latest.outcome || "").toLowerCase();
    issues.push(reached
      ? { area: "email", problem: `${latest.outcome} call but no email logged after it`,
          action: "share the process details with the client by email",
          line: `As the call was ${outcome}, kindly share the process details with the client by email` }
      : { area: "email", problem: `Call was "${latest.outcome}" but no email logged after it`,
          action: "send a follow up email to the client",
          line: `As the call was ${outcome}, kindly send a follow up email to the client` });
  }

  // WhatsApp — only when the client did NOT respond
  if (!reached && d.available.whatsapps) {
    const followUp = d.whatsapps.find((w) => w.when >= latest.when);
    if (!followUp) {
      issues.push({ area: "whatsapp", problem: `Call was "${latest.outcome}" but no WhatsApp logged after it`,
        action: "reach out to the client on WhatsApp",
        line: `As the call was ${String(latest.outcome || "").toLowerCase()}, kindly reach out to the client on WhatsApp` });
    } else {
      const gapH = (followUp.when - latest.when) / 3600000;
      if (gapH > SETTINGS.WHATSAPP_DELAY_HOURS)
        issues.push({ area: "whatsapp", problem: `WhatsApp sent ${Math.round(gapH)}h after the call`, action: `send the WhatsApp follow up within ${SETTINGS.WHATSAPP_DELAY_HOURS} hours` });

      if (SETTINGS.CHECK_WHATSAPP_SPELLING)
        for (const m of await gemini(followUp.body))
          issues.push({ area: "whatsapp", problem: `WhatsApp: ${m}`, action: "correct the mistakes in the WhatsApp message" });
    }
  }

  return issues;
};
