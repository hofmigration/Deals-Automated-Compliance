// 3-check-stage.js — SCRIPT 3. Stage-specific property rules.
// Postponed and Deal Lost must carry a "Won/Postponed/Lost - Reason", and that
// reason must not be "Opportunity" (an opportunity is not a reason for closing).
const { SETTINGS, STAGE_NAME } = require("./config");

module.exports = function checkStage(d) {
  if (!SETTINGS.CHECK_REASON) return [];
  if (!d.stage || !SETTINGS.REASON_REQUIRED_STAGES.includes(d.stage)) return [];

  const stage = STAGE_NAME[d.stage] || d.stageLabel;
  if (!d.reason)
    return [{ area: "reason", problem: `${stage} but no Won/Postponed/Lost reason selected`, action: "select the Won/Postponed/Lost reason" }];

  if (SETTINGS.REASON_FORBIDDEN.map((x) => x.toLowerCase()).includes(String(d.reason).toLowerCase()))
    return [{ area: "reason", problem: `${stage} but the reason is "${d.reason}", which is not a closing reason`, action: "select a proper Won/Postponed/Lost reason" }];

  return [];
};
