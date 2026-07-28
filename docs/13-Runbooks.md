<!--
  Render note: diagrams use Mermaid. View in VS Code preview (Ctrl+Shift+V) with
  the "Markdown Preview Mermaid Support" extension, or in GitHub/GitLab/Notion.
  Diagram style is parser-safe: no line-break tags, no emoji, no semicolons in
  labels, no nested subgraphs, no cylinder shapes.
-->

<div align="center">

# Querify — Operational Runbooks

**Natural-Language Analytics Platform**

| | |
|---|---|
| **Document** | Operational Runbooks |
| **Owner** | Engineering / DevOps |
| **Version** | 2.0 (Comprehensive Edition) |
| **Status** | Active |
| **Date** | 27 June 2026 |
| **Classification** | Confidential — Internal |
| **Audience** | On-call engineers, support, operations |

</div>

---

## What a Runbook Is (In Plain Words)

**In plain words.** A runbook is a recipe for a specific emergency: "if you see X, do these steps." It is written to be followed by someone under pressure, possibly half-asleep at 2am, who needs to act correctly without having to think it all through from scratch.

**Why it matters.** Runbooks turn rare, stressful situations into repeatable procedures. They capture hard-won knowledge so that any team member — not just the original author — can resolve a problem quickly and safely.

**How to use a runbook.** Find the symptom in the index, jump to that runbook, follow the steps in order, and use the diagram to decide between branches. Each runbook states the **symptom**, the **likely cause**, and the **resolution**.

### Index

| # | Scenario | Severity |
|---|---|---|
| 1 | Users cannot log in | SEV-1/2 |
| 2 | Payments or upgrades failing | SEV-1/2 |
| 3 | Payment webhook not updating plans | SEV-2 |
| 4 | A user cannot create a resource | SEV-3 |
| 5 | Live database connection fails | SEV-3 |
| 6 | Slow first response after idle | SEV-3 |
| 7 | A bad release reached production | SEV-1/2 |
| 8 | Suspected secret exposure | SEV-1 |
| 9 | Suspend a user immediately | SEV-2 |
| 10 | Scheduled reports or alerts not running | SEV-3 |

---

## Runbook 1 — Users Cannot Log In

**Symptom.** Logins fail across many users.

```mermaid
flowchart TB
    SYM[Symptom - logins fail across users] --> C1{Backend rejecting tokens}
    C1 -->|Yes| FIX1[Check the identity secret is set correctly in the backend]
    C1 -->|No| C2{Identity provider outage}
    C2 -->|Yes| FIX2[Monitor the provider status and communicate]
    C2 -->|No| FIX3[Check the recent deploy and roll back if needed]

    classDef sym fill:#dc2626,stroke:#991b1b,color:#fff
    classDef gate fill:#ea580c,stroke:#c2410c,color:#fff
    classDef fix fill:#2563eb,stroke:#1e40af,color:#fff
    class SYM sym
    class C1,C2 gate
    class FIX1,FIX2,FIX3 fix
```

| Likely cause | Resolution |
|---|---|
| Backend has the wrong or missing identity secret (test key in production, or unset) | Confirm the live identity secret is set in the backend and matches the live identity instance; re-deploy |
| Identity provider outage | Confirm via the provider status page; communicate to users; wait for recovery |
| A recent deploy broke authentication | Roll back to the last good release |

> **Known pattern (why this happens):** Login breaks if the backend runs with a *test* identity key while the frontend uses the *live* one. The two must be from the same identity instance. This is the single most common login failure.

---

## Runbook 2 — Payments or Upgrades Failing

**Symptom.** The upgrade button errors, or checkout fails.

