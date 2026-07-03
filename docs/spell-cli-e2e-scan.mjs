#!/usr/bin/env node
// Capture scanner for the spell CLI E2E. Reads the JSONL capture written by
// spell-cli-e2e-listen.mjs (one {type,data,at} per line) and emits machine-readable
// KEY=VALUE lines the bash harness greps for its assertions.
//
//   node spell-cli-e2e-scan.mjs <captureFile> <sessionId> <feedOutputMarker>
//
// Emitted keys:
//   RULE_FIRED_TOTAL=<n>                     # spell:rule_fired events for the session
//   RULE_FIRED_OK=<n>                        # of those, outcome=ok
//   RULE_FIRED_ACTIONS=<a,b,...>             # distinct action types that fired (sorted)
//   RULE_FIRED_EVENTS=<PostToolUse,Stop,...> # distinct hook events that fired
//   PROMPT_SEND_TOTAL=<n>                     # session:prompt_send events for the session
//   FEEDOUTPUT_FOUND=yes|no                   # a prompt_send whose content contains the marker
//   FEEDOUTPUT_SAMPLE=<first 120 chars>       # the matching prompt_send content (for the log)

import { readFileSync } from 'node:fs';

const [capFile, sessionId, marker] = process.argv.slice(2);
if (!capFile) {
  process.stderr.write('usage: scan <captureFile> <sessionId> <marker>\n');
  process.exit(2);
}

let lines = [];
try {
  lines = readFileSync(capFile, 'utf-8').split('\n').filter(Boolean);
} catch {
  // Missing/empty capture file → all-zero report (assertions will fail cleanly).
}

const events = [];
for (const line of lines) {
  try { events.push(JSON.parse(line)); } catch { /* skip malformed */ }
}

const forSession = (d) => {
  const ids = Array.isArray(d?.sessionIds)
    ? d.sessionIds
    : d?.targetSessionId ? [d.targetSessionId]
    : d?.sessionId ? [d.sessionId]
    : [];
  return !sessionId || ids.includes(sessionId);
};

const ruleFired = events.filter((e) => e.type === 'spell:rule_fired' && forSession(e.data));
const ruleFiredOk = ruleFired.filter((e) => e.data?.outcome === 'ok');
const actions = [...new Set(ruleFired.map((e) => e.data?.action).filter(Boolean))].sort();
const firedEvents = [...new Set(ruleFired.map((e) => e.data?.event).filter(Boolean))].sort();

const promptSends = events.filter((e) => e.type === 'session:prompt_send' && forSession(e.data));
let feedFound = false;
let feedSample = '';
if (marker) {
  for (const e of promptSends) {
    const content = String(e.data?.content ?? '');
    if (content.includes(marker)) {
      feedFound = true;
      feedSample = content.replace(/\n/g, ' ').slice(0, 120);
      break;
    }
  }
}

const out = [
  `RULE_FIRED_TOTAL=${ruleFired.length}`,
  `RULE_FIRED_OK=${ruleFiredOk.length}`,
  `RULE_FIRED_ACTIONS=${actions.join(',')}`,
  `RULE_FIRED_EVENTS=${firedEvents.join(',')}`,
  `PROMPT_SEND_TOTAL=${promptSends.length}`,
  `FEEDOUTPUT_FOUND=${feedFound ? 'yes' : 'no'}`,
  `FEEDOUTPUT_SAMPLE=${feedSample}`,
];
process.stdout.write(out.join('\n') + '\n');
