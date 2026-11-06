// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GsxRemoteState, GsxService, GsxServiceId, GsxServiceLook, gsxRemote, gsxServiceLook } from './GsxRemote';
import { GSX_REACTION_TIMEOUT_MS, RELEASE_PENDING_TIMEOUT_MS, releasePendingMemory } from './releasePending';
import { SERVICE_LOOKS, ServiceLook } from './ServicesLayout';
import { GsxButtonLinks, useGsxServiceLink } from './useGsxServiceLink';

// The hook's sim and flyPad dependencies (vi.mock is hoisted above the imports)
const fake = vi.hoisted(() => ({ linkSetting: 1, gsx: undefined as unknown }));
vi.mock('@flybywiresim/fbw-sdk-react', () => ({
  usePersistentNumberProperty: (key: string) => [key === 'GSX_SERVICES_LINK' ? fake.linkSetting : 0, () => {}],
  useSimVar: () => [0, () => {}],
  SeatFlags: class {},
}));
vi.mock('./GsxRemote', async (importActual) => {
  const actual = await importActual<typeof import('./GsxRemote')>();
  return { ...actual, useGsxRemote: () => fake.gsx };
});
vi.mock('../../../Store/store', () => ({ useAppSelector: () => undefined }));
vi.mock('../../../Localization/translation', () => ({ t: (key: string) => key.split('.').pop() }));

/** The buttons of a Services page, as in the aircraft pages */
enum Button {
  CabinDoor,
  JetBridge,
  Stairs,
  FuelTruck,
  Gpu,
  CateringTruck,
  BaggageTruck,
}

const LINKS: GsxButtonLinks<Button> = {
  serviceOf: {
    [Button.JetBridge]: GsxServiceId.OperateJetways,
    [Button.Stairs]: GsxServiceId.OperateStairs,
    [Button.FuelTruck]: GsxServiceId.Refueling,
    [Button.Gpu]: GsxServiceId.Gpu,
    [Button.CateringTruck]: GsxServiceId.Catering,
  },
  releaseRowOf: { [Button.JetBridge]: 'jetBridge', [Button.Stairs]: 'stairs', [Button.Gpu]: 'gpu' },
  connectable: [Button.JetBridge, Button.Stairs, Button.Gpu],
  baggage: Button.BaggageTruck,
  gpu: Button.Gpu,
};

/** The page's button states (ServiceButtonState of the aircraft pages): SERVICE_LOOKS[state] is their look */
const HIDDEN = 0;
const DISABLED = 1;
const INACTIVE = 2;
const LOOK_STATES: Record<GsxServiceLook, number> = { disabled: 1, inactive: 2, called: 3, active: 4, released: 5 };

/** The shownState of the aircraft pages before the GSX link moved into useGsxServiceLink, as the reference */
function shownStateBefore(gsxReady: boolean, services: GsxService[], button: Button, state: number): number {
  if (!gsxReady) {
    return state;
  }
  if (button === Button.BaggageTruck) {
    return HIDDEN;
  }
  const gsxService = LINKS.serviceOf[button];
  if (gsxService === undefined) {
    return state;
  }
  const look = gsxServiceLook(services.find((s) => s.id === gsxService));
  const connectable = button === Button.JetBridge || button === Button.Stairs || button === Button.Gpu;
  if (connectable && (look === 'inactive' || look === 'disabled') && state >= INACTIVE) {
    return state;
  }
  return LOOK_STATES[look];
}

/** Runs the hook once (a static render) and gives back what it returned */
function runHook(refuelTargetKg: number | null = null): ReturnType<typeof useGsxServiceLink<Button>> {
  let result: ReturnType<typeof useGsxServiceLink<Button>> | undefined;
  const Probe = () => {
    result = useGsxServiceLink(LINKS, false, refuelTargetKg);
    return null;
  };
  renderToStaticMarkup(<Probe />);
  return result!;
}

const gsxState = (connected: boolean, services: GsxService[], menu: Partial<GsxRemoteState> = {}): GsxRemoteState =>
  ({ connected, gsxRunning: connected, services, ...menu }) as unknown as GsxRemoteState;

