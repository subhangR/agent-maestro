import type {
  MaestroManifest,
  CodebaseContext,
  RelatedTask,
  ProjectStandards,
  TaskData,
  AgentMode,
  TeamMemberData,
  MasterProjectInfo,
  TeamMemberProfile,
  TeamContextLens,
  TeamStructureNode,
} from '../types/manifest.js';
import {
  isWorkerMode,
  isCoordinatorMode,
  isCoordinatedMode,
  resolveTeamContextLensForMode,
} from '../types/manifest.js';
import { config } from '../config.js';
import {
  WORKER_PROFILE,
  COORDINATOR_PROFILE,
  COORDINATED_WORKER_PROFILE,
  COORDINATED_COORDINATOR_PROFILE,
  WORKER_IDENTITY_INSTRUCTION,
  COORDINATOR_IDENTITY_INSTRUCTION,
  COORDINATED_WORKER_IDENTITY_INSTRUCTION,
  COORDINATED_COORDINATOR_IDENTITY_INSTRUCTION,
  buildMultiIdentityInstruction,
  ACCEPTANCE_CRITERIA_PLACEHOLDER_PATTERNS,
} from '../prompts/index.js';

/**
 * Recursive delegation protocol injected for a coordinator bound to a saved team.
 */
const TEAM_COORDINATION_PROTOCOL = [
  'You lead this team. Your job is to coordinate, not to do every unit of work yourself.',
  'Match each piece of work to the best-fit member by their role and expertise shown in this structure.',
  'Delegate to a member by creating a child task and spawning a worker session for them:',
  '  maestro task create --parent <taskId> "<sub-task title>"',
  '  maestro session spawn --task <childTaskId> --team-member-id <memberId>',
  'When an entire sub-domain maps to a sub-team, do NOT micromanage that sub-team\'s members.',
  'Instead spawn that sub-team\'s leader (its leader_id) as a sub-coordinator:',
  '  maestro session spawn --task <childTaskId> --team-member-id <subTeamLeaderId>',
  'The sub-leader inherits this team binding and recursively delegates within its own sub-team.',
  'Spawn lazily: only spin up a member or sub-team when there is concrete work ready for them.',
  'Spawned members and sub-coordinators report back up the chain; you synthesize their results and report upward.',
].join('\n');

/**
 * PromptBuilder - Programmatically constructs prompts from manifest data.
 *
 * Builds deterministic XML blocks from manifest fields.
 */
export class PromptBuilder {
  /**
   * System XML mode — identity + capabilities + commands only.
   * Task-specific data is intentionally excluded.
   */
  buildSystemXml(manifest: MaestroManifest): string {
    if (!this.isIdentityContractV2Enabled()) {
      return this.buildLegacySystemXml(manifest);
    }

    const mode = manifest.mode;

    const parts: string[] = [];
    parts.push(`<maestro_system_prompt mode="${mode}" version="3.0">`);
    parts.push(this.buildIdentityKernel(mode, manifest));
    const teamContext = this.buildTeamContext(manifest);
    if (teamContext) parts.push(teamContext);
    const teamStructure = this.buildTeamStructure(manifest);
    if (teamStructure) parts.push(teamStructure);
    const coordinationContext = this.buildCoordinationContext(manifest);
    if (coordinationContext) parts.push(coordinationContext);
    const masterContext = this.buildMasterProjectContext(manifest);
    if (masterContext) parts.push(masterContext);
    const coordinatorPromotion = this.buildCoordinatorPromotionBlock(manifest);
    if (coordinatorPromotion) parts.push(coordinatorPromotion);
    // Note: commands_reference is injected by PromptComposer.
    parts.push('</maestro_system_prompt>');
    return parts.join('\n');
  }

  /**
   * Task XML mode — task/context payload only.
   * Identity is intentionally excluded.
   */
  buildTaskXml(manifest: MaestroManifest): string {
    if (!this.isIdentityContractV2Enabled()) {
      return this.buildLegacyTaskXml(manifest);
    }

    const mode = manifest.mode;

    const parts: string[] = [];
    parts.push(`<maestro_task_prompt mode="${mode}" version="3.0">`);
    parts.push(this.buildTasks(manifest));

    // Include task tree if tasks have parent-child relationships
    if (manifest.tasks.length > 1) {
      const tree = this.buildTaskTree(manifest.tasks);
      if (tree) parts.push(tree);
    }

    const context = this.buildContext(manifest);
    if (context) parts.push(context);

    // Only include skills for Claude (other agent tools don't support plugin-based skills)
    const agentTool = manifest.agentTool || 'claude-code';
    if (manifest.skills && manifest.skills.length > 0 && agentTool === 'claude-code') {
      parts.push(this.buildSkills(manifest.skills));
    }

    parts.push('</maestro_task_prompt>');
    return parts.join('\n');
  }

