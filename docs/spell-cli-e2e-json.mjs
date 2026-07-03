#!/usr/bin/env node
// Tiny JSON extractor for the spell CLI E2E — a portable stand-in for `jq` on
// machines where jq is not installed. Reads JSON from stdin and evaluates a JS
// expression against it. The parsed document is bound to `d`.
//
//   echo '{"data":{"id":"x"}}' | node spell-cli-e2e-json.mjs 'd.data.id'      -> x
//   echo '{"data":[1,2,3]}'    | node spell-cli-e2e-json.mjs 'd.data.length'  -> 3
//
// Exit 0 on success; exit 3 if stdin is not valid JSON (so callers can detect a
// non-JSON error page). The result is printed with no trailing formatting; arrays
// and objects are JSON-stringified.

const expr = process.argv[2] || 'd';

let raw = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    process.stderr.write('E2E_JSON_PARSE_ERROR\n');
    process.exit(3);
  }
  let v;
  try {
    // eslint-disable-next-line no-eval
    v = eval(expr);
  } catch (err) {
    process.stderr.write(`E2E_JSON_EVAL_ERROR ${err?.message || err}\n`);
    process.exit(4);
  }
  if (v === undefined || v === null) {
    process.stdout.write('');
  } else if (typeof v === 'object') {
    process.stdout.write(JSON.stringify(v));
  } else {
    process.stdout.write(String(v));
  }
});
