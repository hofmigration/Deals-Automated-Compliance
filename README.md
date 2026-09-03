# HubSpot Deal Compliance

Audits the sales deals your consultants worked, posts a note **from Ali** tagging the
consultant, assigns them a task, and emails them. Sibling to the contact compliance
pipeline. Runs on GitHub Actions — separate repo, its own schedule.

---

## The files

Repo root, except the workflow.

| File | What it does |
|---|---|
| `deal-compliance.js` | **the runner** |
| `config.js` | 47 consultants, 7 sales pipelines, all settings |
| `selftest.js` | the deal rules register (41 scenarios) |
| `0-hubspot.js` | API helpers, access self-test |
| `1-fetch-deals.js` | pulls the deals + calls, emails, tasks, notes, WhatsApp, contact |
| `2-check-closedate.js` | close date not in the past |
| `3-check-stage.js` | Won/Postponed/Lost reason |
| `4-check-task.js` | follow-up task |
| `5-check-notes.js` | client details note, proof of payment |
| `6-check-comms.js` | call / email / WhatsApp logging rules |
| `7-check-marketing.js` | contact Outcome, Age Range, Nationality |
| `8-check-pipeline.js` | AI: is the deal in the right pipeline |
| `9-note.js` | writes the note, tags the consultant, assigns the task |
| `package.json` | Node |
| `.github/workflows/deal-compliance.yml` | schedule + dropdowns |

Numbered names matter — the runner loads them by name.

---

## Scope

Only the **7 sales pipelines** are audited:

HOF Sales Pipeline - Canada & AUS · USA NIW Sales Pipeline · HOF Sales Pipeline (Visit) ·
HOF Sales - Work Permit · HOF Sales - Germany Opportunity Card · HOF Sales - Spain · HOF Student

Service pipelines, Work Permit Finland, Work Permit Norway and Referral are **not**
audited. Deals sitting on a service stage are skipped and counted separately.

**Stage matching:** the 7 sales stages exist twice in the portal with different IDs and
slightly different labels ("Expected Sales" vs "Expected Sale", "Postpone (No Specific
Date)" vs "Postponed"). Stages are matched on the **normalised label**, so both sets work.

---

## The rules

| Check | Rule |
|---|---|
| **Close date** | Must not be in the past. **Deal Lost is exempt.** |
| **Reason** | Postponed and Deal Lost must have a Won/Postponed/Lost reason, and it must **not** be `Opportunity`. |
| **Follow-up task** | An **open** task must be scheduled in every stage **except Deal Lost and Payment Made/Deal Won** (a closed sale has nothing left to chase). A completed task does not count, and an open task overdue by more than 2 days is flagged separately. Our `[Compliance]` tasks never count. |
| **Client details** | Full client details must be recorded (age, education, experience, family, reason). Free-form, so judged on substance. Searched in **four places**, because consultants use all of them. |
| **Proof of payment** | Required on **Payment Made/Deal Won** — the fee note with figures. |
| **Connected call** | Must have a brief description, and an **email** logged after it. **No WhatsApp needed.** |
| **WhatsApp timing** | When required, it must arrive within **24h** of the call. Spelling check is off. |
| **Not reached** (No answer, Busy, Left voicemail, Left live message, Wrong number) | Needs an **email AND a WhatsApp** logged after the call. |
| **Call logged** | A deal with no call logged at all is flagged. |
| **Marketing properties** | Contact Outcome must be `Deal Created`; Age Range marked (deal or contact); Nationality marked (contact). |
| **Pipeline** | AI check: does the pipeline match what was actually discussed in the emails and calls. |

Emails and WhatsApps only count when logged **after** the call, otherwise old activity
would satisfy today's call. Only the **3 most important** issues go in the note.

---

## Client details: four places, one destination

Consultants record the client details wherever is convenient. All four are searched, in
this order:

| Where | What happens |
|---|---|
| A note on the **deal** | correct — nothing to do |
| The **deal's** call description | copied onto the deal as a note |
| A note on the **contact** | copied onto the deal as a note |
| The **contact's** call log | copied onto the deal as a note |
| Nowhere | the consultant is asked for them |

Before this, only the deal was searched — so details written on the contact were reported
as missing, which is a false flag on work that had actually been done.

The copied note says where it came from, e.g. *"From a note on the contact, logged by
Ambreen Sayed on 2026-08-18"*, and is never copied twice.

**If the contact record cannot be read**, nothing is reported as missing. An unreadable
lookup is never treated as missing work.

Turn the contact search off with `CHECK_CONTACT_FOR_DETAILS: false`, or the copying with
`COPY_CLIENT_DETAILS_TO_NOTE: false` (which switches it back to asking instead).

## Running it

**Actions → Deal Compliance → Run workflow.** All dropdowns:

| Dropdown | Choices |
|---|---|
| Dry run | `true` = safe test · `false` = LIVE |
| Time window | Yesterday · Today so far · Last 3 / 7 / 14 / 30 days · **Any time (ignore window)** |
| Deal stage | `all` or one of the 7 sales stages |
| Close date | `all` · Overdue (in the past) · Today · This week · This month · Next month · Not set |
| Won/Postponed/Lost reason | `all` · Not set · any of the 14 reasons |
| How many deals | `all` · 25 / 50 / 100 / 250 / 500 |
| Consultant + 2 more | `all` · any of the 47 names |

**Pick "Any time" when scanning by close date, stage or reason** — otherwise the audit
still only looks at deals worked in the window. The stage, close date and reason filters
all run server-side in HubSpot, so targeted scans are fast even across every deal.

Useful combinations:

| Goal | Settings |
|---|---|
| Lost deals with no reason | Any time + Deal Lost + reason `Not set` |
| Opportunity used as a closing reason | Any time + Postponed + reason `Opportunity` |
| Stale close dates | Any time + close date `Overdue (in the past)` |
| Won deals with no proof of payment | Any time + Payment Made/Deal Won |

Careful: **Any time with no other filter pulls every deal**, so keep a limit set for that.

Scheduled daily at **10:20 AM PKT** — 20 minutes after the contact audit, so the two
don't compete for HubSpot rate limits.

**Read in the log:** the access table (anything BROKEN means a missing scope), the
WhatsApp visibility line, then the summary (by stage, by issue, per consultant, samples).

---

## Changing the rules

Every rule is a scenario in `selftest.js`. Run `node selftest.js` after any edit —
it reports `41 passed, 0 failed` and names anything that broke. The workflow runs it
before the audit, so a broken rule stops the run instead of posting bad notes.
Add the scenario at the same time as the rule.

## Going live

- **Manual run:** Dry run dropdown → `false`.
- **Daily run:** edit `config.js`, change the `: true` at the end of `DRY_RUN:` to `: false`.

Consultant emails need `hofmigration.com` verified in Resend (or switch to the Gmail
route used by the No Lead Stage agent). Task assignment needs `crm.objects.tasks.write`.

## Secrets

`HUBSPOT_TOKEN` · `GEMINI_KEY` · `RESEND_KEY`

## Assumptions to confirm

- Won/Postponed/Lost reason is required on **Postponed and Deal Lost only** (per your
  notes). Add `"WON"` to `REASON_REQUIRED_STAGES` if it should apply to won deals too.
- Client details note not required on **Deal Lost** (`DETAILS_NOTE_SKIP_STAGES`).
- Age Range accepted from **either** the deal or the contact.
