import Ajv, { type JSONSchemaType } from 'ajv';
import type { MaestroManifest } from '../types/manifest.js';

/**
 * Validation result returned by validateManifest
 */
export interface ValidationResult {
  valid: boolean;
  errors?: string;
}

/**
 * JSON Schema for Maestro manifest validation
 * Follows the specification in docs/final-maestro-cli-docs/01-MANIFEST-SCHEMA.md
 */
const manifestSchema: JSONSchemaType<MaestroManifest> = {
  type: 'object',
  properties: {
    manifestVersion: {
      type: 'string',
      description: 'Manifest format version',
    },
    mode: {
      type: 'string',
      enum: ['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator', 'execute', 'coordinate'] as any,
      description: 'Agent mode (canonical modes plus legacy execute/coordinate aliases during migration)',
    },
    strategy: {
      type: 'string',
      enum: ['simple', 'tree', 'recruit', 'default', 'intelligent-batching', 'dag'],
      nullable: true,
      description: 'Strategy for this session',
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          parentId: { type: 'string', nullable: true },
          acceptanceCriteria: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
          },
          dependencies: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            nullable: true,
          },
          projectId: { type: 'string' },
          createdAt: { type: 'string' },
          metadata: {
            type: 'object',
            nullable: true,
            required: [],
            additionalProperties: true,
          },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked'],
            nullable: true,
          },
          sessionIds: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
          },
          activeSessionId: {
            type: 'string',
            nullable: true,
          },
          images: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                filename: { type: 'string' },
                mimeType: { type: 'string' },
              },
              required: ['path', 'filename', 'mimeType'],
              additionalProperties: false,
            },
            nullable: true,
          },
        },
        required: ['id', 'title', 'description', 'acceptanceCriteria', 'projectId', 'createdAt'],
        additionalProperties: false,
      },
      minItems: 1,
    },
    session: {
      type: 'object',
      properties: {
        model: {
          type: 'string',
        },
        permissionMode: {
          type: 'string',
          enum: ['acceptEdits', 'interactive', 'readOnly', 'bypassPermissions'],
        },
        thinkingMode: {
          type: 'string',
          enum: ['auto', 'interleaved', 'disabled'],
          nullable: true,
        },
        maxTurns: { type: 'number', nullable: true },
        timeout: { type: 'number', nullable: true },
        workingDirectory: { type: 'string', nullable: true },
        launchConfig: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['claude', 'openai', 'hermes', 'gemini'] },
            model: { type: 'string' },
            reasoningEffort: { type: 'string', enum: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], nullable: true },
            speed: { type: 'string', enum: ['standard', 'fast'], nullable: true },
            accessMode: { type: 'string', enum: ['safe', 'acceptEdits', 'plan', 'fullAccess'], nullable: true },
          },
          required: ['provider', 'model'],
          // Tolerate extra/future launchConfig fields from older or newer writers;
          // sanitizeLaunchConfig re-derives a strict shape before use.
          additionalProperties: true,
          nullable: true,
        },
        allowedCommands: {
          type: 'array',
          items: { type: 'string' },
          nullable: true,
          description: 'Explicit list of allowed commands for this session',
        },
      },
      required: ['model', 'permissionMode'],
      additionalProperties: false,
    },
    context: {
      type: 'object',
      properties: {
        codebaseContext: {
          type: 'object',
          properties: {
            recentChanges: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
            },
            relevantFiles: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
            },
            architecture: { type: 'string', nullable: true },
            techStack: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
            },
            dependencies: {
              type: 'object',
              nullable: true,
              required: [],
              additionalProperties: { type: 'string' },
            },
          },
          required: [],
          nullable: true,
          additionalProperties: false,
        },
        relatedTasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              relationship: {
                type: 'string',
                enum: ['blocks', 'blocked_by', 'depends_on', 'related_to'],
              },
              status: { type: 'string' },
              description: { type: 'string', nullable: true },
            },
            required: ['id', 'title', 'relationship', 'status'],
            additionalProperties: false,
          },
          nullable: true,
        },
        projectStandards: {
          type: 'object',
          properties: {
            codingStyle: { type: 'string', nullable: true },
            testingApproach: { type: 'string', nullable: true },
            documentation: { type: 'string', nullable: true },
            branchingStrategy: { type: 'string', nullable: true },
            cicdPipeline: { type: 'string', nullable: true },
            customGuidelines: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
            },
          },
          required: [],
          nullable: true,
          additionalProperties: false,
        },
        custom: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: true,
        },
      },
      required: [],
      nullable: true,
      additionalProperties: false,
    },
    skills: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Optional standard skills to load',
    },
    agentTool: {
      type: 'string',
      enum: ['claude-code', 'codex', 'hermes', 'gemini'],
      nullable: true,
      description: 'Agent tool to use for this session (defaults to claude-code)',
    },
    launchConfig: {
      type: 'object',
      properties: {
        provider: { type: 'string', enum: ['claude', 'openai', 'hermes', 'gemini'] },
        model: { type: 'string' },
        reasoningEffort: { type: 'string', enum: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], nullable: true },
        speed: { type: 'string', enum: ['standard', 'fast'], nullable: true },
        accessMode: { type: 'string', enum: ['safe', 'acceptEdits', 'plan', 'fullAccess'], nullable: true },
      },
      required: ['provider', 'model'],
      // Tolerate extra/future launchConfig fields from older or newer writers;
      // sanitizeLaunchConfig re-derives a strict shape before use.
      additionalProperties: true,
      nullable: true,
    },
    referenceTaskIds: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Reference task IDs for context (docs from these tasks are provided to the agent)',
    },
    teamStructure: ({
      type: 'object',
      nullable: true,
      additionalProperties: true,
      description: 'Recursive saved-team structure for coordinator-mode delegation',
    } as any),
    availableTeamMembers: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string' },
          identity: { type: 'string' },
          avatar: { type: 'string' },
          mode: {
            type: 'string',
            enum: ['worker', 'coordinator', 'coordinated-worker', 'coordinated-coordinator', 'execute', 'coordinate'] as any,
            nullable: true,
          },
          permissionMode: { type: 'string', nullable: true },
          skillIds: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
          },
          model: { type: 'string', nullable: true },
          agentTool: {
            type: 'string',
            enum: ['claude-code', 'codex', 'hermes', 'gemini'],
            nullable: true,
          },
          capabilities: {
            type: 'object',
            nullable: true,
            required: [],
            additionalProperties: { type: 'boolean' },
          },
          commandPermissions: {
            type: 'object',
            nullable: true,
            required: [],
            properties: {
              groups: {
                type: 'object',
                nullable: true,
                required: [],
                additionalProperties: { type: 'boolean' },
              },
              commands: {
                type: 'object',
                nullable: true,
                required: [],
                additionalProperties: { type: 'boolean' },
              },
            },
            additionalProperties: false,
          },
          memory: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
          },
        },
        required: ['id', 'name', 'role', 'identity', 'avatar'],
        additionalProperties: false,
      },
      description: 'Team members available for coordination (only in coordinate mode)',
    },
    teamMemberId: {
      type: 'string',
      nullable: true,
      description: 'Team member ID for this session (single team member running this session)',
    },
    teamMemberName: {
      type: 'string',
      nullable: true,
      description: 'Team member name',
    },
    teamMemberRole: {
      type: 'string',
      nullable: true,
      description: 'Team member role',
    },
    teamMemberAvatar: {
      type: 'string',
      nullable: true,
      description: 'Team member avatar',
    },
    teamMemberIdentity: {
      type: 'string',
      nullable: true,
      description: 'Team member identity/instructions',
    },
    teamMemberCapabilities: {
      type: 'object',
      nullable: true,
      required: [],
      additionalProperties: { type: 'boolean' },
      description: 'Team member capability overrides',
    },
    teamMemberCommandPermissions: {
      type: 'object',
      nullable: true,
      required: [],
      properties: {
        groups: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: { type: 'boolean' },
        },
        commands: {
          type: 'object',
          nullable: true,
          required: [],
          additionalProperties: { type: 'boolean' },
        },
      },
      additionalProperties: false,
      description: 'Team member command permission overrides',
    },
    teamMemberWorkflowTemplateId: {
      type: 'string',
      nullable: true,
      description: 'Deprecated compatibility field (ignored by prompt composition)',
    },
    teamMemberCustomWorkflow: {
      type: 'string',
      nullable: true,
      description: 'Deprecated compatibility field (ignored by prompt composition)',
    },
    teamMemberMemory: {
      type: 'array',
      items: { type: 'string' },
      nullable: true,
      description: 'Team member persistent memory entries',
    },
    coordinatorSessionId: {
      type: 'string',
      nullable: true,
      description: 'Coordinator session ID (the session that spawned this worker)',
    },
    initialDirective: {
      type: 'object',
      nullable: true,
      properties: {
        subject: { type: 'string' },
        message: { type: 'string' },
        fromSessionId: { type: 'string' },
      },
      required: ['subject', 'message', 'fromSessionId'] as const,
      additionalProperties: false,
      description: 'Initial directive from the coordinator',
    },
    teamMemberProfiles: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string', nullable: true },
          avatar: { type: 'string' },
          identity: { type: 'string' },
          capabilities: {
            type: 'object',
            nullable: true,
            required: [],
            additionalProperties: { type: 'boolean' },
          },
          commandPermissions: {
            type: 'object',
            nullable: true,
            required: [] as never[],
            properties: {
              groups: {
                type: 'object',
                nullable: true,
                required: [] as never[],
                additionalProperties: { type: 'boolean' },
              },
              commands: {
                type: 'object',
                nullable: true,
                required: [] as never[],
                additionalProperties: { type: 'boolean' },
              },
            },
            additionalProperties: false,
          },
          workflowTemplateId: { type: 'string', nullable: true },
          customWorkflow: { type: 'string', nullable: true },
          model: { type: 'string', nullable: true },
          agentTool: {
            type: 'string',
            enum: ['claude-code', 'codex', 'hermes', 'gemini'],
            nullable: true,
          },
          memory: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
          },
        },
        required: ['id', 'name', 'avatar', 'identity'] as const,
        additionalProperties: false,
      },
      description: 'Multiple team member profiles for multi-identity sessions',
    },
    isMaster: {
      type: 'boolean',
      nullable: true,
      description: 'Whether this is a master session with cross-project access',
    },
    masterProjects: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          workingDir: { type: 'string' },
          description: { type: 'string', nullable: true },
          isMaster: { type: 'boolean', nullable: true },
        },
        required: ['id', 'name', 'workingDir'] as const,
        additionalProperties: false,
      },
      description: 'All projects in the workspace (populated for master sessions)',
    },
  },
  required: ['manifestVersion', 'mode', 'tasks', 'session'],
  additionalProperties: false,
};

