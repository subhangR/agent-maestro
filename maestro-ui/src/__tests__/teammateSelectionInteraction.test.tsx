/**
 * Regression (issue #131): selecting a teammate in the New Task modal's
 * assignee picker was silently swallowed, so the task was created with no
 * assignee.
 *
 * Root cause: TaskModalFooter registers a document `mousedown` outside-click
 * listener that closes the picker when the target is not a DOM descendant of
 * `pickerPanelRef`. The member dropdown was portaled into `document.body` (a
 * SIBLING of the panel, not a descendant), so clicking a member counted as an
 * outside click. Browsers fire `mousedown` before `click`, so the picker
 * unmounted on `mousedown` and the member button's `onClick`
 * (`onSelectionChange`) never fired.
 *
 * These tests drive the real TaskModalFooter → TeamTaskPicker →
 * TeamMemberSelector composition through the mousedown→click sequence.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskModalFooter } from '../components/maestro/task-modal/TaskModalFooter';
import type { TeamMember } from '../app/types/maestro';

const makeMember = (overrides: Partial<TeamMember> = {}): TeamMember => ({
    id: 'tm_alpha',
    projectId: 'proj_1',
    name: 'Alpha Agent',
    role: 'engineer',
    identity: 'id',
    avatar: '🤖',
    isDefault: false,
    status: 'active',
    createdAt: '0',
    updatedAt: '0',
    ...overrides,
});

function renderFooter(members: TeamMember[], onMembers = vi.fn()) {
    render(
        <TaskModalFooter
            isEditMode={false}
            isValid={true}
            selectedTeamMemberIds={[]}
            onTeamMemberSelectionChange={onMembers}
            teams={[]}
            selectedTeamId={null}
            onTeamChange={vi.fn()}
            teamMembers={members}
            dangerousMode={false}
            onDangerousModeChange={vi.fn()}
            useWorktree={false}
            onUseWorktreeChange={vi.fn()}
            onClose={vi.fn()}
            onSave={vi.fn().mockResolvedValue(undefined)}
            onSubmit={vi.fn()}
            showLaunchConfig={false}
            onToggleLaunchConfig={vi.fn()}
        />
    );
    return onMembers;
}

/** Open the assignee picker, then open the member dropdown. */
function openMemberDropdown() {
    fireEvent.click(screen.getByTitle('Assign a team or team members'));
    fireEvent.click(screen.getByText('Select Team Members'));
}

describe('TaskModalFooter — teammate selection survives outside-click handler', () => {
    it('commits the member selection even though mousedown precedes click', () => {
        const onMembers = renderFooter([makeMember()]);
        openMemberDropdown();

        const option = screen.getByText('Alpha Agent').closest('button')!;
        // Browsers fire mousedown before click; mousedown bubbles to the
        // document outside-click listener and (pre-fix) closed the picker.
        fireEvent.mouseDown(option);
        fireEvent.click(option);

        expect(onMembers).toHaveBeenCalledWith(['tm_alpha']);
    });

    it('control: a click with no preceding mousedown also commits (wiring is otherwise correct)', () => {
        const onMembers = renderFooter([makeMember()]);
        openMemberDropdown();

        fireEvent.click(screen.getByText('Alpha Agent').closest('button')!);

        expect(onMembers).toHaveBeenCalledWith(['tm_alpha']);
    });

    it('multi-select: a second member can be added through the mousedown→click sequence', () => {
        const members = [makeMember(), makeMember({ id: 'tm_beta', name: 'Beta Agent', avatar: '🦊' })];
        // Start with the first member already selected so the second adds to it.
        const onMembers = vi.fn();
        render(
            <TaskModalFooter
                isEditMode={false}
                isValid={true}
                selectedTeamMemberIds={['tm_alpha']}
                onTeamMemberSelectionChange={onMembers}
                teams={[]}
                selectedTeamId={null}
                onTeamChange={vi.fn()}
                teamMembers={members}
                dangerousMode={false}
                onDangerousModeChange={vi.fn()}
                useWorktree={false}
                onUseWorktreeChange={vi.fn()}
                onClose={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                onSubmit={vi.fn()}
                showLaunchConfig={false}
                onToggleLaunchConfig={vi.fn()}
            />
        );
        fireEvent.click(screen.getByTitle('Assign a team or team members'));
        // Member dropdown button now shows the selected member's name, so open
        // it via the caret-bearing chip inside the picker panel.
        fireEvent.click(screen.getByText('Alpha Agent').closest('button')!);

        const beta = screen.getByText('Beta Agent').closest('button')!;
        fireEvent.mouseDown(beta);
        fireEvent.click(beta);

        expect(onMembers).toHaveBeenCalledWith(['tm_alpha', 'tm_beta']);
    });

    it('clear still empties the selection through the mousedown→click sequence', () => {
        const onMembers = vi.fn();
        render(
            <TaskModalFooter
                isEditMode={false}
                isValid={true}
                selectedTeamMemberIds={['tm_alpha']}
                onTeamMemberSelectionChange={onMembers}
                teams={[]}
                selectedTeamId={null}
                onTeamChange={vi.fn()}
                teamMembers={[makeMember()]}
                dangerousMode={false}
                onDangerousModeChange={vi.fn()}
                useWorktree={false}
                onUseWorktreeChange={vi.fn()}
                onClose={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                onSubmit={vi.fn()}
                showLaunchConfig={false}
                onToggleLaunchConfig={vi.fn()}
            />
        );
        fireEvent.click(screen.getByTitle('Assign a team or team members'));
        fireEvent.click(screen.getByText('Alpha Agent').closest('button')!);

        const clear = screen.getByText('clear');
        fireEvent.mouseDown(clear);
        fireEvent.click(clear);

        expect(onMembers).toHaveBeenCalledWith([]);
    });
});
