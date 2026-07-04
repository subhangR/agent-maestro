import {
  SpellEntityType,
  SpellDefinition,
  SpellEntity,
  SpellInvocationPayload,
  SpellInvocationResult,
  CustomPrompt,
  CreateCustomPromptPayload,
  UpdateCustomPromptPayload,
  Spell,
  SpellRule,
  SpellRuleInput,
  CreateSpellPayload,
  UpdateSpellPayload,
  ActiveSpell,
} from '../../types';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { ITaskRepository } from '../../domain/repositories/ITaskRepository';
import { ISessionRepository } from '../../domain/repositories/ISessionRepository';
import { ITeamMemberRepository } from '../../domain/repositories/ITeamMemberRepository';
import { ICustomPromptRepository } from '../../domain/repositories/ICustomPromptRepository';
import { ISpellRepository } from '../../domain/repositories/ISpellRepository';
import { ISkillLoader } from '../../domain/services/ISkillLoader';
import { IEventBus } from '../../domain/events/IEventBus';
import { IIdGenerator } from '../../domain/common/IIdGenerator';
import { NotFoundError, ValidationError } from '../../domain/common/Errors';

// --- Static Spell Registry ---

const ALL_ENTITY_TYPES: SpellEntityType[] = ['maestro', 'task', 'team-member', 'skill', 'session', 'doc', 'custom-prompt'];

const SPELL_REGISTRY: SpellDefinition[] = [
  // --- "send" spell for every entity type (passes content directly, used by default spell entities) ---
  ...ALL_ENTITY_TYPES.map(type => ({
    name: 'send',
    entityType: type,
    label: 'Send',
    description: 'Send as prompt',
    icon: '📨',
    promptTemplate: '{{content}}',
  })),

  // Task spells
  {
    name: 'void',
    entityType: 'task',
    label: 'Get Details',
    description: 'Inject task details as context',
    icon: '📋',
    promptTemplate: 'Here is a task for context:\n\nID: {{id}}\nTitle: {{title}}\nStatus: {{status}}\nPriority: {{priority}}\nDescription: {{description}}',
  },
  {
    name: 'refer',
    entityType: 'task',
    label: 'Refer to Task',
    description: 'Use task as reference context',
    icon: '🔗',
    promptTemplate: 'Use this task as reference context while working:\n\nTask ID: {{id}}\nTask: {{title}} ({{status}})\n{{description}}\n\nKeep this task\'s requirements in mind.',
  },
  {
    name: 'execute',
    entityType: 'task',
    label: 'Execute Task',
    description: 'Execute the task',
    icon: '▶️',
    promptTemplate: 'Execute the following task:\n\nTask ID: {{id}}\nTitle: {{title}}\nPriority: {{priority}}\n\n{{initialPrompt || description}}',
  },

  // Team member spells
  {
    name: 'void',
    entityType: 'team-member',
    label: 'Get Details',
    description: 'Inject team member details as context',
    icon: '👤',
    promptTemplate: 'Here is a team member for context:\n\nID: {{id}}\nName: {{name}} {{avatar}}\nRole: {{role}}\nIdentity: {{identity}}',
  },
  {
    name: 'adopt',
    entityType: 'team-member',
    label: 'Adopt Persona',
    description: 'Adopt this team member\'s persona',
    icon: '🎭',
    promptTemplate: 'Adopt the following persona for the remainder of this session:\n\nID: {{id}}\nName: {{name}} {{avatar}}\nRole: {{role}}\n\n{{identity}}',
  },

  // Skill spells
  {
    name: 'void',
    entityType: 'skill',
    label: 'Get Details',
    description: 'Inject skill details as context',
    icon: '⚡',
    promptTemplate: 'Here is a skill for context:\n\nID: {{id}}\nName: {{name}}\nDescription: {{description}}',
  },
  {
    name: 'apply',
    entityType: 'skill',
    label: 'Apply Skill',
    description: 'Apply skill guidelines',
    icon: '🎯',
    promptTemplate: 'Apply the following skill guidelines:\n\nSkill ID: {{id}}\nSkill: {{name}}\n\n{{instructions}}',
  },

  // Session spells
  {
    name: 'void',
    entityType: 'session',
    label: 'Get Details',
    description: 'Inject session details as context',
    icon: '💻',
    promptTemplate: 'Here is a session for context:\n\nID: {{id}}\nName: {{name}}\nStatus: {{status}}\nTasks: {{taskIds}}\nStarted: {{startedAt}}',
  },

  // Doc spells
  {
    name: 'void',
    entityType: 'doc',
    label: 'Get Details',
    description: 'Inject document as context',
    icon: '📄',
    promptTemplate: 'Here is a document for context:\n\nID: {{id}}\nTitle: {{title}}\nPath: {{filePath}}\n\n{{content}}',
  },
  {
    name: 'review',
    entityType: 'doc',
    label: 'Review Document',
    description: 'Review document and provide feedback',
    icon: '🔍',
    promptTemplate: 'Review the following document and provide feedback:\n\nID: {{id}}\nTitle: {{title}}\n\n{{content}}',
  },

  // Custom prompt spells
  {
    name: 'void',
    entityType: 'custom-prompt',
    label: 'Send Prompt',
    description: 'Send custom prompt',
    icon: '✨',
    promptTemplate: '{{content}}',
  },

  // Maestro spells (project-level)
  {
    name: 'void',
    entityType: 'maestro',
    label: 'Get Project Details',
    description: 'Inject project details as context',
    icon: '🎼',
    promptTemplate: 'Here is the current project for context:\n\nID: {{id}}\nName: {{name}}\nWorking Directory: {{workingDir}}\nDescription: {{description}}',
  },
];

