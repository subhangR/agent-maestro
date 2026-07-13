import * as fs from 'fs/promises';
import * as path from 'path';
import { Project } from '../../types';
import {
  IProjectRepository,
  CreateProjectInput,
  UpdateProjectInput
} from '../../domain/repositories/IProjectRepository';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { ILogger } from '../../domain/common/ILogger';
import { NotFoundError } from '../../domain/common/Errors';
import { atomicWriteFile } from './utils/atomicWrite';
import { loadFilesParallel } from './utils/parallelFileLoader';

/**
 * File system based implementation of IProjectRepository.
 * Stores projects as individual JSON files.
 */
export class FileSystemProjectRepository implements IProjectRepository {
  private projectsDir: string;
  private projects: Map<string, Project>;
  private initialized: boolean = false;

  constructor(
    private dataDir: string,
    private idGenerator: IIdGenerator,
    private logger: ILogger,
    private taskExistsCheck?: (projectId: string) => Promise<boolean>,
    private sessionExistsCheck?: (projectId: string) => Promise<boolean>
  ) {
    this.projectsDir = path.join(dataDir, 'projects');
    this.projects = new Map();
  }

  /**
   * Initialize the repository by loading existing data.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.projectsDir, { recursive: true });

      const files = await fs.readdir(this.projectsDir);
      const projectFiles = files.filter(f => f.endsWith('.json'));
      const filePaths = projectFiles.map(f => path.join(this.projectsDir, f));

      const { successes, failures } = await loadFilesParallel(
        filePaths,
        async (filePath) => {
          const data = await fs.readFile(filePath, 'utf-8');
          return JSON.parse(data) as Project;
        },
        { concurrency: 50 }
      );

      for (const failure of failures) {
        this.logger.warn(`Failed to load project file: ${failure.path}`, { error: failure.error.message });
      }

      for (const project of successes) {
        this.projects.set(project.id, project);
      }

      this.logger.info(`Loaded ${this.projects.size} projects`);
      this.initialized = true;
    } catch (err) {
      this.logger.error('Failed to initialize project repository:', err as Error);
      throw err;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async saveProject(project: Project): Promise<void> {
    const filePath = path.join(this.projectsDir, `${project.id}.json`);
    await atomicWriteFile(filePath, JSON.stringify(project));
  }

  private async deleteProjectFile(id: string): Promise<void> {
    const filePath = path.join(this.projectsDir, `${id}.json`);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      // Ignore if file doesn't exist
    }
  }

  async create(input: CreateProjectInput): Promise<Project> {
    await this.ensureInitialized();

    const project: Project = {
      id: this.idGenerator.generate('proj'),
      name: input.name,
      workingDir: input.workingDir,
      description: input.description || '',
      ...(input.githubUrl ? { githubUrl: input.githubUrl } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.projects.set(project.id, project);
    await this.saveProject(project);

    this.logger.debug(`Created project: ${project.id}`);
    return project;
  }

  async findById(id: string): Promise<Project | null> {
    await this.ensureInitialized();
    return this.projects.get(id) || null;
  }

  async findAll(): Promise<Project[]> {
    await this.ensureInitialized();
    return Array.from(this.projects.values());
  }

  async update(id: string, updates: UpdateProjectInput): Promise<Project> {
    await this.ensureInitialized();

    const project = this.projects.get(id);
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    const updatedProject: Project = {
      ...project,
      ...updates,
      id: project.id, // Ensure ID cannot be changed
      createdAt: project.createdAt, // Preserve creation time
      updatedAt: Date.now()
    };

    // An empty githubUrl is an explicit clear: drop the key so the persisted JSON
    // (and the in-memory copy) stays consistent with the optional `githubUrl?: string`.
    if (updatedProject.githubUrl === '') {
      delete updatedProject.githubUrl;
    }

    this.projects.set(id, updatedProject);
    await this.saveProject(updatedProject);

    this.logger.debug(`Updated project: ${id}`);
    return updatedProject;
  }

  async delete(id: string): Promise<void> {
    await this.ensureInitialized();

    const project = this.projects.get(id);
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    this.projects.delete(id);
    await this.deleteProjectFile(id);

    this.logger.debug(`Deleted project: ${id}`);
  }

  async hasRelatedTasks(projectId: string): Promise<boolean> {
    if (this.taskExistsCheck) {
      return this.taskExistsCheck(projectId);
    }
    return false;
  }

  async hasRelatedSessions(projectId: string): Promise<boolean> {
    if (this.sessionExistsCheck) {
      return this.sessionExistsCheck(projectId);
    }
    return false;
  }

  async count(): Promise<number> {
    await this.ensureInitialized();
    return this.projects.size;
  }
}
