// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useState } from 'react';
import { isCaptainEfb } from '../../../Utils/efbIndex';

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
  /** GSX's own short state label, e.g. Refueling (may be empty) */
  stateText?: string;
  canTrigger: boolean;
  /** Blocked on another vehicle or service */
  waiting?: boolean;
  /** Multi-line detail while active, e.g. "Refuelling\n12300/18000 kg\n0:04:31 running" */
  statusText?: string;
  /** Numeric progress while active (passengers) */
  progress?: { current: number; total: number; unit: string };
  /** Compact progress, e.g. 120/180 or 42 % */
  progressText?: string;
}

/** The GSX menu (developer guide §8.2): the questions GSX asks, e.g. the operator to use */
export interface GsxMenu {
  title: string;
  entries: string[];
  disabled: boolean[];
}

export interface GsxRemoteState {
  /** Connected to the Remote API server of GSX */
  connected: boolean;
  /** GSX is up in a running sim session (the server rejects commands otherwise) */
  gsxRunning: boolean;
  services: GsxService[];
  /** A GSX menu is open */
  menuShown: boolean;
  menu: GsxMenu;
  /** The on-screen GSX message, e.g. "Refuelling complete" (§8.3) */
  message: { text: string; visible: boolean };
}

/** How a service button looks for a GSX service state */
export type GsxServiceLook = 'disabled' | 'inactive' | 'called' | 'active' | 'released';

/** The default port of the Remote API server (GSX settings: Remote control server, on by default) */
const REMOTE_API_PORT = 8744;
/** The developer guide advises a 2 s reconnection retry */
const RECONNECT_MS = 2_000;
const COMMAND_TIMEOUT_MS = 5_000;
/**
 * GSX manual, Remote Control Mode: set to 1, the GSX toolbar menu is disabled and no pop-up menu or notification is
 * shown; GSX resets it to 0 when it restarts, so it is set again periodically
 */
const REMOTE_CONTROL_VAR = 'L:FSDT_GSX_SET_REMOTECONTROL';
const REMOTE_CONTROL_REFRESH_MS = 5_000;

const NO_MENU: GsxMenu = { title: '', entries: [], disabled: [] };
const DISCONNECTED: GsxRemoteState = {
  connected: false,
  gsxRunning: false,
  services: [],
  menuShown: false,
  menu: NO_MENU,
  message: { text: '', visible: false },
};

/**
 * The connection of the flyPad to the Couatl Remote API v2 of GSX: a local WebSocket speaking JSON. It follows the state
 * of the GSX services, menu and message (snapshot, then patches), requests a service with service.trigger (which runs
 * the GSX menu as if the user had picked the service) and answers the GSX menu with menu.pick. One connection for the
 * whole flyPad, open while a page uses it.
 */
class GsxRemoteClient {
  private ws: WebSocket | null = null;

  private users = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private commandCount = 0;

  private readonly pending = new Map<string, (ok: boolean, error?: string) => void>();

  private state: GsxRemoteState = DISCONNECTED;

  private readonly listeners = new Set<(state: GsxRemoteState) => void>();

  private remoteControl = false;

