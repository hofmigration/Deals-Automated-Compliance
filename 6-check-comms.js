// 6-check-comms.js — SCRIPT 6. Every conversation must be logged on the deal.
//
// EMAIL — "process related details should be shared with the client through the email
// after a connected call". That is a ONE-TIME obligation: once the details have been
// emailed, a later connected call does not mean re-sending the same email.
// So the rule is: an outgoing email must exist from the day of the FIRST connected
// call onwards. (The old rule demanded a new email after the LATEST connected call,
// which wrongly chased consultants who had already sent it.)
//
// NO RESPONSE FROM THE CLIENT (No answer / Busy / Left voicemail / Left live message /
// Wrong number) -> a follow up EMAIL and a WhatsApp must be logged for that attempt.
// Both are accepted from the SAME CALENDAR DAY as the call onwards, because a
// consultant often sends the message minutes before logging the call.
//
// A call where the client was reached must carry a brief description.
const { SETTINGS } = require("./config");
const { daysAgoPkt, startOfTodayPkt } = require("./0-hubspot");

const PLACEHOLDER = /^(na|n\/a|n\.a\.?|none|nil|-+|\.+|x+)$/i;
const hasDescription = (t) => { const s = String(t || "").trim(); return s.length >= 3 && !PLACEHOLDER.test(s); };

// start of the PKT day that `ms` falls in
function startOfDay(ms) {
  const off = SETTINGS.TZ_OFFSET_HOURS * 3600 * 1000;
  return Math.floor((ms + off) / 86400000) * 86400000 - off;
}

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

  const reachedList = SETTINGS.REACHED_OUTCOMES.map((s) => s.toLowerCase());
  const isReached = (c) => reachedList.includes(String(c.outcome).toLowerCase());
  const latest = d.calls[0];
  const reached = isReached(latest);

  // description on a call where the client was actually reached
  if (SETTINGS.CHECK_CALL_DESCRIPTION && reached && !hasDescription(latest.note))
    issues.push({ area: "call", problem: `"${latest.outcome}" call but no description logged`, action: "log the call description" });

  if (d.available.emails) {
    const reachedCalls = d.calls.filter(isReached);
    if (reachedCalls.length) {
      // process details are shared ONCE, from the first connected call onwards
      const firstReached = Math.min(...reachedCalls.map((c) => c.when));
      const shared = d.emails.some((e) => e.when >= startOfDay(firstReached));
      if (!shared)
        issues.push({ area: "email", problem: "Connected call but no email with the process details",
          action: "share the process details with the client by email",
          line: "As the call was connected, kindly share the process details with the client by email" });
    } else {
      // no contact made: the latest attempt needs a follow up email
      const sameDayOrLater = d.emails.some((e) => e.when >= startOfDay(latest.when));
      if (!sameDayOrLater)
        issues.push({ area: "email", problem: `Call was "${latest.outcome}" but no follow up email logged`,
          action: "send a follow up email to the client",
          line: `As the call was ${String(latest.outcome || "").toLowerCase()}, kindly send a follow up email to the client` });
    }
  }

  // WhatsApp — only when the client did NOT respond
  if (!reached && d.available.whatsapps) {
    const followUp = d.whatsapps.find((w) => w.when >= startOfDay(latest.when));
    if (!followUp) {
      issues.push({ area: "whatsapp", problem: `Call was "${latest.outcome}" but no WhatsApp logged`,
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