  private buildLegacySystemXml(manifest: MaestroManifest): string {
    const mode = manifest.mode;

    const parts: string[] = [];
    parts.push(`<maestro_system_prompt mode="${mode}" version="3.0">`);
    parts.push(this.buildIdentity(mode, manifest));
    const teamMemberIdentity = this.buildTeamMemberIdentity(manifest);
    if (teamMemberIdentity) parts.push(teamMemberIdentity);
    const teamMembers = this.buildTeamMembers(manifest.availableTeamMembers, mode, manifest);
    if (teamMembers) parts.push(teamMembers);
    const teamStructure = this.buildTeamStructure(manifest);
    if (teamStructure) parts.push(teamStructure);
    const masterContext = this.buildMasterProjectContext(manifest);
    if (masterContext) parts.push(masterContext);
    const coordinatorPromotion = this.buildCoordinatorPromotionBlock(manifest);
    if (coordinatorPromotion) parts.push(coordinatorPromotion);
    parts.push('</maestro_system_prompt>');
    return parts.join('\n');
  }

  private buildLegacyTaskXml(manifest: MaestroManifest): string {
    const mode = manifest.mode;

    const parts: string[] = [];
    parts.push(`<maestro_task_prompt mode="${mode}" version="3.0">`);
    parts.push(this.buildTasks(manifest));

    if (manifest.tasks.length > 1) {
      const tree = this.buildTaskTree(manifest.tasks);
      if (tree) parts.push(tree);
    }

    const taskSessionContext = this.buildSessionContext(manifest);
    if (taskSessionContext) parts.push(taskSessionContext);

    const taskDirective = this.buildCoordinatorDirective(manifest);
    if (taskDirective) parts.push(taskDirective);

    const context = this.buildContext(manifest);
    if (context) parts.push(context);

    const agentTool = manifest.agentTool || 'claude-code';
    if (manifest.skills && manifest.skills.length > 0 && agentTool === 'claude-code') {
      parts.push(this.buildSkills(manifest.skills));
    }

    parts.push('</maestro_task_prompt>');
    return parts.join('\n');
  }

  // ── Internal builders ────────────────────────────────────────

  private isIdentityContractV2Enabled(): boolean {
    return config.promptIdentityV2;
  }

  private resolveModeIdentity(mode: AgentMode): { profile: string; instruction: string } {
    const profileMap: Record<string, string> = {
      'worker': WORKER_PROFILE,
      'coordinator': COORDINATOR_PROFILE,
      'coordinated-worker': COORDINATED_WORKER_PROFILE,
      'coordinated-coordinator': COORDINATED_COORDINATOR_PROFILE,
    };
    const identityMap: Record<string, string> = {
      'worker': WORKER_IDENTITY_INSTRUCTION,
      'coordinator': COORDINATOR_IDENTITY_INSTRUCTION,
      'coordinated-worker': COORDINATED_WORKER_IDENTITY_INSTRUCTION,
      'coordinated-coordinator': COORDINATED_COORDINATOR_IDENTITY_INSTRUCTION,
    };

    return {
      profile: profileMap[mode] || (isWorkerMode(mode) ? WORKER_PROFILE : COORDINATOR_PROFILE),
      instruction: identityMap[mode] || (isWorkerMode(mode) ? WORKER_IDENTITY_INSTRUCTION : COORDINATOR_IDENTITY_INSTRUCTION),
    };
  }

  private buildIdentityKernel(mode: AgentMode, manifest: MaestroManifest): string {
    const modeIdentity = this.resolveModeIdentity(mode);
    const lines: string[] = ['  <identity_kernel>'];
    lines.push('    <mode_identity>');
    lines.push(`      <profile>${this.esc(modeIdentity.profile)}</profile>`);
    lines.push(`      <instruction>${this.raw(modeIdentity.instruction)}</instruction>`);
    lines.push('    </mode_identity>');

    const selfIdentity = this.buildSelfIdentity(manifest);
    if (selfIdentity) {
      lines.push(selfIdentity);
    }

    lines.push('  </identity_kernel>');
    return lines.join('\n');
  }

  private buildSelfIdentity(manifest: MaestroManifest): string | null {
    const profiles = this.resolveSelfProfiles(manifest);
    if (profiles.length === 0) return null;

    if (profiles.length === 1) {
      return this.buildSingleSelfIdentity(profiles[0]);
    }

    return this.buildMergedSelfIdentity(profiles);
  }

  private resolveSelfProfiles(manifest: MaestroManifest): TeamMemberProfile[] {
    if (manifest.teamMemberProfiles && manifest.teamMemberProfiles.length > 0) {
      return manifest.teamMemberProfiles.filter((profile) => Boolean(profile.identity));
    }

    if (!manifest.teamMemberId || !manifest.teamMemberName || !manifest.teamMemberAvatar) {
      return [];
    }

    if (manifest.teamMemberIdentity === undefined || manifest.teamMemberIdentity === null) {
      return [];
    }

    return [{
      id: manifest.teamMemberId,
      name: manifest.teamMemberName,
      role: manifest.teamMemberRole,
      avatar: manifest.teamMemberAvatar,
      identity: manifest.teamMemberIdentity,
      capabilities: manifest.teamMemberCapabilities,
      commandPermissions: manifest.teamMemberCommandPermissions,
      memory: manifest.teamMemberMemory,
    }];
  }