const MAX_DOC_CONTENT_SIZE = 50 * 1024; // 50KB

// --- Default Spell Entities ---
// These always appear in listings and cannot be deleted.
// Default entities use the 'send' spell which passes their content directly as a prompt.

interface DefaultSpellEntity {
  id: string;
  entityType: SpellEntityType;
  name: string;
  description: string;
  icon: string;
  content: string;
}

const DEFAULT_SPELL_ENTITIES: DefaultSpellEntity[] = [
  // ═══════════════════════════════════════════
  // Maestro (project-level) defaults
  // ═══════════════════════════════════════════
  {
    id: 'default_maestro_system_prompt',
    entityType: 'maestro',
    name: 'System Prompt',
    description: 'Inject the system prompt configuration',
    icon: '⚙️',
    content: 'Show me the current system prompt and configuration for this project.',
  },
  {
    id: 'default_maestro_project_summary',
    entityType: 'maestro',
    name: 'Project Summary',
    description: 'Summarize the current project state',
    icon: '📊',
    content: 'Provide a comprehensive summary of the current project state:\n\n1. **Tasks**: Open count by status and priority, recently completed, any blocked\n2. **Sessions**: Active sessions, what they\'re working on, recent completions\n3. **Team**: Active team members, their current assignments\n4. **Progress**: Overall trajectory — are we on track?\n\nUse `maestro task list`, `maestro session siblings`, and `maestro team-member list` to gather data.',
  },
  {
    id: 'default_maestro_code_review',
    entityType: 'maestro',
    name: 'Code Review Guidelines',
    description: 'Apply code review best practices',
    icon: '🔍',
    content: 'Review the recent changes following these guidelines:\n1. Check for correctness and edge cases\n2. Evaluate code style and consistency\n3. Look for performance issues\n4. Suggest improvements',
  },
  {
    id: 'default_maestro_sprint_planning',
    entityType: 'maestro',
    name: 'Sprint Planning',
    description: 'Plan and organize upcoming work from the task backlog',
    icon: '📅',
    content: 'Review the current project\'s open tasks and team availability, then create a sprint plan:\n\n1. **Backlog review**: List all open tasks by priority using `maestro task list`\n2. **Work packages**: Group related tasks into logical units\n3. **Critical path**: Identify blocking dependencies and must-do-first items\n4. **Assignments**: Match tasks to team members based on their roles and current workload\n5. **Risks**: Flag tasks that are vague, have external dependencies, or need clarification\n\nOutput a concise sprint plan with task IDs, assignees, and suggested execution order.',
  },
  {
    id: 'default_maestro_health_check',
    entityType: 'maestro',
    name: 'Project Health Check',
    description: 'Diagnose project health: blockers, stale work, risks',
    icon: '🩺',
    content: 'Perform a project health check:\n\n1. **Blocked tasks**: Any tasks stuck or waiting on unresolved dependencies?\n2. **Stale sessions**: Sessions that haven\'t reported progress — are they stuck?\n3. **Unassigned work**: Open tasks with no team member assignment\n4. **Priority alignment**: Are high-priority tasks being actively worked on?\n5. **Team utilization**: Over-loaded or idle team members?\n\nUse maestro commands to gather data. Provide a traffic-light summary (green/yellow/red) for each area with actionable recommendations.',
  },
  {
    id: 'default_maestro_architecture_overview',
    entityType: 'maestro',
    name: 'Architecture Overview',
    description: 'Generate a high-level architecture overview of the project',
    icon: '🏗️',
    content: 'Analyze the project codebase and provide a high-level architecture overview:\n\n1. **Key components**: Major modules/packages and their responsibilities\n2. **Data flow**: How data moves between components\n3. **External dependencies**: Third-party services, APIs, databases\n4. **File structure**: Organization patterns and conventions\n5. **Complexity hotspots**: Areas with high coupling, technical debt, or risk\n\nFocus on giving a clear mental model a new contributor could use to get oriented.',
  },

  // ═══════════════════════════════════════════
  // Task defaults
  // ═══════════════════════════════════════════
  {
    id: 'default_task_breakdown',
    entityType: 'task',
    name: 'Break Down into Subtasks',
    description: 'Decompose a task into smaller actionable subtasks',
    icon: '🧩',
    content: 'Analyze the current task and break it down into smaller, actionable subtasks:\n\n1. Each subtask should have a clear, specific title and description\n2. Estimate relative complexity for each: S (< 1 session), M (1-2 sessions), L (3+ sessions)\n3. Identify dependencies between subtasks\n4. Suggest an execution order that maximizes parallelism\n5. Ensure each subtask is small enough for a single worker session\n\nCreate the subtasks using `maestro task create` as children of the current task.',
  },
  {
    id: 'default_task_acceptance_criteria',
    entityType: 'task',
    name: 'Write Acceptance Criteria',
    description: 'Generate clear, testable acceptance criteria',
    icon: '✅',
    content: 'Based on the current task\'s description, write clear acceptance criteria:\n\n- Use **Given / When / Then** format for each criterion\n- Cover the happy path and key edge cases\n- Include both functional and non-functional requirements where relevant\n- Identify assumptions that need validation with the user\n- Keep criteria specific, measurable, and testable\n\nUpdate the task description with the acceptance criteria using `maestro task edit`.',
  },
  {
    id: 'default_task_estimate',
    entityType: 'task',
    name: 'Estimate Complexity',
    description: 'Assess task complexity, scope, and effort',
    icon: '📏',
    content: 'Estimate the complexity of the current task:\n\n1. **Scope**: How many files/components/modules need changes?\n2. **Risk**: Unknown territory? New patterns? External APIs?\n3. **Dependencies**: Other tasks, services, or data this depends on?\n4. **Testing**: What test coverage is needed?\n5. **T-shirt size**: S (< 1 session) / M (1-2 sessions) / L (3+ sessions) / XL (needs breakdown first)\n\nProvide a brief rationale and flag any concerns that could affect the estimate.',
  },
  {
    id: 'default_task_initial_prompt',
    entityType: 'task',
    name: 'Generate Initial Prompt',
    description: 'Create a detailed worker prompt from the task description',
    icon: '📝',
    content: 'Based on the current task\'s title and description, generate a comprehensive initial prompt for a worker session:\n\n1. **Objective**: Clear statement of what needs to be accomplished\n2. **Deliverables**: Specific, concrete outputs expected\n3. **Relevant files**: Reference key files, modules, or code paths\n4. **Constraints**: Guidelines, patterns, or restrictions to follow\n5. **Definition of done**: How to verify the work is complete\n\nWrite the prompt so a worker session can start executing immediately. Update the task\'s initialPrompt field using `maestro task edit`.',
  },
  {
    id: 'default_task_bug_triage',
    entityType: 'task',
    name: 'Bug Triage',
    description: 'Analyze a bug report and identify root causes',
    icon: '🐛',
    content: 'Analyze this bug report and perform triage:\n\n1. **Reproduce**: Identify exact steps to reproduce the issue\n2. **Root cause**: What\'s the likely underlying issue? Trace the code path\n3. **Impact**: Severity (critical/high/medium/low) and who is affected\n4. **Fix approach**: Suggest one or more fix strategies with tradeoffs\n5. **Priority**: Recommended priority based on impact vs effort\n6. **Related**: Any related tasks, recent changes, or known issues?\n\nUpdate the task with findings using `maestro task edit`.',
  },

  // ═══════════════════════════════════════════
  // Team Member defaults
  // ═══════════════════════════════════════════
  {
    id: 'default_tm_recruit',
    entityType: 'team-member',
    name: 'Recruit Specialist',
    description: 'Design and create a new team member for a specific need',
    icon: '🎯',
    content: 'Based on the current project needs, design a new specialized team member:\n\n1. **Role**: What specialization is needed? (e.g., "Frontend Engineer", "DevOps Lead", "QA Specialist")\n2. **Name & Avatar**: Suggest a fitting name and emoji avatar\n3. **Identity prompt**: Write a comprehensive identity covering expertise, communication style, quality standards, and working approach\n4. **Model**: Recommend opus (complex reasoning), sonnet (balanced), or haiku (fast, simple tasks)\n5. **Skills**: Which existing skills should be assigned?\n\nCreate the team member using `maestro team-member create` with the designed profile.',
  },
  {
    id: 'default_tm_workload',
    entityType: 'team-member',
    name: 'Review Workload',
    description: 'Analyze a team member\'s current assignments and capacity',
    icon: '⚖️',
    content: 'Review this team member\'s current workload and capacity:\n\n1. **Active sessions**: How many sessions are currently running?\n2. **Assigned tasks**: What tasks are assigned and their statuses?\n3. **In-flight work**: What\'s actively being worked on right now?\n4. **Utilization**: Is this member over-loaded, balanced, or under-utilized?\n5. **Recommendations**: Should tasks be reassigned? New work assigned? Sessions consolidated?\n\nUse `maestro task list` and `maestro session siblings` to gather data. Provide actionable recommendations.',
  },
  {
    id: 'default_tm_skills',
    entityType: 'team-member',
    name: 'Suggest Skill Assignments',
    description: 'Recommend skills based on the member\'s role and expertise',
    icon: '⚡',
    content: 'Analyze this team member\'s role and identity to suggest relevant skill assignments:\n\n1. **Current skills**: What skills are already assigned?\n2. **Available skills**: List available skills using `maestro spell entities skill`\n3. **Matches**: Which skills align with this member\'s specialization?\n4. **Gaps**: What skills would enhance their effectiveness?\n5. **Priority**: Rank recommended skills by impact\n\nConsider both technical skills (languages, frameworks) and workflow skills (testing, deployment, documentation).',
  },
  {
    id: 'default_tm_identity',
    entityType: 'team-member',
    name: 'Generate Identity Prompt',
    description: 'Create a comprehensive identity prompt from a role description',
    icon: '🪪',
    content: 'Generate a detailed identity prompt for this team member based on their role:\n\n1. **Expertise**: Specific technical domains, languages, frameworks, and tools\n2. **Working style**: How they approach problems — methodical, creative, thorough, fast\n3. **Communication**: Tone, level of detail, how they report progress\n4. **Quality standards**: Code style preferences, testing expectations, documentation approach\n5. **Boundaries**: What they own vs. what they delegate or escalate\n6. **Personality**: A consistent voice that makes interactions natural\n\nUpdate the team member\'s identity using `maestro team-member edit`.',
  },

  // ═══════════════════════════════════════════
  // Session defaults
  // ═══════════════════════════════════════════
  {
    id: 'default_session_spawn_worker',
    entityType: 'session',
    name: 'Spawn Worker',
    description: 'Spawn a focused worker session for a task',
    icon: '🚀',
    content: 'Spawn a new worker session to execute the current task:\n\n1. Review the task requirements and initial prompt\n2. Select the most appropriate team member for the work\n3. Start the session with `maestro session start` targeting the task\n4. Ensure the worker has clear instructions, relevant context, and defined deliverables\n5. Set up status reporting expectations\n\nThe worker should focus on completing the task\'s deliverables and report progress at key milestones.',
  },
  {
    id: 'default_session_status_check',
    entityType: 'session',
    name: 'Status Check',
    description: 'Request a progress update from the session',
    icon: '📡',
    content: 'Provide a status update for this session:\n\n1. **Accomplished**: What has been completed so far?\n2. **In progress**: What is currently being worked on?\n3. **Blockers**: Any issues preventing progress?\n4. **Remaining**: What still needs to be done?\n5. **ETA**: Estimated work remaining\n\nReport using `maestro session report progress` with a concise summary.',
  },
  {
    id: 'default_session_resume',
    entityType: 'session',
    name: 'Resume with Context',
    description: 'Resume a session with a full context recap',
    icon: '🔄',
    content: 'Resume this session by reconstructing the full working context:\n\n1. **Original objective**: What was this session trying to accomplish?\n2. **Progress**: What work has been completed? Check session docs and task status\n3. **Current state**: Where exactly did we leave off? What files were being modified?\n4. **Outstanding items**: What remains to be done?\n5. **Key decisions**: Any important decisions, constraints, or design choices made\n\nUse session docs and task details to reconstruct context, then continue from where the session left off.',
  },
  {
    id: 'default_session_coordinator',
    entityType: 'session',
    name: 'Spawn Coordinator',
    description: 'Spawn a coordinator to manage a task tree',
    icon: '🎭',
    content: 'Spawn a coordinator session to orchestrate work across a task tree:\n\n1. **Survey**: Review the parent task and all subtasks using `maestro task tree`\n2. **Plan**: Determine execution order, identify parallelizable work\n3. **Assign**: Match subtasks to team members based on specialization\n4. **Dispatch**: Spawn worker sessions for each subtask\n5. **Monitor**: Track progress, handle blockers, coordinate handoffs between workers\n\nThe coordinator should maintain oversight and unblock workers, not do implementation directly.',
  },

  // ═══════════════════════════════════════════
  // Skill defaults
  // ═══════════════════════════════════════════
  {
    id: 'default_skill_template',
    entityType: 'skill',
    name: 'Create Skill Template',
    description: 'Generate a new skill file with proper YAML structure',
    icon: '📄',
    content: 'Create a new skill file with the proper structure:\n\n1. **Name**: Clear, descriptive name for the skill\n2. **Description**: What guidelines/knowledge the skill provides\n3. **Trigger**: When should this skill be activated? (keywords, file patterns, contexts)\n4. **Instructions**: Detailed guidelines, best practices, code patterns, and examples\n5. **Location**: Place in the appropriate skills directory\n\nFollow the existing skill file conventions — check a few examples first with `maestro spell entities skill` to match the format.',
  },
  {
    id: 'default_skill_coverage',
    entityType: 'skill',
    name: 'Review Skill Coverage',
    description: 'Identify gaps in available skills',
    icon: '🔎',
    content: 'Review the available skills and identify coverage gaps:\n\n1. **Inventory**: List all current skills and their purposes using `maestro spell entities skill`\n2. **Coverage map**: What workflows and technologies are covered?\n3. **Gaps**: What common project workflows lack skill support?\n4. **Overlaps**: Any redundant or conflicting skills?\n5. **Recommendations**: Prioritized list of skills to create, ordered by expected impact\n\nFocus on skills that would reduce repetitive instructions across sessions.',
  },
  {
    id: 'default_skill_improve',
    entityType: 'skill',
    name: 'Suggest Improvements',
    description: 'Review a skill and suggest enhancements',
    icon: '💎',
    content: 'Review this skill\'s instructions and suggest improvements:\n\n1. **Clarity**: Are instructions clear and unambiguous?\n2. **Completeness**: Are all relevant guidelines and edge cases covered?\n3. **Examples**: Are there enough practical, copy-pasteable examples?\n4. **Trigger accuracy**: Does the skill activate at the right times?\n5. **Organization**: Is content well-structured and scannable?\n\nProvide specific, actionable suggestions — not just "could be better" but exactly what to add or change.',
  },

  // ═══════════════════════════════════════════
  // Doc defaults
  // ═══════════════════════════════════════════
  {
    id: 'default_doc_summarize',
    entityType: 'doc',
    name: 'Summarize Document',
    description: 'Create a concise summary with key takeaways',
    icon: '📋',
    content: 'Read and summarize this document:\n\n1. **Overview**: What is this document about? (1-2 sentences)\n2. **Key points**: The 3-5 most important takeaways\n3. **Decisions**: Any decisions or conclusions documented\n4. **Open questions**: Unresolved items or questions raised\n5. **Relevance**: How does this relate to current project work?\n\nKeep the summary concise and actionable — someone should be able to read it in under 2 minutes.',
  },
  {
    id: 'default_doc_action_items',
    entityType: 'doc',
    name: 'Extract Action Items',
    description: 'Pull out all actionable items from the document',
    icon: '☑️',
    content: 'Review this document and extract all action items:\n\n1. List each action item with a clear, imperative description\n2. Identify who should own each item (if mentioned or inferable)\n3. Note any deadlines or urgency indicators\n4. Flag dependencies between items\n5. Suggest priority ordering\n\nFormat as a checklist. For items that should become tracked work, suggest creating tasks using `maestro task create`.',
  },
  {
    id: 'default_doc_compare',
    entityType: 'doc',
    name: 'Compare Documents',
    description: 'Compare this document with related project docs',
    icon: '🔀',
    content: 'Compare this document with other related documents in the project:\n\n1. **Overlaps**: Content or decisions that appear in multiple docs\n2. **Contradictions**: Any conflicting information or guidance\n3. **Unique content**: Information only found in this document\n4. **Staleness**: Any outdated sections that need updating\n5. **Consolidation**: Opportunities to merge or cross-reference\n\nUse session docs to find related documents. Recommend which document should be the source of truth for shared topics.',
  },

  // ═══════════════════════════════════════════
  // Custom Prompt defaults
  // ═══════════════════════════════════════════
  {
    id: 'default_cp_explain',
    entityType: 'custom-prompt',
    name: 'Explain This',
    description: 'Explain the selected code or concept',
    icon: '💡',
    content: 'Explain the following in detail, including how it works, why it is designed this way, and any important edge cases.',
  },
  {
    id: 'default_cp_refactor',
    entityType: 'custom-prompt',
    name: 'Refactor',
    description: 'Refactor for clarity and maintainability',
    icon: '♻️',
    content: 'Refactor the following code for better readability, maintainability, and performance. Explain each change.',
  },
  {
    id: 'default_cp_write_tests',
    entityType: 'custom-prompt',
    name: 'Write Tests',
    description: 'Generate test cases',
    icon: '🧪',
    content: 'Write comprehensive test cases for the following code, covering happy paths, edge cases, and error scenarios.',
  },
];

