// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, HEvent } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { DisplayUnitID, displayUnitDisplayVar } from '@shared/CdsDisplayUnits';
import { CdsDisplay } from '@shared/CdsReconfiguration';
import { CdsReconfiguration, DU_RECONF_PB_EVENT, PFD_ND_PB_EVENT } from './CdsReconfiguration';

/** The cockpit behaviour that sends the pb H: events */
const COCKPIT_BEHAVIOUR = join(
  __dirname,
  '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire',
  'Part_Interior_Cockpit/model/A380_Cockpit_Behavior.xml',
);

/** The sim variables of a test: DU supplies and brightness knobs on unless set */
const simVars = new Map<string, number | boolean>();

describe('CDS reconfiguration in the systems host (A380 FCOM DSC-31-15-20)', () => {
  const activeFailures = new Set<number>();
  let bus: EventBus;
  let host: CdsReconfiguration;
  let now = 0;

  /** One update of the systems host, a second after the previous one */
  const update = () => {
    now += 1000;
    host.onUpdate();
  };

  /** An H: event from the cockpit, then the next frame of the systems host (a few ms later) */
  const press = (event: string) => {
    bus.getPublisher<HEvent>().pub('hEvent', event);
    now += 10;
    host.onUpdate();
  };

  const captPfdDuDisplay = () => simVars.get(displayUnitDisplayVar(DisplayUnitID.CaptPfd));

  beforeEach(() => {
    simVars.clear();
    activeFailures.clear();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => {
      if (name.startsWith('L:A32NX_ELEC_') || name.startsWith('LIGHT POTENTIOMETER:')) {
        return simVars.get(name) ?? 1;
      }
      return simVars.get(name) ?? 0;
    });
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number | boolean) => {
      simVars.set(name, value);
      return Promise.resolve();
    });
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    bus = new EventBus();
    host = new CdsReconfiguration(bus, {
      isActive: (failure: number) => activeFailures.has(failure),
    } as unknown as FailuresConsumer);
    host.init();
    update();
  });

  it('listens to the H: events the cockpit pbs send', () => {
    const xml = readFileSync(COCKPIT_BEHAVIOUR, 'utf-8');
    const eventOf = (node: string) =>
      new RegExp(`<NODE_ID>${node}</NODE_ID>[\\s\\S]*?<EVENT>([A-Z0-9_]+)</EVENT>`).exec(xml)?.[1];
    expect(eventOf('PUSH_EFIS_CS_PFD')).toBe(PFD_ND_PB_EVENT.CAPT);
    expect(eventOf('PUSH_EFIS_FO_PFD')).toBe(PFD_ND_PB_EVENT.FO);
    expect(eventOf('PUSH_EFIS_CS_RECONF')).toBe(DU_RECONF_PB_EVENT.CAPT);
    expect(eventOf('PUSH_EFIS_FO_RECONF')).toBe(DU_RECONF_PB_EVENT.FO);
  });

  it('cycles the CAPT PFD DU through the ND and the PFD with the CAPT DU RECONF pb (CAPT ND and MFD DUs failed)', () => {
    press(DU_RECONF_PB_EVENT.CAPT);
    expect(captPfdDuDisplay()).toBe(0);

    activeFailures.add(A380Failure.CaptNdDisplayUnit);
    activeFailures.add(A380Failure.CaptMfdDisplayUnit);
    update();
    press(DU_RECONF_PB_EVENT.CAPT);
    expect(captPfdDuDisplay()).toBe(CdsDisplay.Nd);
    press(DU_RECONF_PB_EVENT.CAPT);
    expect(captPfdDuDisplay()).toBe(0);
  });

  it('acts on the DU states of the moment of the press, also a DU that failed since the last periodic update', () => {
    activeFailures.add(A380Failure.CaptNdDisplayUnit);
    activeFailures.add(A380Failure.CaptMfdDisplayUnit);
    // no periodic update since the failures: the press comes in the same frame
    press(DU_RECONF_PB_EVENT.CAPT);
    expect(captPfdDuDisplay()).toBe(CdsDisplay.Nd);
  });
});
