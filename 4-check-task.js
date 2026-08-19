// 4-check-task.js — SCRIPT 4. A follow-up task must be SCHEDULED in every deal stage
// EXCEPT Deal Lost.
//
// "Scheduled" means an OPEN task, not a completed one. Counting completed tasks was
// wrong: a deal whose only task was ticked off two months ago has no follow-up at all.
//   open task due in the future        -> compliant
//   open task overdue by more than the
//   grace period                       -> flagged as overdue (different message)
//   only completed tasks, or no tasks  -> flagged as not scheduled
// Our own "[Compliance]" tasks never count.
const { SETTINGS } = require("./config");
const { startOfTodayPkt } = require("./0-hubspot");

const DONE = ["completed"];                       // HubSpot: NOT_STARTED, IN_PROGRESS, WAITING, COMPLETED, DEFERRED

module.exports = function checkTask(d) {
  if (!SETTINGS.CHECK_TASK || !d.available.tasks) return [];
  if (!d.stage || SETTINGS.TASK_SKIP_STAGES.includes(d.stage)) return [];

  const prefix = (SETTINGS.TASK_PREFIX || "[Compliance]").toLowerCase();
  const theirs = d.tasks.filter((t) => !String(t.hs_task_subject || "").toLowerCase().startsWith(prefix));

  const open = theirs.filter((t) => !DONE.includes(String(t.hs_task_status || "").toLowerCase()));

  if (!open.length) {
    const hadCompleted = theirs.length > 0;
    return [{
      area: "task",
      problem: hadCompleted ? "No open follow-up task (the previous one is completed)" : "No follow-up task scheduled on the deal",
      action: "schedule the next follow-up task on the deal",
    }];
  }

  if (SETTINGS.CHECK_TASK_OVERDUE) {
    const today = startOfTodayPkt(SETTINGS.TZ_OFFSET_HOURS);
    const grace = (SETTINGS.TASK_OVERDUE_GRACE_DAYS || 0) * 86400000;
    const dueDates = open.map((t) => (t.hs_timestamp ? Date.parse(t.hs_timestamp) : NaN)).filter((n) => !Number.isNaN(n));
    // if every open task is overdue beyond the grace period, the follow-up has lapsed
    if (dueDates.length && dueDates.every((due) => due < today - grace)) {
      const days = Math.round((today - Math.max(...dueDates)) / 86400000);
      return [{
        area: "task",
        problem: `Follow-up task is overdue by ${days} day${days === 1 ? "" : "s"}`,
        action: "complete the overdue task and schedule the next follow up",
      }];
    }
  }

  return [];
};