export class SpellService {
  constructor(
    private projectRepo: IProjectRepository,
    private taskRepo: ITaskRepository,
    private sessionRepo: ISessionRepository,
    private teamMemberRepo: ITeamMemberRepository,
    private skillLoader: ISkillLoader,
    private customPromptRepo: ICustomPromptRepository,
    private spellRepo: ISpellRepository,
    private eventBus: IEventBus,
    private idGenerator: IIdGenerator,
  ) {}

  // --- Spell Definitions ---

  getSpellDefinitions(entityType?: SpellEntityType): SpellDefinition[] {
    if (entityType) {
      return SPELL_REGISTRY.filter(s => s.entityType === entityType);
    }
    return [...SPELL_REGISTRY];
  }

  private getSpellDefinition(entityType: SpellEntityType, spellName: string): SpellDefinition | undefined {
    return SPELL_REGISTRY.find(s => s.entityType === entityType && s.name === spellName);
  }

  // --- Helpers ---

  /** Build SpellEntity entries for all DEFAULT_SPELL_ENTITIES of the given type. */
  private getDefaultEntities(type: SpellEntityType): SpellEntity[] {
    return DEFAULT_SPELL_ENTITIES
      .filter(d => d.entityType === type)
      .map(d => ({
        id: d.id,
        type,
        name: d.name,
        description: d.description,
        icon: d.icon,
        availableSpells: ['send'],
        metadata: { isDefault: true },
      }));
  }

