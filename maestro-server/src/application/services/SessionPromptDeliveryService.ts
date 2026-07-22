import { ILogger } from '../../domain/common/ILogger';
import { IEventBus, EventHandler } from '../../domain/events/IEventBus';
import {
  PromptDeliveryOwner,
  TypedEventMap,
} from '../../domain/events/DomainEvents';
import { PtyHostService } from './PtyHostService';

/**
 * Exactly-once terminal injection owner for session:prompt_send.
 *
 * Server-hosted PTYs share one process across every browser/Tauri subscriber,
 * so the server consumes the domain event once and writes beside PtyHostService.
 * Tauri-hosted PTYs remain UI-owned because the process lives in the desktop
 * client and is not reachable from maestro-server.
 */
export class SessionPromptDeliveryService {
  readonly owner: PromptDeliveryOwner;
  private readonly promptHandler: EventHandler<TypedEventMap['session:prompt_send']>;
  private readonly attachHandler: EventHandler<TypedEventMap['session:spawn']>;
  private listening = false;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly ptyHostService: PtyHostService,
    ptyHost: 'tauri' | 'server',
    private readonly logger: ILogger,
  ) {
    this.owner = ptyHost === 'server' ? 'server' : 'ui';
    this.promptHandler = (data) => {
      if (this.owner !== 'server') return;

      // Start delivery synchronously with the event but do not hold the event
      // bus (and prompt HTTP response) open during send-mode's 200ms Enter gap.
      void this.ptyHostService
        .deliverPrompt(data.sessionId, data.content, data.mode)
        .then((delivered) => {
          if (!delivered) {
            this.logger.warn('Session prompt rejected by server PTY queue', {
              sessionId: data.sessionId,
            });
          }
        })
        .catch((error) => {
          this.logger.error(
            'Failed to deliver session prompt to server PTY',
            error instanceof Error ? error : new Error(String(error)),
            { sessionId: data.sessionId },
          );
        });
    };
    this.attachHandler = (data) => {
      if (this.owner !== 'server') return;
      const sessionId = data.session?.id;
      if (sessionId) this.ptyHostService.beginPromptHandoff(sessionId);
    };

    if (this.owner === 'server') {
      this.eventBus.on('session:spawn', this.attachHandler);
      this.eventBus.on('session:resume', this.attachHandler);
      this.eventBus.on('session:prompt_send', this.promptHandler);
      this.listening = true;
    }
  }

  shutdown(): void {
    if (!this.listening) return;
    this.eventBus.off('session:spawn', this.attachHandler);
    this.eventBus.off('session:resume', this.attachHandler);
    this.eventBus.off('session:prompt_send', this.promptHandler);
    this.listening = false;
  }
}