const SERVICE_STATES = [undefined, 'unavailable', 'bypassed', 'available', 'requested', 'performing', 'completing'];
const BUTTONS = [
  Button.CabinDoor,
  Button.JetBridge,
  Button.Stairs,
  Button.FuelTruck,
  Button.Gpu,
  Button.CateringTruck,
  Button.BaggageTruck,
];

describe('useGsxServiceLink', () => {
  it('shows every button as the Services pages did before (all buttons, button states and GSX states)', () => {
    for (const linked of [0, 1]) {
      for (const connected of [false, true]) {
        for (const serviceState of SERVICE_STATES) {
          const services = Object.values(LINKS.serviceOf).flatMap((id) =>
            serviceState === undefined ? [] : [{ id, displayName: id, state: serviceState } as GsxService],
          );
          fake.linkSetting = linked;
          fake.gsx = gsxState(connected, services);
          const link = runHook();

          for (const button of BUTTONS) {
            for (let state = 0; state < SERVICE_LOOKS.length; state++) {
              const expected: ServiceLook =
                SERVICE_LOOKS[shownStateBefore(linked === 1 && connected, services, button, state)];
              expect(
                link.shownLook(button, SERVICE_LOOKS[state]),
                `${linked} ${connected} ${serviceState} ${button} ${state}`,
              ).toBe(expected);
            }
          }
        }
      }
    }
  });

  it('gives no GSX status line and keeps the sim look while GSX is not linked', () => {
    fake.linkSetting = 0;
    fake.gsx = gsxState(true, [{ id: GsxServiceId.Gpu, displayName: 'GPU', state: 'performing' } as GsxService]);
    const link = runHook();

    expect(link.gsxStatus(Button.Gpu)).toEqual({ text: '', progress: null, requestable: true });
    expect(link.shownLook(Button.Gpu, SERVICE_LOOKS[DISABLED])).toBe('disabled');
    expect(link.requestService(Button.Gpu)).toBe(false);
  });

  it('hides the baggage truck while linked (GSX loads the baggage with the boarding)', () => {
    fake.linkSetting = 1;
    fake.gsx = gsxState(true, []);

    expect(runHook().shownLook(Button.BaggageTruck, 'inactive')).toBe('hidden');
  });

  it("shows the flyPad's refuelling progress while the flyPad refuel runs, GSX's own otherwise", () => {
    fake.linkSetting = 1;
    fake.gsx = gsxState(true, [
      {
        id: GsxServiceId.Refueling,
        displayName: 'Refuel',
        state: 'performing',
        stateText: 'Refueling',
        canTrigger: false,
        detail: { fuel: { current: 1000, target: 1010, unit: 'kg', startTotal: 40000, aircraftTotal: 41000 } },
        progressText: '99%',
      },
    ]);

    expect(runHook(50000).gsxStatus(Button.FuelTruck).text).toBe('Refueling 10%');
    expect(runHook().gsxStatus(Button.FuelTruck).text).toBe('Refueling 99%');
  });

  it('shows a docked GSX jetway connected with Release, though GSX reports it completed and the sim does not see it', () => {
    fake.linkSetting = 1;
    fake.gsx = gsxState(true, [
      {
        id: GsxServiceId.OperateJetways,
        displayName: 'Jetway',
        state: 'completed',
        canTrigger: false,
        detail: { phase: 'docked' },
      } as GsxService,
    ]);
    const link = runHook();

    expect(link.shownLook(Button.JetBridge, 'inactive')).toBe('active');
    expect(link.gsxStatus(Button.JetBridge).text).toBe('');
  });
});