```mermaid
flowchart TB
    SYM[Symptom - upgrade errors] --> C1{Payments configured}
    C1 -->|No| FIX1[Set the payment keys in the backend and re-deploy]
    C1 -->|Yes| C2{Environment matches key type}
    C2 -->|No| FIX2[Align the environment setting with the key type]
    C2 -->|Yes| FIX3[Check provider status and recent changes]

    classDef sym fill:#dc2626,stroke:#991b1b,color:#fff
    classDef gate fill:#ea580c,stroke:#c2410c,color:#fff
    classDef fix fill:#2563eb,stroke:#1e40af,color:#fff
    class SYM sym
    class C1,C2 gate
    class FIX1,FIX2,FIX3 fix
```

| Likely cause | Resolution |
|---|---|
| Payment keys not set | A "payments not available" message means the backend lacks payment keys; set them and re-deploy |
| Environment and key mismatch | A "bad gateway" or "authentication failed" at checkout means the environment setting (test versus live) does not match the key type; align them and re-deploy |
| Provider issue | Check the payment provider's status |

> **Known pattern:** Test keys with the environment set to live (or vice versa) cause an authentication failure. They must match exactly.

---

## Runbook 3 — Payment Webhook Not Updating Plans

**Symptom.** A user paid, but their plan did not upgrade automatically.

```mermaid
flowchart LR
    PAID[User paid] --> CHECK{Webhook reaching us}
    CHECK -->|No| REGISTER[Confirm the webhook URL is registered with the provider]
    CHECK -->|Yes but rejected| SIG[Signature failing - confirm the secret and raw-body handling]
    CHECK -->|Yes and accepted| VERIFY[The verify path reconciles on the next check]

    classDef a fill:#2563eb,stroke:#1e40af,color:#fff
    classDef gate fill:#ea580c,stroke:#c2410c,color:#fff
    class PAID a
    class CHECK gate
    class REGISTER,SIG,VERIFY a
```

| Likely cause | Resolution |
|---|---|
| Webhook URL not registered | Register the webhook endpoint in the provider dashboard |
| Signature verification failing | Confirm the signing secret is correct; the webhook must read the raw request body |
| Transient miss | The verification path reconciles the payment when the user returns; confirm the plan updates |

> **Safety net:** Plan upgrades are idempotent and reconciled by both the webhook and a verification check, so a single missed webhook does not lose the payment.

---

## Runbook 4 — A User Cannot Create a Resource

**Symptom.** A user sees a "limit reached" message.

| Likely cause | Resolution |
|---|---|
| Plan limit reached | Expected behaviour — the user is at their plan's cap for that resource. Advise an upgrade, or confirm their plan tier |
| Plan not reflecting a recent upgrade | Confirm the upgrade applied; the plan refreshes after payment verification |

> Usually no action is needed — this is the plan-limit system working as designed.

---

## Runbook 5 — Live Database Connection Fails

**Symptom.** A connection test fails.

```mermaid
flowchart TB
    SYM[Connection test fails] --> CAUSE{Error type}
    CAUSE -->|Host not found| H[Wrong hostname]
    CAUSE -->|Refused| P[Wrong port or remote access disabled]
    CAUSE -->|Timed out| F[Firewall or security group]
    CAUSE -->|Access denied| CR[Wrong username or password]

    classDef sym fill:#dc2626,stroke:#991b1b,color:#fff
    classDef gate fill:#ea580c,stroke:#c2410c,color:#fff
    classDef fix fill:#2563eb,stroke:#1e40af,color:#fff
    class SYM sym
    class CAUSE gate
    class H,P,F,CR fix
```

| Cause | Resolution |
|---|---|
| Host not found | The hostname is wrong; correct it |
| Connection refused | Check the port and that the database accepts remote connections |
| Timed out | Check firewall and security-group rules allow the connection |
| Access denied | Check the username and password |

> The platform already returns these as friendly, specific messages, so the user usually self-serves. Recommend a read-only, least-privilege database user.

---

## Runbook 6 — Slow First Response After Idle

**Symptom.** The first request after a quiet period is slow.

| Cause | Resolution |
|---|---|
| Serverless cold start | Expected for the first request after idle; a keep-alive routine reduces this. If persistently slow, review function memory and the keep-alive cadence |

