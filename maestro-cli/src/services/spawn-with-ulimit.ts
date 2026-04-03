import { spawn, type ChildProcess, type StdioOptions } from 'child_process';
import { homedir, platform } from 'os';
import { join, dirname, delimiter } from 'path';
import { existsSync, readFileSync } from 'fs';

/**
 * On Windows, Node's spawn() can't execute .cmd/.bat shims directly (EINVAL),
 * and using shell: true breaks when args contain shell metacharacters (<, >, &).
 *
 * This resolver finds the .cmd shim on PATH, reads it to extract the JS entry
 * point it wraps, and returns { bin: 'node', prependArgs: ['path/to/cli.js'] }
 * so we can spawn node directly — bypassing cmd.exe entirely.
 */
function resolveWindowsBinary(
  binary: string,
  env?: Record<string, string | undefined>,
): { bin: string; prependArgs: string[] } {
  // If it's already an absolute path to a .js/.mjs file, run with node
  if (/\.[cm]?js$/.test(binary) && existsSync(binary)) {
    return { bin: process.execPath, prependArgs: [binary] };
  }

  // If it's an .exe that exists, use directly
  if (binary.endsWith('.exe') && existsSync(binary)) {
    return { bin: binary, prependArgs: [] };
  }

  const pathEnv = env?.PATH || env?.Path || process.env.PATH || '';
  const dirs = pathEnv.split(delimiter);

  // First, look for a direct .exe
  for (const dir of dirs) {
    const exeCandidate = join(dir, binary + '.exe');
    if (existsSync(exeCandidate)) {
      return { bin: exeCandidate, prependArgs: [] };
    }
  }

  // Then, look for a .cmd shim and extract the JS entry point
  for (const dir of dirs) {
    const cmdCandidate = join(dir, binary + '.cmd');
    if (existsSync(cmdCandidate)) {
      const jsEntry = extractJsEntryFromCmd(cmdCandidate);
      if (jsEntry) {
        return { bin: process.execPath, prependArgs: [jsEntry] };
      }
    }
  }

  // Fallback: return as-is and let spawn fail with a clear error
  return { bin: binary, prependArgs: [] };
}

/**
 * Read a .cmd shim and extract the JS entry point path.
 * npm .cmd shims contain a line like: "%_prog%" "%dp0%\node_modules\...\cli.js" %*
 */
function extractJsEntryFromCmd(cmdPath: string): string | null {
  try {
    const content = readFileSync(cmdPath, 'utf-8');
    // Match patterns like "%dp0%\path\to\script.js" or "%dp0%/path/to/script.mjs"
    const match = content.match(/%dp0%[\\\/]([^"]+\.[cm]?js)/);
    if (match) {
      return join(dirname(cmdPath), match[1]);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Spawn a process with a raised file descriptor limit.
 *
 * Claude Code (and other agent CLIs) require a high open-file limit and will
 * error with "possibly due to low max file descriptors" when the macOS default
 * soft limit (2560) is too low.
 *
 * This helper wraps the spawn in `/bin/sh -c` that:
 *   1. Raises `ulimit -n` to 2 147 483 646
 *   2. `cd`s into the requested working directory via an env var
 *   3. `exec`s the target binary so there is no extra wrapper process
 *
 * The shell is started with `cwd` set to `$HOME` (always accessible) to avoid
 * `shell-init: getcwd: Operation not permitted` errors that occur when the
 * parent process's cwd is inaccessible (deleted, sandboxed, or restricted by
 * macOS TCC).  The actual target working directory is passed via env var and
 * applied with `cd` inside the script before exec.
 *
 * Arguments are passed as positional params (`"$@"`) so no shell-escaping
 * is needed — each arg stays a separate element in the spawn array.
 */
export function spawnWithUlimit(
  binary: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdio?: StdioOptions;
  } = {},
): ChildProcess {
  const targetCwd = options.cwd || process.cwd();

  // On Windows: spawn directly — ulimit and exec are Unix-only concepts.
  // Resolve .cmd shims to their underlying JS entry points to avoid cmd.exe
  // shell interpretation issues with special characters in arguments.
  if (platform() === 'win32') {
    const { bin, prependArgs } = resolveWindowsBinary(binary, options.env);
    return spawn(bin, [...prependArgs, ...args], {
      cwd: targetCwd,
      env: options.env,
      stdio: options.stdio ?? 'pipe',
    });
  }

  // Unix: Pass the target cwd via env var so the shell script can cd into it.
  const env: Record<string, string | undefined> = {
    ...options.env,
    __MAESTRO_SPAWN_CWD: targetCwd,
  };

  return spawn(
    '/bin/sh',
    [
      '-c',
      'ulimit -n 2147483646 2>/dev/null; cd "$__MAESTRO_SPAWN_CWD"; unset __MAESTRO_SPAWN_CWD; exec "$@"',
      'sh',
      binary,
      ...args,
    ],
    {
      // Start the shell in $HOME — a directory that is always accessible —
      // to prevent getcwd failures during shell-init when the parent's cwd
      // is inaccessible.
      cwd: homedir(),
      env,
      stdio: options.stdio ?? 'pipe',
    },
  );
}
