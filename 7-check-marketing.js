// 7-check-marketing.js — SCRIPT 7. Marketing properties on the associated contact.
//   Outcome must be "Deal Created" (it is a multi-checkbox, so it must contain it).
//   Age Range must be marked  (accepted from the contact OR the deal).
//   Nationality must be marked (contact only — deals have no nationality property).
const { SETTINGS } = require("./config");

module.exports = function checkMarketing(d) {
  if (!SETTINGS.CHECK_MARKETING || !d.available.contact) return [];
  if (!d.contact) return [];                 // no contact linked: nothing to judge
  const issues = [];

  const outcome = String(d.contact.outcome || "");
  if (!/deal created/i.test(outcome))
    issues.push({ area: "marketing", problem: outcome ? `Contact outcome is "${outcome}", not Deal Created` : "Contact outcome is not marked as Deal Created", action: "mark the outcome as Deal Created" });

  if (!d.contact.ageRange && !d.dealAgeRange)
    issues.push({ area: "marketing", problem: "Age Range is not marked", action: "mark the age range" });

  if (!d.contact.nationality)
    issues.push({ area: "marketing", problem: "Nationality is not marked", action: "mark the nationality" });

  return issues;
};
