// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useState } from 'react';

/**
 * The GSX services, by their Couatl Remote API v2 id (GSX Pro manual for MSFS, Couatl Remote API v2 developer guide,
 * Appendix B)
 */
export enum GsxServiceId {
  Deboarding = 'Deboarding',
  Boarding = 'Boarding',
  Refueling = 'Refueling',
  Catering = 'Catering',
  /** Pushback */
  Departure = 'Departure',
  OperateJetways = 'OperateJetways',
  OperateStairs = 'OperateStairs',
  Gpu = 'GPU',
  DeIce = 'DeIce',
  Water = 'Water',
  Lavatory = 'Lavatory',
  Cleaning = 'Cleaning',
}

/** A GSX service as the Remote API reports it (developer guide §8.1) */
export interface GsxService {
  id: string;
  displayName: string;
  /** available, unavailable, bypassed, requested, performing, completing, completed or unknown */
  state: string;
  canTrigger: boolean;
  /** Blocked on another vehicle or service */
  waiting?: boolean;
  /** Compact progress, e.g. 120/180 or 42 % */
  progressText?: string;
}

export interface GsxRemoteState {
  /** Connected to the Remote API server of GSX */
  connected: boolean;
  /** GSX is up in a running sim session (the server rejects commands otherwise) */
  gsxRunning: boolean;
  services: GsxService[];
}

/** How a service button looks for a GSX service state */
export type GsxServiceLook = 'disabled' | 'inactive' | 'called' | 'active' | 'released';

/** The default port of the Remote API server (GSX settings: Remote control server, on by default) */
const REMOTE_API_PORT = 8744;
/** The developer guide advises a 2 s reconnection retry */
const RECONNECT_MS = 2_000;
const COMMAND_TIMEOUT_MS = 5_000;

const DISCONNECTED: GsxRemoteState = { connected: false, gsxRunning: false, services: [] };

/**
 * The connection of the flyPad to the Couatl Remote API v2 of GSX: a local WebSocket speaking JSON. It follows the state
 * of the GSX services (snapshot, then patches) and requests a service with service.trigger, which runs the GSX menu
 * as if the user had picked the service. One connection for the whole flyPad, open while a page uses it.
 */
class GsxRemoteClient {
  private ws: WebSocket | null = null;

  private users = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private commandCount = 0;

  private readonly pending = new Map<string, (ok: boolean, error?: string) => void>();

  private state: GsxRemoteState = DISCONNECTED;

  private readonly listeners = new Set<(state: GsxRemoteState) => void>();

  /**
   * Follows the GSX state; the connection opens with the first listener and closes with the last one
   * @returns the function that stops following it
   */
  public subscribe(listener: (state: GsxRemoteState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    this.users++;
    if (this.users === 1) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      this.users--;
      if (this.users === 0) {
        this.close();
      }
    };
  }

  /**
   * Requests a GSX service (service.trigger)
   * @param service the service id
   * @returns whether GSX accepted it, or the error code of the Remote API
   */
  public trigger(service: GsxServiceId): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const ws = this.ws;
      if (ws === null || ws.readyState !== WebSocket.OPEN) {
        resolve({ ok: false, error: 'not_connected' });
        return;
      }
      this.commandCount++;
      const id = `fbw-flypad-${this.commandCount}`;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'timeout' });
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, (ok, error) => {
        clearTimeout(timeout);
        resolve({ ok, error });
      });
      ws.send(JSON.stringify({ type: 'command', id, verb: 'service.trigger', args: { service } }));
    });
  }

  private update(changes: Partial<GsxRemoteState>): void {
    this.state = { ...this.state, ...changes };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private connect(): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${REMOTE_API_PORT}/`);
    } catch (_e) {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.update({ connected: true });
      ws.send(JSON.stringify({ type: 'subscribe', channels: ['state'] }));
    };
    ws.onmessage = (event) => this.handleMessage(String(event.data));
    ws.onclose = () => {
      if (this.ws !== ws) {
        return;
      }
      this.ws = null;
      this.update(DISCONNECTED);
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private handleMessage(data: string): void {
    let message: any;
    try {
      message = JSON.parse(data);
    } catch (_e) {
      return;
    }
    switch (message.type) {
      case 'hello':
        this.update({ gsxRunning: message.gsxRunning === true });
        break;
      case 'event':
        if (message.topic === 'engine' && typeof message.gsxRunning === 'boolean') {
          this.update({ gsxRunning: message.gsxRunning });
        }
        break;
      case 'snapshot':
        this.update({ services: Array.isArray(message.services) ? message.services : [] });
        break;
      case 'patch':
        if (message.path === '/services') {
          this.update({ services: Array.isArray(message.value) ? message.value : [] });
        }
        break;
      case 'result': {
        const answer = this.pending.get(message.id);
        if (answer) {
          this.pending.delete(message.id);
          answer(message.ok === true, message.error?.code);
        }
        break;
      }
      default:
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.users === 0 || this.reconnectTimer !== null) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.users > 0) {
        this.connect();
      }
    }, RECONNECT_MS);
  }

  private close(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.update(DISCONNECTED);
  }
}

export const gsxRemote = new GsxRemoteClient();

/**
 * The GSX state while the link to GSX is on
 * @param enabled the Services page is linked to GSX
 */
export function useGsxRemote(enabled: boolean): GsxRemoteState {
  const [state, setState] = useState<GsxRemoteState>(DISCONNECTED);
  useEffect(() => {
    if (!enabled) {
      setState(DISCONNECTED);
      return undefined;
    }
    return gsxRemote.subscribe(setState);
  }, [enabled]);
  return state;
}

/**
 * How the button of a GSX service looks: requested (amber), performing (green: a connected jetway, stairs or GPU, or a
 * running truck service), completing, available, or disabled when GSX does not offer it here
 * @param service the service, undefined when GSX does not list it
 */
export function gsxServiceLook(service: GsxService | undefined): GsxServiceLook {
  switch (service?.state) {
    case undefined:
    case 'unavailable':
    case 'bypassed':
      return 'disabled';
    case 'requested':
      return 'called';
    case 'performing':
      return service.waiting ? 'called' : 'active';
    case 'completing':
      return 'released';
    default:
      return 'inactive';
  }
}