> This is normal serverless behaviour, not a fault. Subsequent requests are fast.

---

## Runbook 7 — A Bad Release Reached Production

**Symptom.** A new release is causing errors.

```mermaid
flowchart LR
    BAD[Bad release detected] --> SEV{Severity}
    SEV -->|Critical| RB[Roll back immediately]
    SEV -->|Minor| FF[Forward-fix in the next release]
    RB --> VERIFY[Verify recovery]

    classDef bad fill:#dc2626,stroke:#991b1b,color:#fff
    classDef gate fill:#ea580c,stroke:#c2410c,color:#fff
    classDef act fill:#2563eb,stroke:#1e40af,color:#fff
    classDef ok fill:#16a34a,stroke:#15803d,color:#fff
    class BAD bad
    class SEV gate
    class RB,FF act
    class VERIFY ok
```

| Step | Action |
|---|---|
| Assess | Decide critical (roll back) versus minor (forward-fix) |
| Roll back frontend | Redeploy the last good build in the hosting console |
| Roll back backend | Re-deploy from the last good commit or previous stack version |
| Verify | Health check and smoke test |

See the CI/CD document for full rollback detail.

---

## Runbook 8 — Suspected Secret Exposure

**Symptom.** A secret key may have leaked.

| Step | Action |
|---|---|
| Contain | Restrict access to the affected system |
| Rotate | Rotate the exposed secret immediately (see the Incident Response Plan) |
| Assess | Use the audit log to determine exposure |
| Remediate | Fix how the secret leaked; confirm it is not in source or logs |

> Mind the at-rest encryption key caveat — it cannot be casually rotated without re-encrypting stored credentials.

---

## Runbook 9 — Suspend a User Immediately

**Symptom.** A user must be blocked right away.

| Step | Action |
|---|---|
| Suspend | An admin sets the user's status to suspended in the admin area |
| Effect | The suspension takes effect within seconds — the user is blocked even with a valid session token |
| Verify | Confirm the user can no longer access the API |

> The platform blocks suspended users at the authentication layer, with a short cache that is cleared immediately on suspension.

---

## Runbook 10 — Scheduled Reports or Alerts Not Running

**Symptom.** Schedules or alerts are not firing.

```mermaid
flowchart TB
    SYM[Schedules or alerts not firing] --> C1{Scheduler running}
    C1 -->|No| FIX1[Check the scheduled function and its timer]
    C1 -->|Yes| C2{Items due and enabled}
    C2 -->|No| FIX2[Confirm the schedule is enabled and due]
    C2 -->|Yes| FIX3[Check the run logs for errors]

    classDef sym fill:#dc2626,stroke:#991b1b,color:#fff
    classDef gate fill:#ea580c,stroke:#c2410c,color:#fff
    classDef fix fill:#2563eb,stroke:#1e40af,color:#fff
    class SYM sym
    class C1,C2 gate
    class FIX1,FIX2,FIX3 fix
```

| Cause | Resolution |
|---|---|
| Scheduler not invoking | Confirm the scheduled function and its timer are active |
| Nothing due | Confirm the schedule is enabled and its next-run time has passed |
| Runs failing | Check the run logs for the specific error (often a data or query issue) |

---

## Glossary

| Term | Plain-words definition |
|---|---|
| **Runbook** | A step-by-step guide for a specific problem |
| **Symptom** | The observable sign that something is wrong |
| **Rollback** | Returning to the previous good version |
| **Cold start** | The brief delay when a serverless function wakes from idle |
| **Webhook** | An automatic message from another service |
| **Idempotent** | Running an action twice has the same effect as once |
| **Least-privilege** | Granting only the minimum access needed |
| **Secret rotation** | Replacing a secret key with a new one |
| **Token** | A temporary pass proving a user is logged in |

---

<div align="center">

---

**Querify — Operational Runbooks v2.0 (Comprehensive Edition)**
Confidential — Internal Use Only · © 2026 Querify

</div>
