import { Team, CreateTeamPayload, UpdateTeamPayload, TeamTreeNode, TeamTreeMember } from '../../types';
import { ITeamRepository } from '../../domain/repositories/ITeamRepository';
import { ITeamMemberRepository } from '../../domain/repositories/ITeamMemberRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ValidationError, NotFoundError, BusinessRuleError } from '../../domain/common/Errors';

/**
 * Application service for team operations.
 * Manages team lifecycle, validation, and events.
 */
export class TeamService {
  constructor(
    private teamRepo: ITeamRepository,
    private teamMemberRepo: ITeamMemberRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator
  ) {}

  /**
   * Create a new team.
   * Business rules:
   * - Generates ID with 'team' prefix
   * - leaderId must reference an existing team member
   * - All memberIds must reference existing team members
   * - leaderId must be included in memberIds
   */
  async createTeam(data: CreateTeamPayload): Promise<Team> {
    if (!data.projectId) {
      throw new ValidationError('Project ID is required');
    }
    if (!data.name || data.name.trim() === '') {
      throw new ValidationError('Team name is required');
    }
    if (!data.leaderId || data.leaderId.trim() === '') {
      throw new ValidationError('Leader ID is required');
    }
    if (!data.memberIds || data.memberIds.length === 0) {
      throw new ValidationError('At least one member is required');
    }

    // Leader must be in memberIds
    if (!data.memberIds.includes(data.leaderId)) {
      throw new BusinessRuleError('Leader must be one of the team members');
    }

    // Validate all memberIds exist
    await this.validateMemberIdsExist(data.projectId, data.memberIds);

    // Validate leaderId exists (already covered by memberIds check, but explicit)
    const leader = await this.teamMemberRepo.findById(data.projectId, data.leaderId);
    if (!leader) {
      throw new NotFoundError('Team member (leader)', data.leaderId);
    }

    // Validate subTeamIds if provided
    if (data.subTeamIds && data.subTeamIds.length > 0) {
      for (const subTeamId of data.subTeamIds) {
        const subTeam = await this.teamRepo.findById(data.projectId, subTeamId);
        if (!subTeam) {
          throw new NotFoundError('Sub-team', subTeamId);
        }
      }
    }

    const now = new Date().toISOString();
    const team: Team = {
      id: this.idGenerator.generate('team'),
      projectId: data.projectId,
      name: data.name.trim(),
      description: data.description?.trim(),
      avatar: data.avatar?.trim(),
      leaderId: data.leaderId,
      memberIds: [...data.memberIds],
      subTeamIds: data.subTeamIds ? [...data.subTeamIds] : [],
      parentTeamId: data.parentTeamId ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.teamRepo.create(team);
    await this.eventBus.emit('team:created', created);

    return created;
  }

  /**
   * Get a team by ID.
   */
  async getTeam(projectId: string, id: string): Promise<Team> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const team = await this.teamRepo.findById(projectId, id);
    if (!team) {
      throw new NotFoundError('Team', id);
    }
    return team;
  }

