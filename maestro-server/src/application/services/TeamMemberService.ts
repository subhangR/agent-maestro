import { TeamMember, TeamMemberSnapshot, CreateTeamMemberPayload, UpdateTeamMemberPayload } from '../../types';
import { ITeamMemberRepository } from '../../domain/repositories/ITeamMemberRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ValidationError, NotFoundError, ForbiddenError, BusinessRuleError } from '../../domain/common/Errors';
import { GLOBAL_PROJECT_ID } from '../../infrastructure/repositories/FileSystemTeamMemberRepository';

/**
 * Application service for team member operations.
 * Manages team member lifecycle, validation, and events.
 */
export class TeamMemberService {
  constructor(
    private teamMemberRepo: ITeamMemberRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator
  ) {}

  /**
   * Create a new custom team member.
   * Business rules:
   * - Generates ID with 'tm' prefix
   * - Sets isDefault: false
   * - Sets status: 'active'
   */
  async createTeamMember(data: CreateTeamMemberPayload): Promise<TeamMember> {
    // Validation
    if (!data.projectId) {
      throw new ValidationError('Project ID is required');
    }
    if (!data.name || data.name.trim() === '') {
      throw new ValidationError('Team member name is required');
    }
    if (!data.role || data.role.trim() === '') {
      throw new ValidationError('Team member role is required');
    }
    if (!data.avatar || data.avatar.trim() === '') {
      throw new ValidationError('Team member avatar is required');
    }

    const now = new Date().toISOString();
    const member: TeamMember = {
      id: this.idGenerator.generate('tm'),
      projectId: data.projectId,
      ...(data.scope && { scope: data.scope }),
      name: data.name.trim(),
      role: data.role.trim(),
      identity: data.identity ? data.identity.trim() : `You are ${data.name.trim()}. ${data.role.trim()}.`,
      avatar: data.avatar.trim(),
      model: data.model,
      ...(data.modelProfileId && { modelProfileId: data.modelProfileId }),
      agentTool: data.agentTool,
      mode: data.mode,
      permissionMode: data.permissionMode,
      skillIds: data.skillIds || [],
      isDefault: false,
      status: 'active',
      ...(data.capabilities && { capabilities: data.capabilities }),
      ...(data.commandPermissions && { commandPermissions: data.commandPermissions }),
      ...(data.workflowTemplateId && { workflowTemplateId: data.workflowTemplateId }),
      ...(data.customWorkflow && { customWorkflow: data.customWorkflow }),
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.teamMemberRepo.create(member);
    await this.eventBus.emit('team_member:created', created);

    return created;
  }

  /**
   * Get a team member by ID within a project.
   */
  async getTeamMember(projectId: string, id: string): Promise<TeamMember> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const member = await this.teamMemberRepo.findById(projectId, id);
    if (!member) {
      throw new NotFoundError('Team member', id);
    }
    return member;
  }

  /**
   * Get a team member by ID without requiring projectId.
   * Uses cache-first lookup (IDs are globally unique).
   */
  async getTeamMemberById(id: string): Promise<TeamMember> {
    const member = await this.teamMemberRepo.findById(GLOBAL_PROJECT_ID, id);
    if (!member) {
      throw new NotFoundError('Team member', id);
    }
    return member;
  }

