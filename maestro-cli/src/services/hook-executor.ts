import { spawn } from 'child_process';
import { platform } from 'os';

/**
 * Result of executing a hook
 */
export interface HookResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

/**
 * Options for executing hooks
 */
export interface HookOptions {
  /** Working directory for command execution */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Stop executing remaining hooks if one fails */
  stopOnError?: boolean;
}

/**
 * Parse a shell command string into executable and arguments array.
 * Handles basic quoting (single and double quotes).
 */
function parseCommand(command: string): { exe: string; args: string[] } {
  const parts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === ' ' && !inSingle && !inDouble) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    parts.push(current);
  }

  const [exe, ...args] = parts;
  return { exe: exe || '', args };
}

/**
 * HookExecutor - Executes shell commands (hooks) at lifecycle points
 *
 * Supports pre-init and post-exit hooks from skills.
 */
export class HookExecutor {
  /**
   * Execute a single hook command
   *
   * @param command - Shell command to execute
   * @param options - Execution options
   * @returns Hook execution result
   */
  async executeHook(command: string, options: HookOptions = {}): Promise<HookResult> {
    // Handle empty command
    if (!command || command.trim() === '') {
      return {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    }

    return new Promise<HookResult>((resolve) => {
      // Use spawn with explicit /bin/sh -c to avoid passing unsanitized
      // commands through exec()'s shell. The command string is passed as
      // a single argument to sh -c, preventing argument injection.
      const spawnOptions: {
        cwd?: string;
        env: NodeJS.ProcessEnv;
        timeout?: number;
      } = {
        env: {
          ...process.env,
          ...(options.env || {}),
        },
      };

      if (options.cwd) {
        spawnOptions.cwd = options.cwd;
      }

      if (options.timeout) {
        spawnOptions.timeout = options.timeout;
      }

      const isWindows = platform() === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/sh';
      const shellArgs = isWindows ? ['/C', command.trim()] : ['-c', command.trim()];
      const child = spawn(shell, shellArgs, spawnOptions);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (err: Error) => {
        resolve({
          success: false,
          exitCode: 1,
          stdout,
          stderr,
          error: err.message || 'Command execution failed',
        });
      });

      let timedOut = false;
      if (spawnOptions.timeout) {
        setTimeout(() => { timedOut = true; }, spawnOptions.timeout);
      }

      child.on('close', (code: number | null, signal: string | null) => {
        const exitCode = code ?? 1;
        const isTimeout = timedOut || signal === 'SIGTERM';

        resolve({
          success: exitCode === 0,
          exitCode,
          stdout,
          stderr,
          ...(exitCode !== 0
            ? { error: isTimeout ? 'Command execution timeout' : `Command exited with code ${exitCode}` }
            : {}),
        });
      });
    });
  }

  /**
   * Execute multiple hooks in sequence
   *
   * @param commands - Array of shell commands to execute
   * @param options - Execution options
   * @returns Array of hook execution results
   */
  async executeHooks(
    commands: string[],
    options: HookOptions = {}
  ): Promise<HookResult[]> {
    const results: HookResult[] = [];

    for (const command of commands) {
      const result = await this.executeHook(command, options);
      results.push(result);

      // Stop on first error if requested
      if (options.stopOnError && !result.success) {
        break;
      }
    }

    return results;
  }


  /**
   * Check if any hooks failed
   *
   * @param results - Array of hook results
   * @returns true if any hook failed
   */
  hasFailures(results: HookResult[]): boolean {
    return results.some(result => !result.success);
  }

  /**
   * Get all failed hooks from results
   *
   * @param results - Array of hook results
   * @returns Array of failed hook results
   */
  getFailures(results: HookResult[]): HookResult[] {
    return results.filter(result => !result.success);
  }
}

/**
 * Default instance
 */
export const defaultHookExecutor = new HookExecutor();
