# Agent Prompts

System prompts for each triage tier. One file per agent:

- `tier1-classifier.md` — fast classification agent (obvious scam / obvious benign / escalate)
- `tier2-analyst.md` — deep analysis agent (social engineering, impersonation, intent)
- `tier3-escalation.md` — final-verdict agent (full context, always decides)
- `verdict-translator.md` — converts technical findings into plain language for non-technical users

## Prompt Contract

Every triage agent must return strict JSON:

```json
{
  "verdict": "scam | suspicious | safe | escalate",
  "confidence": 0.0,
  "threat_type": "phishing | smishing | romance | tech-support | malware | other | none",
  "language": "ISO 639-1 code of the user's language (e.g., en, he, es)",
  "plain_language_explanation": "One or two sentences a non-technical person understands, in the user's language.",
  "recommended_action": "What the person should do right now, in the user's language."
}
```

Rules:
- Tier 1 and Tier 2 may return `"escalate"`; Tier 3 never does.
- Explanations must contain **zero jargon** — test: would a 70-year-old understand it?
- When uncertain, bias toward caution — a false "safe" is the worst possible outcome.

## Multilingual Rules

**Every language is supported** — the agents respond in the language of the input.

- Every agent must handle input content in any language, including mixed-language scams.
- `plain_language_explanation` and `recommended_action` MUST be written in the **user's language** (passed in as `user_language` in the case object; falls back to the detected language of the report).
- Analysis/reasoning between tiers stays in English (internal), but user-facing text never is unless the user's language is English.
- Agents apply language/locale-specific scam context (regional impersonation patterns: banks, postal services, government agencies per locale).
- Responses must read as natural native phrasing — not machine-translated. RTL languages (e.g., Hebrew, Arabic) must be natural RTL text.
