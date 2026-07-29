import { atomicWriteFile } from './atomicWrite';

/**
 * Batches and debounces file writes.
 * Marks entities as dirty and flushes on a timer or explicit flush() call.
 */
export class WriteBatcher {
  private dirtyEntities: Map<string, { filePath: string; data: string }> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushIntervalMs: number;

  constructor(options?: { flushIntervalMs?: number }) {
    this.flushIntervalMs = options?.flushIntervalMs ?? 500;
  }

  markDirty(entityId: string, filePath: string, data: string): void {
    this.dirtyEntities.set(entityId, { filePath, data });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
  }

  /**
   * Flush a single entity's pending write to disk.
   * Call this before loading an entity from disk to avoid stale reads.
   */
  async flushEntity(entityId: string): Promise<void> {
    const entry = this.dirtyEntities.get(entityId);
    if (!entry) return;
    this.dirtyEntities.delete(entityId);
    await atomicWriteFile(entry.filePath, entry.data);
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirtyEntities.size === 0) return;
    const entries = Array.from(this.dirtyEntities.entries());
    this.dirtyEntities.clear();
    const results = await Promise.allSettled(
      entries.map(([, { filePath, data }]) => atomicWriteFile(filePath, data))
    );
    // Re-queue entries whose writes failed, unless they've since been re-dirtied
    // with newer data (in which case the newer write will supersede this one).
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const [id, entry] = entries[i];
        if (!this.dirtyEntities.has(id)) {
          this.dirtyEntities.set(id, entry);
          this.scheduleFlush();
        }
      }
    }
  }

  async destroy(): Promise<void> {
    await this.flush();
  }
}
