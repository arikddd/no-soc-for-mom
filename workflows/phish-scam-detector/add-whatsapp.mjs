// Patch "Phish & Scam detector v1.1" so family members can report over WhatsApp
// (Meta Cloud API) as well as Telegram. Input: n8n CLI export (array) or a single
// workflow object. Output: workflow object with name/nodes/connections/settings.
//   node add-whatsapp.mjs wf.json wf-whatsapp.json
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const [, , inPath, outPath] = process.argv;
let wf = JSON.parse(readFileSync(inPath, 'utf8'));
if (Array.isArray(wf)) wf = wf[0];

const OWNER_TG = '11111111'; // your own Telegram user id: gets Tier 3 approvals for WhatsApp reports
const byName = (name) => {
  const n = wf.nodes.find((x) => x.name === name);
  if (!n) throw new Error('missing node ' + name);
  return n;
};
if (wf.nodes.some((n) => n.name === 'Report')) throw new Error('already patched');

const add = (node) => {
  wf.nodes.push({ id: randomUUID(), ...node });
  return node.name;
};
// connections helpers (main only)
const out = (src, idx = 0) => {
  wf.connections[src] ??= { main: [] };
  const m = wf.connections[src].main;
  while (m.length <= idx) m.push([]);
  return m[idx];
};
const link = (src, dst, idx = 0) => out(src, idx).push({ node: dst, type: 'main', index: 0 });
const unlink = (src, dst) => {
  for (const arr of wf.connections[src]?.main ?? []) {
    const i = arr.findIndex((c) => c.node === dst);
    if (i >= 0) arr.splice(i, 1);
  }
};
const at = (name, dx, dy) => {
  const [x, y] = byName(name).position;
  return [x + dx, y + dy];
};

// ---------------------------------------------------------------------------
// 1. Second trigger + one normalizer both triggers feed.
add({
  name: 'WhatsApp Trigger',
  type: 'n8n-nodes-base.whatsAppTrigger',
  typeVersion: 1,
  position: at('Telegram Trigger', 0, 224),
  // Disabled until the Meta app credential exists; a trigger without credentials
  // would make the whole workflow (Telegram included) fail to activate.
  disabled: true,
  parameters: { updates: ['messages'], options: { messageStatusUpdates: ['failed'] } },
});

const REPORT_CODE = String.raw`// One shape for every channel. Everything downstream reads $('Report'),
// never a trigger directly.
const j = $input.first().json;

if (j.message && j.message.chat) {
  // Telegram
  const m = j.message;
  return [{ json: {
    channel: 'telegram',
    chat_id: m.chat.id,
    sender_id: m.from?.id ?? null,
    sender_name: m.from?.first_name || null,
    username: m.from?.username || null,
    message_id: m.message_id ?? null,
    date: m.date ? new Date(m.date * 1000).toISOString() : null,
    text: m.text ?? m.caption ?? '',
    session_key: String(m.chat.id),
  } }];
}

// WhatsApp Cloud API: the trigger emits changes[].value; accept the raw
// webhook body as well.
const v = j.entry?.[0]?.changes?.[0]?.value ?? j;
const msg = v.messages?.[0];
if (!msg) return []; // delivery/read status or other non-message event

const contact = (v.contacts || []).find((c) => c.wa_id === msg.from) || v.contacts?.[0] || {};
let text = '';
if (msg.type === 'text') text = msg.text?.body ?? '';
else if (msg.type === 'image' || msg.type === 'video' || msg.type === 'document') text = msg[msg.type]?.caption ?? '';
else if (msg.type === 'button') text = msg.button?.text ?? '';

return [{ json: {
  channel: 'whatsapp',
  chat_id: msg.from, // wa_id: international number, digits only
  sender_id: msg.from,
  sender_name: contact.profile?.name || null,
  username: null,
  message_id: msg.id,
  date: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : null,
  text,
  forwarded: Boolean(msg.context?.forwarded || msg.context?.frequently_forwarded),
  wa_type: msg.type,
  wa_phone_number_id: v.metadata?.phone_number_id ?? null,
  session_key: 'wa:' + msg.from,
} }];`;

add({
  name: 'Report',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: at('Telegram Trigger', 144, 112),
  parameters: { jsCode: REPORT_CODE },
});
byName('Switch').position = at('Telegram Trigger', 304, 0);

unlink('Telegram Trigger', 'Switch');
link('Telegram Trigger', 'Report');
link('WhatsApp Trigger', 'Report');
link('Report', 'Switch');

// Switch routes on the normalized text.
for (const rule of byName('Switch').parameters.rules.values)
  for (const c of rule.conditions.conditions) c.leftValue = '={{ $json.text }}';

