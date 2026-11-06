// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FORCE_MENU_WAIT_MS,
  GSX_STUCK_MS,
  GSX_TRIGGER_HOLD_MS,
  GsxRemoteState,
  GsxService,
  GsxServiceId,
  gsxRefuelProgress,
  gsxRemote,
  gsxRequestable,
  gsxServiceLook,
  gsxStuck,
  gsxTriggerHoldMs,
  gsxTurnaroundAction,
} from './GsxRemote';

const service = (state: string, canTrigger?: boolean): GsxService =>
  ({ id: 'Catering', displayName: 'Catering', state, canTrigger }) as GsxService;

describe('GSX turnaround step action', () => {
  it('offers no Request on a completed service GSX does not let be triggered', () => {
    expect(gsxTurnaroundAction(service('completed', false))).toBeNull();
  });

  it('offers Request whenever GSX lets the service be triggered, a completed one included', () => {
    expect(gsxTurnaroundAction(service('available', true))).toBe('request');
    expect(gsxTurnaroundAction(service('completed', true))).toBe('request');
  });

  it('offers nothing on an available service GSX does not let be triggered now', () => {
    expect(gsxTurnaroundAction(service('available', false))).toBeNull();
  });

  it('falls back on the state without canTrigger', () => {
    expect(gsxTurnaroundAction(service('available'))).toBe('request');
    expect(gsxTurnaroundAction(service('completed'))).toBeNull();
  });

  it('offers Stop on a running service GSX lets be triggered, nothing while requested or leaving', () => {
    expect(gsxTurnaroundAction(service('performing', true))).toBe('stop');
    expect(gsxTurnaroundAction(service('performing', false))).toBeNull();
    expect(gsxTurnaroundAction(service('requested', false))).toBeNull();
    expect(gsxTurnaroundAction(service('completing', false))).toBeNull();
    expect(gsxTurnaroundAction(service('unavailable', false))).toBeNull();
  });
});

describe('GSX jetway and stairs', () => {
  // GSX 4 reports them completed without canTrigger after a dock and after an undock alike; the phase tells which
  const operated = (id: string, state: string, phase?: string): GsxService =>
    ({ id, displayName: id, state, canTrigger: false, detail: phase ? { phase } : undefined }) as GsxService;

  it('look connected once docked, with no Request', () => {
    expect(gsxServiceLook(operated('OperateJetways', 'completed', 'docked'))).toBe('active');
    expect(gsxRequestable(operated('OperateJetways', 'completed', 'docked'))).toBe(false);
  });

  it('offer Request again once undocked: GSX accepts the next trigger though it sends no canTrigger', () => {
    expect(gsxServiceLook(operated('OperateJetways', 'completed', 'undocked'))).toBe('inactive');
    expect(gsxRequestable(operated('OperateJetways', 'completed', 'undocked'))).toBe(true);
    expect(gsxRequestable(operated('OperateStairs', 'completed', 'undocked'))).toBe(true);
  });

  it('offer no Request while GSX operates them or does not have them', () => {
    expect(gsxRequestable(operated('OperateJetways', 'performing', 'docking'))).toBe(false);
    expect(gsxRequestable(operated('OperateJetways', 'requested'))).toBe(false);
    expect(gsxRequestable(operated('OperateJetways', 'unavailable'))).toBe(false);
  });
});

describe('GSX-linked Services buttons', () => {
  it('may offer Request only when GSX lets the service be triggered, or does not list it', () => {
    expect(gsxRequestable(service('completed', false))).toBe(false);
    expect(gsxRequestable(service('completed', true))).toBe(true);
    expect(gsxRequestable(service('available', true))).toBe(true);
    expect(gsxRequestable(service('unavailable', false))).toBe(false);
    expect(gsxRequestable(undefined)).toBe(true);
  });
});

/**
 * The GSX refuelling of an A380X with the flyPad fuel sync on, as GSX reported it: the flyPad pumps the fuel and GSX,
 * which does not know the flyPad target, keeps its own target just above what was pumped
 */
const refuelling = (aircraftTotalLb: number, state = 'performing'): GsxService =>
  ({
    id: 'Refueling',
    displayName: 'Refuel',
    state,
    canTrigger: false,
    detail: {
      fuel: {
        current: aircraftTotalLb - 54887,
        target: aircraftTotalLb - 54877,
        unit: 'lb',
        startTotal: 54887,
        aircraftTotal: aircraftTotalLb,
      },
    },
    progressText: '100%',
  }) as GsxService;

