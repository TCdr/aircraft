// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { GsxRemoteState, GsxService, GsxServiceId, GsxServiceLook, gsxServiceLook } from './GsxRemote';
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
function runHook(): ReturnType<typeof useGsxServiceLink<Button>> {
  let result: ReturnType<typeof useGsxServiceLink<Button>> | undefined;
  const Probe = () => {
    result = useGsxServiceLink(LINKS, false);
    return null;
  };
  renderToStaticMarkup(<Probe />);
  return result!;
}

const gsxState = (connected: boolean, services: GsxService[]): GsxRemoteState =>
  ({ connected, gsxRunning: connected, services }) as unknown as GsxRemoteState;

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
});