// ---------------------------------------------------------------------------
// 2. Every remaining Telegram Trigger reference goes through Report.
const REPLACE = [
  [`$('Telegram Trigger').item.json.message.chat.id`, `$('Report').first().json.chat_id`],
  [`$('Telegram Trigger').first().json.message.text`, `$('Report').first().json.text`],
];
for (const n of wf.nodes) {
  let s = JSON.stringify(n.parameters);
  for (const [a, b] of REPLACE) s = s.split(a).join(b);
  n.parameters = JSON.parse(s);
}
for (const name of ['Simple Memory', 'Simple Memory1', 'Simple Memory2', 'Simple Memory3'])
  byName(name).parameters.sessionKey = `={{ $('Report').first().json.session_key }}`;

// ---------------------------------------------------------------------------
// 3. Access control per channel; the scam branch now enforces it too.
const verifyCode = (existing) => {
  const tg = (existing.match(/const allowed = (\[[^\]]*\])/) || [])[1] || `[${OWNER_TG}]`;
  return String.raw`// Family allowlist per channel.
// telegram: numeric user ids. whatsapp: international number, digits only
// (e.g. 9725XXXXXXXX), exactly as WhatsApp reports it.
const ALLOWED = {
  telegram: ${tg},
  whatsapp: ['9725XXXXXXX1', '9725XXXXXXX2'],
};
const r = $('Report').first().json;
const fromId = r.sender_id;
const isAllowed = (ALLOWED[r.channel] || []).map(String).includes(String(fromId));

return [{
  json: {
    text: r.text,
    channel: r.channel,
    isAllowed,
    fromId,
  },
}];`;
};
for (const name of ['Verify Access', 'Verify Access1']) {
  const n = byName(name);
  n.parameters.jsCode = verifyCode(n.parameters.jsCode);
}

