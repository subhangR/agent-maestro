# Auto-Save for Task Create Mode

## Problem

When creating a new task, if the server crashes or the app closes unexpectedly, all typed content (title, description, settings) is lost. Auto-save currently only works in edit mode (existing tasks).

## Approach

Auto-create the task on the server as soon as the user types meaningful content (title or description), then let the existing auto-save mechanism handle all further edits.

## Design

### Server Change

In `maestro-server/src/api/validation.ts`, make `title` optional in `createTaskSchema`:

```ts
// Before: title: shortString  (min 1, required)
// After:  title: z.string().optional()
```

No other server changes. Task creation and update services already handle optional fields correctly.

### UI: Auto-Create Flow

`CreateTaskModal.tsx` gains an internal `autoCreatedTask` state:

```ts
const [autoCreatedTask, setAutoCreatedTask] = useState<MaestroTask | null>(null);
const effectiveEditMode = isEditMode || !!autoCreatedTask;
const effectiveTask = isEditMode ? task : autoCreatedTask;
```

**Auto-create trigger:** A `useEffect` watches `form.changeVersion`. When content exists (`title.trim() || prompt.trim()`) and no task has been created yet, a 1s debounce timer fires and creates the task on the server via `useMaestroStore.getState().createTask()`.

**After auto-creation:**
- `useAutoSave` activates (`enabled: effectiveEditMode`)
- All further edits auto-save via the existing debounce mechanism
- Auto-save status indicator appears in the footer

### Button Behavior After Auto-Creation

| Button | Before auto-create | After auto-create |
|--------|-------------------|-------------------|
| Create Task | Creates task, closes modal | Just closes modal (already saved) |
| Create & Run | Creates task, launches session | Launches already-created task |
| Close (X) | Shows discard dialog if content | Just closes (data safe on server) |

### Edge Cases

- **"Create & Run" before auto-create debounce fires:** Existing `handleSubmit` path runs normally, auto-create timer is cancelled.
- **Close before auto-create fires:** Discard dialog still shown (task not on server yet).
- **Auto-created task with empty title:** UI displays "Untitled" as fallback. User can add title later.
- **Image uploads:** Staged images are uploaded when auto-create fires, same as the current create flow.

### Files Changed

1. `maestro-server/src/api/validation.ts` — make title optional in createTaskSchema
2. `maestro-ui/src/components/maestro/CreateTaskModal.tsx` — auto-create logic, button handler adjustments
3. `maestro-ui/src/components/maestro/task-modal/TaskModalFooter.tsx` — show auto-save indicator after auto-creation

### Files NOT Changed

- `useAutoSave.ts` — reused as-is
- `useTaskForm.ts` — reused as-is
- `MaestroPanel.tsx` — handleCreateTask still works for Create & Run
- Server services/repositories — no changes