  private buildSingleSelfIdentity(profile: TeamMemberProfile): string {
    const lines: string[] = ['    <self_identity>'];
    lines.push(`      <id>${this.esc(profile.id)}</id>`);
    lines.push(`      <name>${this.esc(profile.name)}</name>`);
    if (profile.role) {
      lines.push(`      <role>${this.esc(profile.role)}</role>`);
    }
    lines.push(`      <avatar>${this.esc(profile.avatar)}</avatar>`);
    lines.push(`      <identity>${this.raw(profile.identity)}</identity>`);

    if (profile.model) {
      lines.push(`      <model>${this.esc(profile.model)}</model>`);
    }
    if (profile.agentTool) {
      lines.push(`      <agent_tool>${this.esc(profile.agentTool)}</agent_tool>`);
    }
    if (profile.capabilities && Object.keys(profile.capabilities).length > 0) {
      lines.push('      <capabilities>');
      for (const [capability, enabled] of Object.entries(profile.capabilities).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`        <capability name="${this.esc(capability)}" enabled="${enabled}" />`);
      }
      lines.push('      </capabilities>');
    }
    const commandPermissions = this.buildCommandPermissions(profile.commandPermissions, '      ');
    if (commandPermissions) {
      lines.push(commandPermissions);
    }

    if (profile.memory && profile.memory.length > 0) {
      lines.push('      <memory>');
      for (const memory of profile.memory) {
        lines.push(`        <entry>${this.raw(memory)}</entry>`);
      }
      lines.push('      </memory>');
    }

