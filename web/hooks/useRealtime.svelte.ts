export interface PresenceEditor {
  handle: string;
  path: string | null;
}

export interface DraftSavedEvent {
  by: string;
  path: string;
  savedAt: number;
}

export interface PublishedEvent {
  by: string;
  branchName: string;
  prUrl: string;
  prNumber: number;
  files: string[];
}

export interface RealtimeApi {
  readonly connected: boolean;
  readonly editors: PresenceEditor[];
  setEditing: (path: string | null) => void;
  onDraftSaved: (handler: (e: DraftSavedEvent) => void) => () => void;
  onPublished: (handler: (e: PublishedEvent) => void) => () => void;
  close: () => void;
}

const RECONNECT_BASE_MS = 1500;
const RECONNECT_MAX_MS = 15_000;
const PING_MS = 25_000;

export function useRealtime(): RealtimeApi {
  let connected = $state(false);
  let editors = $state<PresenceEditor[]>([]);
  let ws: WebSocket | null = null;
  let currentPath: string | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let backoff = RECONNECT_BASE_MS;
  let closed = false;
  const draftSavedHandlers = new Set<(e: DraftSavedEvent) => void>();
  const publishedHandlers = new Set<(e: PublishedEvent) => void>();

  function connect() {
    if (closed) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/api/ws`;
    let sock: WebSocket;
    try {
      sock = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      connected = true;
      backoff = RECONNECT_BASE_MS;
      try {
        sock.send(JSON.stringify({ type: 'editing', path: currentPath }));
      } catch {
        // ignore
      }
      pingTimer = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) {
          try {
            sock.send(JSON.stringify({ type: 'ping' }));
          } catch {
            // ignore
          }
        }
      }, PING_MS);
    };
    sock.onclose = () => {
      connected = false;
      ws = null;
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      scheduleReconnect();
    };
    sock.onerror = () => {
      try {
        sock.close();
      } catch {
        // ignore
      }
    };
    sock.onmessage = (ev) => {
      let msg: { type?: string } & Record<string, unknown>;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (msg.type === 'roster' && Array.isArray(msg.editors)) {
        editors = msg.editors as PresenceEditor[];
      } else if (msg.type === 'draft-saved') {
        for (const h of draftSavedHandlers) h(msg as unknown as DraftSavedEvent);
      } else if (msg.type === 'published') {
        for (const h of publishedHandlers) h(msg as unknown as PublishedEvent);
      }
    };
  }

  function scheduleReconnect() {
    if (closed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoff);
    backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
  }

  connect();

  return {
    get connected() {
      return connected;
    },
    get editors() {
      return editors;
    },
    setEditing(path: string | null) {
      currentPath = path;
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'editing', path }));
        } catch {
          // ignore
        }
      }
    },
    onDraftSaved(handler) {
      draftSavedHandlers.add(handler);
      return () => {
        draftSavedHandlers.delete(handler);
      };
    },
    onPublished(handler) {
      publishedHandlers.add(handler);
      return () => {
        publishedHandlers.delete(handler);
      };
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      ws?.close();
    },
  };
}
