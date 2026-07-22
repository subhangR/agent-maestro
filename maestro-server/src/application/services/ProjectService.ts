import * as fs from 'fs/promises';
import { Project } from '../../types';
import {
  IProjectRepository,
  CreateProjectInput,
  UpdateProjectInput
} from '../../domain/repositories/IProjectRepository';
import { IEventBus } from '../../domain/events/IEventBus';
import { ValidationError, BusinessRuleError, NotFoundError } from '../../domain/common/Errors';

/**
 * Application service for project operations.
 * Coordinates repository access, validation, and event emission.
 */
export class ProjectService {
  constructor(
    private projectRepo: IProjectRepository,
    private eventBus: IEventBus
  ) {}

  /**
   * Create a new project.
   */
  async createProject(input: CreateProjectInput): Promise<Project> {
    // Validation
    if (!input.name || input.name.trim() === '') {
      throw new ValidationError('Project name is required');
    }

    // Ensure working directory exists, create it if it doesn't
    const workingDir = input.workingDir || '';
    if (workingDir) {
      await fs.mkdir(workingDir, { recursive: true });
    }

    const project = await this.projectRepo.create({
      name: input.name.trim(),
      workingDir,
      description: input.description || '',
      ...(input.githubUrl ? { githubUrl: input.githubUrl } : {})
    });

    await this.eventBus.emit('project:created', project);

    return project;
  }

  /**
   * Get a project by ID.
   */
  async getProject(id: string): Promise<Project> {
    const project = await this.projectRepo.findById(id);
    if (!project) {
      throw new NotFoundError('Project', id);
    }
    return project;
  }

  /**
   * List all projects.
   */
  async listProjects(): Promise<Project[]> {
    return this.projectRepo.findAll();
  }

  /**
   * Update a project.
   */
  async updateProject(id: string, updates: UpdateProjectInput): Promise<Project> {
    // Validate updates
    if (updates.name !== undefined && updates.name.trim() === '') {
      throw new ValidationError('Project name cannot be empty');
    }

    const project = await this.projectRepo.update(id, updates);

    await this.eventBus.emit('project:updated', project);

    return project;
  }

  /**
   * Delete a project.
   * Enforces business rules: cannot delete if has tasks or sessions.
   */
  async deleteProject(id: string): Promise<void> {
    // Check if project exists
    const project = await this.projectRepo.findById(id);
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    // Check for related tasks
    const hasTasks = await this.projectRepo.hasRelatedTasks(id);
    if (hasTasks) {
      throw new BusinessRuleError('Cannot delete project with existing tasks');
    }

    // Check for related sessions
    const hasSessions = await this.projectRepo.hasRelatedSessions(id);
    if (hasSessions) {
      throw new BusinessRuleError('Cannot delete project with existing sessions');
    }

    await this.projectRepo.delete(id);

    await this.eventBus.emit('project:deleted', { id });
  }

  /**
   * Get project count.
   */
  async getProjectCount(): Promise<number> {
    return this.projectRepo.count();
  }

  /**
   * Set master status on a project.
   */
  async setMasterStatus(projectId: string, isMaster: boolean): Promise<Project> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project', projectId);
    }

    const updated = await this.projectRepo.update(projectId, { isMaster });
    await this.eventBus.emit('project:updated', updated);
    return updated;
  }

  /**
   * List all projects marked as master.
   */
  async listMasterProjects(): Promise<Project[]> {
    const all = await this.projectRepo.findAll();
    return all.filter(p => p.isMaster === true);
  }
}
