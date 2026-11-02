# Phish & Scam Detector

The complete v1 pipeline of **No SOC for Mom** in a single n8n workflow (40 nodes). A family
member forwards a suspicious SMS or a store link to a Telegram bot or a WhatsApp number and gets a plain-language
Hebrew verdict back in seconds — with optional human-approved escalation to a stronger model
for hard cases.

## Two Pipelines in One Workflow

Two triggers (Telegram and WhatsApp) feed one `Report` node that normalizes the message, so the rest of the workflow is channel-agnostic. Replies go back on the channel the report came from. WhatsApp setup: [docs/whatsapp-setup.md](../../docs/whatsapp-setup.md).

The entry **Switch** routes by message shape:

### 1. SMS / Phishing pipeline (message contains text + link)
```
Telegram → Verify Access → Extract URLs → Unshorten → VirusTotal (URL)
        → Tier 1 Agent (Haiku) ──┬── verdict → HTML-safe format → Telegram reply
                                 └── ⚪ inconclusive → human-gated approval → Tier 3 Agent (Opus) → reply
        (in parallel: thum.io screenshot of the page → sent as photo)
```

### 2. Website / Scam-store pipeline (message is a bare URL)
```
Telegram → Verify Access → Normalize URL (SSRF guard) → Fetch HTML → Signal Extractor
        → RDAP domain age → VirusTotal (domain)
        → Tier 1 Scam Agent (Haiku) ──┬── verdict → format → Telegram reply
                                      └── ⚪ / price-check → human-gated approval → Tier 3 Scam Agent (Opus + web search) → reply
```

Detects: phishing, fraud stores, and **overpriced dropshipping** (AI product images, fake
stats, fake urgency, ™-branded generic goods — with legitimacy guards to avoid false
positives on real retailers).

## Key Design Features

- **Tiered cost model** — Haiku handles ~90% of cases; Opus only runs after the family member
  approves the extra cost via Telegram buttons (human-in-the-loop `telegramHitlTool`).
- **Prompt-injection hardening** — all evidence blocks (VT data, SMS text, page HTML signals)
  are declared DATA-not-instructions in every agent prompt.
- **SSRF guard** — the URL normalizer refuses to fetch localhost/private-range/bare-IP hosts.
- **Telegram-safe output** — a deterministic formatter strips leaked reasoning and escapes
  HTML so a malformed model reply can't break message delivery.
- **Defanged IOCs** — verdicts show `hxxps` / `example[.]com` so nobody accidentally clicks.

## Setup

### 1. Import
n8n → **Workflows → Import from File** → select `phish-scam-detector.json`.

### 2. Create credentials and attach them
The export ships **without credentials**. Attach yours to these nodes:

| Credential type | Nodes | Notes |
|---|---|---|
| **Telegram API** | Telegram Trigger, Send a text message, Send a text message1, Send a text message2, Send a photo message, User Escalation Approval, User Escalation Approval1 | Create a bot via [@BotFather](https://t.me/BotFather) |
| **Anthropic API** | Anthropic Chat Model, Anthropic Chat Model1, Anthropic Chat Model2, Anthropic Chat Model3 | [console.anthropic.com](https://console.anthropic.com) |
| **VirusTotal API** | VirusTotal HTTP Request, VirusTotal HTTP Request1 | Free tier is enough at family scale |
| **WhatsApp OAuth API** + **WhatsApp API** (optional) | WhatsApp Trigger; WhatsApp deny, WhatsApp screenshot, WhatsApp verdict (Phish), WhatsApp verdict (Scam) | Meta Cloud API. The trigger ships disabled, see [docs/whatsapp-setup.md](../../docs/whatsapp-setup.md) |

Keyless services used (no signup): `unshorten.me`, `image.thum.io`, `rdap.org`.

### 3. Set your family allowlist  ⚠️ REQUIRED
Open the **Verify Access** and **Verify Access1** Code nodes and replace the placeholder IDs
with your family's numeric Telegram user IDs and, if you use WhatsApp, their numbers (international format, digits only):

```js
const ALLOWED = {
  telegram: [11111111, 22222222, 33333333],        // ← replace these
  whatsapp: ['9725XXXXXXX1', '9725XXXXXXX2'],     // ← and these
};
```

Find an ID by messaging [@userinfobot](https://t.me/userinfobot) on Telegram. Anyone not on
the list gets a "private bot" refusal.

### 4. Activate & test
1. Activate the workflow.
2. Send the bot a fake-but-safe test, e.g. a message with a link to a known-good site — expect 🟢.
3. Send a bare store URL — expect the scam-store pipeline to answer.

## Language / Localization

Verdicts are currently written in **Hebrew** and tuned for the Israeli scam landscape
(Israel Post / bank smishing, local coupon processors in the allowlist). To localize:
- Edit the four agent `systemMessage` prompts (output language + regional allowlist + examples).
- Edit the two `User Escalation Approval` prompt texts and the "private bot" refusal message.

The long-term goal (see [docs/architecture.md](../../docs/architecture.md)) is auto-detecting
the report language and answering in it.

## Models Used

| Role | Model | Why |
|---|---|---|
| Tier 1 (both pipelines) | Claude Haiku 4.5 | Fast + cheap for the easy 90% |
| Tier 3 (both pipelines) | Claude Opus | Deep analysis; scam-side also gets web search for live price comparison |

## Cost Notes

- Tier 1 runs on every report (small prompt, Haiku) — effectively pennies.
- Tier 3 runs **only after the family member taps "approve"** — cost stays user-controlled. For WhatsApp reports the approval goes to the owner's Telegram, since n8n has no WhatsApp human-in-the-loop tool.
- VirusTotal/RDAP/unshorten/thum.io: free tiers.

### Cost Estimation Example

| Check type | Tokens (in / out) | Cost |
|---|---|---|
| Tier 1 verdict (Haiku) | ~10K / ~300 | **~$0.012** (≈1 cent) |
| Tier 3 SMS escalation (Opus) | ~12K / ~400 | **~$0.07** |
| Tier 3 scam escalation (Opus + web search, multi-turn) | ~30K / ~1K | **~$0.18** + $0.01/search |

**Monthly scenarios** (assuming ~10% of checks escalate to Tier 3):

| Usage | Checks/month | Estimated cost |
|---|---|---|
| One family member | ~5 | **~$0.10/month** |
| Whole family | ~30 | **~$0.60/month** |

Notes:
- The dominant input cost is the VirusTotal JSON — trimming `last_analysis_results`
  (per-vendor detail) before passing it to the agent can cut Tier 1 input roughly in half.
- [Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
  on the large static system prompts would cut repeat input costs by up to ~90%, but at
  family volume (minutes between checks vs. the 5-minute cache TTL) hits are unlikely —
  not worth the complexity here.
- Actual numbers vary with SMS length, number of URLs, and VirusTotal response size.
  Verify against the `usage` figures in your Anthropic Console.
