import { Command } from 'commander';
import { api } from '../api.js';
import { config } from '../config.js';
import { outputJSON, outputTable, outputKeyValue, outputErrorJSON } from '../utils/formatter.js';
import { handleError } from '../utils/errors.js';
import { guardCommand } from '../services/command-permissions.js';
import { normalizeMode, type AgentModeInput } from '../types/manifest.js';
import type { TeamMemberResponse } from '../types/api-responses.js';
import ora from 'ora';
import { resolveProjectScope } from '../utils/project-scope.js';

export function registerTeamMemberCommands(program: Command) {
    const teamMember = program.command('team-member').description('Manage team members');

    teamMember.command('list')
        .description('List team members for the current project')
        .option('--all', 'Include archived members')
        .option('--status <status>', 'Filter by status: active or archived')
        .option('--mode <mode>', 'Filter by mode: worker, coordinator, coordinated-worker, coordinated-coordinator')
        .option('--project-id <id>', 'Filter by project ID (overrides global --project)')
        .option('--all-projects', 'List team members from all projects')
        .action(async (cmdOpts: { all?: boolean; status?: string; mode?: string; projectId?: string; allProjects?: boolean }) => {
            await guardCommand('team-member:list');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const scope = resolveProjectScope(
                { projectId: cmdOpts.projectId, allProjects: cmdOpts.allProjects },
                globalOpts,
            );
            const projectId = scope.projectId;

            // Validate status filter
            if (cmdOpts.status && !['active', 'archived'].includes(cmdOpts.status)) {
                const err = { message: `Invalid status "${cmdOpts.status}". Must be: active or archived` };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            // Validate mode filter
            const normalizedFilterMode = cmdOpts.mode
                ? normalizeMode(cmdOpts.mode as AgentModeInput, false)
                : null;

            if (cmdOpts.mode && !['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator', 'execute', 'coordinate'].includes(cmdOpts.mode)) {
                const err = { message: `Invalid mode "${cmdOpts.mode}". Must be: worker, coordinator, coordinated-worker, coordinated-coordinator (legacy execute/coordinate are accepted)` };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const spinner = !isJson ? ora('Fetching team members...').start() : null;

            try {
                const endpoint = projectId
                    ? `/api/team-members?projectId=${projectId}`
                    : '/api/team-members';
                const members = await api.get<TeamMemberResponse[]>(endpoint);

                spinner?.stop();

                // Apply filters
                let filtered = members;
                if (cmdOpts.all) {
                    // include all statuses
                } else if (cmdOpts.status) {
                    filtered = members.filter(m => m.status === cmdOpts.status);
                } else {
                    filtered = members.filter(m => m.status === 'active');
                }

                if (normalizedFilterMode) {
                    filtered = filtered.filter(m => {
                        const mode = normalizeMode((m.mode || 'worker') as AgentModeInput, false);
                        return mode === normalizedFilterMode;
                    });
                }

                if (isJson) {
                    outputJSON(filtered);
                } else {
                    if (filtered.length === 0) {
                        console.log('No team members found.');
                    } else {
                        outputTable(
                            ['ID', 'Name', 'Role', 'Mode', 'Status', 'Scope', 'Default'],
                            filtered.map(m => [
                                m.id,
                                `${m.avatar} ${m.name}`,
                                m.role,
                                m.mode || 'worker',
                                m.status,
                                m.scope === 'global' ? 'global' : 'project',
                                m.isDefault ? 'yes' : 'no',
                            ])
                        );
                    }
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    teamMember.command('get <teamMemberId>')
        .description('Get team member details')
        .action(async (teamMemberId: string) => {
            await guardCommand('team-member:get');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            const spinner = !isJson ? ora('Fetching team member...').start() : null;

            try {
                const endpoint = projectId
                    ? `/api/team-members/${teamMemberId}?projectId=${projectId}`
                    : `/api/team-members/${teamMemberId}`;
                const member = await api.get<TeamMemberResponse>(endpoint);

                spinner?.stop();

                if (isJson) {
                    outputJSON(member);
                } else {
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    outputKeyValue('Role', member.role);
                    outputKeyValue('Mode', member.mode || 'worker');
                    outputKeyValue('Model', member.model || 'sonnet');
                    outputKeyValue('Agent Tool', member.agentTool || 'claude-code');
                    outputKeyValue('Permission Mode', member.permissionMode || 'default');
                    outputKeyValue('Default', member.isDefault ? 'yes' : 'no');
                    outputKeyValue('Scope', member.scope === 'global' ? 'global' : 'project');
                    outputKeyValue('Status', member.status);
                    if (member.identity) {
                        outputKeyValue('Identity', member.identity || '');
                    }
                    if (member.skillIds && member.skillIds.length > 0) {
                        outputKeyValue('Skill IDs', member.skillIds.join(', '));
                    }
                    if (member.capabilities && Object.keys(member.capabilities).length > 0) {
                        console.log('Capabilities:');
                        Object.entries(member.capabilities).forEach(([k, v]) => {
                            console.log(`  ${k}: ${v}`);
                        });
                    }
                    if (member.commandPermissions && (
                        Object.keys(member.commandPermissions.groups || {}).length > 0 ||
                        Object.keys(member.commandPermissions.commands || {}).length > 0
                    )) {
                        console.log('Command Permissions:');
                        const groups = member.commandPermissions.groups || {};
                        const cmds = member.commandPermissions.commands || {};
                        if (Object.keys(groups).length > 0) {
                            console.log('  Groups:');
                            Object.entries(groups).forEach(([g, v]) => console.log(`    ${g}: ${v}`));
                        }
                        if (Object.keys(cmds).length > 0) {
                            console.log('  Commands:');
                            Object.entries(cmds).forEach(([c, v]) => console.log(`    ${c}: ${v}`));
                        }
                    }
                    const memoryList = member.memory || [];
                    if (memoryList.length > 0) {
                        outputKeyValue('Memory', `${memoryList.length} entries`);
                        memoryList.forEach((entry: string, i: number) => {
                            console.log(`  ${i + 1}. ${entry}`);
                        });
                    }
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    teamMember.command('edit <teamMemberId>')
        .description('Edit a team member')
        .option('--name <name>', 'Update team member name')
        .option('--role <role>', 'Update role description')
        .option('--avatar <emoji>', 'Update avatar emoji')
        .option('--mode <mode>', 'Update agent mode: worker, coordinator, coordinated-worker, coordinated-coordinator')
        .option('--model <model>', 'Update model (e.g. sonnet, claude-fable-5, claude-opus-4-8, claude-opus-4-7[1m], gpt-5.5, hermes-default)')
        .option('--model-profile <id>', 'Bind to a model profile id (resolves at spawn); pass "" to clear and use --model')
        .option('--agent-tool <tool>', 'Update agent tool (claude-code, codex, hermes, or gemini)')
        .option('--permission-mode <mode>', 'Update permission mode: acceptEdits, interactive, readOnly, or bypassPermissions')
        .option('--identity <instructions>', 'Update identity/persona instructions')
        .option('--skills <skills>', 'Update assigned skill IDs (comma-separated, e.g. react-expert,frontend-design)')
        .option('--scope <scope>', 'Update scope: project or global')
        .action(async (teamMemberId: string, cmdOpts: { name?: string; role?: string; avatar?: string; mode?: string; model?: string; modelProfile?: string; agentTool?: string; permissionMode?: string; identity?: string; skills?: string; scope?: string }) => {
            await guardCommand('team-member:edit');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            // Validate mode if provided
            if (cmdOpts.mode) {
                const validModes = ['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator', 'execute', 'coordinate'];
                if (!validModes.includes(cmdOpts.mode)) {
                    const err = { message: `Invalid mode "${cmdOpts.mode}". Must be one of: ${validModes.join(', ')}` };
                    if (isJson) { outputErrorJSON(err); process.exit(1); }
                    else { console.error(err.message); process.exit(1); }
                }
            }

            // Validate agent tool if provided
            if (cmdOpts.agentTool) {
                const validAgentTools = ['claude-code', 'codex', 'hermes', 'gemini'];
                if (!validAgentTools.includes(cmdOpts.agentTool)) {
                    const err = { message: `Invalid agent tool "${cmdOpts.agentTool}". Must be one of: ${validAgentTools.join(', ')}` };
                    if (isJson) { outputErrorJSON(err); process.exit(1); }
                    else { console.error(err.message); process.exit(1); }
                }
            }

            // Validate permission mode if provided
            if (cmdOpts.permissionMode) {
                const validPermissionModes = ['acceptEdits', 'interactive', 'readOnly', 'bypassPermissions'];
                if (!validPermissionModes.includes(cmdOpts.permissionMode)) {
                    const err = { message: `Invalid permission mode "${cmdOpts.permissionMode}". Must be one of: ${validPermissionModes.join(', ')}` };
                    if (isJson) { outputErrorJSON(err); process.exit(1); }
                    else { console.error(err.message); process.exit(1); }
                }
            }

            // Build update payload from provided options
            const updates: Record<string, unknown> = { projectId };
            if (cmdOpts.name) updates.name = cmdOpts.name.trim();
            if (cmdOpts.role) updates.role = cmdOpts.role.trim();
            if (cmdOpts.avatar) updates.avatar = cmdOpts.avatar.trim();
            if (cmdOpts.mode) updates.mode = normalizeMode(cmdOpts.mode as AgentModeInput, false);
            if (cmdOpts.model) updates.model = cmdOpts.model;
            // Distinguish "flag omitted" (undefined) from "--model-profile ''" (clear binding).
            if (cmdOpts.modelProfile !== undefined) updates.modelProfileId = cmdOpts.modelProfile;
            if (cmdOpts.agentTool) updates.agentTool = cmdOpts.agentTool;
            if (cmdOpts.permissionMode) updates.permissionMode = cmdOpts.permissionMode;
            if (cmdOpts.identity) updates.identity = cmdOpts.identity.trim();
            if (cmdOpts.skills) updates.skillIds = cmdOpts.skills.split(',').map((s: string) => s.trim()).filter(Boolean);
            if (cmdOpts.scope) {
                if (!['project', 'global'].includes(cmdOpts.scope)) {
                    const err = { message: `Invalid scope "${cmdOpts.scope}". Must be: project or global` };
                    if (isJson) { outputErrorJSON(err); process.exit(1); }
                    else { console.error(err.message); process.exit(1); }
                }
                updates.scope = cmdOpts.scope;
            }

            // Check that at least one field is being updated
            const fieldCount = Object.keys(updates).length - 1; // exclude projectId
            if (fieldCount === 0) {
                const err = { message: 'No fields to update. Provide at least one option (e.g. --name, --role, --identity, --mode).' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const spinner = !isJson ? ora('Updating team member...').start() : null;

            try {
                const member = await api.patch<TeamMemberResponse>(`/api/team-members/${teamMemberId}`, updates);

                spinner?.succeed('Team member updated');

                if (isJson) {
                    outputJSON(member);
                } else {
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    outputKeyValue('Role', member.role);
                    outputKeyValue('Mode', member.mode || 'worker');
                    outputKeyValue('Model', member.model || 'sonnet');
                    outputKeyValue('Agent Tool', member.agentTool || 'claude-code');
                    if (member.identity) {
                        outputKeyValue('Identity', member.identity || '');
                    }
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    // ── Lifecycle commands ─────────────────────────────────────
    teamMember.command('archive <teamMemberId>')
        .description('Archive a team member')
        .action(async (teamMemberId: string) => {
            await guardCommand('team-member:archive');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const spinner = !isJson ? ora('Archiving team member...').start() : null;

            try {
                const member = await api.post<TeamMemberResponse>(`/api/team-members/${teamMemberId}/archive`, { projectId });

                spinner?.succeed('Team member archived');

                if (isJson) {
                    outputJSON(member);
                } else {
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    outputKeyValue('Status', member.status);
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    teamMember.command('unarchive <teamMemberId>')
        .description('Unarchive a team member')
        .action(async (teamMemberId: string) => {
            await guardCommand('team-member:unarchive');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const spinner = !isJson ? ora('Unarchiving team member...').start() : null;

            try {
                const member = await api.post<TeamMemberResponse>(`/api/team-members/${teamMemberId}/unarchive`, { projectId });

                spinner?.succeed('Team member unarchived');

                if (isJson) {
                    outputJSON(member);
                } else {
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    outputKeyValue('Status', member.status);
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    teamMember.command('delete <teamMemberId>')
        .description('Delete a team member (member must be archived first)')
        .action(async (teamMemberId: string) => {
            await guardCommand('team-member:delete');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            if (!isJson) {
                console.log('Warning: Team members must be archived before deletion. Use "team-member archive <id>" first.');
            }

            const spinner = !isJson ? ora('Deleting team member...').start() : null;

            try {
                const result = await api.delete<TeamMemberResponse>(`/api/team-members/${teamMemberId}?projectId=${projectId}`);

                spinner?.succeed('Team member deleted');

                if (isJson) {
                    outputJSON(result);
                } else {
                    console.log(`Team member ${teamMemberId} deleted.`);
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    teamMember.command('reset <teamMemberId>')
        .description('Reset a default team member to its original settings')
        .action(async (teamMemberId: string) => {
            await guardCommand('team-member:reset');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const spinner = !isJson ? ora('Resetting team member...').start() : null;

            try {
                const member = await api.post<TeamMemberResponse>(`/api/team-members/${teamMemberId}/reset`, { projectId });

                spinner?.succeed('Team member reset to defaults');

                if (isJson) {
                    outputJSON(member);
                } else {
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    outputKeyValue('Role', member.role);
                    outputKeyValue('Mode', member.mode || 'worker');
                    outputKeyValue('Status', member.status);
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    // ── Self-update identity command ─────────────────────────────
    teamMember.command('update-identity <teamMemberId>')
        .description('Update own identity/persona instructions (self-awareness)')
        .requiredOption('--identity <instructions>', 'New identity/persona instructions')
        .action(async (teamMemberId: string, cmdOpts: { identity: string }) => {
            await guardCommand('team-member:update-identity');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const spinner = !isJson ? ora('Updating identity...').start() : null;

            try {
                const member = await api.patch<TeamMemberResponse>(`/api/team-members/${teamMemberId}`, {
                    projectId,
                    identity: cmdOpts.identity.trim(),
                });

                spinner?.succeed('Identity updated');

                if (isJson) {
                    outputJSON(member);
                } else {
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    outputKeyValue('Identity', member.identity || '');
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    // ── Memory commands ────────────────────────────────────────
    const memory = teamMember.command('memory').description('Manage team member memory (persistent notes)');

    memory.command('append <teamMemberId>')
        .description('Append an entry to team member memory')
        .requiredOption('--entry <text>', 'Memory entry to store')
        .action(async (teamMemberId: string, cmdOpts: { entry: string }) => {
            await guardCommand('team-member:memory:append');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const trimmedEntry = cmdOpts.entry.trim();
            if (!trimmedEntry) {
                const err = { message: 'Memory entry cannot be empty.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const spinner = !isJson ? ora('Appending to memory...').start() : null;

            try {
                const member = await api.post<TeamMemberResponse>(`/api/team-members/${teamMemberId}/memory`, {
                    projectId,
                    entries: [trimmedEntry],
                });

                spinner?.succeed('Memory entry added');

                if (isJson) {
                    outputJSON(member);
                } else {
                    const memoryList = member.memory || [];
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    outputKeyValue('Memory entries', String(memoryList.length));
                    if (memoryList.length > 0) {
                        console.log('\nMemory:');
                        memoryList.forEach((entry: string, i: number) => {
                            console.log(`  ${i + 1}. ${entry}`);
                        });
                    }
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    memory.command('list <teamMemberId>')
        .description('List all memory entries for a team member')
        .action(async (teamMemberId: string) => {
            await guardCommand('team-member:memory:list');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const spinner = !isJson ? ora('Fetching memory...').start() : null;

            try {
                const member = await api.get<TeamMemberResponse>(`/api/team-members/${teamMemberId}?projectId=${projectId}`);

                spinner?.stop();

                if (isJson) {
                    outputJSON({ id: member.id, name: member.name, memory: member.memory || [] });
                } else {
                    const memoryList = member.memory || [];
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    outputKeyValue('Memory entries', String(memoryList.length));
                    if (memoryList.length > 0) {
                        console.log('\nMemory:');
                        memoryList.forEach((entry: string, i: number) => {
                            console.log(`  ${i + 1}. ${entry}`);
                        });
                    } else {
                        console.log('\nNo memory entries.');
                    }
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    memory.command('clear <teamMemberId>')
        .description('Clear all memory entries for a team member')
        .action(async (teamMemberId: string) => {
            await guardCommand('team-member:memory:clear');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            const spinner = !isJson ? ora('Clearing memory...').start() : null;

            try {
                const member = await api.patch<TeamMemberResponse>(`/api/team-members/${teamMemberId}`, {
                    projectId,
                    memory: [],
                });

                spinner?.succeed('Memory cleared');

                if (isJson) {
                    outputJSON(member);
                } else {
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    console.log('Memory cleared.');
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });

    teamMember.command('create <name>')
        .description('Create a new team member')
        .requiredOption('--role <role>', 'Role description for the team member')
        .requiredOption('--avatar <emoji>', 'Avatar emoji for the team member')
        .requiredOption('--mode <mode>', 'Agent mode: worker, coordinator, coordinated-worker, coordinated-coordinator')
        .option('--model <model>', 'Model to use (e.g. sonnet, claude-fable-5, claude-opus-4-8, claude-opus-4-7[1m], gpt-5.5, hermes-default, or native model names)')
        .option('--model-profile <id>', 'Bind to a model profile id (resolves at spawn instead of --model)')
        .option('--agent-tool <tool>', 'Agent tool (claude-code, codex, hermes, or gemini)', 'claude-code')
        .option('--permission-mode <mode>', 'Permission mode: acceptEdits, interactive, readOnly, or bypassPermissions')
        .option('--identity <instructions>', 'Custom identity/persona instructions')
        .option('--skills <skills>', 'Comma-separated skill IDs to assign (e.g. react-expert,frontend-design)')
        .option('--global', 'Make this team member available across all projects')
        .action(async (name: string, cmdOpts: { role: string; avatar: string; mode: string; model?: string; modelProfile?: string; agentTool?: string; permissionMode?: string; identity?: string; skills?: string; global?: boolean }) => {
            await guardCommand('team-member:create');
            const globalOpts = program.opts();
            const isJson = globalOpts.json;
            const projectId = globalOpts.project || config.projectId;

            if (!projectId) {
                const err = { message: 'No project context found. Use --project <id> or set MAESTRO_PROJECT_ID.' };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            // Validate mode
            const validModes = ['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator', 'execute', 'coordinate'];
            if (!validModes.includes(cmdOpts.mode)) {
                const err = { message: `Invalid mode "${cmdOpts.mode}". Must be one of: ${validModes.join(', ')}` };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            // Validate agent tool
            const validAgentTools = ['claude-code', 'codex', 'hermes', 'gemini'];
            if (cmdOpts.agentTool && !validAgentTools.includes(cmdOpts.agentTool)) {
                const err = { message: `Invalid agent tool "${cmdOpts.agentTool}". Must be one of: ${validAgentTools.join(', ')}` };
                if (isJson) { outputErrorJSON(err); process.exit(1); }
                else { console.error(err.message); process.exit(1); }
            }

            // Validate permission mode if provided
            if (cmdOpts.permissionMode) {
                const validPermissionModes = ['acceptEdits', 'interactive', 'readOnly', 'bypassPermissions'];
                if (!validPermissionModes.includes(cmdOpts.permissionMode)) {
                    const err = { message: `Invalid permission mode "${cmdOpts.permissionMode}". Must be one of: ${validPermissionModes.join(', ')}` };
                    if (isJson) { outputErrorJSON(err); process.exit(1); }
                    else { console.error(err.message); process.exit(1); }
                }
            }

            const spinner = !isJson ? ora('Creating team member...').start() : null;

            try {
                const payload: Record<string, unknown> = {
                    projectId,
                    name: name.trim(),
                    role: cmdOpts.role.trim(),
                    avatar: cmdOpts.avatar.trim(),
                    mode: normalizeMode(cmdOpts.mode as AgentModeInput, false),
                    agentTool: cmdOpts.agentTool || 'claude-code',
                    identity: cmdOpts.identity?.trim() || '',
                };

                if (cmdOpts.model) {
                    payload.model = cmdOpts.model;
                }

                if (cmdOpts.modelProfile) {
                    payload.modelProfileId = cmdOpts.modelProfile;
                }

                if (cmdOpts.permissionMode) {
                    payload.permissionMode = cmdOpts.permissionMode;
                }

                if (cmdOpts.skills) {
                    payload.skillIds = cmdOpts.skills.split(',').map((s: string) => s.trim()).filter(Boolean);
                }

                if (cmdOpts.global) {
                    payload.scope = 'global';
                }

                const member = await api.post<TeamMemberResponse>('/api/team-members', payload);

                spinner?.succeed('Team member created');

                if (isJson) {
                    outputJSON(member);
                } else {
                    outputKeyValue('ID', member.id);
                    outputKeyValue('Name', `${member.avatar} ${member.name}`);
                    outputKeyValue('Role', member.role);
                    outputKeyValue('Mode', member.mode || 'worker');
                    outputKeyValue('Model', member.model || 'sonnet');
                    outputKeyValue('Agent Tool', member.agentTool || 'claude-code');
                }
            } catch (err) {
                spinner?.stop();
                handleError(err, isJson);
            }
        });
}
