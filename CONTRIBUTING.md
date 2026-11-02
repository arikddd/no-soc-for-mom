# Contributing

No SOC for Mom covers two investigations today: phishing messages and overpriced dropshipping stores. Families face more: romance and investment scams, "Mom, I lost my phone" messages, fake tech support, fake rental listings. If you have built, or want to build, an investigation workflow for one of them, this repository is where it belongs.

## How contributions work

1. **Open an issue first** for anything bigger than a fix: the threat, how it reaches a family, what evidence a workflow could gather, and what a plain-language verdict would say.
2. **Fork the repository**, create a branch, and make your change.
3. **Open a pull request** against `main` and fill in the template.
4. The maintainer reviews it. Nothing reaches `main` without an approving review, and the maintainer may ask for changes before merging.

Fixes to the existing workflow, prompts and docs are welcome the same way.

## What a new investigation should include

- An n8n workflow export under `workflows/<name>/`, with a `README.md`: what it detects, its intake, the enrichment sources, the verdicts it can give, and the credentials it needs.
- The same shape as the existing pipeline where it fits: intake → enrichment → tiered triage → plain-language verdict.
- Prompts that treat every piece of evidence (message text, page content, API results) as data, never as instructions.
- A fail-safe default: when the workflow cannot decide or could not fetch something, it says so and advises caution. It never reports "safe" on missing evidence.

## Before you open the pull request: privacy

This repository is public, and workflow exports carry more than they seem to. Check every file you add:

- **No credentials.** Remove the `credentials` and `webhookId` keys from n8n exports, and never commit `.env` files, API keys or tokens.
- **No personal identifiers.** Replace Telegram user IDs, chat IDs and phone numbers with placeholders (`11111111`, `9725XXXXXXX1`).
- **No real stores, brands or people in examples.** Mask them (`example-store.com`, `[Brand]™`). Calling a real business a scam in a public repository is a legal risk for everyone involved.
- **No real messages from your family.** Use made-up samples, or real scam texts with every personal detail removed.
- **Defang malicious links** in docs and examples (`hxxps://example[.]com`).

## Testing

Say in the pull request how you tested the change: on your own n8n instance, with which kinds of samples, and what the verdicts were. A workflow that has only been validated but never run is fine to propose, as long as the pull request says so.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE) of this repository.
