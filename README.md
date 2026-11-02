# No SOC for Mom 🛡️

> Enterprise-grade security operations for the people who need it most — your family.

**No SOC for Mom** brings enterprise SOC (Security Operations Center) principles to protecting your family. Suspicious messages, emails, and links are analyzed through automation and tiered AI agents, returning a clear verdict in plain language within seconds.

The least technical people in our lives deserve the protection enterprises take for granted — at near-zero cost, with no human analyst required.

## How It Works

```
Family member forwards a suspicious message/email/link
        │
        ▼
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  1. INTAKE      │───▶│  2. ENRICHMENT   │───▶│  3. TRIAGE       │───▶│  4. VERDICT     │
│  Telegram/email │    │  URL reputation,  │    │  Tiered AI       │    │  Plain-language │
│  webhook entry  │    │  domain age, IOC  │    │  agents (L1→L3)  │    │  answer in secs │
└─────────────────┘    └──────────────────┘    └──────────────────┘    └─────────────────┘
```

1. **Intake** — A family member forwards anything suspicious to a Telegram bot, email address, or shares a link. Zero-friction: no apps to learn, no forms to fill.
2. **Enrichment** — Automated lookups: URL reputation, domain age, sender history, known-scam databases, IOC feeds.
3. **Tiered AI Triage** — Like a real SOC:
   - **Tier 1 agent** — fast classification of obvious cases (cheap, fast model)
   - **Tier 2 agent** — deeper analysis of ambiguous cases (context, intent, social engineering patterns)
   - **Tier 3 agent** — final escalation for sophisticated threats (most capable model, full context)
4. **Verdict** — A clear answer in plain language, in seconds: *"🔴 This is a scam. Do not click. Delete it."* — with a one-line explanation anyone can understand, **in the user's own language**.

## What's In This Repo

| Folder | Contents |
|---|---|
| [workflows/phish-scam-detector/](workflows/phish-scam-detector/) | ✅ **The complete v1 pipeline** — Telegram and WhatsApp intake → enrichment (VirusTotal, RDAP, unshorten, screenshot) → tiered AI triage → Hebrew verdicts, with human-gated Tier 3 escalation. Import-ready. |
| [workflows/01-intake/](workflows/01-intake/) | n8n workflows for message/email/link ingestion (Telegram bot, email trigger, webhooks) |
| [workflows/02-enrichment/](workflows/02-enrichment/) | IOC enrichment: URL scanning, domain intel, reputation lookups |
| [workflows/03-triage-agents/](workflows/03-triage-agents/) | Tiered AI agent workflows (L1 → L2 → L3 escalation) |
| [workflows/04-verdict-delivery/](workflows/04-verdict-delivery/) | Plain-language verdict formatting and delivery back to the user |
| [prompts/](prompts/) | System prompts for each AI agent tier |
| [docs/](docs/) | Architecture, setup guides, threat model |
| [config/](config/) | Environment templates and configuration examples |
| [assets/](assets/) | Logos, diagrams, screenshots |

## Design Principles

- **Zero friction for the protected** — If Mom has to install something or learn a workflow, we've failed. Forward a message, get an answer.
- **Plain language always** — No jargon in verdicts. "This is a scam pretending to be your bank" beats "Phishing detected (confidence: 0.94)".
- **Speak their language** — The AI agents analyze and respond in the user's own language, whatever it is. Verdicts arrive in the language the report was sent in — English, Hebrew, Spanish, or any other language the family speaks.
- **Tiered cost efficiency** — Cheap/fast models handle the 90% of obvious cases; expensive models only see what actually needs them.
- **Near-zero cost** — Designed to run on a Raspberry Pi with free-tier APIs. Protecting family shouldn't cost enterprise money.
- **Fail safe, not silent** — If the pipeline can't reach a confident verdict, it says so and advises caution. Never a false "it's safe".

## Prerequisites

- [n8n](https://n8n.io/) instance (self-hosted; a Raspberry Pi works great)
- An LLM API key (Anthropic Claude recommended) for the triage agents
- Free-tier accounts for enrichment sources (e.g., VirusTotal, URLScan.io)
- A Telegram bot token (for the intake channel); optionally a Meta WhatsApp Cloud API app ([setup](docs/whatsapp-setup.md))

## Quick Start

> 🚧 Work in progress — workflows are being built and will land in `workflows/` with import-ready JSON.

1. Clone this repo
2. Copy `config/.env.example` to `.env` and fill in your API keys
3. Import the workflows from `workflows/` into your n8n instance (in order: intake → enrichment → triage → verdict)
4. Point your family's Telegram bot at the intake webhook
5. Test with a known-scam message before going live

## Status

✅ **v1 working** — the [Phish & Scam Detector](workflows/phish-scam-detector/) workflow is
live and battle-tested on a real family Telegram bot (Hebrew verdicts, Israeli scam landscape).

### Roadmap

- [x] Architecture doc & threat model
- [x] Intake: Telegram bot workflow
- [x] Intake: WhatsApp (Meta Cloud API) on the same workflow
- [x] Enrichment: URL/domain reputation workflow (VirusTotal, RDAP age, unshortening, screenshots)
- [x] Tier 1 triage agents (fast classification — phishing + scam-store)
- [x] Tier 3 escalation agents with human-in-the-loop cost approval
- [x] Verdict delivery with plain-language templates (Hebrew)
- [ ] Auto-detect report language and answer in it (currently Hebrew-tuned)
- [ ] Email intake channel
- [ ] End-to-end regression testing with real-world scam samples
- [ ] Setup guide for non-experts deploying for their own family

## Contributing

New investigations and fixes are welcome as pull requests; every change to `main` is reviewed and approved by the maintainer first. Read [CONTRIBUTING.md](CONTRIBUTING.md), especially the privacy checklist, before opening one. To report a weakness in the workflows privately, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
