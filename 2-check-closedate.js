// 2-check-closedate.js — SCRIPT 2. Close date must not be in the past.
// Applies to Qualified Client, CCL Sent, Last Month Rollover, Expected Sales,
// Payment Made/Deal Won and Postponed. EXCEPTION: Deal Lost is not checked.
const { startOfTodayPkt } = require("./0-hubspot");
const { SETTINGS } = require("./config");

module.exports = function checkCloseDate(d) {
  if (!SETTINGS.CHECK_CLOSEDATE) return [];
  if (!d.stage || SETTINGS.CLOSEDATE_SKIP_STAGES.includes(d.stage)) return [];

  if (!d.closedate)
    return [{ area: "closedate", problem: "No close date set", action: "set the close date" }];

  const today = startOfTodayPkt(SETTINGS.TZ_OFFSET_HOURS);
  if (d.closedate < today) {
    const days = Math.round((today - d.closedate) / 86400000);
    return [{ area: "closedate", problem: `Close date is in the past (${days} day${days === 1 ? "" : "s"} ago)`, action: "update the close date" }];
  }
  return [];
};