const ifTemplate = byName('If');
add({
  name: 'If1',
  type: 'n8n-nodes-base.if',
  typeVersion: ifTemplate.typeVersion,
  position: at('Verify Access1', 128, 0),
  parameters: JSON.parse(JSON.stringify(ifTemplate.parameters).replace(/"id":"[^"]+"/, `"id":"${randomUUID()}"`)),
});
byName('Normalize URL').position = at('Verify Access1', 272, 0);
unlink('Verify Access1', 'Normalize URL');
link('Verify Access1', 'If1');
link('If1', 'Normalize URL', 0);

// ---------------------------------------------------------------------------
// 4. Captions: keep Telegram HTML, add a WhatsApp-formatted copy.
const WA_HELPER = String.raw`

// WhatsApp copy: *bold*, _italic_, ` + '`code`' + String.raw`, no HTML entities.
const caption_wa = t
  .replace(/<b>\s*([\s\S]*?)\s*<\/b>/g, (m, x) => (x ? '*' + x + '*' : ''))
  .replace(/<i>\s*([\s\S]*?)\s*<\/i>/g, (m, x) => (x ? '_' + x + '_' : ''))
  .replace(/<code>([\s\S]*?)<\/code>/g, '` + '`$1`' + String.raw`')
  .replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (m, href, label) => (label === href ? label : label + ' (' + href + ')'))
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
`;
for (const name of ['Format output', 'Format output1']) {
  const n = byName(name);
  const code = n.parameters.jsCode;
  const ret = 'return [{ json: { caption: t } }];';
  if (!code.includes(ret)) throw new Error(name + ': unexpected return line');
  n.parameters.jsCode = code.replace(ret, WA_HELPER.trimStart() + '\n' + 'return [{ json: { caption: t, caption_wa } }];');
}

// ---------------------------------------------------------------------------
// 5. Replies to the reporter go out on the channel they came from.
const isTelegram = () => ({
  conditions: {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
    conditions: [{
      id: randomUUID(),
      leftValue: `={{ $('Report').first().json.channel }}`,
      rightValue: 'telegram',
      operator: { type: 'string', operation: 'equals' },
    }],
    combinator: 'and',
  },
  options: {},
});
const waSend = (extra) => ({
  resource: 'message',
  operation: 'send',
  phoneNumberId: `={{ $('Report').first().json.wa_phone_number_id }}`,
  recipientPhoneNumber: `={{ $('Report').first().json.chat_id }}`,
  ...extra,
});

// Splits `src -> tgNode` into `src -> IF -> tgNode | waNode`; anything tgNode
// fed continues to be fed by both.
function channelFork({ src, tgNode, ifName, waName, waParams, srcIndex = 0 }) {
  const tg = byName(tgNode);
  const [x, y] = tg.position;
  add({ name: ifName, type: 'n8n-nodes-base.if', typeVersion: 2.3, position: [x, y], parameters: isTelegram() });
  tg.position = [x + 192, y - 96];
  add({ name: waName, type: 'n8n-nodes-base.whatsApp', typeVersion: 1.1, position: [x + 192, y + 96], parameters: waParams });

  const arr = out(src, srcIndex);
  const i = arr.findIndex((c) => c.node === tgNode);
  if (i < 0) throw new Error(`${src} does not feed ${tgNode}`);
  arr[i] = { node: ifName, type: 'main', index: 0 };
  link(ifName, tgNode, 0);
  link(ifName, waName, 1);
  for (const c of wf.connections[tgNode]?.main?.[0] ?? []) link(waName, c.node);
}

channelFork({
  src: 'If', srcIndex: 1, tgNode: 'Send a text message1',
  ifName: 'Telegram? (deny)', waName: 'WhatsApp deny',
  waParams: waSend({ textBody: '⛔️ זהו בוט פרטי ⛔️', additionalFields: {} }),
});
// the scam branch shares the deny reply
link('If1', 'Telegram? (deny)', 1);

channelFork({
  src: 'Render URL', tgNode: 'Send a photo message',
  ifName: 'Telegram? (screenshot)', waName: 'WhatsApp screenshot',
  waParams: waSend({ messageType: 'image', mediaPath: 'useMedian8n', mediaPropertyName: 'data', additionalFields: {} }),
});
channelFork({
  src: 'Format output', tgNode: 'Send the verdict1',
  ifName: 'Telegram? (phish verdict)', waName: 'WhatsApp verdict (Phish)',
  waParams: waSend({ textBody: `={{ $('Format output').first().json.caption_wa }}`, additionalFields: {} }),
});
channelFork({
  src: 'Format output1', tgNode: 'Send the verdict',
  ifName: 'Telegram? (scam verdict)', waName: 'WhatsApp verdict (Scam)',
  waParams: waSend({ textBody: `={{ $('Format output1').first().json.caption_wa }}`, additionalFields: {} }),
});

// ---------------------------------------------------------------------------
// 6. Tier 3 cost approval: WhatsApp has no human-in-the-loop tool, so a
// WhatsApp report's escalation question goes to the owner's Telegram.
const WA_PREFIX = `{{ $('Report').first().json.channel === 'whatsapp' ? '📱 דיווח בוואטסאפ מ' + String($('Report').first().json.sender_name || $('Report').first().json.sender_id).replace(/[_*\`\\[\\]()]/g, ' ') + ':\\n' + String($('Report').first().json.text).slice(0, 200).replace(/[_*\`\\[\\]()]/g, ' ') + '\\n\\n' : '' }}`;
for (const name of ['User Escalation Approval', 'User Escalation Approval1']) {
  const p = byName(name).parameters;
  p.chatId = `={{ $('Report').first().json.channel === 'telegram' ? $('Report').first().json.chat_id : '${OWNER_TG}' }}`;
  if (!p.message.startsWith('=')) throw new Error(name + ': message is not an expression');
  p.message = '=' + WA_PREFIX + p.message.slice(1);
}

// ---------------------------------------------------------------------------
// 7. Case records carry the real channel.
const SOURCE_OLD = /const msg = \$\('Telegram Trigger'\)\.first\(\)\.json\.message;/;
const SOURCE_BLOCK = /  source: \{\n    channel: 'telegram',[\s\S]*?\n  \},\n/;
const SOURCE_NEW = `  source: {
    channel: r.channel,
    chat_id: r.chat_id,
    message_id: r.message_id,
    from: { id: r.sender_id, username: r.username || null, first_name: r.sender_name || null },
    message_text: r.text || '',
    message_date: r.date,
  },
`;
for (const name of ['Build Case (Phish)', 'Build Case (Scam)']) {
  const n = byName(name);
  let c = n.parameters.jsCode;
  if (!SOURCE_OLD.test(c) || !SOURCE_BLOCK.test(c)) throw new Error(name + ': unexpected code');
  c = c.replace(SOURCE_OLD, `const r = $('Report').first().json;`)
    .replace(SOURCE_BLOCK, SOURCE_NEW)
    .replace(`(msg.text || '').slice(0, 120)`, `(r.text || '').slice(0, 120)`)
    .replace(`  \`מזהה: \${caseDoc.case_id}\`,`, `  \`ערוץ: \${r.channel === 'whatsapp' ? 'וואטסאפ' : 'טלגרם'}\`,\n  \`מזהה: \${caseDoc.case_id}\`,`);
  if (/\bmsg\./.test(c)) throw new Error(name + ': leftover msg reference');
  n.parameters.jsCode = c;
}

// ---------------------------------------------------------------------------
const left = wf.nodes.filter((n) => JSON.stringify(n.parameters).includes(`$('Telegram Trigger')`)).map((n) => n.name);
if (left.length) throw new Error('Telegram Trigger still referenced in: ' + left.join(', '));

const result = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`ok: ${wf.nodes.length} nodes -> ${outPath}`);