  // --- Entity Listing ---

  async listEntities(type: SpellEntityType, projectId: string): Promise<SpellEntity[]> {
    switch (type) {
      case 'maestro': {
        const project = await this.projectRepo.findById(projectId);
        const entities: SpellEntity[] = [];
        if (project) {
          entities.push({
            id: project.id,
            type: 'maestro',
            name: project.name,
            description: project.description || `Working dir: ${project.workingDir}`,
            icon: '🎼',
            availableSpells: ['void'],
            metadata: { workingDir: project.workingDir },
          });
        }
        // Add hardcoded defaults
        entities.push(...this.getDefaultEntities('maestro'));
        // Add user-created custom prompts tagged as maestro
        const maestroPrompts = (await this.customPromptRepo.findAll()).filter(p => p.entityType === 'maestro');
        for (const p of maestroPrompts) {
          entities.push({
            id: p.id,
            type: 'maestro',
            name: p.name,
            description: p.description,
            icon: p.icon,
            availableSpells: ['send'],
            metadata: { tags: p.tags },
          });
        }
        return entities;
      }

      case 'task': {
        const tasks = await this.taskRepo.findAll({ projectId });
        const entities: SpellEntity[] = tasks.map(t => ({
          id: t.id,
          type: 'task' as SpellEntityType,
          name: t.title,
          description: t.description,
          availableSpells: ['void', 'refer', 'execute'],
          metadata: { status: t.status, priority: t.priority },
        }));
        // Add hardcoded defaults
        entities.push(...this.getDefaultEntities('task'));
        return entities;
      }

      case 'team-member': {
        const members = await this.teamMemberRepo.findByProjectId(projectId);
        const entities: SpellEntity[] = members.map(m => ({
          id: m.id,
          type: 'team-member' as SpellEntityType,
          name: m.name,
          description: m.role,
          icon: m.avatar,
          availableSpells: ['void', 'adopt'],
          metadata: { role: m.role, model: m.model },
        }));
        // Add hardcoded defaults
        entities.push(...this.getDefaultEntities('team-member'));
        return entities;
      }

      case 'skill': {
        const skillIds = await this.skillLoader.listAvailable();
        const entities: SpellEntity[] = [];
        for (const id of skillIds) {
          try {
            const skill = await this.skillLoader.load(id);
            if (skill) {
              entities.push({
                id,
                type: 'skill',
                name: skill.manifest.name || id,
                description: skill.manifest.description,
                availableSpells: ['void', 'apply'],
              });
            }
          } catch {
            // Skip skills that fail to load
          }
        }
        // Add hardcoded defaults
        entities.push(...this.getDefaultEntities('skill'));
        return entities;
      }

      case 'session': {
        const sessions = await this.sessionRepo.findAll({ projectId });
        const activeSessions = sessions.filter(s =>
          s.status !== 'completed' && s.status !== 'failed' && s.status !== 'stopped'
        );
        const entities: SpellEntity[] = activeSessions.map(s => ({
          id: s.id,
          type: 'session' as SpellEntityType,
          name: s.name,
          description: `Status: ${s.status}`,
          availableSpells: ['void'],
          metadata: { status: s.status },
        }));
        // Add hardcoded defaults
        entities.push(...this.getDefaultEntities('session'));
        return entities;
      }

      case 'doc': {
        const sessions = await this.sessionRepo.findAll({ projectId });
        const entities: SpellEntity[] = [];
        for (const session of sessions) {
          if (session.docs) {
            for (const doc of session.docs) {
              entities.push({
                id: doc.id,
                type: 'doc',
                name: doc.title,
                description: doc.filePath,
                icon: '📄',
                availableSpells: ['void', 'review'],
                metadata: { sessionId: session.id, filePath: doc.filePath },
              });
            }
          }
        }
        // Add hardcoded defaults
        entities.push(...this.getDefaultEntities('doc'));
        return entities;
      }

      case 'custom-prompt': {
        const entities: SpellEntity[] = [];
        // Add hardcoded defaults
        entities.push(...this.getDefaultEntities('custom-prompt'));
        // Add user-created custom prompts (entityType undefined or 'custom-prompt')
        const prompts = (await this.customPromptRepo.findAll()).filter(
          p => !p.entityType || p.entityType === 'custom-prompt'
        );
        for (const p of prompts) {
          entities.push({
            id: p.id,
            type: 'custom-prompt',
            name: p.name,
            description: p.description,
            icon: p.icon,
            availableSpells: ['void'],
            metadata: { tags: p.tags },
          });
        }
        return entities;
      }

      default:
        return [];
    }
  }

