# Architecture

> 🚧 Draft — evolves with the project.

## Pipeline Overview

The system mirrors a real SOC's tiered triage model, implemented entirely in n8n:

```
[Intake] → [Enrichment] → [Tier 1 Agent] → verdict?
                               │ (ambiguous)
                               ▼
                          [Tier 2 Agent] → verdict?
                               │ (sophisticated/conflicting signals)
                               ▼
                          [Tier 3 Agent] → verdict (always)
                               │
                               ▼
                        [Verdict Delivery]
```

## Stages

### 1. Intake (`workflows/01-intake/`)
Entry points for suspicious content:
- **Telegram bot** — primary channel. Family forwards messages/screenshots/links.
- **Email forward address** — forward suspicious emails as attachments to preserve headers.
- **Webhook** — generic entry for future channels (WhatsApp, SMS gateway).

Responsibilities: normalize input into a standard "case" object (source, content, URLs found, sender info, attachments), assign a case ID, deduplicate.

### 2. Enrichment (`workflows/02-enrichment/`)
Automated intel gathering per indicator:
- URL reputation (VirusTotal, URLScan.io)
- Domain age & registrar (young domains are a strong scam signal)
- Sender reputation / known-scam pattern databases
- IP reputation (AbuseIPDB) where applicable

Output: the case object annotated with enrichment verdicts and raw scores.

### 3. Tiered Triage (`workflows/03-triage-agents/`)
- **Tier 1** — fast, cheap model. Handles obvious cases (clear scam / clearly benign). Must return a confidence score; below threshold → escalate.
- **Tier 2** — mid-tier model with full enrichment context. Analyzes social engineering patterns, intent, impersonation.
- **Tier 3** — most capable model. Sees everything: raw content, all enrichment, Tier 1/2 reasoning. Always returns a final verdict.

Escalation contract: each tier either returns `{verdict, confidence, plain_language_explanation}` or escalates with its partial analysis attached.

### 4. Verdict Delivery (`workflows/04-verdict-delivery/`)
- Translates the verdict into plain language (templates in `prompts/`)
- Traffic-light format: 🔴 scam / 🟡 suspicious, be careful / 🟢 looks safe
- Always includes: what it is, why, and what to do next — in one or two sentences
- Delivered back on the same channel the report came from
- **Delivered in the user's language** — verdict language matches the language of the report (see Multilingual Support below)

## Multilingual Support

**Any language is supported.** The AI agents are natively multilingual — no per-language configuration is required.

- **Intake** detects the report language (from the message text and/or an optional per-user language preference stored with the allowed chat IDs).
- **Triage agents** are language-aware: scam analysis works on content in any language — including scams that mix languages (e.g., a Hebrew SMS linking to an English phishing page).
- **Verdicts** are always returned in the user's language. Plain-language rules apply in every language: no jargon, understandable by a non-technical 70-year-old.
- **Language-specific scam patterns**: agents apply regional context based on the detected language/locale (e.g., Israel Post / bank impersonation smishing in Hebrew; parcel/toll scams in English; BBVA/Correos impersonation in Spanish).
- RTL languages (Hebrew, Arabic) must render correctly in the delivery channel (Telegram handles RTL natively).

## Threat Model (summary)

Primary threats targeting non-technical family members:
1. **Phishing** — fake bank/delivery/government messages
2. **Smishing** — SMS-based lures (package delivery, toll fees, "mom I lost my phone")
3. **Romance & investment scams** — longer-con manipulation
4. **Tech support scams** — fake virus warnings, remote-access requests
5. **Malicious links/attachments** — credential harvesting, malware

## Cost Model

Target: near-zero monthly cost.
- Self-hosted n8n on existing hardware (Raspberry Pi)
- Free-tier enrichment APIs (rate limits are fine at family scale)
- Tiered LLM usage: ~90% of cases resolved at Tier 1 (cheapest model, minimal tokens)