  /**
   * Get all active teams for a project.
   */
  async getProjectTeams(projectId: string): Promise<Team[]> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const teams = await this.teamRepo.findByProjectId(projectId);
    return teams.filter(t => t.status !== 'archived');
  }

  /**
   * Update a team.
   * Validates memberIds/leaderId if changed.
   */
  async updateTeam(projectId: string, id: string, updates: UpdateTeamPayload): Promise<Team> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    if (updates.name !== undefined && updates.name.trim() === '') {
      throw new ValidationError('Team name cannot be empty');
    }

    const current = await this.getTeam(projectId, id);

    const cleanUpdates: Partial<Team> = {
      updatedAt: new Date().toISOString(),
    };

    if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
    if (updates.description !== undefined) cleanUpdates.description = updates.description?.trim();
    if (updates.avatar !== undefined) cleanUpdates.avatar = updates.avatar?.trim();
    if (updates.metadata !== undefined) cleanUpdates.metadata = updates.metadata;
    if (updates.parentTeamId !== undefined) cleanUpdates.parentTeamId = updates.parentTeamId;

    // Determine final memberIds and leaderId for validation
    const finalMemberIds = updates.memberIds ?? current.memberIds;
    const finalLeaderId = updates.leaderId ?? current.leaderId;

    // If memberIds changed, validate they exist
    if (updates.memberIds !== undefined) {
      await this.validateMemberIdsExist(projectId, updates.memberIds);
      cleanUpdates.memberIds = [...updates.memberIds];
    }

    // If leaderId changed, validate it exists
    if (updates.leaderId !== undefined) {
      const leader = await this.teamMemberRepo.findById(projectId, updates.leaderId);
      if (!leader) {
        throw new NotFoundError('Team member (leader)', updates.leaderId);
      }
      cleanUpdates.leaderId = updates.leaderId;
    }

    // Leader must be in memberIds
    if (!finalMemberIds.includes(finalLeaderId)) {
      throw new BusinessRuleError('Leader must be one of the team members');
    }

    // If subTeamIds changed, validate them
    if (updates.subTeamIds !== undefined) {
      for (const subTeamId of updates.subTeamIds) {
        const subTeam = await this.teamRepo.findById(projectId, subTeamId);
        if (!subTeam) {
          throw new NotFoundError('Sub-team', subTeamId);
        }
        // Check circular reference
        await this.validateNoCircularReference(projectId, id, subTeamId);
      }
      cleanUpdates.subTeamIds = [...updates.subTeamIds];
    }

    if (updates.status !== undefined) {
      cleanUpdates.status = updates.status;
    }

    const updated = await this.teamRepo.update(id, { ...cleanUpdates, projectId });
    await this.eventBus.emit('team:updated', updated);

    return updated;
  }

  /**
   * Delete a team.
   * Must be archived first.
   */
  async deleteTeam(projectId: string, id: string): Promise<void> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const team = await this.getTeam(projectId, id);

    if (team.status !== 'archived') {
      throw new BusinessRuleError('Team must be archived before deletion. Use the archive endpoint first.');
    }

    await this.teamRepo.delete(id);
    await this.eventBus.emit('team:deleted', { id });
  }

  /**
   * Archive a team.
   */
  async archiveTeam(projectId: string, id: string): Promise<Team> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const team = await this.getTeam(projectId, id);

    if (team.status === 'archived') {
      return team;
    }

    const updated = await this.teamRepo.update(id, {
      status: 'archived',
      updatedAt: new Date().toISOString(),
      projectId,
    });

    await this.eventBus.emit('team:archived', updated);

    return updated;
  }

  /**
   * Unarchive a team.
   */
  async unarchiveTeam(projectId: string, id: string): Promise<Team> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const team = await this.getTeam(projectId, id);

    if (team.status === 'active') {
      return team;
    }

    const updated = await this.teamRepo.update(id, {
      status: 'active',
      updatedAt: new Date().toISOString(),
      projectId,
    });

    await this.eventBus.emit('team:updated', updated);

    return updated;
  }

  /**
   * Add members to a team.
   */
  async addMembers(projectId: string, teamId: string, memberIds: string[]): Promise<Team> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }
    if (!memberIds || memberIds.length === 0) {
      throw new ValidationError('At least one member ID is required');
    }

    await this.validateMemberIdsExist(projectId, memberIds);

    const team = await this.getTeam(projectId, teamId);

    // Merge without duplicates
    const newMemberIds = [...new Set([...team.memberIds, ...memberIds])];

    const updated = await this.teamRepo.update(teamId, {
      memberIds: newMemberIds,
      updatedAt: new Date().toISOString(),
      projectId,
    });

    await this.eventBus.emit('team:updated', updated);

    return updated;
  }

  /**
   * Remove members from a team.
   * Cannot remove the leader.
   */
  async removeMembers(projectId: string, teamId: string, memberIds: string[]): Promise<Team> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }
    if (!memberIds || memberIds.length === 0) {
      throw new ValidationError('At least one member ID is required');
    }

    const team = await this.getTeam(projectId, teamId);

    // Cannot remove the leader
    if (memberIds.includes(team.leaderId)) {
      throw new BusinessRuleError('Cannot remove the team leader from members. Change the leader first.');
    }

    const newMemberIds = team.memberIds.filter(id => !memberIds.includes(id));

    if (newMemberIds.length === 0) {
      throw new BusinessRuleError('Cannot remove all members from a team');
    }

    const updated = await this.teamRepo.update(teamId, {
      memberIds: newMemberIds,
      updatedAt: new Date().toISOString(),
      projectId,
    });

    await this.eventBus.emit('team:updated', updated);

    return updated;
  }

  /**
   * Add a sub-team.
   * Validates no circular reference exists.
   */
  async addSubTeam(projectId: string, teamId: string, subTeamId: string): Promise<Team> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }
    if (!subTeamId) {
      throw new ValidationError('Sub-team ID is required');
    }

    // Validate sub-team exists
    const subTeam = await this.teamRepo.findById(projectId, subTeamId);
    if (!subTeam) {
      throw new NotFoundError('Sub-team', subTeamId);
    }

    // Cannot add self as sub-team
    if (teamId === subTeamId) {
      throw new BusinessRuleError('A team cannot be a sub-team of itself');
    }

    // Check circular reference
    await this.validateNoCircularReference(projectId, teamId, subTeamId);

    const team = await this.getTeam(projectId, teamId);

    if (team.subTeamIds.includes(subTeamId)) {
      return team; // Already a sub-team
    }

    const newSubTeamIds = [...team.subTeamIds, subTeamId];

    const updated = await this.teamRepo.update(teamId, {
      subTeamIds: newSubTeamIds,
      updatedAt: new Date().toISOString(),
      projectId,
    });

    // Update parentTeamId on the sub-team
    await this.teamRepo.update(subTeamId, {
      parentTeamId: teamId,
      updatedAt: new Date().toISOString(),
      projectId,
    });

    await this.eventBus.emit('team:updated', updated);

    return updated;
  }

  /**
   * Remove a sub-team.
   */
  async removeSubTeam(projectId: string, teamId: string, subTeamId: string): Promise<Team> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }
    if (!subTeamId) {
      throw new ValidationError('Sub-team ID is required');
    }

    const team = await this.getTeam(projectId, teamId);

    const newSubTeamIds = team.subTeamIds.filter(id => id !== subTeamId);

    const updated = await this.teamRepo.update(teamId, {
      subTeamIds: newSubTeamIds,
      updatedAt: new Date().toISOString(),
      projectId,
    });

    // Clear parentTeamId on the sub-team
    const subTeam = await this.teamRepo.findById(projectId, subTeamId);
    if (subTeam && subTeam.parentTeamId === teamId) {
      await this.teamRepo.update(subTeamId, {
        parentTeamId: null,
        updatedAt: new Date().toISOString(),
        projectId,
      });
    }

    await this.eventBus.emit('team:updated', updated);

    return updated;
  }

  /**
   * Get a lightweight snapshot of a team.
   */
  async getTeamSnapshot(projectId: string, id: string): Promise<{ id: string; name: string; avatar?: string; leaderId: string; memberCount: number }> {
    const team = await this.getTeam(projectId, id);
    return {
      id: team.id,
      name: team.name,
      avatar: team.avatar,
      leaderId: team.leaderId,
      memberCount: team.memberIds.length,
    };
  }

  /**
   * Resolve a team into a fully-hydrated recursive tree (members + nested sub-teams).
   * Cycle-safe: a team already seen on the current path is not expanded again.
   */
  async getTeamTree(projectId: string, id: string): Promise<TeamTreeNode> {
    if (!projectId) {
      throw new ValidationError('Project ID is required');
    }

    const build = async (teamId: string, seen: Set<string>): Promise<TeamTreeNode> => {
      const team = await this.getTeam(projectId, teamId);

      const members: TeamTreeMember[] = [];
      for (const memberId of team.memberIds) {
        const member = await this.teamMemberRepo.findById(projectId, memberId);
        if (!member) continue;
        members.push({
          id: member.id,
          name: member.name,
          role: member.role,
          identity: member.identity,
          avatar: member.avatar,
          mode: member.mode,
          isLeader: member.id === team.leaderId,
        });
      }

      const subTeams: TeamTreeNode[] = [];
      for (const subTeamId of team.subTeamIds) {
        if (seen.has(subTeamId)) continue; // guard against cycles
        const subTeam = await this.teamRepo.findById(projectId, subTeamId);
        if (!subTeam) continue;
        subTeams.push(await build(subTeamId, new Set([...seen, subTeamId])));
      }

      return {
        id: team.id,
        name: team.name,
        description: team.description,
        avatar: team.avatar,
        leaderId: team.leaderId,
        status: team.status,
        members,
        subTeams,
      };
    };

    return build(id, new Set([id]));
  }

  /**
   * Find the sub-team (a strict descendant of rootTeamId) led by memberId, if any.
   * Used at spawn time to re-root a spawned sub-team leader to its own branch.
   * Returns the sub-team's id, or null. Cycle-safe; does not match the root itself.
   */
  async findSubTeamLedBy(projectId: string, rootTeamId: string, memberId: string): Promise<string | null> {
    if (!projectId || !rootTeamId || !memberId) return null;

    const visited = new Set<string>([rootTeamId]);

    const search = async (teamId: string): Promise<string | null> => {
      const team = await this.teamRepo.findById(projectId, teamId);
      if (!team) return null;
      for (const subTeamId of team.subTeamIds) {
        if (visited.has(subTeamId)) continue;
        visited.add(subTeamId);
        const subTeam = await this.teamRepo.findById(projectId, subTeamId);
        if (!subTeam) continue;
        if (subTeam.leaderId === memberId) return subTeam.id;
        const deeper = await search(subTeamId);
        if (deeper) return deeper;
      }
      return null;
    };

    return search(rootTeamId);
  }

  // --- Private helpers ---

  /**
   * Validate that all memberIds reference existing team members.
   */
  private async validateMemberIdsExist(projectId: string, memberIds: string[]): Promise<void> {
    for (const memberId of memberIds) {
      const member = await this.teamMemberRepo.findById(projectId, memberId);
      if (!member) {
        throw new NotFoundError('Team member', memberId);
      }
    }
  }

  /**
   * Validate that adding subTeamId to teamId does not create a circular reference.
   * Walks up the ancestry chain from teamId to ensure subTeamId is not an ancestor.
   */
  private async validateNoCircularReference(projectId: string, teamId: string, subTeamId: string): Promise<void> {
    // Check: does subTeamId have teamId anywhere in its sub-team tree?
    // If subTeamId contains teamId as a descendant, adding subTeamId under teamId would create a cycle.
    const visited = new Set<string>();

    const hasDescendant = async (currentId: string, targetId: string): Promise<boolean> => {
      if (currentId === targetId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);

      const current = await this.teamRepo.findById(projectId, currentId);
      if (!current) return false;

      for (const childId of current.subTeamIds) {
        if (await hasDescendant(childId, targetId)) {
          return true;
        }
      }

      return false;
    };

    // Check if subTeamId has teamId as a descendant (which would create a cycle)
    if (await hasDescendant(subTeamId, teamId)) {
      throw new BusinessRuleError('Circular sub-team reference detected. A team cannot be its own ancestor.');
    }
  }
}
