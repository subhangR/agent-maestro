/**
 * @deprecated Use useMaestroStore's WebSocket connection instead.
 * This hook is unused and will be removed in a future version.
 * See useMaestroStore.initWebSocket() for the active implementation.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import type { MaestroTask, MaestroSession } from '../app/types/maestro';
import { WS_URL } from '../utils/serverConfig';
import { withGatewayToken } from '../utils/gatewayAuth';

// Global singleton WebSocket instance (shared across all hook instances)
let globalWs: WebSocket | null = null;
let globalConnecting = false;
let globalListeners: Set<(event: MessageEvent) => void> = new Set();
let globalReconnectTimeout: number | null = null;
let globalReconnectAttempts = 0;

// WebSocket event types
type WebSocketEvent =
    | { event: 'task:created'; data: MaestroTask }
    | { event: 'task:updated'; data: MaestroTask }
    | { event: 'task:deleted'; data: { id: string } }
    | { event: 'session:created'; data: any }  // Can be Session or spawn data
    | { event: 'session:updated'; data: MaestroSession }
    | { event: 'session:deleted'; data: { id: string } }
    // PHASE IV-A: New bidirectional relationship events
    | { event: 'session:task_added'; data: { sessionId: string; taskId: string } }
    | { event: 'session:task_removed'; data: { sessionId: string; taskId: string } }
    | { event: 'task:session_added'; data: { taskId: string; sessionId: string } }
    | { event: 'task:session_removed'; data: { taskId: string; sessionId: string } }
    | { event: 'subtask:created'; data: { taskId: string; subtask: any } }
    | { event: 'subtask:updated'; data: { taskId: string; subtask: any } }
    | { event: 'subtask:deleted'; data: { taskId: string; subtaskId: string } }
    // Notification events
    | { event: 'notify:task_completed'; data: { taskId: string; title: string } }
    | { event: 'notify:task_failed'; data: { taskId: string; title: string } }
    | { event: 'notify:task_blocked'; data: { taskId: string; title: string } }
    | { event: 'notify:task_session_completed'; data: { taskId: string; sessionId: string; title: string } }
    | { event: 'notify:task_session_failed'; data: { taskId: string; sessionId: string; title: string } }
    | { event: 'notify:session_completed'; data: { sessionId: string; name: string } }
    | { event: 'notify:session_failed'; data: { sessionId: string; name: string } }
    | { event: 'notify:needs_input'; data: { sessionId: string; name: string; message?: string } }
    | { event: 'notify:progress'; data: { sessionId: string; taskId?: string; message?: string } }
    | { event: 'session:modal'; data: { sessionId: string; modalId: string; title: string; html: string; filePath?: string; timestamp: number } };

export type MaestroWebSocketCallbacks = {
    onTaskCreated?: (task: MaestroTask) => void;
    onTaskUpdated?: (task: MaestroTask) => void;
    onTaskDeleted?: (data: { id: string }) => void;
    onSessionCreated?: (data: any) => void;  // Can be Session or spawn data
    onSessionUpdated?: (session: MaestroSession) => void;
    onSessionDeleted?: (data: { id: string }) => void;
    // PHASE IV-A: New bidirectional relationship callbacks
    onSessionTaskAdded?: (data: { sessionId: string; taskId: string }) => void;
    onSessionTaskRemoved?: (data: { sessionId: string; taskId: string }) => void;
    onTaskSessionAdded?: (data: { taskId: string; sessionId: string }) => void;
    onTaskSessionRemoved?: (data: { taskId: string; sessionId: string }) => void;
    onSubtaskCreated?: (data: { taskId: string; subtask: any }) => void;
    onSubtaskUpdated?: (data: { taskId: string; subtask: any }) => void;
    onSubtaskDeleted?: (data: { taskId: string; subtaskId: string }) => void;
    // Notification event callbacks
    onNotifyTaskCompleted?: (data: { taskId: string; title: string }) => void;
    onNotifyTaskFailed?: (data: { taskId: string; title: string }) => void;
    onNotifyTaskBlocked?: (data: { taskId: string; title: string }) => void;
    onNotifyTaskSessionCompleted?: (data: { taskId: string; sessionId: string; title: string }) => void;
    onNotifyTaskSessionFailed?: (data: { taskId: string; sessionId: string; title: string }) => void;
    onNotifySessionCompleted?: (data: { sessionId: string; name: string }) => void;
    onNotifySessionFailed?: (data: { sessionId: string; name: string }) => void;
    onNotifyNeedsInput?: (data: { sessionId: string; name: string; message?: string }) => void;
    onNotifyProgress?: (data: { sessionId: string; taskId?: string; message?: string }) => void;
    onSessionModal?: (data: { sessionId: string; modalId: string; title: string; html: string; filePath?: string; timestamp: number }) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
};

/**
 * React hook for Maestro WebSocket connection
 * 
 * Connects to the Maestro server WebSocket and handles real-time events.
 * Automatically reconnects on disconnection with exponential backoff.
 */
