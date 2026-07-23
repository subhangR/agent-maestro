import { LogDigestService } from '../src/application/services/LogDigestService';

/**
 * Regression guard for the chat/activity view (SessionActivityPanel and any
 * digest consumer). Injected user prompts in the JSONL transcript are machine
 * scaffolding — `<environment_context>` blocks and `<maestro_task_prompt>`
 * wrappers — and used to surface verbatim as `[PROMPT] <environment_context>…`
 * bubbles in the chat window. The digest must render them as plain English
 * (task title/description) or drop them, while passing real human messages
 * through untouched.
 */
describe('LogDigestService — user prompt humanization', () => {
  let svc: any;

  beforeEach(() => {
    svc = new (LogDigestService as any)({}, {});
  });

  const userLine = (content: string) => ({
    type: 'user',
    timestamp: new Date().toISOString(),
    message: { content },
  });

  it('drops environment_context-only prompts entirely', () => {
    const text =
      '<environment_context>\n<cwd>/home/ubuntu</cwd>\n<shell>bash</shell>\n' +
      '<filesystem><workspace_roots><root>/home/ubuntu</root></workspace_roots></filesystem>\n' +
      '</environment_context>';
    expect(svc.extractUserText(userLine(text), 220)).toBeNull();
  });

  it('summarizes a maestro_task_prompt as "Task: <title> — <description>"', () => {
    const text =
      '<maestro_task_prompt mode="worker" version="3.0"><tasks count="1">' +
      '<task id="t1"><title>UI Chat Window fix</title>' +
      '<description>Chat should show plain english.</description></task>' +
      '</tasks></maestro_task_prompt>';
    expect(svc.extractUserText(userLine(text), 220)).toBe(
      'Task: UI Chat Window fix — Chat should show plain english.',
    );
  });

  it('does not repeat the description when it matches the title', () => {
    const text =
      '<maestro_task_prompt mode="worker"><tasks count="1"><task id="t1">' +
      '<title>Fix glass mode</title><description>Fix glass mode</description>' +
      '</task></tasks></maestro_task_prompt>';
    expect(svc.extractUserText(userLine(text), 220)).toBe('Task: Fix glass mode');
  });

  it('passes plain human messages through untouched', () => {
    const text = 'Please also make the header sticky when scrolling.';
    expect(svc.extractUserText(userLine(text), 220)).toBe(text);
  });

  it('keeps human text that surrounds scaffolding blocks', () => {
    const text =
      '<environment_context><cwd>/x</cwd></environment_context>\n' +
      'Continue with the previous task please.';
    expect(svc.extractUserText(userLine(text), 220)).toBe(
      'Continue with the previous task please.',
    );
  });

  it('drops unclosed raw markup instead of showing tags', () => {
    const text =
      '<maestro_system_prompt mode="worker" version="3.0"><identity_kernel>' +
      '<mode_identity><profile>maestro-worker</profile>';
    expect(svc.extractUserText(userLine(text), 220)).toBeNull();
  });

  it('humanizes Codex user entries without adding a code-like prompt label', () => {
    const text =
      '<environment_context><cwd>/home/ubuntu</cwd></environment_context>\n' +
      '<maestro_task_prompt mode="worker"><tasks count="1"><task id="t1">' +
      '<title>Speed up chat</title><description>Keep the transcript readable.</description>' +
      '</task></tasks></maestro_task_prompt>';
    const entries = svc.extractTextEntries([
      {
        type: 'response_item',
        timestamp: new Date().toISOString(),
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      },
    ], 220);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: 'user',
      text: 'Task: Speed up chat — Keep the transcript readable.',
    });
  });
});
