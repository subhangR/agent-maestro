interface TemplateContext {
  MAESTRO_TASK_DATA?: any;
  MAESTRO_TASK_IDS?: string;
  MAESTRO_TASKS?: any[];
  MAESTRO_TASK_COUNT?: number;
  MAESTRO_SESSION_ID?: string;
  MAESTRO_PROJECT_ID?: string;
  MAESTRO_API_URL?: string;
  MAESTRO_SYSTEM_PROMPT?: string;
  MAESTRO_APPEND_SYSTEM_PROMPT?: string;
  MAESTRO_SKILL_IDS?: string;
  MAESTRO_SKILLS?: any[];
  [key: string]: any;
}

export class PromptTemplateEngine {
  /**
   * Render prompt template with environment variables
   */
  static async renderTemplate(
    templatePath: string,
    envVars: Record<string, string>
  ): Promise<string> {
    try {
      // In a real Node environment we would use fs.readFile.
      // In Tauri frontend, we might need a command to read the file, 
      // or we pass the template content directly.
      // For now, assuming we read via a tauri command or fetch.
      // Since we don't have a read_file command exposed to frontend yet,
      // we'll assume the template content is passed or we invoke a read command.
      
      // Temporary: Use a default template if file reading fails or isn't implemented
      let templateContent = DEFAULT_TEMPLATE;
      
      try {
        // Try to read file using Tauri fs API if available, or invoke a custom command
        // For this implementation, we'll assume we can't easily read from ~/.agents-ui from the browser context
        // without a specific allowlist. So we'll use a hardcoded default for MVP.
      } catch {
      }

      // Parse environment variables
      const context: TemplateContext = {
        MAESTRO_SESSION_ID: envVars.MAESTRO_SESSION_ID,
        MAESTRO_PROJECT_ID: envVars.MAESTRO_PROJECT_ID,
        MAESTRO_API_URL: envVars.MAESTRO_API_URL,
        MAESTRO_SYSTEM_PROMPT: envVars.MAESTRO_SYSTEM_PROMPT,
        MAESTRO_APPEND_SYSTEM_PROMPT: envVars.MAESTRO_APPEND_SYSTEM_PROMPT,
      };

      // Parse JSON task data
      if (envVars.MAESTRO_TASK_DATA) {
        try {
          context.MAESTRO_TASK_DATA = JSON.parse(envVars.MAESTRO_TASK_DATA);
        } catch {
        }
      }

      // Parse task IDs
      if (envVars.MAESTRO_TASK_IDS) {
        const taskIds = envVars.MAESTRO_TASK_IDS.split(',');
        context.MAESTRO_TASK_COUNT = taskIds.length;
        // In a full implementation, we would fetch task details here
        context.MAESTRO_TASKS = taskIds.map(id => ({ id, title: 'Loading...', status: 'unknown' }));
      }

      // Parse skills
      if (envVars.MAESTRO_SKILL_IDS) {
        const skillIds = envVars.MAESTRO_SKILL_IDS.split(',');
        context.MAESTRO_SKILLS = skillIds.map(id => ({ name: id, description: 'Skill' }));
      }

      return this.simpleTemplateRender(templateContent, context);
    } catch (err) {
      return `Error rendering template: ${err}`;
    }
  }

  /**
   * Simple template rendering
   */
  private static simpleTemplateRender(
    template: string,
    context: TemplateContext
  ): string {
    let result = template;

    // Handle {{#if VAR}}...{{/if}}
    // We do this first to handle blocks
    const ifRegex = /{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g;
    result = result.replace(ifRegex, (match, varName, content) => {
      const value = context[varName];
      // Check for truthy value (not null, undefined, false, empty string, or empty array)
      const isTruthy = value && (Array.isArray(value) ? value.length > 0 : true);
      return isTruthy ? content : '';
    });

    // Handle {{#each ARRAY}}...{{/each}}
    const eachRegex = /{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g;
    result = result.replace(eachRegex, (match, varName, content) => {
      const list = context[varName];
      if (Array.isArray(list)) {
        return list.map(item => {
          let itemContent = content;
          // Replace {{this.PROPERTY}}
          itemContent = itemContent.replace(/{{this\.(\w+)}}/g, (m: string, prop: string) => {
            return item[prop] || '';
          });
          return itemContent;
        }).join('');
      }
      return '';
    });

    // Handle simple variables {{VAR}} or {{VAR.PROP}}
    // We loop through context keys to avoid regex complexity
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle nested objects
        for (const [prop, propVal] of Object.entries(value)) {
            const regex = new RegExp(`{{${key}\.${prop}}}`, 'g');
            result = result.replace(regex, String(propVal));
        }
      } else if (typeof value === 'string' || typeof value === 'number') {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, String(value));
      }
    }

    // Cleanup any remaining tags
    // result = result.replace(/{{.*?}}/g, '');

    return result;
  }
}

const DEFAULT_TEMPLATE = `You are Claude Code, working on a Maestro-managed task.

## Task Context
{{#if MAESTRO_TASK_DATA}}
Task ID: {{MAESTRO_TASK_DATA.id}}
Title: {{MAESTRO_TASK_DATA.title}}
Description: {{MAESTRO_TASK_DATA.description}}
Status: {{MAESTRO_TASK_DATA.status}}
Priority: {{MAESTRO_TASK_DATA.priority}}

Initial Prompt:
{{MAESTRO_TASK_DATA.prompt}}
{{/if}}

{{#if MAESTRO_TASK_IDS}}
## Multi-Task Session
You are working on {{MAESTRO_TASK_COUNT}} tasks simultaneously.
{{/if}}

## Maestro Integration
- Session ID: {{MAESTRO_SESSION_ID}}
- Project ID: {{MAESTRO_PROJECT_ID}}
- API Endpoint: {{MAESTRO_API_URL}}

## Instructions
{{#if MAESTRO_SYSTEM_PROMPT}}
{{MAESTRO_SYSTEM_PROMPT}}
{{/if}}

## Progress Reporting
Use the following hooks to report progress:
- 
\`curl -X POST {{MAESTRO_API_URL}}/hooks/task-progress\` - Update task progress
- 
\`curl -X POST {{MAESTRO_API_URL}}/hooks/task-complete\` - Mark task complete
- 
\`curl -X POST {{MAESTRO_API_URL}}/hooks/task-blocked\` - Report blocker

{{#if MAESTRO_APPEND_SYSTEM_PROMPT}}
{{MAESTRO_APPEND_SYSTEM_PROMPT}}
{{/if}}
`;