const LB_TO_KG = 0.45359237;

describe('GSX refuelling progress against the flyPad fuel target', () => {
  it('starts at 0 when the refuelling starts, not at the 100 % GSX reports', () => {
    expect(gsxRefuelProgress(refuelling(54887), 156700)).toBeCloseTo(0);
  });

  it('is the part of the fuel to load that the aircraft received', () => {
    const startKg = 54887 * LB_TO_KG;
    const progress = gsxRefuelProgress(refuelling(89123), 156700);
    expect(progress).toBeCloseTo((89123 * LB_TO_KG - startKg) / (156700 - startKg));
    expect(progress).toBeLessThan(0.2);
  });

  it('takes a GSX fuel quantity in kg as it is', () => {
    const service = refuelling(0);
    service.detail = { fuel: { current: 500, target: 510, unit: 'kg', startTotal: 1000, aircraftTotal: 1500 } };
    expect(gsxRefuelProgress(service, 3000)).toBeCloseTo(0.25);
  });

  it('is full once the target is reached, never above', () => {
    expect(gsxRefuelProgress(refuelling(156700 / LB_TO_KG + 50), 156700)).toBe(1);
  });

  it('has none outside the refuelling, without the GSX fuel detail, or with nothing to load', () => {
    expect(gsxRefuelProgress(refuelling(60000, 'completed'), 156700)).toBeNull();
    expect(gsxRefuelProgress({ ...refuelling(60000), detail: undefined }, 156700)).toBeNull();
    expect(gsxRefuelProgress(refuelling(60000), 54887 * LB_TO_KG)).toBeNull();
    expect(gsxRefuelProgress(undefined, 156700)).toBeNull();
  });
});

describe('GSX menu', () => {
  // the client's message handler and state, as the WebSocket feeds them
  const client = gsxRemote as unknown as { handleMessage(data: string): void; state: GsxRemoteState };
  const menuPatch = (shown: boolean) =>
    client.handleMessage(JSON.stringify({ type: 'patch', path: '/menuShown', value: shown }));

  it('notes when GSX closes its menu (e.g. a release question answered), not when it stays closed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    menuPatch(true);
    vi.setSystemTime(9_000);
    menuPatch(false);
    vi.setSystemTime(20_000);
    menuPatch(false);
    vi.useRealTimers();

    expect(client.state.menuShown).toBe(false);
    expect(client.state.menuClosedAt).toBe(9_000);
  });
});

describe('Stuck GSX jet bridge or stairs', () => {
  const client = gsxRemote as unknown as { handleMessage(data: string): void; state: GsxRemoteState };
  const T = 1_000_000;
  const report = (id: string, state: string, phase?: string) =>
    client.handleMessage(
      JSON.stringify({
        type: 'patch',
        path: '/services',
        value: [{ id, displayName: id, state, canTrigger: false, ...(phase ? { detail: { phase } } : {}) }],
      }),
    );
  const service = (id: string) => client.state.services.find((s) => s.id === id);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is stuck when GSX performs it with no phase (GSX paused it)', () => {
    report(GsxServiceId.OperateStairs, 'performing');

    expect(gsxStuck(service(GsxServiceId.OperateStairs), T)).toBe(true);
  });

  it('is not stuck while its phase changes, only once the same phase lasts too long', () => {
    report(GsxServiceId.OperateStairs, 'performing', 'on the way');
    vi.setSystemTime(T + 60_000);
    report(GsxServiceId.OperateStairs, 'performing', 'approaching');
    vi.setSystemTime(T + 61_000);
    report(GsxServiceId.OperateStairs, 'performing', 'approaching');

    const stairs = service(GsxServiceId.OperateStairs);
    expect(gsxStuck(stairs, T + 60_000 + GSX_STUCK_MS - 1)).toBe(false);
    expect(gsxStuck(stairs, T + 60_000 + GSX_STUCK_MS)).toBe(true);
  });

  it('is never stuck when docked, not performing, or for another service', () => {
    report(GsxServiceId.OperateJetways, 'completed', 'docked');
    expect(gsxStuck(service(GsxServiceId.OperateJetways), T + 10 * GSX_STUCK_MS)).toBe(false);
    report(GsxServiceId.Gpu, 'performing');
    expect(gsxStuck(service(GsxServiceId.Gpu), T + 10 * GSX_STUCK_MS)).toBe(false);
    expect(gsxStuck(undefined, T)).toBe(false);
  });
});

