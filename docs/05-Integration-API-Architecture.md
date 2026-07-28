<!--
  Render note: diagrams use Mermaid. View in VS Code preview (Ctrl+Shift+V) with
  the "Markdown Preview Mermaid Support" extension, or in GitHub/GitLab/Notion.
  Diagram style is parser-safe: no line-break tags, no emoji, no semicolons in
  labels, no nested subgraphs, no cylinder shapes.
-->

<div align="center">

# Querify — Integration and API Architecture

**Natural-Language Analytics Platform**

| | |
|---|---|
| **Document** | Integration and API Architecture |
| **Owner** | Engineering |
| **Version** | 2.0 (Comprehensive Edition) |
| **Status** | Pre-Launch Baseline |
| **Date** | 27 June 2026 |
| **Classification** | Confidential — Internal |
| **Audience** | Executives, engineers, integration partners, developers |

</div>

---

## How to Read This Document

Layered as usual: **In plain words** (anyone), **The detail** (engineers and partners), **Why it matters** (the practical value). Terms are defined on first use and gathered in the [Glossary](#11-glossary).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Key Concepts in Plain Words](#2-key-concepts-in-plain-words)
3. [Integration Landscape](#3-integration-landscape)
4. [External Integrations](#4-external-integrations)
5. [Supported Data Sources](#5-supported-data-sources)
6. [AI Model Providers](#6-ai-model-providers)
7. [The Internal API](#7-the-internal-api)
8. [The Public Developer API](#8-the-public-developer-api)
9. [The Embeddable Widget](#9-the-embeddable-widget)
10. [API Contracts at a Glance](#10-api-contracts-at-a-glance)
11. [Glossary](#11-glossary)

---

## 1. Executive Summary

**In plain words.** Querify's value comes from connecting things: the customer's data, an AI model, and a friendly, governed experience. It both *relies on* outside services (for login, payments, and AI) and *offers* its own ways for others to plug in (a developer API, an embeddable chat widget, and shareable public chat apps).

**The detail.** Integrations run in two directions:

- **Inbound** — services Querify depends on: identity (Clerk), payments (Cashfree), and AI providers.
- **Outbound** — Querify's own surfaces that others build on: the internal API (used by the app), the public REST API (key-authenticated), and embeddable artifacts.

**Why it matters.** Querify is provider-agnostic where it counts. It supports a dozen database types and multiple AI providers behind common interfaces, so a new source or model can be added without re-architecting the system.

> **Executive takeaway:** Querify both consumes best-in-class services and exposes its own capabilities outward, multiplying its value and its potential channels (API, embeds, public apps).

---

## 2. Key Concepts in Plain Words

| Concept | Plain-words explanation | Everyday analogy |
|---|---|---|
| **Integration** | Two systems working together | Two companies agreeing to share a delivery service |
| **API** | A defined way for programs to talk to each other | A restaurant menu: a fixed list of what you can order and how |
| **Inbound vs outbound** | Services Querify uses vs surfaces Querify offers | Ingredients you buy in vs dishes you serve out |
| **Adapter / abstraction** | A common interface that hides vendor differences | A universal power adapter that fits any country's socket |
| **API key** | A secret password for programs (not people) | A keycard that opens specific doors |
| **Embed / widget** | A piece of Querify placed inside another website | A YouTube video embedded in a blog post |

---

## 3. Integration Landscape

**In plain words.** Querify sits in the middle, connecting the customer's data sources on one side, the services it depends on on another, and the surfaces it offers outward on a third.

```mermaid
flowchart TB
    subgraph CORE[Querify Platform]
        direction TB
        APP[Browser App]
        API[Backend API]
    end

    subgraph INBOUND[Inbound Dependencies]
        direction TB
        CLERK[Clerk - Identity]
        CASH[Cashfree - Payments]
        AI[AI Model Providers]
    end

    subgraph DATA[Customer Data Sources]
        direction TB
        FILES[Uploaded Files]
        DBS[Live Databases]
    end

    subgraph OUTBOUND[Outbound Surfaces]
        direction TB
        PUBAPI[Public REST API]
        EMBED[Embeddable Widget]
        DEPLOY[Public Chat Apps]
    end

    APP --> API
    API --> CLERK
    API --> CASH
    APP --> AI
    API --> AI
    APP --> FILES
    API --> DBS
    API --> PUBAPI
    API --> EMBED
    API --> DEPLOY

    classDef core fill:#2563eb,stroke:#1e40af,color:#fff
    classDef in fill:#0d9488,stroke:#0f766e,color:#fff
    classDef data fill:#ea580c,stroke:#c2410c,color:#fff
    classDef out fill:#7c3aed,stroke:#5b21b6,color:#fff
    class APP,API core
    class CLERK,CASH,AI in
    class FILES,DBS data
    class PUBAPI,EMBED,DEPLOY out
```

**Why it matters.** This single picture explains the business model's reach: Querify is not a closed app — it is a hub with multiple ways to connect data in and push capability out.

---

## 4. External Integrations

**In plain words.** Querify leans on three specialist services so it does not have to build everything itself, and each one is connected securely.

**The detail.**

| Integration | Type | Purpose | Trust mechanism |
|---|---|---|---|
| **Clerk** | Identity (SaaS) | Login, sessions, single sign-on, user sync | Token signature verification; signed webhooks |
| **Cashfree** | Payments (SaaS) | Subscription checkout (INR) | Server-authoritative pricing; signed webhooks |
| **AI Providers** | Model APIs | Natural-language understanding and query generation | API keys (platform-managed or user-supplied) |
| **Customer Databases** | Data sources | Live querying | Encrypted credentials; read-only validation |

```mermaid
sequenceDiagram
    participant APP as Querify
    participant CLERK as Clerk
    participant CASH as Cashfree

    Note over APP,CLERK: Identity lifecycle
    APP->>CLERK: verify a session token
    CLERK-->>APP: identity confirmed
    CLERK->>APP: user-updated webhook - signed

    Note over APP,CASH: Payment lifecycle
    APP->>CASH: create a checkout order
    CASH-->>APP: a payment session
    CASH->>APP: payment-success webhook - signed
    APP->>APP: verify and upgrade the plan - idempotent
```

**Why it matters.** Building secure login and payments from scratch is expensive and risky. Delegating to specialists lets the team focus on the product's unique value — natural-language analytics — while still meeting a high security bar.

---

## 5. Supported Data Sources

**In plain words.** Querify can connect to many kinds of databases, plus uploaded files. The rest of the system does not need to know which kind it is talking to, thanks to a common "translator" layer.

```mermaid
flowchart LR
    AGENT[Agent and Query Runner] --> ADAPTER[Common Database Adapter]
    ADAPTER --> PG[PostgreSQL]
    ADAPTER --> MY[MySQL and MariaDB]
    ADAPTER --> MS[SQL Server]
    ADAPTER --> OR[Oracle]
    ADAPTER --> SF[Snowflake]
    ADAPTER --> BQ[BigQuery]
    ADAPTER --> RS[Redshift]
    ADAPTER --> DBX[Databricks]
    ADAPTER --> CH[ClickHouse]
    ADAPTER --> LT[SQLite and DuckDB]

    classDef core fill:#7c3aed,stroke:#5b21b6,color:#fff
    classDef ad fill:#2563eb,stroke:#1e40af,color:#fff
    classDef db fill:#0d9488,stroke:#0f766e,color:#fff
    class AGENT core
    class ADAPTER ad
    class PG,MY,MS,OR,SF,BQ,RS,DBX,CH,LT db
```

**The detail.**

| Category | Supported types |
|---|---|
| Cloud warehouses | Snowflake, BigQuery, Redshift, Databricks |
| Relational | PostgreSQL, MySQL, MariaDB, SQL Server, Oracle |
| Analytical and local | ClickHouse, SQLite, DuckDB |
| Files | CSV, Excel (processed in the browser) |

All live queries are **read-only by enforcement** — the validator permits only SELECT/WITH and blocks every write or schema-changing operation.

**Why it matters.** Broad source support widens the addressable market: almost any organisation can connect the database it already has. The common adapter means adding the next database type is a contained change, not a rewrite.

> **What is an "adapter"?** Different databases speak slightly different dialects. An adapter is a translator that lets the rest of Querify issue one kind of request and have it work everywhere — like a travel adapter that lets one charger work in any country.

---

## 6. AI Model Providers

**In plain words.** Querify is not tied to a single AI company. It can route requests to whichever model is best or most cost-effective, and paid users can even bring their own AI account.

```mermaid
flowchart TB
    AGENT[Agent Engine] --> ROUTER[Provider Router]
    ROUTER --> P1[OpenAI]
    ROUTER --> P2[Anthropic]
    ROUTER --> P3[AWS Bedrock]
    ROUTER --> P4[Google]
    ROUTER --> P5[Others - Mistral, Cohere, DeepSeek, Hugging Face, Alibaba]

    NOTE[Free tier uses platform-managed models. Paid users may supply their own keys.]

    classDef core fill:#7c3aed,stroke:#5b21b6,color:#fff
    classDef router fill:#2563eb,stroke:#1e40af,color:#fff
    classDef prov fill:#0d9488,stroke:#0f766e,color:#fff
    classDef note fill:#f1f5f9,stroke:#94a3b8,color:#1e293b
    class AGENT core
    class ROUTER router
    class P1,P2,P3,P4,P5 prov
    class NOTE note
```

**The detail.**

| Aspect | Detail |
|---|---|
| Providers | OpenAI, Anthropic, AWS Bedrock, Google, Mistral, Cohere, DeepSeek, Hugging Face, Alibaba |
| Free tier | Served by platform-managed models, with a daily token allowance |
| Bring-your-own-key | Paid users may configure their own provider keys |
| Routing | A provider router hides the differences between each vendor's API |

**Why it matters.** Model independence protects the business from any single vendor's price rises, outages, or policy changes, and lets Querify always use the best tool for the job. It also controls cost: the free tier uses managed models, while heavy users can bring their own.

---

## 7. The Internal API

**In plain words.** This is the private set of doorways the Querify app itself uses. It is organised by capability and is not meant for outside developers.

```mermaid
flowchart TB
    APIC[API Client - attaches the identity token] -->|HTTPS plus token| MODULES

    subgraph MODULES[Internal API Modules]
        direction TB
        M1[Identity and Settings]
        M2[Datasets and Connections]
        M3[Live Query]
        M4[Plans and Payments]
        M5[Governance - Glossary, Metrics, Audit]
        M6[Automations - Schedules, Alerts]
        M7[Reports and Collaboration]
        M8[Admin]
    end

    classDef client fill:#2563eb,stroke:#1e40af,color:#fff
    classDef mod fill:#7c3aed,stroke:#5b21b6,color:#fff
    class APIC client
    class M1,M2,M3,M4,M5,M6,M7,M8 mod
```

**The detail.**

| Convention | Detail |
|---|---|
| Protocol | HTTPS, JSON request and response |
| Authentication | An identity token on every request |
| Methods | Standard verbs: read, create, update, remove |
| Errors | A consistent JSON error shape with appropriate status codes |
| Rate limiting | Applied per route group, tighter on sensitive endpoints |

**Why it matters.** A consistent internal API makes the app reliable and quick to extend. Because it is separate from the public API, the team can change it freely without breaking external developers.

---

## 8. The Public Developer API

**In plain words.** Querify offers a small, stable set of doorways for other developers' programs, protected by an API key. They can ask questions, run read-only queries, and list their data sources.

```mermaid
sequenceDiagram
    actor DEV as Developer
    participant API as Public API v1
    participant RUN as Query Runner
    participant SRC as Data Source

    DEV->>API: request with an API key
    API->>API: validate the key by its hash
    API->>API: check rate limit and metering
    API->>RUN: run a verified read-only query
    RUN->>SRC: execute
    SRC-->>RUN: rows
    RUN-->>API: result
    API-->>DEV: JSON result
```

**The detail.**

| Capability | Description |
|---|---|
| Natural-language query | Submit a question and a target source; receive a structured answer |
| Direct SQL | Submit a read-only SQL statement against a connection |
| List datasets | Retrieve the caller's datasets |
| List connections | Retrieve the caller's connections (no credentials returned) |

| Property | Detail |
|---|---|
| Authentication | API key in the request header; stored only as a hash |
| Versioning | Path-versioned (v1), so future changes do not break existing callers |
| Rate limiting | A dedicated, tighter limit (each call may invoke a model) |
| Metering | Usage recorded per call for plan accounting |

**Why it matters.** A public API turns Querify from an app into a platform. Other teams can embed analytics into their own products, which is both a growth channel and a stickiness factor.

> **Why is the public API versioned?** Putting "v1" in the address means that when Querify needs to make a breaking change, it can release "v2" while leaving "v1" working. Existing integrations keep running and upgrade on their own schedule.

---

## 9. The Embeddable Widget

**In plain words.** A Querify user can publish a public chat app — for example on their website — that lets anyone ask questions of a chosen dataset. Strong guard-rails stop this from being abused or running up costs.

```mermaid
flowchart LR
    BUILD[Querify user builds and deploys a public chat] --> PUB[Public chat endpoint]
    VISITOR[Anonymous visitor asks a question] --> PUB
    PUB --> BUDGET[Daily token budget plus kill-switch]
    BUDGET -->|within budget| ANSWER[Answer returned]
    BUDGET -->|over budget| LIMIT[Friendly limit message]

    classDef owner fill:#2563eb,stroke:#1e40af,color:#fff
    classDef pub fill:#dc2626,stroke:#991b1b,color:#fff
    classDef qf fill:#7c3aed,stroke:#5b21b6,color:#fff
    classDef ok fill:#16a34a,stroke:#15803d,color:#fff
    class BUILD owner
    class VISITOR pub
    class PUB,BUDGET qf
    class ANSWER,LIMIT ok
```

**The detail.**

| Protection | Why it matters |
|---|---|
| Per-deployment daily token budget | Bounds cost even if anonymous traffic is spread across many sources |
| Owner kill-switch | A disabled deployment cannot spend the owner's AI quota |
| Read-only enforcement | Public users can only read, never modify, the underlying data |
| Credential scrubbing | Connection credentials are never exposed on the public surface |

**Why it matters.** Public, anonymous surfaces are inherently risky (cost and abuse). Querify's budget caps, kill-switch, and read-only enforcement let users share safely without fear of a surprise bill or a data leak.

> **Worked example.** A consultant publishes a public chat over a market-research dataset for a client. Hundreds of anonymous visitors use it. The per-deployment daily budget ensures the consultant's AI costs stay capped; once the budget is reached, visitors see a polite "daily limit reached" message instead of running up an unbounded bill.

---

## 10. API Contracts at a Glance

**In plain words.** A "contract" is the promise an API makes about how it behaves. Querify has four kinds, each with a different audience and stability promise.

```mermaid
flowchart TB
    C1[Internal API - flexible, app-coupled]
    C2[Public API v1 - versioned, stable]
    C3[Public chat - anonymous, protected]
    C4[Webhooks inbound - signed, provider-defined]

    classDef c fill:#7c3aed,stroke:#5b21b6,color:#fff
    class C1,C2,C3,C4 c
```

**The detail.**

| Surface | Audience | Authentication | Stability |
|---|---|---|---|
| Internal API | The Querify browser app | Identity token | Evolves with the app |
| Public API v1 | External developers | API key | Versioned and stable |
| Public chat endpoints | Anonymous end users | None (rate-limited and budgeted) | Stable |
| Webhooks (inbound) | Clerk, Cashfree | Signature verification | Provider-defined |

**Why it matters.** Being explicit about which surfaces are stable (public API, public chat) versus free to change (internal API) protects external integrators from surprise breakages while letting the team move fast internally.

---

## 11. Glossary

| Term | Plain-words definition |
|---|---|
| **Integration** | Two systems working together |
| **API** | A defined way for programs to talk to each other |
| **REST API** | A common style of web API using standard web requests |
| **Inbound dependency** | An outside service that Querify relies on |
| **Outbound surface** | A way Querify lets others connect to it |
| **Adapter / abstraction** | A common interface that hides differences between vendors |
| **API key** | A secret credential for programs (not people) |
| **Versioning** | Labelling an API (v1, v2) so changes do not break existing users |
| **Webhook** | An automatic message a service sends when an event happens |
| **Embed / widget** | A piece of Querify placed inside another website |
| **Token budget** | A cap on how much AI usage a public chat can consume |
| **Kill-switch** | A control to immediately disable a public deployment |
| **Read-only** | Able to view data but never change it |

---

<div align="center">

---

**Querify — Integration and API Architecture v2.0 (Comprehensive Edition)**
Confidential — Internal Use Only · © 2026 Querify

</div>
