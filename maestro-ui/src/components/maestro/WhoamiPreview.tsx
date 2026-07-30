import React, { useState } from "react";
import { MaestroTask, WorkerStrategy, OrchestratorStrategy } from "../../app/types/maestro";

type WhoamiPreviewProps = {
    mode: 'execute' | 'orchestrate';
    strategy: WorkerStrategy | OrchestratorStrategy;
    selectedTasks: MaestroTask[];
    projectId: string;
};

/**
 * Generates the worker workflow section based on strategy
 */
function renderWorkerWorkflow(strategy: WorkerStrategy, primaryTask: MaestroTask): string {
    if (strategy === 'tree') {
        return `## Queue Worker Workflow

**IMPORTANT**: This is a QUEUE WORKER session. You must follow the queue workflow below.

1. **Get next task**: \`maestro queue top\`
2. **Start the task**: \`maestro queue start\` — this claims it and marks it in-progress
3. **Implement** the task requirements systematically
4. **Report progress** every 5-10 minutes: \`maestro report progress "what you did"\`
5. **Complete or fail**: \`maestro queue complete\` or \`maestro queue fail "reason"\`
6. **Repeat** from step 1

### Queue Commands

| Command | Description |
|---------|-------------|
| \`maestro queue top\` | Show the next task in the queue |
| \`maestro queue start\` | Start processing the next task |
| \`maestro queue complete\` | Mark current task as completed |
| \`maestro queue fail [reason]\` | Mark current task as failed |
| \`maestro queue skip\` | Skip the current task |`;
    }

    // simple strategy
    return `## Your Workflow

1. **Review** the task description, acceptance criteria, and project context above
2. **Implement** the requirements systematically -- your task is already marked as in-progress
3. **Report progress** regularly and at major milestones
4. **Report blockers** if stuck: \`maestro report blocked "what is blocking"\`
5. **Verify** all acceptance criteria are met and tests pass
6. **Complete** when everything is verified: \`maestro report complete "Summary of what was done"\`

## Reporting

**Session-level** (\`maestro report\`) — for overall session progress and lifecycle
**Task-level** (\`maestro task report\`) — for reporting status on a specific task`;
}

/**
 * Generates the orchestrator workflow section
 */
function renderOrchestratorWorkflow(strategy: OrchestratorStrategy): string {
    return `## Your Role

You are the **Maestro Orchestrator**. You coordinate and manage work -- you **never implement tasks directly**.

**Golden Rule: Orchestrators coordinate. Workers implement. Never write code directly.**

## Workflow Phases

1. **Analysis** — Review scope, check dependencies, assess risk
2. **Planning & Decomposition** — Break down complex tasks into subtasks
3. **Delegation** — Spawn workers: \`maestro session spawn --task <id> --skill maestro-worker\`
4. **Monitoring** — Track progress: \`maestro task list\`, \`maestro session list\`
5. **Failure Handling** — Diagnose and retry/reassign failed tasks
6. **Completion** — Verify all acceptance criteria, summarize work

## Key Commands

| Command | Description |
|---------|-------------|
| \`maestro task create "<title>" --parent <id>\` | Create subtask |
| \`maestro session spawn --task <id>\` | Spawn worker |
| \`maestro task tree\` | Visualize task hierarchy |
| \`maestro session list\` | Monitor active sessions |`;
}

/**
 * Generates the available commands section based on mode and strategy
 */
function renderCommandsSection(mode: 'execute' | 'orchestrate', strategy: WorkerStrategy | OrchestratorStrategy): string {
    const coreCommands = [
        { name: 'whoami', desc: 'Print current context' },
        { name: 'status', desc: 'Show project status' },
        { name: 'commands', desc: 'Show available commands' },
    ];

    const reportCommands = [
        { name: 'report progress', desc: 'Report work progress' },
        { name: 'report complete', desc: 'Report completion' },
        { name: 'report blocked', desc: 'Report blocker' },
    ];

    const taskCommands = mode === 'orchestrate'
        ? [
            { name: 'task list', desc: 'List tasks' },
            { name: 'task create', desc: 'Create new task' },
            { name: 'task update', desc: 'Update task' },
            { name: 'task tree', desc: 'Show task tree' },
        ]
        : [
            { name: 'task list', desc: 'List tasks' },
            { name: 'task get', desc: 'Get task details' },
            { name: 'task create', desc: 'Create new task' },
        ];

    const sessionCommands = mode === 'orchestrate'
        ? [
            { name: 'session list', desc: 'List sessions' },
            { name: 'session spawn', desc: 'Spawn new session' },
        ]
        : [
            { name: 'session info', desc: 'Get session info' },
        ];

    const queueCommands = strategy === 'tree'
        ? [
            { name: 'queue top', desc: 'Show next task' },
            { name: 'queue start', desc: 'Start processing task' },
            { name: 'queue complete', desc: 'Complete current task' },
            { name: 'queue fail', desc: 'Mark task failed' },
        ]
        : [];

    const sections: string[] = [
        `## Available Commands`,
        ``,
        `Mode: ${mode} | Strategy: ${strategy}`,
        ``,
    ];

    const formatCmds = (label: string, cmds: { name: string; desc: string }[]) => {
        sections.push(`**${label}:**`);
        cmds.forEach(c => sections.push(`- \`maestro ${c.name}\` - ${c.desc}`));
        sections.push('');
    };

    formatCmds('Core', coreCommands);
    formatCmds('Report', reportCommands);
    formatCmds('Task', taskCommands);
    formatCmds('Session', sessionCommands);
    if (queueCommands.length > 0) {
        formatCmds('Queue', queueCommands);
    }

    return sections.join('\n');
}

