/**
 * Regression: edit-mode Run button must flush the pending auto-save BEFORE
 * spawning the session so the session sees the just-selected teammate.
 *
 * Before the fix: onWorkOn() fires synchronously then onClose() (which
 * triggers the save) — spawn sees stale task.
 * After the fix: onSave() is awaited first, onWorkOn() fires after.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskModalFooter } from '../components/maestro/task-modal/TaskModalFooter';

describe('TaskModalFooter — Run button save-before-spawn ordering', () => {
    it('awaits onSave before calling onWorkOn in edit mode', async () => {
        const callOrder: string[] = [];

        // onSave returns a Promise that resolves after a tick — simulating async save
        const onSave = vi.fn(() => {
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    callOrder.push('save');
                    resolve();
                }, 0);
            });
        });

        const onWorkOn = vi.fn(() => {
            callOrder.push('workOn');
        });

        const onClose = vi.fn(() => {
            callOrder.push('close');
        });

        render(
            <TaskModalFooter
                isEditMode={true}
                isValid={true}
                selectedTeamMemberIds={['tm_1']}
                onTeamMemberSelectionChange={vi.fn()}
                teams={[]}
                selectedTeamId={null}
                onTeamChange={vi.fn()}
                teamMembers={[]}
                dangerousMode={false}
                onDangerousModeChange={vi.fn()}
                useWorktree={false}
                onUseWorktreeChange={vi.fn()}
                onClose={onClose}
                onSave={onSave}
                onSubmit={vi.fn()}
                onWorkOn={onWorkOn}
                showLaunchConfig={false}
                onToggleLaunchConfig={vi.fn()}
            />
        );

        const runBtn = screen.getByRole('button', { name: /run/i });
        fireEvent.click(runBtn);

        // Wait for the async save to complete and onWorkOn to be called
        await waitFor(() => {
            expect(onWorkOn).toHaveBeenCalled();
        });

        // onSave must have been called at all
        expect(onSave).toHaveBeenCalled();
        // save must resolve (appear in callOrder) BEFORE workOn is invoked
        expect(callOrder.indexOf('save')).toBeGreaterThanOrEqual(0);
        expect(callOrder.indexOf('workOn')).toBeGreaterThanOrEqual(0);
        expect(callOrder.indexOf('save')).toBeLessThan(callOrder.indexOf('workOn'));
    });
});