  // --- Entity Resolution ---

  async resolveEntity(type: SpellEntityType, entityId: string, projectId: string): Promise<Record<string, any>> {
    // Check default spell entities first (works for all entity types)
    const defaultEntity = DEFAULT_SPELL_ENTITIES.find(d => d.id === entityId && d.entityType === type);
    if (defaultEntity) {
      return { id: defaultEntity.id, name: defaultEntity.name, content: defaultEntity.content };
    }

    switch (type) {
      case 'maestro': {
        // Check user-created custom prompts tagged as maestro
        const maestroPrompt = await this.customPromptRepo.findById(entityId).catch(() => null);
        if (maestroPrompt && maestroPrompt.entityType === 'maestro') {
          return { id: maestroPrompt.id, name: maestroPrompt.name, content: maestroPrompt.content };
        }
        // Fall back to project entity
        const project = await this.projectRepo.findById(entityId);
        if (!project) throw new NotFoundError('Project', entityId);
        return {
          id: project.id,
          name: project.name,
          workingDir: project.workingDir,
          description: project.description || '',
        };
      }

      case 'task': {
        const task = await this.taskRepo.findById(entityId);
        if (!task) throw new NotFoundError('Task', entityId);
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          initialPrompt: task.initialPrompt,
        };
      }

      case 'team-member': {
        const member = await this.teamMemberRepo.findById(projectId, entityId);
        if (!member) throw new NotFoundError('TeamMember', entityId);
        return {
          id: member.id,
          name: member.name,
          avatar: member.avatar,
          role: member.role,
          identity: member.identity || '',
        };
      }

      case 'skill': {
        const skill = await this.skillLoader.load(entityId);
        if (!skill) throw new NotFoundError('Skill', entityId);
        return {
          id: entityId,
          name: skill.manifest.name || entityId,
          description: skill.manifest.description || '',
          instructions: skill.instructions,
        };
      }

      case 'session': {
        const session = await this.sessionRepo.findById(entityId);
        if (!session) throw new NotFoundError('Session', entityId);
        return {
          id: session.id,
          name: session.name,
          status: session.status,
          taskIds: session.taskIds.join(', '),
          startedAt: new Date(session.startedAt).toISOString(),
        };
      }

      case 'doc': {
        // Search across sessions for the doc
        const sessions = await this.sessionRepo.findAll({ projectId });
        for (const session of sessions) {
          if (session.docs) {
            const doc = session.docs.find(d => d.id === entityId);
            if (doc) {
              let content = doc.content || '';
              if (doc.contentFilePath) {
                try {
                  const docContent = await this.sessionRepo.getDocContent(session.id, doc.id);
                  if (docContent) content = docContent;
                } catch {
                  // Fall back to inline content
                }
              }
              // Truncate large content
              if (content.length > MAX_DOC_CONTENT_SIZE) {
                content = content.substring(0, MAX_DOC_CONTENT_SIZE) + '\n\n[Content truncated at 50KB]';
              }
              return {
                id: doc.id,
                title: doc.title,
                filePath: doc.filePath,
                content,
              };
            }
          }
        }
        throw new NotFoundError('Doc', entityId);
      }

      case 'custom-prompt': {
        const prompt = await this.customPromptRepo.findById(entityId);
        if (!prompt) throw new NotFoundError('CustomPrompt', entityId);
        return {
          id: prompt.id,
          name: prompt.name,
          content: prompt.content,
        };
      }

      default:
        throw new ValidationError(`Unknown entity type: ${type}`);
    }
  }

  // --- Template Interpolation ---

  private interpolateTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)(?:\s*\|\|\s*(\w+))?\}\}/g, (_, key, fallback) => {
      const value = data[key];
      if (value !== undefined && value !== null && value !== '') return String(value);
      if (fallback) return data[fallback] !== undefined ? String(data[fallback]) : '';
      return '';
    });
  }

  // --- Spell Invocation ---

  async invoke(payload: SpellInvocationPayload): Promise<SpellInvocationResult> {
    // 1. Resolve targets: explicit list takes precedence; legacy single-id is
    //    promoted into a one-element list so the fan-out path is unified.
    const targets = this.resolveInvocationTargets(payload);
    if (targets.length === 0) {
      throw new ValidationError('targetSessionId or targetSessionIds is required');
    }

    // 2. Resolve entity ONCE — entity data is identical across all targets.
    const entityData = await this.resolveEntity(payload.entityType, payload.entityId, payload.projectId);

    // 3. Find spell definition — default to 'send' (the universal pass-through)
    //    when CLI sends null or omits spellName.
    const spellName = payload.spellName || 'send';
    const spellDef = this.getSpellDefinition(payload.entityType, spellName);
    if (!spellDef) throw new NotFoundError('Spell', `${payload.entityType}:${spellName}`);

    // 4. Interpolate template (one prompt for all targets).
    const prompt = this.interpolateTemplate(spellDef.promptTemplate, entityData);

    // 5. Fan out — validate each target session exists and deliver via the
    //    SINGLE session:prompt_send path. senderSessionId is stamped to the
    //    invoker so the receiving session can attribute the prompt.
    //    (Frozen in DESIGN_BRIEF "invoke contract" — removes the double-inject bug.)
    const now = Date.now();
    const senderSessionId = payload.invokerSessionId ?? null;
    const senderProjectId = await this.resolveSenderProjectId(senderSessionId);

    for (const targetSessionId of targets) {
      const session = await this.sessionRepo.findById(targetSessionId);
      if (!session) throw new NotFoundError('Session', targetSessionId);

      await this.eventBus.emit('session:prompt_send', {
        sessionId: targetSessionId,
        content: prompt,
        mode: 'send' as const,
        senderSessionId,
        senderProjectId,
        targetProjectId: session.projectId ?? null,
        timestamp: now,
      });
    }

    // 6. Emit spell:invoked once per target purely for UI feedback (toast/ring
    //    pulse, never PTY). UI keys results by targetSessionId so multiple
    //    rings can light up simultaneously.
    const primaryTargetId = targets[0];
    let primaryResult: SpellInvocationResult | null = null;
    for (const targetSessionId of targets) {
      const result: SpellInvocationResult = {
        success: true,
        prompt,
        entityType: payload.entityType,
        entityId: payload.entityId,
        spellName,
        targetSessionId,
        timestamp: now,
      };
      await this.eventBus.emit('spell:invoked', result);
      if (targetSessionId === primaryTargetId) primaryResult = result;
    }

    return primaryResult!;
  }

  private resolveInvocationTargets(payload: SpellInvocationPayload): string[] {
    const out: string[] = [];
    if (payload.targetSessionId) out.push(payload.targetSessionId);
    if (payload.targetSessionIds) {
      for (const id of payload.targetSessionIds) {
        if (id && !out.includes(id)) out.push(id);
      }
    }
    return out;
  }

  private async resolveSenderProjectId(senderSessionId: string | null): Promise<string | null> {
    if (!senderSessionId) return null;
    const sender = await this.sessionRepo.findById(senderSessionId).catch(() => null);
    return sender?.projectId ?? null;
  }

  // --- Spell CRUD (P1 foundation) ---

  async listSpells(): Promise<Spell[]> {
    return this.spellRepo.findAll();
  }

  async getSpell(id: string): Promise<Spell> {
    const spell = await this.spellRepo.findById(id);
    if (!spell) throw new NotFoundError('Spell', id);
    return spell;
  }

  /** Assign a stable id to any rule that arrives without one (create/update). */
  private materializeRules(rules: SpellRuleInput[]): SpellRule[] {
    return rules.map(rule => ({
      ...rule,
      id: rule.id || this.idGenerator.generate('rule'),
    }));
  }

  async createSpell(data: CreateSpellPayload): Promise<Spell> {
    const now = Date.now();
    const spell: Spell = {
      id: this.idGenerator.generate('spell'),
      name: data.name,
      description: data.description,
      icon: data.icon,
      color: data.color,
      rules: this.materializeRules(data.rules ?? []),
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    return this.spellRepo.create(spell);
  }

  async updateSpell(id: string, data: UpdateSpellPayload): Promise<Spell> {
    // Assign ids to any new rules before persisting.
    const { rules, ...rest } = data;
    const patch: Partial<Spell> = { ...rest };
    if (rules) {
      patch.rules = this.materializeRules(rules);
    }
    const updated = await this.spellRepo.update(id, patch);

    // F6: GC orphaned ruleIterations on every session where this spell is active —
    // rule ids that no longer exist would otherwise leak stale loop counters.
    if (data.rules) {
      await this.reconcileRuleIterations(id, updated.rules);
    }
    return updated;
  }

  /** Drop ruleIterations keys for rule ids that no longer exist on the spell (F6). */
  private async reconcileRuleIterations(spellId: string, rules: SpellRule[]): Promise<void> {
    const validIds = new Set(rules.map(r => r.id));
    let sessions: any[];
    try {
      sessions = await this.sessionRepo.findAll();
    } catch {
      return;
    }
    for (const session of sessions) {
      const actives: ActiveSpell[] = session.activeSpells ?? [];
      let sessionChanged = false;
      const nextActives = actives.map(a => {
        if (a.spellId !== spellId || !a.ruleIterations) return a;
        const kept: Record<string, number> = {};
        let activeChanged = false;
        for (const [ruleId, count] of Object.entries(a.ruleIterations)) {
          if (validIds.has(ruleId)) kept[ruleId] = count;
          else activeChanged = true;
        }
        if (!activeChanged) return a;
        sessionChanged = true;
        return { ...a, ruleIterations: kept };
      });
      if (sessionChanged) {
        await this.sessionRepo.update(session.id, { activeSpells: nextActives });
      }
    }
  }

  async deleteSpell(id: string): Promise<void> {
    // Repo enforces the isDefault / SEED_IDS guard.
    return this.spellRepo.delete(id);
  }

  // --- Spell Activation (P1 foundation) ---
  // Wires Session.activeSpells; the dispatcher (P2) consults this state at hook time.

  async activateSpell(spellId: string, targetSessionIds: string[], castBy: string | null): Promise<{
    spell: Spell;
    sessions: { sessionId: string; activeSpell: ActiveSpell }[];
  }> {
    const spell = await this.getSpell(spellId);
    if (targetSessionIds.length === 0) {
      throw new ValidationError('targetSessionIds must not be empty');
    }

    const now = Date.now();
    const sessions: { sessionId: string; activeSpell: ActiveSpell }[] = [];

    for (const sessionId of targetSessionIds) {
      const session = await this.sessionRepo.findById(sessionId);
      if (!session) throw new NotFoundError('Session', sessionId);

      const existing = session.activeSpells ?? [];
      // Idempotent: if already active, re-enable + bump castAt rather than duplicating.
      const prior = existing.find(a => a.spellId === spellId);
      const filtered = existing.filter(a => a.spellId !== spellId);
      // F8: preserve loop counters for rule ids that still exist, so re-casting an
      // already-active spell mid-loop does not silently reset its counters.
      const validRuleIds = new Set((spell.rules ?? []).map(r => r.id));
      const ruleIterations: Record<string, number> = {};
      for (const [ruleId, count] of Object.entries(prior?.ruleIterations ?? {})) {
        if (validRuleIds.has(ruleId)) ruleIterations[ruleId] = count;
      }
      const activeSpell: ActiveSpell = {
        spellId: spell.id,
        color: spell.color,
        enabled: true,
        ruleIterations,
        castAt: now,
        castBy,
      };
      const nextActive = [...filtered, activeSpell];

      await this.sessionRepo.update(sessionId, { activeSpells: nextActive });
      sessions.push({ sessionId, activeSpell });
    }

    await this.eventBus.emit('spell:activated', {
      spellId: spell.id,
      sessionIds: targetSessionIds,
      activeSpell: sessions[0].activeSpell,
      timestamp: now,
    });

    return { spell, sessions };
  }

  async deactivateSpell(spellId: string, targetSessionIds: string[]): Promise<{
    spell: Spell;
    sessionIds: string[];
  }> {
    const spell = await this.getSpell(spellId);
    if (targetSessionIds.length === 0) {
      throw new ValidationError('targetSessionIds must not be empty');
    }

    for (const sessionId of targetSessionIds) {
      const session = await this.sessionRepo.findById(sessionId);
      if (!session) throw new NotFoundError('Session', sessionId);
      const nextActive = (session.activeSpells ?? []).filter(a => a.spellId !== spellId);
      await this.sessionRepo.update(sessionId, { activeSpells: nextActive });
    }

    const now = Date.now();
    await this.eventBus.emit('spell:deactivated', {
      spellId: spell.id,
      sessionIds: targetSessionIds,
      timestamp: now,
    });

    return { spell, sessionIds: targetSessionIds };
  }

  /**
   * D8/FR-6.6: zero the loop counter(s) for a spell active on a session.
   * - `ruleId` given → reset only that rule's iteration count to 0.
   * - `ruleId` omitted → reset ALL counters (ruleIterations = {}).
   * Emits `spell:loop_reset` with the authoritative updated active-spell entry.
   */
  async resetLoop(spellId: string, sessionId: string, ruleId?: string): Promise<{
    spell: Spell;
    sessionId: string;
    activeSpell: ActiveSpell;
  }> {
    const spell = await this.getSpell(spellId);

    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundError('Session', sessionId);

    const actives: ActiveSpell[] = session.activeSpells ?? [];
    const current = actives.find(a => a.spellId === spellId);
    if (!current) {
      throw new NotFoundError('ActiveSpell', `${spellId} on ${sessionId}`);
    }

    const nextIterations: Record<string, number> = ruleId
      ? { ...current.ruleIterations, [ruleId]: 0 }
      : {};
    const updatedActive: ActiveSpell = { ...current, ruleIterations: nextIterations };
    const nextActives = actives.map(a => (a.spellId === spellId ? updatedActive : a));

    await this.sessionRepo.update(sessionId, { activeSpells: nextActives });

    await this.eventBus.emit('spell:loop_reset', {
      spellId,
      sessionId,
      ruleId: ruleId ?? null,
      activeSpell: updatedActive,
      timestamp: Date.now(),
    });

    return { spell, sessionId, activeSpell: updatedActive };
  }

  // --- Custom Prompt CRUD ---

  async createCustomPrompt(data: CreateCustomPromptPayload): Promise<CustomPrompt> {
    const now = Date.now();
    const prompt: CustomPrompt = {
      id: this.idGenerator.generate('cp'),
      name: data.name,
      description: data.description,
      icon: data.icon,
      content: data.content,
      tags: data.tags,
      entityType: data.entityType,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.customPromptRepo.create(prompt);
    await this.eventBus.emit('custom_prompt:created', created);
    return created;
  }

  async updateCustomPrompt(id: string, data: UpdateCustomPromptPayload): Promise<CustomPrompt> {
    const updated = await this.customPromptRepo.update(id, data);
    await this.eventBus.emit('custom_prompt:updated', updated);
    return updated;
  }

  async deleteCustomPrompt(id: string): Promise<void> {
    if (id.startsWith('default_')) {
      throw new ValidationError('Cannot delete default spell entities');
    }
    await this.customPromptRepo.delete(id);
    await this.eventBus.emit('custom_prompt:deleted', { id });
  }

  async listCustomPrompts(): Promise<CustomPrompt[]> {
    return this.customPromptRepo.findAll();
  }
}
