// 8-check-pipeline.js — SCRIPT 8. THE JUDGEMENT CHECK (AI).
// Did the consultant put the deal in the right pipeline for what was actually
// discussed with the client? Judged from the logged email subjects/bodies and call
// notes. Only flags a CLEAR mismatch (e.g. everything talks about Canada PR but the
// deal sits in the Spain pipeline).
const { SETTINGS, PIPELINES } = require("./config");

module.exports = async function checkPipeline(d) {
  if (!SETTINGS.CHECK_PIPELINE_MATCH || !process.env.GEMINI_KEY) return [];

  const evidence = [
    ...d.emails.slice(0, 3).map((e) => `EMAIL: ${e.subject} — ${String(e.body).slice(0, 300)}`),
    ...d.calls.slice(0, 3).filter((c) => c.note).map((c) => `CALL (${c.outcome}): ${String(c.note).slice(0, 200)}`),
  ];
  if (evidence.length < 1) return [];

  const prompt = `You audit an immigration consultancy's CRM. A deal sits in one sales pipeline. Decide if that pipeline CLEARLY contradicts what was actually discussed with the client.

Deal pipeline: "${d.pipelineName}"

Available pipelines: ${PIPELINES.map((p) => p.name).join(" | ")}

Logged activity:
${evidence.join("\n")}

Flag a mismatch ONLY if the activity clearly concerns a different country or programme than the pipeline (for example the emails are all about Canada PR but the deal is in the Spain pipeline). Visit/visit visa, work permit, student, Germany Opportunity Card, Spain, Canada & AUS and USA NIW are distinct programmes. If the activity is generic, brief, or consistent with the pipeline, there is NO mismatch. Do not guess.

Reply ONLY JSON: {"mismatch": true|false, "suggested": "<one pipeline name or empty>", "reason": "<max 12 words>"}`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SETTINGS.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }) });
    const t = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const j = JSON.parse(m[0]);
    if (!j.mismatch) return [];
    const suggested = PIPELINES.find((p) => p.name.toLowerCase() === String(j.suggested || "").toLowerCase());
    return [{
      area: "pipeline",
      problem: `Pipeline "${d.pipelineName}" does not match the logged activity (${j.reason || "activity suggests otherwise"})`,
      action: suggested ? `move the deal to the ${suggested.name} pipeline` : "move the deal to the correct pipeline",
    }];
  } catch { return []; }
};