    lines.push('    </self_identity>');
    return lines.join('\n');
  }

  private buildMergedSelfIdentity(profiles: TeamMemberProfile[]): string {
    const combinedName = profiles.map((profile) => profile.name).join(' + ');
    const roleList = profiles.map((profile) => profile.role || profile.name).join(', ');

    const lines: string[] = [`    <self_identity merged="true" profile_count="${profiles.length}">`];
    lines.push(`      <name>${this.esc(combinedName)}</name>`);
    lines.push(`      <avatar>${this.esc(profiles[0].avatar)}</avatar>`);
    lines.push(`      <role>${this.esc(roleList)}</role>`);
    lines.push(`      <instruction>${buildMultiIdentityInstruction(roleList)}</instruction>`);
    for (const profile of profiles) {
      lines.push(`      <expertise source="${this.esc(profile.name)}" id="${this.esc(profile.id)}">${this.raw(profile.identity)}</expertise>`);
    }

    const mergedMemory = profiles.flatMap((profile) => (profile.memory || []).map((entry) => ({
      source: profile.name,
      text: entry,
    })));
    if (mergedMemory.length > 0) {
      lines.push('      <memory>');
      for (const entry of mergedMemory) {
        lines.push(`        <entry source="${this.esc(entry.source)}">${this.raw(entry.text)}</entry>`);
      }
      lines.push('      </memory>');
    }

    lines.push('    </self_identity>');
    return lines.join('\n');
  }

  private buildTeamContext(manifest: MaestroManifest): string | null {
    const teamMembers = manifest.availableTeamMembers;
    if (!teamMembers || teamMembers.length === 0) return null;

    const selfIds = this.resolveSelfIds(manifest);
    const visibleMembers = selfIds.size > 0
      ? teamMembers.filter((member) => !selfIds.has(member.id))
      : teamMembers;

    if (visibleMembers.length === 0) return null;

    const lens = resolveTeamContextLensForMode(manifest.mode);
    const lines: string[] = [`  <team_context lens="${lens}" count="${visibleMembers.length}">`];
    lines.push(`    <instruction>${this.teamContextInstruction(lens)}</instruction>`);

    for (const member of visibleMembers) {
      if (lens === 'full_expertise') {
        lines.push(`    <team_member id="${this.esc(member.id)}" name="${this.esc(member.name)}" role="${this.esc(member.role)}">`);
        lines.push(`      <avatar>${this.esc(member.avatar)}</avatar>`);
        lines.push(`      <identity>${this.raw(member.identity)}</identity>`);
        if (member.memory && member.memory.length > 0) {
          lines.push('      <memory>');
          for (const entry of member.memory) {
            lines.push(`        <entry>${this.raw(entry)}</entry>`);
          }
          lines.push('      </memory>');
        }
        if (member.mode) {
          lines.push(`      <mode>${this.esc(member.mode)}</mode>`);
        }
        if (member.permissionMode) {
          lines.push(`      <permission_mode>${this.esc(member.permissionMode)}</permission_mode>`);
        }
        if (member.model) {
          lines.push(`      <model>${this.esc(member.model)}</model>`);
        }
        if (member.agentTool) {
          lines.push(`      <agent_tool>${this.esc(member.agentTool)}</agent_tool>`);
        }
        if (member.capabilities && Object.keys(member.capabilities).length > 0) {
          lines.push('      <capabilities>');
          for (const [capability, enabled] of Object.entries(member.capabilities).sort(([a], [b]) => a.localeCompare(b))) {
            lines.push(`        <capability name="${this.esc(capability)}" enabled="${enabled}" />`);
          }
          lines.push('      </capabilities>');
        }
        const commandPermissions = this.buildCommandPermissions(member.commandPermissions, '      ');
        if (commandPermissions) {
          lines.push(commandPermissions);
        }
        lines.push('    </team_member>');
        continue;
      }

      lines.push(`    <team_member id="${this.esc(member.id)}" name="${this.esc(member.name)}" role="${this.esc(member.role)}" />`);
    }

    lines.push('  </team_context>');
    return lines.join('\n');
  }

  /**
   * Recursive team structure + delegation protocol for a coordinator bound to a
   * saved team. Renders the full member/sub-team tree and instructs the leader to
   * route work by expertise and spawn sub-team leaders as sub-coordinators (lazy).
   */
  private buildTeamStructure(manifest: MaestroManifest): string | null {
    const tree = manifest.teamStructure;
    if (!tree || !isCoordinatorMode(manifest.mode)) return null;

    const selfIds = this.resolveSelfIds(manifest);

    const renderNode = (node: TeamStructureNode, indent: string): string[] => {
      const out: string[] = [];
      out.push(`${indent}<team id="${this.esc(node.id)}" name="${this.esc(node.name)}" leader_id="${this.esc(node.leaderId)}">`);
      for (const m of node.members || []) {
        const roleAttr = m.role ? ` role="${this.esc(m.role)}"` : '';
        const selfAttr = selfIds.has(m.id) ? ' self="true"' : '';
        out.push(`${indent}  <member id="${this.esc(m.id)}" name="${this.esc(m.name)}"${roleAttr} leader="${m.isLeader}"${selfAttr}>`);
        if (m.identity) out.push(`${indent}    <expertise>${this.raw(m.identity)}</expertise>`);
        out.push(`${indent}  </member>`);
      }
      for (const sub of node.subTeams || []) {
        out.push(...renderNode(sub, `${indent}  `));
      }
      out.push(`${indent}</team>`);
      return out;
    };

    const lines: string[] = ['  <team_structure>'];
    lines.push(`    <protocol>${this.raw(TEAM_COORDINATION_PROTOCOL)}</protocol>`);
    lines.push(...renderNode(tree, '    '));
    lines.push('  </team_structure>');
    return lines.join('\n');
  }

  private buildCoordinationContext(manifest: MaestroManifest): string | null {
    if (!isCoordinatedMode(manifest.mode) || !manifest.coordinatorSessionId) {
      return null;
    }

    const lines: string[] = ['  <coordination_context>'];
    lines.push(`    <coordinator_session_id>${this.esc(manifest.coordinatorSessionId)}</coordinator_session_id>`);

    if (manifest.initialDirective) {
      lines.push('    <directive>');
      lines.push(`      <subject>${this.raw(manifest.initialDirective.subject)}</subject>`);
      lines.push(`      <message>${this.raw(manifest.initialDirective.message)}</message>`);
      lines.push(`      <from_session_id>${this.esc(manifest.initialDirective.fromSessionId)}</from_session_id>`);
      lines.push('    </directive>');
    }

    lines.push('  </coordination_context>');
    return lines.join('\n');
  }

  private resolveSelfIds(manifest: MaestroManifest): Set<string> {
    const selfIds = new Set<string>();
    if (manifest.teamMemberId) {
      selfIds.add(manifest.teamMemberId);
    }
    if (manifest.teamMemberProfiles) {
      for (const profile of manifest.teamMemberProfiles) {
        if (profile.id) {
          selfIds.add(profile.id);
        }
      }
    }
    return selfIds;
  }

  private teamContextInstruction(lens: TeamContextLens): string {
    if (lens === 'full_expertise') {
      return 'Full team expertise context. Use it to coordinate with member strengths, model/tool fit, and execution constraints.';
    }
    return 'Slim team roster for delegation and discovery. Use id, name, and role to assign work.';
  }

  private buildCommandPermissions(
    commandPermissions: TeamMemberProfile['commandPermissions'] | TeamMemberData['commandPermissions'] | undefined,
    indent: string,
  ): string | null {
    if (!commandPermissions) return null;

    const lines: string[] = [`${indent}<command_permissions>`];
    let hasEntries = false;

    if (commandPermissions.groups && Object.keys(commandPermissions.groups).length > 0) {
      hasEntries = true;
      lines.push(`${indent}  <groups>`);
      for (const [group, enabled] of Object.entries(commandPermissions.groups).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`${indent}    <permission name="${this.esc(group)}" enabled="${enabled}" />`);
      }
      lines.push(`${indent}  </groups>`);
    }

    if (commandPermissions.commands && Object.keys(commandPermissions.commands).length > 0) {
      hasEntries = true;
      lines.push(`${indent}  <commands>`);
      for (const [command, enabled] of Object.entries(commandPermissions.commands).sort(([a], [b]) => a.localeCompare(b))) {
        lines.push(`${indent}    <permission name="${this.esc(command)}" enabled="${enabled}" />`);
      }
      lines.push(`${indent}  </commands>`);
    }

    lines.push(`${indent}</command_permissions>`);
    if (!hasEntries) return null;
    return lines.join('\n');
  }

  private buildIdentity(mode: AgentMode, manifest?: MaestroManifest): string {
    const lines = ['  <identity>'];
    const { profile, instruction } = this.resolveModeIdentity(mode);

    lines.push(`    <profile>${profile}</profile>`);
    lines.push(`    <instruction>${instruction}</instruction>`);

    if (manifest) {
      const projectId = manifest.tasks[0]?.projectId;
      if (projectId) {
        lines.push(`    <project_id>${this.esc(projectId)}</project_id>`);
      }
    }
    lines.push('  </identity>');
    return lines.join('\n');
  }

  private buildTeamMemberIdentity(manifest: MaestroManifest): string | null {
    // Multi-identity: merge into a single unified identity block
    if (manifest.teamMemberProfiles && manifest.teamMemberProfiles.length > 1) {
      const profiles = manifest.teamMemberProfiles.filter(p => p.identity);
      if (profiles.length === 0) return null;

      // P1.3: Combined name from all profiles; use first avatar
      const combinedName = profiles.map(p => p.name).join(' + ');
      // P1.5: Use roles (not names) for the expertise instruction
      const roleList = profiles.map(p => p.role || p.name).join(', ');

      const lines = ['  <available_team_members>'];
      lines.push(`    <name>${this.esc(combinedName)}</name>`);
      lines.push(`    <avatar>${this.esc(profiles[0].avatar)}</avatar>`);
      // P3.1: Combined role element
      lines.push(`    <role>${this.esc(roleList)}</role>`);
      lines.push(`    <instructions>${buildMultiIdentityInstruction(roleList)}</instructions>`);
      for (const profile of profiles) {
        lines.push(`    <expertise source="${this.esc(profile.name)}">${this.raw(profile.identity)}</expertise>`);
      }
      // Add team member expertise blocks if this is a coordinator
      if (isCoordinatorMode(manifest.mode) && manifest.availableTeamMembers) {
        const selfIds = new Set<string>();
        if (manifest.teamMemberId) {
          selfIds.add(manifest.teamMemberId);
        }
        if (manifest.teamMemberProfiles) {
          for (const p of manifest.teamMemberProfiles) {
            if (p.id) selfIds.add(p.id);
          }
        }
        for (const member of manifest.availableTeamMembers) {
          if (selfIds.has(member.id)) continue;
          if (!member.identity) continue;
          lines.push(`    <expertise source="${this.esc(member.name)}">${this.raw(member.identity)}</expertise>`);
        }
      }
      // Merge memory from all profiles with source attribution (P1.6)
      const allMemory = profiles.flatMap(p => (p.memory || []).map(m => ({ source: p.name, text: m })));
      if (allMemory.length > 0) {
        lines.push('    <memory>');
        for (const entry of allMemory) {
          lines.push(`      <entry source="${this.esc(entry.source)}">${this.raw(entry.text)}</entry>`);
        }
        lines.push('    </memory>');
      }
      lines.push('  </available_team_members>');
      return lines.join('\n');
    }

    // Single identity (backward compat): check singular fields or single-element profiles array
    if (manifest.teamMemberProfiles && manifest.teamMemberProfiles.length === 1) {
      const profile = manifest.teamMemberProfiles[0];
      if (!profile.identity) return null;
      const lines = ['  <available_team_members>'];
      lines.push(`    <name>${this.esc(profile.name)}</name>`);
      lines.push(`    <avatar>${this.esc(profile.avatar)}</avatar>`);
      // P3.1: Add role element
      if (profile.role) {
        lines.push(`    <role>${this.esc(profile.role)}</role>`);
      }
      lines.push(`    <instructions>${this.raw(profile.identity)}</instructions>`);
      // Add team member expertise blocks if this is a coordinator
      if (isCoordinatorMode(manifest.mode) && manifest.availableTeamMembers) {
        const selfIds = new Set<string>();
        if (manifest.teamMemberId) {
          selfIds.add(manifest.teamMemberId);
        }
        if (manifest.teamMemberProfiles) {
          for (const p of manifest.teamMemberProfiles) {
            if (p.id) selfIds.add(p.id);
          }
        }
        for (const member of manifest.availableTeamMembers) {
          if (selfIds.has(member.id)) continue;
          if (!member.identity) continue;
          lines.push(`    <expertise source="${this.esc(member.name)}">${this.raw(member.identity)}</expertise>`);
        }
      }
      if (profile.memory && profile.memory.length > 0) {
        lines.push('    <memory>');
        for (const entry of profile.memory) {
          lines.push(`      <entry>${this.raw(entry)}</entry>`);
        }
        lines.push('    </memory>');
      }
      lines.push('  </available_team_members>');
      return lines.join('\n');
    }

    // Original singular fields (backward compat)
    if (!manifest.teamMemberId || !manifest.teamMemberName) return null;
    if (manifest.teamMemberIdentity === undefined || manifest.teamMemberIdentity === null) return null;

    const lines = ['  <available_team_members>'];
    lines.push(`    <name>${this.esc(manifest.teamMemberName)}</name>`);
    if (manifest.teamMemberAvatar) {
      lines.push(`    <avatar>${this.esc(manifest.teamMemberAvatar)}</avatar>`);
    }
    // P3.1: Add role element
    if (manifest.teamMemberRole) {
      lines.push(`    <role>${this.esc(manifest.teamMemberRole)}</role>`);
    }
    if (manifest.teamMemberIdentity) {
      lines.push(`    <instructions>${this.raw(manifest.teamMemberIdentity)}</instructions>`);
    }
    // Add team member expertise blocks if this is a coordinator
    if (isCoordinatorMode(manifest.mode) && manifest.availableTeamMembers) {
      const selfIds = new Set<string>();
      if (manifest.teamMemberId) {
        selfIds.add(manifest.teamMemberId);
      }
      for (const member of manifest.availableTeamMembers) {
        if (selfIds.has(member.id)) continue;
        if (!member.identity) continue;
        lines.push(`    <expertise source="${this.esc(member.name)}">${this.raw(member.identity)}</expertise>`);
      }
    }
    if (manifest.teamMemberMemory && manifest.teamMemberMemory.length > 0) {
      lines.push('    <memory>');
      for (const entry of manifest.teamMemberMemory) {
        lines.push(`      <entry>${this.raw(entry)}</entry>`);
      }
      lines.push('    </memory>');
    }
    lines.push('  </available_team_members>');
    return lines.join('\n');
  }

  private buildTasks(manifest: MaestroManifest): string {
    const tasks = manifest.tasks;
    const lines: string[] = [];

    lines.push(`  <tasks count="${tasks.length}">`);
    for (const t of tasks) {
      lines.push(`    <task id="${this.esc(t.id)}">`);
      lines.push(`      <title>${this.esc(t.title)}</title>`);
      lines.push(`      <description>${this.raw(t.description)}</description>`);
      if (t.parentId) {
        lines.push(`      <parent_task_id>${this.esc(t.parentId)}</parent_task_id>`);
      }
      if (t.status) {
        lines.push(`      <status>${this.esc(t.status)}</status>`);
      }
      lines.push(`      <priority>${t.priority || 'medium'}</priority>`);
      const ac = this.formatAcceptanceCriteria(t.acceptanceCriteria);
      if (ac) {
        lines.push(`      <acceptance_criteria>${ac}</acceptance_criteria>`);
      }
      if (t.dependencies && t.dependencies.length > 0) {
        lines.push('      <dependencies>' + t.dependencies.map(d => `<dep>${this.esc(d)}</dep>`).join('') + '</dependencies>');
      }
      if (t.images && t.images.length > 0) {
        lines.push('      <media>');
        lines.push(`        <instruction>Use the Read tool to view these attached images as visual context for this task.</instruction>`);
        for (const img of t.images) {
          lines.push(`        <image filename="${this.esc(img.filename)}" type="${this.esc(img.mimeType)}" path="${this.esc(img.path)}" />`);
        }
        lines.push('      </media>');
      }
      lines.push('    </task>');
    }
    lines.push('  </tasks>');
    return lines.join('\n');
  }

  private buildTaskTree(tasks: TaskData[]): string | null {
    const hasTree = tasks.some(t => t.parentId);
    if (!hasTree) return null;

    const taskMap = new Map<string, TaskData>();
    tasks.forEach(t => taskMap.set(t.id, t));

    const roots = tasks.filter(t => !t.parentId || !taskMap.has(t.parentId));
    const childrenOf = (parentId: string) => tasks.filter(t => t.parentId === parentId);

    const lines: string[] = ['  <task_tree>'];

    const renderNode = (task: TaskData, indent: string) => {
      const status = task.status || 'todo';
      const attrs = [`id="${this.esc(task.id)}"`, `status="${status}"`];
      if (task.priority) attrs.push(`priority="${task.priority}"`);
      if (task.dependencies && task.dependencies.length > 0) {
        attrs.push(`deps="${task.dependencies.join(',')}"`);
      }
      lines.push(`${indent}<node ${attrs.join(' ')}>`);
      lines.push(`${indent}  <title>${this.esc(task.title)}</title>`);
      if (task.description) {
        lines.push(`${indent}  <description>${this.raw(task.description)}</description>`);
      }
      const children = childrenOf(task.id);
      children.forEach(child => renderNode(child, indent + '  '));
      lines.push(`${indent}</node>`);
    };

    roots.forEach(root => renderNode(root, '    '));
    lines.push('  </task_tree>');
    return lines.join('\n');
  }

  private buildSessionContext(manifest: MaestroManifest): string | null {
    const projectId = manifest.tasks[0]?.projectId;
    const sessionId = process.env.MAESTRO_SESSION_ID;

    if (!sessionId && !projectId && !manifest.coordinatorSessionId) return null;

    const lines: string[] = ['  <session_context>'];
    if (sessionId) {
      lines.push(`    <session_id>${this.esc(sessionId)}</session_id>`);
    }
    if (manifest.coordinatorSessionId) {
      lines.push(`    <coordinator_session_id>${this.esc(manifest.coordinatorSessionId)}</coordinator_session_id>`);
    }
    if (projectId) {
      lines.push(`    <project_id>${this.esc(projectId)}</project_id>`);
    }
    lines.push(`    <mode>${manifest.mode}</mode>`);
    lines.push('  </session_context>');
    return lines.join('\n');
  }

  private buildCoordinatorDirective(manifest: MaestroManifest): string | null {
    if (!manifest.initialDirective) return null;

    const lines: string[] = ['  <coordinator_directive>'];
    lines.push(`    <subject>${this.raw(manifest.initialDirective.subject)}</subject>`);
    lines.push(`    <message>${this.raw(manifest.initialDirective.message)}</message>`);
    lines.push('  </coordinator_directive>');
    return lines.join('\n');
  }

  private buildContext(manifest: MaestroManifest): string | null {
    const ctx = manifest.context;
    const sections: string[] = [];

    // Codebase
    const codebase = this.buildCodebaseContext(ctx?.codebaseContext);
    if (codebase) sections.push(codebase);

    // Related tasks
    const related = this.buildRelatedTasks(ctx?.relatedTasks);
    if (related) sections.push(related);

    // Project standards
    const standards = this.buildProjectStandards(ctx?.projectStandards);
    if (standards) sections.push(standards);

    if (sections.length === 0) return null;

    return '  <context>\n' + sections.join('\n') + '\n  </context>';
  }

  private buildCodebaseContext(ctx?: CodebaseContext): string | null {
    if (!ctx) return null;
    const lines: string[] = [];
    let hasContent = false;

    lines.push('    <codebase>');

    if (ctx.recentChanges && ctx.recentChanges.length > 0) {
      lines.push('      <recent_changes>');
      ctx.recentChanges.forEach(c => lines.push(`        <change>${this.esc(c)}</change>`));
      lines.push('      </recent_changes>');
      hasContent = true;
    }

    if (ctx.relevantFiles && ctx.relevantFiles.length > 0) {
      lines.push('      <relevant_files>');
      ctx.relevantFiles.forEach(f => lines.push(`        <file>${this.esc(f)}</file>`));
      lines.push('      </relevant_files>');
      hasContent = true;
    }

    if (ctx.architecture) {
      lines.push(`      <architecture>${this.raw(ctx.architecture)}</architecture>`);
      hasContent = true;
    }

    if (ctx.techStack && ctx.techStack.length > 0) {
      lines.push('      <tech_stack>');
      ctx.techStack.forEach(t => lines.push(`        <technology>${this.esc(t)}</technology>`));
      lines.push('      </tech_stack>');
      hasContent = true;
    }

    lines.push('    </codebase>');

    return hasContent ? lines.join('\n') : null;
  }

  private buildRelatedTasks(tasks?: RelatedTask[]): string | null {
    if (!tasks || tasks.length === 0) return null;

    const lines = ['    <related_tasks>'];
    tasks.forEach(t => {
      lines.push(`      <task id="${this.esc(t.id)}" relationship="${t.relationship}" status="${t.status}">`);
      lines.push(`        <title>${this.esc(t.title)}</title>`);
      lines.push('      </task>');
    });
    lines.push('    </related_tasks>');
    return lines.join('\n');
  }

  private buildProjectStandards(standards?: ProjectStandards): string | null {
    if (!standards) return null;
    const lines: string[] = [];
    let hasContent = false;

    lines.push('    <project_standards>');

    if (standards.codingStyle) {
      lines.push(`      <coding_style>${this.esc(standards.codingStyle)}</coding_style>`);
      hasContent = true;
    }
    if (standards.testingApproach) {
      lines.push(`      <testing_approach>${this.esc(standards.testingApproach)}</testing_approach>`);
      hasContent = true;
    }
    if (standards.documentation) {
      lines.push(`      <documentation>${this.esc(standards.documentation)}</documentation>`);
      hasContent = true;
    }
    if (standards.branchingStrategy) {
      lines.push(`      <branching_strategy>${this.esc(standards.branchingStrategy)}</branching_strategy>`);
      hasContent = true;
    }
    if (standards.cicdPipeline) {
      lines.push(`      <cicd_pipeline>${this.esc(standards.cicdPipeline)}</cicd_pipeline>`);
      hasContent = true;
    }
    if (standards.customGuidelines && standards.customGuidelines.length > 0) {
      lines.push('      <custom_guidelines>');
      standards.customGuidelines.forEach(g => lines.push(`        <guideline>${this.esc(g)}</guideline>`));
      lines.push('      </custom_guidelines>');
      hasContent = true;
    }

    lines.push('    </project_standards>');

    return hasContent ? lines.join('\n') : null;
  }

  private buildSkills(skills: string[]): string {
    const lines = ['  <skills>'];
    skills.forEach(s => lines.push(`    <skill>${this.esc(s)}</skill>`));
    lines.push('  </skills>');
    return lines.join('\n');
  }

  private buildTeamMembers(teamMembers?: TeamMemberData[], mode?: AgentMode, manifest?: MaestroManifest): string | null {
    if (!teamMembers || teamMembers.length === 0) return null;

    // Filter out team members that form this agent's own identity (P1.7: hardened)
    const selfIds = new Set<string>();
    // Always include singular teamMemberId if set
    if (manifest?.teamMemberId) {
      selfIds.add(manifest.teamMemberId);
    }
    // Include all profile IDs (defensive: skip falsy ids)
    if (manifest?.teamMemberProfiles) {
      for (const p of manifest.teamMemberProfiles) {
        if (p.id) selfIds.add(p.id);
      }
    }
    const visibleMembers = selfIds.size > 0
      ? teamMembers.filter(m => !selfIds.has(m.id))
      : teamMembers;

    if (visibleMembers.length === 0) return null;

    const lines: string[] = [`  <available_team_members count="${visibleMembers.length}">`];
    lines.push(`    <instruction>These are the team members available to you for spawning and delegation. Use their id with --team-member-id when spawning sessions.</instruction>`);
    for (const member of visibleMembers) {
      if (mode && isCoordinatorMode(mode)) {
        // Coordinators need full member details for spawning and delegation (P3.2: enriched)
        lines.push(`    <available_team_member id="${this.esc(member.id)}" name="${this.esc(member.name)}" role="${this.esc(member.role)}">`);
        lines.push(`      <avatar>${this.esc(member.avatar)}</avatar>`);
        if (member.mode) {
          lines.push(`      <mode>${this.esc(member.mode)}</mode>`);
        }
        if (member.permissionMode) {
          lines.push(`      <permission_mode>${this.esc(member.permissionMode)}</permission_mode>`);
        }
        if (member.model) {
          lines.push(`      <model>${this.esc(member.model)}</model>`);
        }
        if (member.agentTool) {
          lines.push(`      <agent_tool>${this.esc(member.agentTool)}</agent_tool>`);
        }
        if (member.capabilities && Object.keys(member.capabilities).length > 0) {
          lines.push('      <capabilities>');
          for (const [cap, enabled] of Object.entries(member.capabilities)) {
            lines.push(`        <capability name="${this.esc(cap)}" enabled="${enabled}" />`);
          }
          lines.push('      </capabilities>');
        }
        lines.push('    </available_team_member>');
      } else {
        // Workers need slim roster with ID for peer discovery (P3.3: added id)
        lines.push(`    <available_team_member id="${this.esc(member.id)}" name="${this.esc(member.name)}" role="${this.esc(member.role)}" />`);
      }
    }
    lines.push('  </available_team_members>');
    return lines.join('\n');
  }


  private buildMasterProjectContext(manifest: MaestroManifest): string | null {
    const hasMultipleProjects = manifest.masterProjects && manifest.masterProjects.length > 1;
    if (!manifest.isMaster && !hasMultipleProjects) return null;

    const lines: string[] = ['  <workspace_context>'];
    lines.push('    <description>You can reach any session in any project in this workspace.</description>');

    if (manifest.masterProjects && manifest.masterProjects.length > 0) {
      lines.push('    <projects>');
      for (const p of manifest.masterProjects) {
        const attrs = [
          `id="${this.esc(p.id)}"`,
          `name="${this.esc(p.name)}"`,
          `workingDir="${this.esc(p.workingDir)}"`,
          ...(p.isMaster ? ['isMaster="true"'] : []),
        ].join(' ');
        if (p.description) {
          lines.push(`      <project ${attrs}>`);
          lines.push(`        <description>${this.esc(p.description)}</description>`);
          lines.push('      </project>');
        } else {
          lines.push(`      <project ${attrs} />`);
        }
      }
      lines.push('    </projects>');
    }

    lines.push('    <commands>');
    lines.push('      Use `maestro master projects` to list all projects.');
    lines.push('      Use `maestro master sessions --active` to see live sessions across the workspace.');
    lines.push('      Use `maestro session prompt &lt;id&gt; --message "..."` to message any session in any project.');
    lines.push('      Use `maestro session logs &lt;id&gt;` to read any session\'s recent output.');
    lines.push('      Use `maestro session spawn --project &lt;id&gt; ...` to spawn into another project (requires coordinator mode).');
    lines.push('    </commands>');
    lines.push('  </workspace_context>');
    return lines.join('\n');
  }

  buildCoordinatorPromotionBlock(manifest: MaestroManifest): string | null {
    const mode = manifest.mode;
    const isWorker = mode === 'worker' || mode === 'coordinated-worker';
    if (!isWorker) return null;

    const lines: string[] = ['  <coordinator_promotion>'];
    lines.push('  You are a worker. You can ping, read, and observe any session, but you cannot spawn new ones.');
    lines.push('  If your task requires spawning helpers, run `maestro coordinator enable` first.');
    lines.push('  This converts you to a coordinator for the rest of the session.');
    lines.push('  </coordinator_promotion>');
    return lines.join('\n');
  }

  // ── Formatting helpers ───────────────────────────────────────

  formatAcceptanceCriteria(criteria?: string[]): string | null {
    if (!criteria || criteria.length === 0) {
      return null;
    }
    // Filter out generic placeholder strings that add no value
    const PLACEHOLDER_PATTERNS = ACCEPTANCE_CRITERIA_PLACEHOLDER_PATTERNS;
    const meaningful = criteria.filter(c => {
      const lower = c.trim().toLowerCase();
      return lower.length > 0 && !PLACEHOLDER_PATTERNS.includes(lower);
    });
    if (meaningful.length === 0) {
      return null;
    }
    if (meaningful.length === 1) {
      return meaningful[0];
    }
    return meaningful.map((c, i) => `${i + 1}. ${c}`).join('\n');
  }

  /**
   * Escape XML special characters in attribute values and short structured fields.
   * NOT for freeform text content (identity, descriptions) — use raw() for those.
   */
  private esc(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Pass through freeform text content as-is (no escaping).
   * Used for identity instructions, task descriptions, workflow phases, etc.
   * LLMs read these as natural text — escaping makes them harder to parse.
   */
  private raw(str: string): string {
    return str;
  }
}
