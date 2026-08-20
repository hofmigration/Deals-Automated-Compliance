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

// Our own COMPLIANCE notes must never satisfy these checks. Identified by their
// wording, not by the owner — a client-details note copied in by the system is still
// a valid client-details note, and Ali may legitimately write one himself.
const isComplianceNote = (n) => {
  const b = String(n.body || "");
  return (/^\s*hi\s*@/i.test(b) && /\bkindly\b/i.test(b)) ||
    /\[compliance\]/i.test(b) || /^compliance check/i.test(b);
};

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

// Where are the client details? Consultants often type them into the CALL
// DESCRIPTION rather than a separate note, e.g.
//   "age: 54yrs / edu: phd / exp: 30yrs / married / kids: 16yrs / Indian /
//    associate professor / he wanted to know about the USA EB-2 NIW..."
// That still counts as recorded, so it is accepted here and can be copied into a
// proper deal note automatically by script 11.
function findClientDetails(d) {
  const noteHit = (d.notes || []).filter((n) => !isComplianceNote(n)).find((n) => looksLikeClientDetails(n.body));
  if (noteHit) return { where: "note", text: noteHit.body, call: null };
  const callHit = (d.calls || []).find((c) => looksLikeClientDetails(c.note));
  if (callHit) return { where: "call", text: callHit.note, call: callHit };
  return null;
}

module.exports = function checkNotes(d) {
  if (!d.available.notes) return [];
  const issues = [];
  const theirs = d.notes.filter((n) => !isComplianceNote(n));

  if (SETTINGS.CHECK_DETAILS_NOTE && d.stage && !SETTINGS.DETAILS_NOTE_SKIP_STAGES.includes(d.stage)) {
    const found = findClientDetails(d);
    if (!found && d.available.calls) {
      // nowhere at all: neither a note nor a call description -> ask the consultant
      issues.push({ area: "details", problem: "No client details recorded on the deal", action: "add a note with the full client details" });
    } else if (found && found.where === "call") {
      // in the call description: the system copies it into a note, so nothing to ask.
      // But if copying is switched off, or the copy failed, the consultant is asked.
      if (!SETTINGS.COPY_CLIENT_DETAILS_TO_NOTE || d.detailsCopyFailed)
        issues.push({ area: "details", problem: "Client details are in the call description, not in a note", action: "add the client details as a note on the deal" });
    }
  }

  if (SETTINGS.CHECK_PAYMENT_PROOF && d.stage && SETTINGS.PAYMENT_PROOF_STAGES.includes(d.stage)) {
    if (!theirs.some((n) => looksLikePaymentProof(n.body)))
      issues.push({ area: "payment", problem: "Deal marked won but no proof of payment logged", action: "log the proof of payment on the deal" });
  }

  return issues;
};
module.exports.looksLikeClientDetails = looksLikeClientDetails;
module.exports.looksLikePaymentProof = looksLikePaymentProof;
module.exports.findClientDetails = findClientDetails;
module.exports.isComplianceNote = isComplianceNote;
