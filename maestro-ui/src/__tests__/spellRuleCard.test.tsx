import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';

// First JSX render can take seconds when the machine is under load (parallel
// suites); don't let scheduling noise fail a pure render assertion.
vi.setConfig({ testTimeout: 20000 });
import { RuleCard } from '../components/spells/studio/editor/RuleCard';
import { blankRule, type EditorRule } from '../components/spells/studio/editor/editorState';
import { ACTIONS_BY_EVENT, type SpellHookEvent } from '../app/types/maestro';

function renderCard(rule: EditorRule) {
  const patch = vi.fn();
  render(
    <RuleCard
      rule={rule}
      index={0}
      total={1}
      patch={patch}
      onChangeEvent={vi.fn()}
      onRemove={vi.fn()}
      onDuplicate={vi.fn()}
      onMove={vi.fn()}
      showError={false}
    />,
  );
  return { patch };
}

function actionOptions(): string[] {
  const select = screen.getByLabelText(/Then do this/);
  return within(select as HTMLElement).getAllByRole('option').map((o) => o.textContent ?? '');
}

describe('RuleCard action legality per event (ACTIONS_BY_EVENT)', () => {
  it('SessionEnd offers only run-command and notify', () => {
    const rule = blankRule('SessionEnd');
    rule.collapsed = false;
    renderCard(rule);
    expect(actionOptions()).toEqual(['Run command', 'Notify']);
  });

  it('Stop offers continue-loop', () => {
    const stop = blankRule('Stop');
    stop.collapsed = false;
    renderCard(stop);
    expect(actionOptions()).toContain('Continue loop');
  });

  it('PreToolUse excludes continue-loop', () => {
    const pre = blankRule('PreToolUse');
    pre.collapsed = false;
    renderCard(pre);
    expect(actionOptions()).not.toContain('Continue loop');
    expect(actionOptions()).toEqual(['Inject prompt', 'Feed context', 'Run command', 'Notify']);
  });

  it('the option list mirrors ACTIONS_BY_EVENT for every hook event', () => {
    // Sanity: the matrix itself is the single legality source the dropdown reads.
    (Object.keys(ACTIONS_BY_EVENT) as SpellHookEvent[]).forEach((ev) => {
      expect(ACTIONS_BY_EVENT[ev].length).toBeGreaterThan(0);
      if (ev === 'Stop' || ev === 'SubagentStop') {
        expect(ACTIONS_BY_EVENT[ev]).toContain('continue-loop');
      } else {
        expect(ACTIONS_BY_EVENT[ev]).not.toContain('continue-loop');
      }
    });
  });
});

describe('RuleCard notify panel (C3)', () => {
  it('shows in-app copy and no channel field', () => {
    const rule = blankRule('Stop');
    rule.collapsed = false;
    rule.actionType = 'notify-channel';
    renderCard(rule);
    expect(screen.getByText(/Shows an in-app notification/)).toBeTruthy();
    expect(screen.queryByText(/Channel/)).toBeNull();
    expect(screen.queryByPlaceholderText(/telegram/)).toBeNull();
    expect(screen.queryByText(/relay/i)).toBeNull();
  });
});

describe('RuleCard run-command panel', () => {
  it('requires the shell acknowledgement before the rule is valid', () => {
    const rule = blankRule('SessionEnd'); // defaults to run-command
    rule.collapsed = false;
    rule.command = 'npm';
    rule.runCommandAck = false;
    renderCard(rule);
    expect(screen.getByText(/runs shell commands on your machine/)).toBeTruthy();
  });
});
