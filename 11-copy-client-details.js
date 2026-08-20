// 11-copy-client-details.js — SCRIPT 11. THE ONE THAT FIXES INSTEAD OF ASKING.
//
// Consultants keep typing the client details into the CALL DESCRIPTION instead of a
// separate note, no matter how many times they are asked. So when the details are
// found in a call description and there is no client-details note on the deal yet,
// this copies them into a proper note on the deal.
//
// Safeguards:
//  - never runs in dry run
//  - never runs if a client-details note already exists (no duplicates)
//  - the copied note is clearly labelled with where it came from
//  - it is posted as Ali (the compliance lead), like every other automated note
//  - a marker line makes it recognisable so it is never copied twice
const { hub } = require("./0-hubspot");
const { SETTINGS } = require("./config");
const { findClientDetails } = require("./5-check-notes");

const MARKER = "Client details (copied from the call log)";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// already copied once? then leave it alone
const alreadyCopied = (d) => (d.notes || []).some((n) => String(n.body || "").includes(MARKER));

// dryRun = true reports what WOULD be copied without writing anything.
async function copyIfNeeded(d, ownerName, dryRun = false) {
  if (!SETTINGS.COPY_CLIENT_DETAILS_TO_NOTE) return null;
  if (!d.available.notes || !d.available.calls) return null;
  if (alreadyCopied(d)) return null;

  const found = findClientDetails(d);
  if (!found || found.where !== "call") return null;      // nothing to copy, or already a note
  if (dryRun) return { wouldCopy: true, chars: found.text.length };

  const dt = found.call?.when ? new Date(found.call.when).toISOString().slice(0, 10) : "";
  const lines = String(found.text).split(/\s*(?:\r?\n|\s\/\s)\s*/).filter(Boolean);
  const body =
    `<div><p style="margin:0;"><strong>${MARKER}</strong></p>` +
    `<p style="margin:0;color:#7c8aa5;font-size:12px;">Logged by ${esc(ownerName)}${dt ? ` on ${dt}` : ""}</p>` +
    `<p style="margin:0;">&nbsp;</p>` +
    lines.map((l) => `<p style="margin:0;">${esc(l.trim())}</p>`).join("") +
    `</div>`;

  await hub("POST", "/crm/v3/objects/notes", {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: body,
      hubspot_owner_id: String(SETTINGS.NOTE_OWNER_ID),
    },
    associations: [{ to: { id: String(d.id) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 214 }] }],
  });
  return { copied: true, chars: found.text.length };
}

module.exports = { copyIfNeeded, MARKER, alreadyCopied };