  /**
   * Get all team members for a project.
   * Returns defaults (with overrides applied) + custom members.
   */
  async getProjectTeamMembers(projectId: string): Promise<TeamMember[]> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const members = await this.teamMemberRepo.findByProjectId(projectId);
    return members.filter(m => m.status !== 'archived');
  }

  /**
   * Get all global team members (scope === 'global').
   */
  async getGlobalTeamMembers(): Promise<TeamMember[]> {
    const members = await this.teamMemberRepo.findByProjectId(GLOBAL_PROJECT_ID);
    return members.filter(m => m.status !== 'archived' && m.scope === 'global');
  }

  /**
   * Update a team member.
   * Business rules:
   * - For default members: delegates to saveDefaultOverride()
   * - For custom members: updates the main JSON file
   * - Emits team_member:updated event
   */
  async updateTeamMember(projectId: string, id: string, updates: UpdateTeamMemberPayload): Promise<TeamMember> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    // Validation
    if (updates.name !== undefined && updates.name.trim() === '') {
      throw new ValidationError('Team member name cannot be empty');
    }
    if (updates.role !== undefined && updates.role.trim() === '') {
      throw new ValidationError('Team member role cannot be empty');
    }
    if (updates.avatar !== undefined && updates.avatar.trim() === '') {
      throw new ValidationError('Team member avatar cannot be empty');
    }

    // Fetch current member to check if it's a default
    const current = await this.getTeamMember(projectId, id);

    // Prepare clean updates
    const cleanUpdates: Partial<TeamMember> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
    if (updates.role !== undefined) cleanUpdates.role = updates.role.trim();
    if (updates.identity !== undefined) cleanUpdates.identity = updates.identity.trim();
    if (updates.avatar !== undefined) cleanUpdates.avatar = updates.avatar.trim();
    if (updates.model !== undefined) cleanUpdates.model = updates.model;
    // Empty string clears the binding; undefined leaves it untouched.
    if (updates.modelProfileId !== undefined) cleanUpdates.modelProfileId = updates.modelProfileId || undefined;
    if (updates.agentTool !== undefined) cleanUpdates.agentTool = updates.agentTool;
    if (updates.mode !== undefined) cleanUpdates.mode = updates.mode;
    if (updates.skillIds !== undefined) cleanUpdates.skillIds = updates.skillIds;
    if (updates.status !== undefined) {
      // Prevent archiving default members via PATCH bypass
      if (updates.status === 'archived' && current.isDefault) {
        throw new ForbiddenError('Cannot archive default team members.');
      }
      cleanUpdates.status = updates.status;
    }
    if (updates.capabilities !== undefined) cleanUpdates.capabilities = updates.capabilities;
    if (updates.commandPermissions !== undefined) cleanUpdates.commandPermissions = updates.commandPermissions;
    if (updates.workflowTemplateId !== undefined) cleanUpdates.workflowTemplateId = updates.workflowTemplateId;
    if (updates.customWorkflow !== undefined) cleanUpdates.customWorkflow = updates.customWorkflow;
    if (updates.memory !== undefined) cleanUpdates.memory = updates.memory;
    if (updates.permissionMode !== undefined) cleanUpdates.permissionMode = updates.permissionMode;
    if (updates.scope !== undefined) cleanUpdates.scope = updates.scope;

    // Update through repository (handles both defaults via override and custom via file)
    const updated = await this.teamMemberRepo.update(id, { ...cleanUpdates, projectId });
    await this.eventBus.emit('team_member:updated', updated);

    return updated;
  }

  /**
   * Delete a team member.
   * Business rules:
   * - Must check isDefault === false
   * - Must check status === 'archived'
   * - Throws ForbiddenError for default members
   * - Throws BusinessRuleError if not archived
   */
  async deleteTeamMember(projectId: string, id: string): Promise<void> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const member = await this.getTeamMember(projectId, id);

    // Check if it's a default member
    if (member.isDefault) {
      throw new ForbiddenError('Cannot delete default team members. You can customize them using the update endpoint.');
    }

    // Check if it's archived
    if (member.status !== 'archived') {
      throw new BusinessRuleError('Team member must be archived before deletion. Use the archive endpoint first.');
    }

    await this.teamMemberRepo.delete(id);
    await this.eventBus.emit('team_member:deleted', { id });
  }

  /**
   * Archive a team member.
   * Sets status to 'archived' and emits team_member:archived event.
   */
  async archiveTeamMember(projectId: string, id: string): Promise<TeamMember> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const member = await this.getTeamMember(projectId, id);

    // Check if it's a default member
    if (member.isDefault) {
      throw new ForbiddenError('Cannot archive default team members.');
    }

    if (member.status === 'archived') {
      // Already archived, just return it
      return member;
    }

    const updated = await this.teamMemberRepo.update(id, {
      status: 'archived',
      updatedAt: new Date().toISOString(),
      projectId,
    });

    await this.eventBus.emit('team_member:archived', updated);

    return updated;
  }

  /**
   * Unarchive a team member.
   * Sets status to 'active'.
   */
  async unarchiveTeamMember(projectId: string, id: string): Promise<TeamMember> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const member = await this.getTeamMember(projectId, id);

    // Check if it's a default member
    if (member.isDefault) {
      throw new ForbiddenError('Cannot unarchive default team members.');
    }

    if (member.status === 'active') {
      // Already active, just return it
      return member;
    }

    const updated = await this.teamMemberRepo.update(id, {
      status: 'active',
      updatedAt: new Date().toISOString(),
      projectId,
    });

    await this.eventBus.emit('team_member:updated', updated);

    return updated;
  }

  /**
   * Reset a default team member to code defaults.
   * Deletes the .override.json file.
   * Throws NotFoundError if not a default member.
   */
  async resetDefault(projectId: string, id: string): Promise<TeamMember> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const member = await this.getTeamMember(projectId, id);

    if (!member.isDefault) {
      throw new NotFoundError('Default team member', id);
    }

    await this.teamMemberRepo.resetDefault(projectId, id);

    // Fetch the reset member
    const reset = await this.getTeamMember(projectId, id);
    await this.eventBus.emit('team_member:updated', reset);

    return reset;
  }

  /**
   * Atomically append entries to a team member's memory.
   * Performs the read-modify-write in one place to reduce (but not eliminate) the
   * race window compared to callers doing it themselves.
   */
  async appendMemory(projectId: string, id: string, entries: string[]): Promise<TeamMember> {
    const current = await this.getTeamMember(projectId, id);
    const existingMemory = current.memory ?? [];
    const newMemory = [...existingMemory, ...entries];
    return this.updateTeamMember(projectId, id, { memory: newMemory });
  }

  /**
   * Atomically edit a single memory entry in place, addressed by its 0-based index.
   * Performs the read-modify-write in one place to reduce the race window.
   */
  async editMemoryEntry(projectId: string, id: string, index: number, entry: string): Promise<TeamMember> {
    const trimmed = entry.trim();
    if (!trimmed) {
      throw new ValidationError('Memory entry cannot be empty');
    }

    const current = await this.getTeamMember(projectId, id);
    const memory = [...(current.memory ?? [])];

    if (!Number.isInteger(index) || index < 0 || index >= memory.length) {
      throw new NotFoundError('Memory entry', String(index));
    }

    memory[index] = trimmed;
    return this.updateTeamMember(projectId, id, { memory });
  }

  /**
   * Atomically remove a single memory entry, addressed by its 0-based index.
   * Performs the read-modify-write in one place to reduce the race window.
   */
  async removeMemoryEntry(projectId: string, id: string, index: number): Promise<TeamMember> {
    const current = await this.getTeamMember(projectId, id);
    const memory = [...(current.memory ?? [])];

    if (!Number.isInteger(index) || index < 0 || index >= memory.length) {
      throw new NotFoundError('Memory entry', String(index));
    }

    memory.splice(index, 1);
    return this.updateTeamMember(projectId, id, { memory });
  }

  /**
   * Get a lightweight snapshot of a team member for session metadata.
   */
  async getTeamMemberSnapshot(projectId: string, id: string): Promise<TeamMemberSnapshot> {
    const member = await this.getTeamMember(projectId, id);

    return {
      name: member.name,
      avatar: member.avatar,
      role: member.role,
      model: member.model,
      agentTool: member.agentTool,
      permissionMode: member.permissionMode,
    };
  }
}
