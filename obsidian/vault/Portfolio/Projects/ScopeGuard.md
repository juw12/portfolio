---
id: scopeguard
app: scopeguard
type: project
status: working-prototype
date: 2026-11-02
tags: [scopeguard, ai, guardrails, llm, abuse-prevention, analytics, pwa, vanilla-js, python]
links: ["https://juw12.github.io/projects/scopeguard/", "https://juw12.github.io/projects/scopeguard/", "https://juw12.github.io/projects/scopeguard/", "apps/scopeguard/"]
---

ScopeGuard sits between your users and your AI assistant and keeps it on its <strong>mission</strong>. Every message gets one of five decisions: <strong>allow</strong> on-mission requests, answer <strong>related</strong> ones briefly and steer back, <strong>redirect</strong> off-topic use without ever calling the LLM, <strong>throttle</strong> repeat offenders after a daily allowance, and <strong>block</strong> jailbreaks and prompt injection. The app runs the guard <strong>entirely in the browser</strong>: chat as different users, simulate traffic, and watch a dashboard of off-mission share, estimated LLM cost avoided, <strong>unmet-demand themes</strong> and flagged users. A review queue teaches the classifier instantly. Edit, import and export policies, with templates for a CAD copilot, a bank and an online store. An Accuracy page measures it on held-out test sets (85% served-vs-stopped on a never-tuned set) or your own cases. For production, the same engine ships as a <strong>self-hosted, standard-library Python server</strong> with a check API and an OpenAI-compatible proxy.

## App / Web / Mobile

- **App** — https://juw12.github.io/projects/scopeguard/
- **Web** — https://juw12.github.io/projects/scopeguard/
- **Mobile** — https://juw12.github.io/projects/scopeguard/

Monorepo: https://github.com/juw12/projects (`apps/scopeguard/`)
