# WhatsApp intake (Meta Cloud API)

Family members can report on WhatsApp as well as Telegram. They forward the suspicious SMS or link to the bot's WhatsApp number and get the same Hebrew verdict back on WhatsApp. The analysis pipeline is shared; only intake and replies differ.

## How it fits into the workflow

```
Telegram Trigger ─┐
                  ├─ Report (one normalized shape) → Switch → … same pipeline …
WhatsApp Trigger ─┘
                                       … → Telegram? ─┬─ Telegram reply
                                                      └─ WhatsApp reply
```

- **Report** turns either trigger's payload into `{channel, chat_id, sender_id, sender_name, text, …}`. Every later node reads `$('Report')`, never a trigger. WhatsApp delivery and read receipts produce no item, so they end the run quietly.
- **Verify Access / Verify Access1** hold one allowlist per channel. WhatsApp numbers are written as WhatsApp reports them: international format, digits only (`9725XXXXXXXX`). The scam-site branch now enforces the allowlist too (`If1`).
- Every reply to the reporter (the verdicts, the page screenshot and the "private bot" refusal) goes through a `Telegram?` IF to the Telegram node or its WhatsApp twin.
- **Format output / Format output1** produce `caption` (Telegram HTML) and `caption_wa` (WhatsApp `*bold*` / `_italic_`).
- **Tier 3 cost approval.** WhatsApp has no human-in-the-loop tool in n8n, so for a WhatsApp report the "escalate to the stronger model?" question goes to the owner's Telegram, prefixed with who reported what. The reporter just receives the verdict.
- **Case documentation** is unchanged and stays on the owner's Telegram. The case records `source.channel: "whatsapp"`.

`add-whatsapp.mjs` in `workflows/phish-scam-detector/` is the script that applied this change to the live workflow. It's kept as a record and can be re-run on a fresh export.

## Meta setup (once)

1. **Create the app.** At [developers.facebook.com](https://developers.facebook.com/apps) → *Create app*, pick the WhatsApp use case ("Connect with customers through WhatsApp") and attach it to a Meta Business portfolio (create one if asked).
2. **Note the IDs.** Under *WhatsApp → API Setup*, Meta gives you a free **test number**. Copy the **WhatsApp Business Account ID**. Under *App settings → Basic*, copy the **App ID** and **App Secret**.
3. **Add the family as test recipients.** The test number only talks to up to 5 numbers verified under *API Setup → To*. Add each family member's number. Each gets a WhatsApp code to confirm.
4. **Get a permanent token.** The token on the API Setup page expires after 24 hours. In [business.facebook.com](https://business.facebook.com) → *Settings → Users → System users*, add a system user (Admin). Under *Assign assets*, give it the app and the WhatsApp account with full control, then *Generate token* for the app with `whatsapp_business_messaging` and `whatsapp_business_management`, expiry *Never*.

## n8n setup

1. **Create two credentials.**
   - *WhatsApp OAuth API* (used by the trigger): Client ID = App ID, Client Secret = App Secret.
   - *WhatsApp API* (used for sending): Access Token = the system-user token, Business Account ID = the WABA ID.
2. **Attach them.** The OAuth credential goes on **WhatsApp Trigger**. The API credential goes on **WhatsApp deny**, **WhatsApp screenshot**, **WhatsApp verdict (Phish)** and **WhatsApp verdict (Scam)**. The sender number needs no setting, because it's taken from each incoming message.
3. **Fill the allowlist.** In **Verify Access** and **Verify Access1**, replace the placeholder `whatsapp: [...]` numbers.
4. **Enable WhatsApp Trigger** (it ships disabled, because an active workflow with a trigger that has no credential fails to activate, Telegram included). Save. While the workflow is active, n8n registers its webhook with the Meta app.
5. **Test.** From a family phone, send the test number a text with a link. In Meta under *WhatsApp → Configuration*, the callback URL should point at `https://<your-n8n>/webhook/…/webhook` with the `messages` field subscribed.

If no executions appear, subscribe the WhatsApp account to the app once:

```
curl -X POST "https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps" -H "Authorization: Bearer <system-user token>"
```

## Moving to a real number

The test number is fine for a family of five. For a number of your own, use *API Setup → Add phone number*. That number must not be active in the WhatsApp or WhatsApp Business app (it can't be in both). It needs to receive an SMS or call for verification, and its display name goes through Meta review. If messages from numbers outside the test list don't arrive, switch the app to *Live*, which requires a privacy-policy URL.

## Things to know

- **One webhook per Meta app.** Clicking *Test workflow* on the WhatsApp Trigger moves Meta's webhook to the test URL and production stops receiving. Deactivate the workflow first, or experiment with a second Meta app.
- **24-hour window.** Free-form replies are allowed within 24 hours of the family member's last message, which always holds for a verdict. If a Tier 3 approval sits unanswered for more than a day, the WhatsApp reply will fail.
- **Cost.** The bot only sends replies inside the 24-hour window (service messages) and needs no message templates. Since 1 October 2026 Meta charges for service messages after the first 1,000 a month per business phone number, at the recipient country's rate. A family uses a few dozen. Without a payment method on the account, Meta stops delivering once the free 1,000 are used. Check [Meta's pricing page](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) for current rules.
- **Subscribe the account to the app.** If the webhook is configured but no executions appear, the WhatsApp Business Account is probably subscribed only to Meta's own demo app. Run the `subscribed_apps` call under *n8n setup* once.
- **Forwarded messages** arrive as ordinary text. A forwarded picture's caption is analysed, but the image itself is not, which matches the Telegram intake.
