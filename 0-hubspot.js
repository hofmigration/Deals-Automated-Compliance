// 0-hubspot.js — shared HubSpot helpers for the deal audit.
// RULE: a lookup that FAILS must never look like "no data". Association reads
// report {ids, ok}; when ok is false the checks stay silent.
const TOKEN = process.env.HUBSPOT_TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hub(method, path, body) {
  const url = `https://api.hubapi.com${path}`;
  for (let a = 0; a < 6; a++) {
    const res = await fetch(url, {
      method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await sleep(2000 * (a + 1)); continue; }
    if (!res.ok) { const t = await res.text(); const e = new Error(`${method} ${path} -> ${res.status}: ${t.slice(0, 200)}`); e.status = res.status; throw e; }
    return res.status === 204 ? null : res.json();
  }
  throw new Error(`rate-limited: ${method} ${path}`);
}

const warned = new Set();
function warnOnce(type, msg) {
  if (warned.has(type)) return;
  warned.add(type);
  console.log(`!! LOOKUP FAILED for "${type}" — ${msg}`);
  console.log(`   Deals will NOT be flagged for missing ${type} while this is broken.`);
}

const ALIASES = { communications: ["communications", "0-18", "communication"] };
const workingAlias = {};

async function assocIds(fromType, objectId, toType) {
  const names = workingAlias[toType] ? [workingAlias[toType]] : (ALIASES[toType] || [toType]);
  let lastErr, anyOk = false;
  for (const name of names) {
    for (const version of ["v4", "v3"]) {
      try {
        const d = await hub("GET", `/crm/${version}/objects/${fromType}/${objectId}/associations/${name}?limit=200`);
        anyOk = true;
        const ids = (d.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
        if (ids.length) { workingAlias[toType] = name; return { ids, ok: true, via: name }; }
      } catch (e) { lastErr = e; }
    }
  }
  if (anyOk) return { ids: [], ok: true, via: names[0] };
  warnOnce(toType, lastErr?.message || "unknown error");
  return { ids: [], ok: false, error: lastErr?.message };
}

async function batchRead(objectType, ids, properties) {
  if (!ids.length) return { records: [], ok: true };
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const d = await hub("POST", `/crm/v3/objects/${objectType}/batch/read`, { properties, inputs: ids.slice(i, i + 100).map((id) => ({ id: String(id) })) });
      out.push(...(d.results || []));
    } catch (e) { warnOnce(`${objectType} (read)`, e.message); return { records: out, ok: false }; }
  }
  return { records: out, ok: true };
}

// Reads a picklist property's value -> label map (deal stages, call outcomes, ...)
async function optionLabels(objectType, property) {
  try {
    const p = await hub("GET", `/crm/v3/properties/${objectType}/${property}`);
    const m = {}; for (const o of p.options || []) m[o.value] = o.label; return m;
  } catch (e) { console.log(`Could not read ${objectType}.${property}: ${e.message}`); return {}; }
}

async function preflight(sampleDealId) {
  console.log(`\n--- checking access (sample deal ${sampleDealId}) ---`);
  const status = {};
  for (const type of ["calls", "emails", "tasks", "notes", "communications", "contacts"]) {
    const r = await assocIds("deals", sampleDealId, type);
    status[type] = r.ok;
    console.log(`  ${r.ok ? "OK     " : "BROKEN "} ${type}${r.ok ? ` (${r.ids.length} linked${r.via && r.via !== type ? `, via "${r.via}"` : ""})` : ""}`);
  }
  const broken = Object.entries(status).filter(([, ok]) => !ok).map(([t]) => t);
  if (broken.length) {
    console.log(`\n  WARNING: ${broken.join(", ")} could not be read. Add the matching read`);
    console.log(`  scopes to the private app, then re-run. Dependent checks are OFF this run.`);
  }
  console.log("");
  return status;
}

function daysAgoPkt(ms, tz = 5) {
  if (!ms) return Infinity;
  const off = tz * 3600 * 1000;
  const dayOf = (t) => Math.floor((t + off) / 86400000);
  return dayOf(Date.now()) - dayOf(ms);
}
const startOfTodayPkt = (tz = 5) => {
  const off = tz * 3600 * 1000;
  const n = new Date(Date.now() + off);
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - off;
};

const newestFirst = (a) => a.slice().sort((x, y) => Date.parse(y.properties.hs_timestamp || 0) - Date.parse(x.properties.hs_timestamp || 0));
const strip = (h) => (h || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

module.exports = { hub, assocIds, batchRead, optionLabels, preflight, daysAgoPkt, startOfTodayPkt, newestFirst, strip };