  private remoteControlTimer: ReturnType<typeof setInterval> | null = null;

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
    return this.command('service.trigger', { service });
  }

  /** Picks an entry of the open GSX menu (menu.pick), e.g. the answer to a GSX question */
  public pickMenu(index: number): Promise<{ ok: boolean; error?: string }> {
    return this.command('menu.pick', { index });
  }

  /** Closes the GSX menu (menu.close) */
  public closeMenu(): Promise<{ ok: boolean; error?: string }> {
    return this.command('menu.close', {});
  }

  /**
   * Puts GSX under remote control (no GSX pop-up menu or notification in the sim: the flyPad shows them) or gives
   * the GSX menu back to the user
   */
  public setRemoteControl(on: boolean): void {
    // by the captain's flyPad only: the first officer's leaving the page would give the menu back under the captain
    if (on === this.remoteControl || !isCaptainEfb()) {
      return;
    }
    this.remoteControl = on;
    if (on) {
      this.refreshRemoteControl();
      this.remoteControlTimer = setInterval(() => this.refreshRemoteControl(), REMOTE_CONTROL_REFRESH_MS);
    } else {
      if (this.remoteControlTimer !== null) {
        clearInterval(this.remoteControlTimer);
        this.remoteControlTimer = null;
      }
      SimVar.SetSimVarValue(REMOTE_CONTROL_VAR, 'number', 0);
    }
  }

  private refreshRemoteControl(): void {
    if (this.remoteControl && this.state.connected && this.state.gsxRunning) {
      SimVar.SetSimVarValue(REMOTE_CONTROL_VAR, 'number', 1);
    }
  }

  private command(verb: string, args: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
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
      ws.send(JSON.stringify({ type: 'command', id, verb, args }));
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

  private static menuOf(value: any): GsxMenu {
    if (!value || !Array.isArray(value.entries)) {
      return NO_MENU;
    }
    return {
      title: typeof value.title === 'string' ? value.title : '',
      entries: value.entries.map((e: unknown) => String(e)),
      disabled: Array.isArray(value.disabled) ? value.disabled.map((d: unknown) => d === true) : [],
    };
  }

  private static messageOf(value: any): { text: string; visible: boolean } {
    return { text: typeof value?.text === 'string' ? value.text : '', visible: value?.visible === true };
  }

  /** A top-level key of the state (a snapshot key or a patch), see developer guide §8 */
  private applyKey(key: string, value: any): void {
    switch (key) {
      case 'services':
        this.update({ services: Array.isArray(value) ? value : [] });
        break;
      case 'menuShown':
        this.update({ menuShown: value === true });
        break;
      case 'menu':
        this.update({ menu: GsxRemoteClient.menuOf(value) });
        break;
      case 'message':
        this.update({ message: GsxRemoteClient.messageOf(value) });
        break;
      default:
        break;
    }
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
        this.refreshRemoteControl();
        break;
      case 'event':
        if (message.topic === 'engine' && typeof message.gsxRunning === 'boolean') {
          this.update({ gsxRunning: message.gsxRunning });
          this.refreshRemoteControl();
        }
        break;
      case 'snapshot':
        for (const key of ['services', 'menuShown', 'menu', 'message']) {
          this.applyKey(key, message[key]);
        }
        break;
      case 'patch':
        if (typeof message.path === 'string' && message.path.startsWith('/')) {
          this.applyKey(message.path.substring(1), message.value);
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
    this.setRemoteControl(false);
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

/** The GSX state, followed while the component is shown (the Services page looks for GSX even with the link off) */
export function useGsxRemote(): GsxRemoteState {
  const [state, setState] = useState<GsxRemoteState>(DISCONNECTED);
  useEffect(() => gsxRemote.subscribe(setState), []);
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

/**
 * The action chip of a turnaround step: Request while GSX offers the service, Stop while it runs and GSX lets it be
 * triggered, none otherwise (e.g. a completed step).
 * Remote API developer guide §8.1: canTrigger is "whether service.trigger is meaningful right now (true only when the
 * service is available)"; its reference client triggers a service only when canTrigger. A service GSX allows to be
 * requested again comes back as available with canTrigger, so it gets its Request chip back.
 * Design choice: without canTrigger (not sent by an older server), Request only in the available state.
 * @param service the service
 */
export function gsxTurnaroundAction(service: GsxService): 'request' | 'stop' | null {
  const look = gsxServiceLook(service);
  const requestable = typeof service.canTrigger === 'boolean' ? service.canTrigger : service.state === 'available';
  if (look === 'inactive') {
    return requestable ? 'request' : null;
  }
  return look === 'active' && service.canTrigger === true ? 'stop' : null;
}

/**
 * Whether a GSX-linked button may offer Request: GSX lets the service be triggered (gsxTurnaroundAction), or GSX does
 * not list it (the button then follows the sim)
 */
export function gsxRequestable(service: GsxService | undefined): boolean {
  return service === undefined || gsxTurnaroundAction(service) === 'request';
}

/**
 * The progress of a GSX service, 0 to 1: the quantity of its status text (e.g. "12300/18000 kg" while refuelling),
 * else its passenger count; null when it has none
 */
export function gsxServiceProgress(service: GsxService | undefined): number | null {
  if (!service || (service.state !== 'performing' && service.state !== 'completing')) {
    return null;
  }
  const quantity = service.statusText?.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(?:kg|lbs?|l|gal)/i);
  if (quantity) {
    const total = Number(quantity[2]);
    return total > 0 ? Math.min(1, Number(quantity[1]) / total) : null;
  }
  if (service.progress && service.progress.total > 0) {
    return Math.min(1, service.progress.current / service.progress.total);
  }
  return null;
}