describe('Forcing a stuck GSX jet bridge or stairs', () => {
  const client = gsxRemote as unknown as { handleMessage(data: string): void };
  const showMenu = (title: string, entries: string[]) =>
    client.handleMessage(JSON.stringify({ type: 'patch', path: '/menu', value: { title, entries } }));

  let trigger: ReturnType<typeof vi.spyOn>;
  let pick: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    trigger = vi.spyOn(gsxRemote, 'trigger').mockResolvedValue({ ok: true });
    pick = vi.spyOn(gsxRemote, 'pickMenu').mockResolvedValue({ ok: true });
  });
  afterEach(async () => {
    await vi.runAllTimersAsync();
    trigger.mockRestore();
    pick.mockRestore();
    vi.useRealTimers();
  });

  it('triggers the service, then picks "Complete now" by its text in the GSX "Service in progress" menu', async () => {
    const forced = gsxRemote.completeStuckService(GsxServiceId.OperateStairs);
    showMenu('Service in progress', ['Abort service', 'COMPLETE NOW', 'Back']);

    expect(await forced).toBe(true);
    expect(trigger).toHaveBeenCalledWith(GsxServiceId.OperateStairs);
    expect(pick).toHaveBeenCalledWith(1);
  });

  it('picks nothing when the GSX menu does not come in time', async () => {
    const forced = gsxRemote.completeStuckService(GsxServiceId.OperateJetways);
    await vi.advanceTimersByTimeAsync(FORCE_MENU_WAIT_MS);
    showMenu('Service in progress', ['Complete now', 'Abort service', 'Back']);

    expect(await forced).toBe(false);
    expect(pick).not.toHaveBeenCalled();
  });

  it('picks nothing in a menu without "Complete now", or in another GSX menu', async () => {
    const withoutEntry = gsxRemote.completeStuckService(GsxServiceId.OperateStairs);
    showMenu('Service in progress', ['Abort service', 'Back']);
    expect(await withoutEntry).toBe(false);

    const otherMenu = gsxRemote.completeStuckService(GsxServiceId.OperateStairs);
    showMenu('Select operator', ['Complete now', 'Back']);
    showMenu('Service in progress', ['Complete now', 'Back']);
    expect(await otherMenu).toBe(false);

    expect(pick).not.toHaveBeenCalled();
  });
});

