import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskForm } from '../hooks/useTaskForm';
import type { MaestroTask } from '../app/types/maestro';

// Minimal task stub for edit-mode baseline
const makeTask = (overrides: Partial<MaestroTask> = {}): MaestroTask => ({
    id: 'task_1',
    projectId: 'proj_1',
    parentId: null,
    title: 'Test Task',
    description: 'desc',
    initialPrompt: 'desc',
    status: 'todo',
    priority: 'medium',
    createdAt: 1000,
    updatedAt: 1000,
    startedAt: null,
    completedAt: null,
    sessionIds: [],
    skillIds: [],
    agentIds: [],
    dependencies: [],
    subtasks: [],
    teamMemberIds: [],
    referenceTaskIds: [],
    ...overrides,
});

describe('useTaskForm — teammate assignment payloads', () => {
    it('getCreatePayload includes teamMemberId and teamMemberIds when one member is selected', () => {
        const { result } = renderHook(() => useTaskForm('create', true));
        act(() => {
            result.current.setSelectedTeamMemberIds(['tm_1']);
            result.current.setTitle('My task');
            result.current.setPrompt('Do the thing');
        });
        const payload = result.current.getCreatePayload(false, [], undefined);
        expect(payload.teamMemberId).toBe('tm_1');
        expect(payload.teamMemberIds).toEqual(['tm_1']);
    });

    it('getCreatePayload sets teamMemberIds (multi) and leaves teamMemberId undefined for >1 members', () => {
        const { result } = renderHook(() => useTaskForm('create', true));
        act(() => {
            result.current.setSelectedTeamMemberIds(['tm_1', 'tm_2']);
            result.current.setTitle('My task');
        });
        const payload = result.current.getCreatePayload(false, [], undefined);
        expect(payload.teamMemberId).toBeUndefined();
        expect(payload.teamMemberIds).toEqual(['tm_1', 'tm_2']);
    });

    it('getCreatePayload has no teamMember fields when none selected', () => {
        const { result } = renderHook(() => useTaskForm('create', true));
        act(() => {
            result.current.setTitle('My task');
        });
        const payload = result.current.getCreatePayload(false, [], undefined);
        expect(payload.teamMemberId).toBeUndefined();
        expect(payload.teamMemberIds).toBeUndefined();
    });

    it('getUpdateDiff includes teamMemberIds/teamMemberId when member is selected on a task that had none', () => {
        const task = makeTask({ teamMemberId: undefined, teamMemberIds: [] });
        const { result } = renderHook(() => useTaskForm('edit', true, task));
        act(() => {
            result.current.setSelectedTeamMemberIds(['tm_1']);
        });
        const diff = result.current.getUpdateDiff([], []);
        expect(diff).not.toBeNull();
        expect(diff!.teamMemberIds).toEqual(['tm_1']);
        expect(diff!.teamMemberId).toBe('tm_1');
    });

    it('getUpdateDiff clears teamMemberIds when member is deselected', () => {
        const task = makeTask({ teamMemberId: 'tm_1', teamMemberIds: ['tm_1'] });
        const { result } = renderHook(() => useTaskForm('edit', true, task));
        act(() => {
            result.current.setSelectedTeamMemberIds([]);
        });
        const diff = result.current.getUpdateDiff([], []);
        expect(diff).not.toBeNull();
        expect(diff!.teamMemberIds).toBeUndefined();
        expect(diff!.teamMemberId).toBeUndefined();
    });

    it('getUpdateDiff returns null when team member is unchanged', () => {
        const task = makeTask({ teamMemberId: 'tm_1', teamMemberIds: ['tm_1'] });
        const { result } = renderHook(() => useTaskForm('edit', true, task));
        // No changes made — diff should be null
        const diff = result.current.getUpdateDiff([], []);
        expect(diff).toBeNull();
    });
});
