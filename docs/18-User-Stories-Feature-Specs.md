<!--
  Render note: diagrams use Mermaid. View in VS Code preview with the Mermaid extension.
  Diagram style is parser-safe.
-->

<div align="center">

# Querify — User Stories and Feature Specifications

**Natural-Language Analytics Platform**

| | |
|---|---|
| **Document** | User Stories and Feature Specifications |
| **Owner** | Product |
| **Version** | 2.0 (Comprehensive Edition) |
| **Status** | Active |
| **Date** | 27 June 2026 |
| **Classification** | Confidential — Internal |
| **Audience** | Product, engineering, QA, new joiners |

</div>

---

## How to Read This Document

**In plain words.** A "user story" describes a feature from the user's point of view: *"As a [role], I want [capability], so that [benefit]."* Each story is followed by **acceptance criteria** — the concrete checks that prove the feature works. Everything here is **built and present** in the platform.

**Why it matters.** User stories keep features tied to real human needs, and acceptance criteria give everyone (product, engineering, testing) a shared, testable definition of "done."

```mermaid
flowchart LR
    ROLE[As a role] --> WANT[I want a capability] --> BENEFIT[So that I get a benefit]
    BENEFIT --> ACCEPT[Acceptance criteria prove it works]

    classDef a fill:#2563eb,stroke:#1e40af,color:#fff
    class ROLE,WANT,BENEFIT,ACCEPT a
```

### Feature Index

| # | Feature |
|---|---|
| 1 | Natural-Language Query |
| 2 | Data Upload and Connections |
| 3 | Reports and Dashboards |
| 4 | Governance — Glossary and Metrics |
| 5 | Automations — Schedules and Alerts |
| 6 | Collaboration |
| 7 | Plans and Billing |
| 8 | Administration |
| 9 | Public API and Embeds |

---

## Feature 1 — Natural-Language Query

**Stories.**

- As a **business user**, I want to ask a question in plain English, so that I get an answer without writing SQL.
- As a **skeptical decision-maker**, I want to see how the answer was reached, so that I can trust it.
- As an **analyst**, I want the system to verify its own result, so that errors are caught before I see them.

**Acceptance criteria.**

- A plain-English question returns a structured answer and a chart.
- A reasoning trace shows the steps and the generated query.
- The agent runs a verification turn before presenting the answer.
- If a query fails, the system attempts to self-correct.

**Why it matters.** This is the core promise of the product — the feature that everything else supports.

---

## Feature 2 — Data Upload and Connections

**Stories.**

- As a **user**, I want to upload a spreadsheet, so that I can analyse it immediately.
- As a **data owner**, I want to connect a live database, so that I can query current data.
- As a **security-conscious user**, I want my database credentials protected, so that they are never exposed.

**Acceptance criteria.**

- Uploaded files are analysed quickly (processed in the browser).
- A dozen database types can be connected.
- Connection credentials are encrypted at rest and redacted in responses.
- A connection can be tested, with clear, specific error messages.

**Why it matters.** Without easy, safe data connection, there is nothing to query. This feature is the on-ramp to the whole product.

---

## Feature 3 — Reports and Dashboards

**Stories.**

- As an **analyst**, I want the agent to build a report from a request, so that I save setup time.
- As a **viewer**, I want to open a report and see live charts, so that I stay informed.

**Acceptance criteria.**

- The agent can assemble a multi-panel report from a plain-English request.
- Panels render as charts and refresh against the bound data source.
- Reports are subject to plan limits.

**Why it matters.** Reports turn one-off questions into reusable, shareable dashboards — a key driver of ongoing engagement.

---

## Feature 4 — Governance: Glossary and Metrics

**Stories.**

- As an **analyst**, I want to define business terms once, so that the whole team gets consistent answers.
- As an **admin**, I want certified metrics, so that key numbers are calculated the same way everywhere.

**Acceptance criteria.**

- Glossary terms and certified metrics are shared at the organisation level.
- The agent uses these definitions to ground its answers.
- Both are subject to plan limits.

**Why it matters.** Governance is what makes the product trustworthy for a whole organisation, not just an individual — a key differentiator versus generic AI tools.

---

## Feature 5 — Automations: Schedules and Alerts

**Stories.**

- As an **analyst**, I want a query to run on a schedule, so that I get regular updates automatically.
- As a **manager**, I want an alert when a metric crosses a threshold, so that I react in time.

**Acceptance criteria.**

- A verified query can be scheduled at chosen intervals.
- An alert can be expressed in plain English and fires when its condition is met.
- A background process runs due schedules and evaluates alerts regularly.
- Both count toward the plan's automation limit.

**Why it matters.** Automations move the product from "answer on demand" to "watching your data for you" — increasing its value and stickiness.

---

## Feature 6 — Collaboration

**Stories.**

- As a **team member**, I want to comment on a report, so that we discuss findings in context.
- As an **owner**, I want to share a report via a link, so that others can view it.

**Acceptance criteria.**

- Comments can be added, and a mention notifies the teammate.
- Shareable links can be created and revoked.
- Sharing respects ownership and access rules.

**Why it matters.** Collaboration spreads the product within an organisation and turns individual insights into team decisions.

---

## Feature 7 — Plans and Billing

**Stories.**

- As a **user**, I want to upgrade my plan, so that I unlock higher limits.
- As a **finance-minded user**, I want to see my billing history, so that I can track payments.

**Acceptance criteria.**

- The upgrade flow collects payment and activates the plan automatically.
- Pricing is server-authoritative and cannot be tampered with.
- Billing history is visible.
- Plans downgrade automatically after a lapse, with a grace period.

**Why it matters.** This is the revenue engine. Reliable, tamper-proof billing is essential to the business model.

---

## Feature 8 — Administration

**Stories.**

- As an **admin**, I want to manage my team's roles, so that access is appropriate.
- As an **admin**, I want to suspend a user, so that I can revoke access immediately.

**Acceptance criteria.**

- Admins manage users within their own organisation only.
- Role and status changes are recorded in the audit log.
- A suspended user is blocked immediately, even with a valid session.

**Why it matters.** Administration gives organisations the control they need to adopt the product safely and at scale.

---

## Feature 9 — Public API and Embeds

**Stories.**

- As a **developer**, I want to query via an API, so that I can build on the platform.
- As an **owner**, I want to embed a public chat, so that others can ask questions of my data.

**Acceptance criteria.**

- API access is authenticated with a hashed key and is read-only.
- Public chats are rate-limited and budget-capped, with an owner kill-switch.
- Credentials are never exposed on public surfaces.

**Why it matters.** These surfaces turn Querify into a platform others build on — a growth channel beyond the core app.

---

## Glossary

| Term | Plain-words definition |
|---|---|
| **User story** | A feature described from the user's point of view |
| **Acceptance criteria** | The concrete checks that prove a feature works |
| **Role** | The type of user (business user, analyst, admin, developer) |
| **Reasoning trace** | The recorded steps showing how an answer was produced |
| **Certified metric** | An officially-defined calculation shared across a team |
| **Glossary term** | A shared business definition the agent uses |
| **Kill-switch** | A control to immediately disable a public deployment |
| **Read-only** | Able to view data but never change it |

---

<div align="center">

---

**Querify — User Stories and Feature Specifications v2.0 (Comprehensive Edition)**
Confidential — Internal Use Only · © 2026 Querify

</div>