describe('Release of a GSX-linked jet bridge, stairs or GPU', () => {
  const PRESS_TIME = 1_000_000;
  const docked = (id: GsxServiceId): GsxService =>
    ({ id, displayName: id, state: 'completed', canTrigger: false, detail: { phase: 'docked' } }) as GsxService;
  const undocking = (id: GsxServiceId): GsxService =>
    ({ id, displayName: id, state: 'performing', canTrigger: false, detail: { phase: 'undocking' } }) as GsxService;
  const gpuPerforming: GsxService = {
    id: GsxServiceId.Gpu,
    displayName: 'GPU',
    state: 'performing',
    canTrigger: true,
  } as GsxService;

  let trigger: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(PRESS_TIME);
    fake.linkSetting = 1;
    trigger = vi.spyOn(gsxRemote, 'trigger').mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    ['jetBridge', 'stairs', 'gpu'].forEach((row) => releasePendingMemory.cancel(row));
    trigger.mockRestore();
    vi.useRealTimers();
  });

  /** A Release press on a row, as the aircraft pages handle it */
  const pressChip = (button: Button) => {
    const link = runHook();
    link.rememberRelease(button, 'inactive');
    link.requestService(button);
  };

  it('offers Retry when GSX has not started moving the jet bridge some seconds after the Release press', () => {
    fake.gsx = gsxState(true, [docked(GsxServiceId.OperateJetways)]);
    pressChip(Button.JetBridge);
    expect(runHook().equipmentLook(Button.JetBridge, 'inactive')).toBe('released');

    vi.setSystemTime(PRESS_TIME + GSX_REACTION_TIMEOUT_MS + 1_000);
    const link = runHook();
    expect(link.equipmentLook(Button.JetBridge, 'inactive')).toBe('active');
    expect(link.equipmentGsxStatus(Button.JetBridge, 'inactive')).toMatchObject({
      text: 'NoReaction',
      releaseAction: 'Retry',
    });
  });

  it('sends the release to GSX again on the Retry press, and shows "Leaving" again', () => {
    fake.gsx = gsxState(true, [docked(GsxServiceId.OperateStairs)]);
    pressChip(Button.Stairs);
    vi.setSystemTime(PRESS_TIME + GSX_REACTION_TIMEOUT_MS + 1_000);

    pressChip(Button.Stairs);

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(trigger).toHaveBeenLastCalledWith(GsxServiceId.OperateStairs);
    expect(runHook().equipmentLook(Button.Stairs, 'inactive')).toBe('released');
  });

  it('shows "Leaving" until the jet bridge is gone once GSX has started moving it', () => {
    fake.gsx = gsxState(true, [docked(GsxServiceId.OperateJetways)]);
    pressChip(Button.JetBridge);

    fake.gsx = gsxState(true, [undocking(GsxServiceId.OperateJetways)]);
    vi.setSystemTime(PRESS_TIME + 40_000);
    const link = runHook();
    expect(link.equipmentLook(Button.JetBridge, 'inactive')).toBe('released');
    expect(link.equipmentGsxStatus(Button.JetBridge, 'inactive').releaseAction).toBeUndefined();
  });

  it('points to the GSX question while GSX asks to confirm the release, and gives no Retry until it is answered', () => {
    fake.gsx = gsxState(true, [docked(GsxServiceId.OperateStairs)]);
    pressChip(Button.Stairs);

    fake.gsx = gsxState(true, [docked(GsxServiceId.OperateStairs)], { menuShown: true });
    vi.setSystemTime(PRESS_TIME + 30_000);
    let link = runHook();
    expect(link.equipmentLook(Button.Stairs, 'inactive')).toBe('released');
    expect(link.equipmentGsxStatus(Button.Stairs, 'inactive')).toMatchObject({ text: 'AsksQuestion' });
    expect(link.equipmentGsxStatus(Button.Stairs, 'inactive').releaseAction).toBeUndefined();

    const answer = PRESS_TIME + 30_000;
    fake.gsx = gsxState(true, [docked(GsxServiceId.OperateStairs)], { menuShown: false, menuClosedAt: answer });
    vi.setSystemTime(answer + GSX_REACTION_TIMEOUT_MS - 1_000);
    link = runHook();
    expect(link.equipmentLook(Button.Stairs, 'inactive')).toBe('released');
    expect(link.equipmentGsxStatus(Button.Stairs, 'inactive').text).toBe('');

    vi.setSystemTime(answer + GSX_REACTION_TIMEOUT_MS + 1_000);
    expect(runHook().equipmentGsxStatus(Button.Stairs, 'inactive').releaseAction).toBe('Retry');
  });

  it('offers Force on a stuck stairs, which forces GSX instead of sending a release', () => {
    const force = vi.spyOn(gsxRemote, 'completeStuckService').mockResolvedValue(true);
    const stuck = { id: GsxServiceId.OperateStairs, displayName: 'Stairs', state: 'performing', canTrigger: false };
    fake.gsx = gsxState(true, [stuck as GsxService]);

    let link = runHook();
    expect(link.equipmentLook(Button.Stairs, 'inactive')).toBe('active');
    expect(link.equipmentGsxStatus(Button.Stairs, 'inactive').releaseAction).toBe('Force');

    pressChip(Button.Stairs);
    link = runHook();
    expect(force).toHaveBeenCalledWith(GsxServiceId.OperateStairs);
    expect(trigger).not.toHaveBeenCalled();
    expect(link.equipmentLook(Button.Stairs, 'inactive')).toBe('active');
    force.mockRestore();
  });

  it('offers Force when a released jet bridge gets stuck, instead of "Leaving"', () => {
    fake.gsx = gsxState(true, [docked(GsxServiceId.OperateJetways)]);
    pressChip(Button.JetBridge);

    fake.gsx = gsxState(true, [
      { id: GsxServiceId.OperateJetways, displayName: 'Jetway', state: 'performing', canTrigger: false } as GsxService,
    ]);
    const link = runHook();
    expect(link.equipmentLook(Button.JetBridge, 'inactive')).toBe('active');
    expect(link.equipmentGsxStatus(Button.JetBridge, 'inactive').releaseAction).toBe('Force');
  });

  it('keeps waiting the full timeout for the GPU, which GSX keeps performing while its crew unplugs it', () => {
    fake.gsx = gsxState(true, [gpuPerforming]);
    pressChip(Button.Gpu);

    vi.setSystemTime(PRESS_TIME + RELEASE_PENDING_TIMEOUT_MS - 1_000);
    const link = runHook();
    expect(link.equipmentLook(Button.Gpu, 'inactive')).toBe('released');
    expect(link.equipmentGsxStatus(Button.Gpu, 'inactive').releaseAction).toBeUndefined();
  });
});