/**
 * Format task list for multi-task preview
 */
function formatTaskList(tasks: MaestroTask[]): string {
    if (tasks.length <= 1) return '';

    const lines = tasks.map((task, i) => {
        const priority = task.priority ? ` [${task.priority}]` : '';
        return `${i + 1}. **${task.id}** - ${task.title}${priority}\n   ${task.description || '(no description)'}`;
    });

    return `### All Tasks in This Session (${tasks.length} tasks)

**Primary Task**: Task 1 (${tasks[0].id})

${lines.join('\n\n')}`;
}

/**
 * Build the full whoami preview markdown
 */
function buildWhoamiPreview(
    mode: 'execute' | 'orchestrate',
    strategy: WorkerStrategy | OrchestratorStrategy,
    tasks: MaestroTask[],
    projectId: string,
): string {
    const primaryTask = tasks[0];

    const parts: string[] = [];

    // Identity header
    parts.push(`---`);
    parts.push(`# Maestro Session Context`);
    parts.push(``);
    parts.push(`**Mode:** ${mode}`);
    parts.push(`**Strategy:** ${strategy}`);
    if (mode === 'orchestrate') {
        parts.push(`**Orchestrator Strategy:** ${strategy}`);
    }
    parts.push(`**Session ID:** <will be assigned>`);
    parts.push(`**Project ID:** ${projectId}`);
    parts.push(`---`);
    parts.push(``);

    // Assignment section
    if (mode === 'execute') {
        parts.push(`# Maestro Worker Session${strategy === 'tree' ? ' (Tree Strategy)' : ''}`);
    } else {
        parts.push(`# Maestro Orchestrator Session (${strategy} Strategy)`);
    }
    parts.push(``);

    if (mode === 'orchestrate') {
        parts.push(`## Current Task Context`);
        parts.push(``);
        parts.push(`**Task ID:** ${primaryTask.id}`);
        parts.push(`**Title:** ${primaryTask.title}`);
        parts.push(`**Priority:** ${primaryTask.priority}`);
        parts.push(`**Total Tasks:** ${tasks.length}`);
        parts.push(``);
        parts.push(`**Description:**`);
        parts.push(primaryTask.description || '(no description)');
        parts.push(``);
    } else {
        parts.push(`## Your Assignment`);
        parts.push(``);
        parts.push(`You have been assigned to task **${primaryTask.id}**:`);
        parts.push(``);
        parts.push(`**Title:** ${primaryTask.title}`);
        parts.push(``);
        parts.push(`**Description:**`);
        parts.push(primaryTask.description || '(no description)');
        parts.push(``);
        parts.push(`**Priority:** ${primaryTask.priority}`);
        parts.push(``);
    }

    // Multi-task list
    const allTasks = formatTaskList(tasks);
    if (allTasks) {
        parts.push(allTasks);
        parts.push(``);
    }

    // Workflow section
    if (mode === 'execute') {
        parts.push(renderWorkerWorkflow(strategy as WorkerStrategy, primaryTask));
    } else {
        parts.push(renderOrchestratorWorkflow(strategy as OrchestratorStrategy));
    }
    parts.push(``);

    // Commands section
    parts.push(`---`);
    parts.push(``);
    parts.push(renderCommandsSection(mode, strategy));

    return parts.join('\n');
}

export function WhoamiPreview({ mode, strategy, selectedTasks, projectId }: WhoamiPreviewProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (selectedTasks.length === 0) return null;

    const preview = buildWhoamiPreview(mode, strategy, selectedTasks, projectId);

    return (
        <div className={`whoamiPreview ${mode === 'orchestrate' ? 'whoamiPreview--orchestrate' : ''}`}>
            <button type="button"
                className="whoamiPreviewToggle"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="whoamiPreviewToggleIcon">{isExpanded ? '▾' : '▸'}</span>
                <span className="whoamiPreviewToggleLabel">
                    whoami preview
                </span>
                <span className="whoamiPreviewToggleMeta">
                    {mode === 'execute' ? 'worker' : 'orchestrator'} / {strategy} / {selectedTasks.length} task{selectedTasks.length !== 1 ? 's' : ''}
                </span>
            </button>
            {isExpanded && (
                <div className="whoamiPreviewContent">
                    <pre className="whoamiPreviewText">{preview}</pre>
                </div>
            )}
        </div>
    );
}