describe('Trigger of a GSX jet bridge or stairs right after its move completed', () => {
  // the client as the WebSocket feeds it; the fake connection records what is sent
  const client = gsxRemote as unknown as {
    handleMessage(data: string): void;
    connect(): void;
    ws: FakeWebSocket | null;
    state: GsxRemoteState;
    phases: Map<string, unknown>;
  };
  const T = 2_000_000;
  const JETWAY = GsxServiceId.OperateJetways;

  class FakeWebSocket {
    public static readonly OPEN = 1;

    public readyState = FakeWebSocket.OPEN;

    public readonly sent: any[] = [];

    public onclose: (() => void) | null = null;

    public send(data: string) {
      this.sent.push(JSON.parse(data));
    }

    public close() {}
  }

  const report = (state: string, phase?: string) =>
    client.handleMessage(
      JSON.stringify({
        type: 'patch',
        path: '/services',
        value: [
          { id: JETWAY, displayName: 'Jetway', state, canTrigger: false, ...(phase ? { detail: { phase } } : {}) },
        ],
      }),
    );
  const jetway = () => client.state.services.find((s) => s.id === JETWAY);
  const answerLastCommand = (socket: FakeWebSocket, ok: boolean) =>
    client.handleMessage(JSON.stringify({ type: 'result', id: socket.sent[socket.sent.length - 1].id, ok }));

  let socket: FakeWebSocket;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T);
    vi.stubGlobal('WebSocket', FakeWebSocket);
    client.connect();
    socket = client.ws!;
    // the flyPad saw the service move: the first report of a service is no completion
    report('performing', 'docking');
  });
  afterEach(() => {
    client.ws = null;
    client.phases.clear();
    report('available');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('holds the trigger until GSX_TRIGGER_HOLD_MS after the completion, then sends it and resolves with the answer', async () => {
    report('completed', 'docked');
    await vi.advanceTimersByTimeAsync(3_000);

    let result: { ok: boolean; error?: string } | undefined;
    gsxRemote.trigger(JETWAY).then((r) => {
      result = r;
    });
    await vi.advanceTimersByTimeAsync(GSX_TRIGGER_HOLD_MS - 3_000 - 1);
    expect(socket.sent).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toMatchObject({ verb: 'service.trigger', args: { service: JETWAY } });
    expect(result).toBeUndefined();
    answerLastCommand(socket, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual({ ok: true, error: undefined });
  });

  it('sends one command only when the service is triggered again during the wait', async () => {
    report('completed', 'docked');

    const first = gsxRemote.trigger(JETWAY);
    const second = gsxRemote.trigger(JETWAY);
    await vi.advanceTimersByTimeAsync(GSX_TRIGGER_HOLD_MS);

    expect(second).toBe(first);
    expect(socket.sent).toHaveLength(1);
  });

  it('tells the listeners when a held trigger starts and ends', async () => {
    report('completed', 'docked');
    const unsubscribe = gsxRemote.subscribe(() => {});
    const heard: (string[] | undefined)[] = [];
    const stopListening = gsxRemote.subscribe((state) => heard.push(state.heldTriggers));
    heard.length = 0;

    gsxRemote.trigger(JETWAY);
    await vi.advanceTimersByTimeAsync(GSX_TRIGGER_HOLD_MS);
    stopListening();
    unsubscribe();

    expect(heard).toEqual([[JETWAY], []]);
  });

  it('sends at once without a completion stamp, and once the hold has passed', async () => {
    // the flyPad connected after the completion: its first report of the service is already completed
    client.phases.clear();
    report('completed', 'docked');
    expect(jetway()?.completedAt).toBeUndefined();
    gsxRemote.trigger(JETWAY);
    expect(socket.sent).toHaveLength(1);

    report('performing', 'undocking');
    report('completed', 'undocked');
    await vi.advanceTimersByTimeAsync(GSX_TRIGGER_HOLD_MS);
    gsxRemote.trigger(JETWAY);
    expect(socket.sent).toHaveLength(2);
  });

  it('keeps the completion time through later reports of the completed state, and drops it when the service moves again', () => {
    report('completed', 'docked');
    expect(jetway()?.completedAt).toBe(T);

    vi.setSystemTime(T + 5_000);
    report('completed', 'docked');
    expect(jetway()?.completedAt).toBe(T);

    report('performing', 'undocking');
    expect(jetway()?.completedAt).toBeUndefined();
  });

  it('starts no new hold when the reset of GSX shows the docked service available for a moment', () => {
    report('completed', 'docked');
    vi.setSystemTime(T + 10_000);
    report('available');
    vi.setSystemTime(T + 11_000);
    report('completed', 'docked');

    expect(jetway()?.completedAt).toBeUndefined();
    expect(gsxTriggerHoldMs(jetway(), T + 11_000)).toBe(0);
  });

  it('gives the remaining wait of a jet bridge or stairs, none for other services or states', () => {
    report('completed', 'docked');

    expect(gsxTriggerHoldMs(jetway(), T)).toBe(GSX_TRIGGER_HOLD_MS);
    expect(gsxTriggerHoldMs(jetway(), T + 4_000)).toBe(GSX_TRIGGER_HOLD_MS - 4_000);
    expect(gsxTriggerHoldMs(jetway(), T + GSX_TRIGGER_HOLD_MS)).toBe(0);
    expect(gsxTriggerHoldMs(undefined, T)).toBe(0);
    expect(gsxTriggerHoldMs({ ...jetway()!, id: GsxServiceId.Catering }, T)).toBe(0);
    expect(gsxTriggerHoldMs({ ...jetway()!, state: 'performing' }, T)).toBe(0);
  });

  it('sends nothing and answers not_connected when the connection is lost during the wait', async () => {
    report('completed', 'docked');
    let result: { ok: boolean; error?: string } | undefined;
    gsxRemote.trigger(JETWAY).then((r) => {
      result = r;
    });

    socket.readyState = 3;
    socket.onclose?.();
    // a new connection opens before the hold would have ended
    client.connect();
    const newSocket = client.ws!;
    await vi.advanceTimersByTimeAsync(GSX_TRIGGER_HOLD_MS);

    expect(result).toEqual({ ok: false, error: 'not_connected' });
    expect(newSocket.sent).toHaveLength(0);
    expect(socket.sent).toHaveLength(0);
  });
});
