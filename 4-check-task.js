// 4-check-task.js — SCRIPT 4. A follow-up task must be scheduled in every deal
// stage EXCEPT Deal Lost. Our own "[Compliance]" tasks never count.
const { SETTINGS } = require("./config");

module.exports = function checkTask(d) {
  if (!SETTINGS.CHECK_TASK || !d.available.tasks) return [];
  if (!d.stage || SETTINGS.TASK_SKIP_STAGES.includes(d.stage)) return [];

  const prefix = (SETTINGS.TASK_PREFIX || "[Compliance]").toLowerCase();
  const real = d.tasks.filter((t) => !String(t.hs_task_subject || "").toLowerCase().startsWith(prefix));
  if (!real.length)
    return [{ area: "task", problem: "No follow-up task scheduled on the deal", action: "schedule a follow-up task on the deal" }];
  return [];
};