// Create Ajv instance
const ajv = new Ajv.default({
  allErrors: true,
  verbose: true,
});

// Compile schema
const validate = ajv.compile(manifestSchema);

/**
 * Validates a manifest object against the JSON schema
 *
 * @param manifest - The manifest object to validate
 * @returns ValidationResult with valid flag and optional error messages
 *
 * @example
 * ```typescript
 * const result = validateManifest(manifestData);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateManifest(manifest: any): ValidationResult {
  const valid = validate(manifest);

  if (valid) {
    return { valid: true };
  }

  // Format errors into human-readable string
  const errors = validate.errors
    ?.map((err: any) => {
      const path = err.instancePath || err.schemaPath;
      const message = err.message || 'validation error';
      const keyword = err.keyword;
      const params = err.params;

      // Create more descriptive error messages
      if (keyword === 'enum' && params && 'allowedValues' in params) {
        const field = path.replace(/^\//, '').replace(/\//g, '.') || 'value';
        return `${field}: must be one of [${params.allowedValues.join(', ')}]`;
      }

      if (keyword === 'required' && params && 'missingProperty' in params) {
        const field = path ? `${path.replace(/^\//, '').replace(/\//g, '.')}.${params.missingProperty}` : params.missingProperty;
        return `${field}: is required`;
      }

      if (keyword === 'type') {
        const field = path.replace(/^\//, '').replace(/\//g, '.') || 'value';
        return `${field}: ${message}`;
      }

      return `${path.replace(/^\//, '').replace(/\//g, '.')}: ${message}`;
    })
    .join('; ');

  return {
    valid: false,
    errors: errors || 'Validation failed',
  };
}

/**
 * Export the compiled validator for direct use
 */
export { validate as compiledValidator };

/**
 * Export the schema for documentation or external use
 */
export { manifestSchema };