export function useMaestroWebSocket(callbacks: MaestroWebSocketCallbacks = {}) {
    const [connected, setConnected] = useState(globalWs?.readyState === WebSocket.OPEN);
    const callbacksRef = useRef(callbacks);
    const listenerRef = useRef<((event: MessageEvent) => void) | null>(null);

    // Update callbacks ref when they change
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    const connectGlobal = useCallback(() => {
        // Prevent duplicate connections
        if (globalConnecting || (globalWs && globalWs.readyState === WebSocket.OPEN)) {
            return;
        }

        globalConnecting = true;

        // Clean up existing connection
        if (globalWs) {
            globalWs.close();
            globalWs = null;
        }

        try {
            const ws = new WebSocket(withGatewayToken(WS_URL));
            globalWs = ws;

            ws.onopen = () => {
                setConnected(true);
                globalConnecting = false;
                globalReconnectAttempts = 0;
            };

            ws.onmessage = (event) => {
                // Broadcast to all registered listeners
                globalListeners.forEach(listener => listener(event));
            };

            ws.onerror = () => {
            };

            ws.onclose = () => {
                setConnected(false);
                globalConnecting = false;
                globalWs = null;

                // Attempt to reconnect with exponential backoff + jitter
                const baseDelay = Math.min(1000 * Math.pow(2, globalReconnectAttempts), 30000);
                const jitter = Math.random() * baseDelay * 0.5; // 0-50% jitter
                const delay = baseDelay + jitter;

                if (globalReconnectTimeout) {
                    clearTimeout(globalReconnectTimeout);
                }

                globalReconnectTimeout = window.setTimeout(() => {
                    globalReconnectAttempts++;
                    connectGlobal();
                }, delay);
            };
        } catch {
            globalConnecting = false;
        }
    }, []);

    // Register message listener and connect
    useEffect(() => {
        // Create listener for this hook instance
        const listener = (event: MessageEvent) => {
            try {
                const parsed = JSON.parse(event.data);
                const messages = Array.isArray(parsed) ? parsed : [parsed];

                for (const message of messages as WebSocketEvent[]) {
                const callbacks = callbacksRef.current;
                switch (message.event) {
                    case 'task:created':
                        callbacks.onTaskCreated?.(message.data);
                        break;
                    case 'task:updated':
                        callbacks.onTaskUpdated?.(message.data);
                        break;
                    case 'task:deleted':
                        callbacks.onTaskDeleted?.(message.data);
                        break;
                    case 'session:created':
                        callbacks.onSessionCreated?.(message.data);
                        break;
                    case 'session:updated':
                        callbacks.onSessionUpdated?.(message.data);
                        break;
                    case 'session:deleted':
                        callbacks.onSessionDeleted?.(message.data);
                        break;
                    case 'session:task_added':
                        callbacks.onSessionTaskAdded?.(message.data);
                        break;
                    case 'session:task_removed':
                        callbacks.onSessionTaskRemoved?.(message.data);
                        break;
                    case 'task:session_added':
                        callbacks.onTaskSessionAdded?.(message.data);
                        break;
                    case 'task:session_removed':
                        callbacks.onTaskSessionRemoved?.(message.data);
                        break;
                    case 'subtask:created':
                        callbacks.onSubtaskCreated?.(message.data);
                        break;
                    case 'subtask:updated':
                        callbacks.onSubtaskUpdated?.(message.data);
                        break;
                    case 'subtask:deleted':
                        callbacks.onSubtaskDeleted?.(message.data);
                        break;
                    // Notification events
                    case 'notify:task_completed':
                        callbacks.onNotifyTaskCompleted?.(message.data);
                        break;
                    case 'notify:task_failed':
                        callbacks.onNotifyTaskFailed?.(message.data);
                        break;
                    case 'notify:task_blocked':
                        callbacks.onNotifyTaskBlocked?.(message.data);
                        break;
                    case 'notify:task_session_completed':
                        callbacks.onNotifyTaskSessionCompleted?.(message.data);
                        break;
                    case 'notify:task_session_failed':
                        callbacks.onNotifyTaskSessionFailed?.(message.data);
                        break;
                    case 'notify:session_completed':
                        callbacks.onNotifySessionCompleted?.(message.data);
                        break;
                    case 'notify:session_failed':
                        callbacks.onNotifySessionFailed?.(message.data);
                        break;
                    case 'notify:needs_input':
                        callbacks.onNotifyNeedsInput?.(message.data);
                        break;
                    case 'notify:progress':
                        callbacks.onNotifyProgress?.(message.data);
                        break;
                    case 'session:modal':
                        callbacks.onSessionModal?.(message.data);
                        break;
                }
                } // end for loop
            } catch {
            }
        };

        listenerRef.current = listener;
        globalListeners.add(listener);

        // Connect to global WebSocket if not already connected
        connectGlobal();

        // Cleanup on unmount
        return () => {
            if (listenerRef.current) {
                globalListeners.delete(listenerRef.current);
            }

            // Only close connection if no more listeners
            if (globalListeners.size === 0) {
                if (globalReconnectTimeout) {
                    clearTimeout(globalReconnectTimeout);
                    globalReconnectTimeout = null;
                }
                if (globalWs) {
                    globalWs.close();
                    globalWs = null;
                }
                globalConnecting = false;
            }
        };
    }, [connectGlobal]);

    return { connected };
}
