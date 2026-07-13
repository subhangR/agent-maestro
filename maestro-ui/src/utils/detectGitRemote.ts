import { Command } from '@tauri-apps/plugin-shell';
import { parseGitRemote, ParsedGitRemote } from './parseGitRemote';

export async function detectGitRemote(workingDir: string): Promise<ParsedGitRemote | null> {
  if (!workingDir) return null;
  try {
    const cmd = Command.create('git', ['-C', workingDir, 'remote', 'get-url', 'origin']);
    const output = await cmd.execute();
    if (output.code !== 0) return null;
    return parseGitRemote(output.stdout);
  } catch {
    return null;
  }
}
