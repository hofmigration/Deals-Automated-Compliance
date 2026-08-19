// 5-check-notes.js — SCRIPT 5. Two notes are expected on a deal.
//
// A) CLIENT DETAILS note — full client details in a separate note. The wording is
//    different every time, e.g.:
//      "43/masters in marketing/ 14 years of exp/ since 2011 - 2018
//       2022- till date in UAE / Married - bachelors - house wife
//       3 kids 13 -10- 8 / Reason: 2nd passport"
//    So it is detected by SUBSTANCE, not by a fixed format: a note that carries
//    several client facts (age, education, experience, family, reason...).
//
// B) PROOF OF PAYMENT note — only on Payment Made/Deal Won. Example is a fee note:
//      "VAT INCLUSIVE | Fees | Deposit | Due Date | 11,000 11,000 UP"
//    Detected by payment wording plus figures.
const { SETTINGS } = require("./config");

// our own compliance notes must never satisfy these checks
const isOurs = (n) => String(n.ownerId || "") === String(SETTINGS.NOTE_OWNER_ID) ||
  /compliance check|kindly (mark|log|schedule|update|select)/i.test(n.body || "");

const DETAIL_SIGNALS = [
  /\b(bachelor|bachelors|master|masters|mba|bsc|msc|phd|diploma|graduate)\b/i,
  /\b\d+\s*(years?|yrs?)\b/i,
  /\bexp(erience)?\b/i,
  /\b(married|single|divorced|spouse|wife|husband)\b/i,
  /\b\d+\s*kids?\b/i,
  /\breason\b/i,
  /\b(ielts|pte|score)\b/i,
  /\b(uae|dubai|qatar|kuwait|oman|bahrain|saudi|ksa)\b/i,
];
const PAYMENT_SIGNALS = [
  /\bvat\b/i, /\bfee?s\b/i, /\bdeposit\b/i, /\bdue date\b/i, /\binstal?ment\b/i,
  /\bpayment\b/i, /\breceipt\b/i, /\bpaid\b/i, /\binvoice\b/i,
];
const hasFigures = (t) => /\d{3,}|\d+[,.]\d{3}/.test(t || "");

function looksLikeClientDetails(body) {
  const t = String(body || "");
  if (t.replace(/\s+/g, "").length < 25) return false;
  const hits = DETAIL_SIGNALS.filter((r) => r.test(t)).length;
  return hits >= 2 || (hits >= 1 && /\d/.test(t) && t.length > 60);
}
function looksLikePaymentProof(body) {
  const t = String(body || "");
  const hits = PAYMENT_SIGNALS.filter((r) => r.test(t)).length;
  return (hits >= 2 && hasFigures(t)) || (hits >= 1 && hasFigures(t) && /vat|deposit|instal/i.test(t));
}

module.exports = function checkNotes(d) {
  if (!d.available.notes) return [];
  const issues = [];
  const theirs = d.notes.filter((n) => !isOurs(n));

  if (SETTINGS.CHECK_DETAILS_NOTE && d.stage && !SETTINGS.DETAILS_NOTE_SKIP_STAGES.includes(d.stage)) {
    if (!theirs.some((n) => looksLikeClientDetails(n.body)))
      issues.push({ area: "details", problem: "No client details note on the deal", action: "add a note with the full client details" });
  }

  if (SETTINGS.CHECK_PAYMENT_PROOF && d.stage && SETTINGS.PAYMENT_PROOF_STAGES.includes(d.stage)) {
    if (!theirs.some((n) => looksLikePaymentProof(n.body)))
      issues.push({ area: "payment", problem: "Deal marked won but no proof of payment logged", action: "log the proof of payment on the deal" });
  }

  return issues;
};
module.exports.looksLikeClientDetails = looksLikeClientDetails;
module.exports.looksLikePaymentProof = looksLikePaymentProof;