describe('Request and Release of a GSX jet bridge held right after its move completed', () => {
  const PRESS_TIME = 1_000_000;
  const HELD_MS = 9_000;
  const jetway = (phase: string, extra: Partial<GsxService> = {}): GsxService =>
    ({
      id: GsxServiceId.OperateJetways,
      displayName: 'Jetway',
      state: 'completed',
      canTrigger: false,
      detail: { phase },
      completedAt: PRESS_TIME - 3_000,
      ...extra,
    }) as GsxService;

  let trigger: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(PRESS_TIME);
    fake.linkSetting = 1;
    trigger = vi.spyOn(gsxRemote, 'trigger').mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    releasePendingMemory.cancel('jetBridge');
    trigger.mockRestore();
    vi.useRealTimers();
  });

  const pressRelease = () => {
    const link = runHook();
    link.rememberRelease(Button.JetBridge, 'inactive');
    link.requestService(Button.JetBridge);
  };

  it('shows "Leaving" for a held Release and offers no Retry until GSX_REACTION_TIMEOUT_MS after the real send', () => {
    fake.gsx = gsxState(true, [jetway('docked')]);
    pressRelease();

    // the trigger is sent at PRESS_TIME + HELD_MS
    vi.setSystemTime(PRESS_TIME + GSX_REACTION_TIMEOUT_MS + 1_000);
    let link = runHook();
    expect(link.equipmentLook(Button.JetBridge, 'inactive')).toBe('released');
    expect(link.equipmentGsxStatus(Button.JetBridge, 'inactive').releaseAction).toBeUndefined();

    vi.setSystemTime(PRESS_TIME + HELD_MS + GSX_REACTION_TIMEOUT_MS + 1_000);
    link = runHook();
    expect(link.equipmentLook(Button.JetBridge, 'inactive')).toBe('active');
    expect(link.equipmentGsxStatus(Button.JetBridge, 'inactive')).toMatchObject({ releaseAction: 'Retry' });
  });

  it('shows the called look for a Request that waits, until GSX reports its own state', () => {
    fake.gsx = gsxState(true, [jetway('undocked')], { heldTriggers: [GsxServiceId.OperateJetways] });
    expect(runHook().shownLook(Button.JetBridge, 'inactive')).toBe('called');

    fake.gsx = gsxState(true, [jetway('undocking', { state: 'performing', completedAt: undefined })]);
    expect(runHook().shownLook(Button.JetBridge, 'inactive')).toBe('active');
  });

  it('shows the idle look when no trigger waits', () => {
    fake.gsx = gsxState(true, [jetway('undocked')]);
    expect(runHook().shownLook(Button.JetBridge, 'inactive')).toBe('inactive');
  });
});
