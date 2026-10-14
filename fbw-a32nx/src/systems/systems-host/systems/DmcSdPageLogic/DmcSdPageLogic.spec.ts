// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@microsoft/msfs-sdk';
import { Arinc429SignStatusMatrix, Arinc429Word } from '@flybywiresim/fbw-sdk';
import { DmcSdPageLogic } from './DmcSdPageLogic';
import { SdPages } from '../../../shared/src/SdPages';

/** The sim variables read by the test (plain and registered reads) */
const simVars = new Map<string, number>();

/** The ECP words of a failed ECAM control panel: Ecp.ts writes them as 0 with the FAILURE WARNING SSM */
const FAILED_ECP_WORD = Arinc429Word.getRawWord(0, Arinc429SignStatusMatrix.FailureWarning);

/** The page selected on the SD, as the DMC writes it */
const selectedPage = () => simVars.get('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX') ?? SdPages.NONE;

/*
 * A320 FCOM DSC-31-30 (a320_fcom.txt l.46834-46836): "If the ECAM control panel fails, the CLR, RCL, STS, EMER CANC,
 * and ALL pushbuttons remain operative, because their contacts are directly wired to the flight warning and display
 * management computers." The DMC reads ALL, STS and CLR from the hardwired discretes as well as from the ECP words.
 */
describe('DMC SD page selection with the ECAM control panel failed', () => {
  let bus: EventBus;
  let dmc: DmcSdPageLogic;

  /** Sets one hardwired discrete of the ECP (L:A32NX_ECP_DISCRETE_OUT_*), as A32NXEcpBusPublisher publishes it */
  const setDiscrete = (key: 'all' | 'sts' | 'clr', pressed: boolean) =>
    bus.getPublisher<any>().pub(`a32nx_ecp_discrete_out_${key}`, pressed, false, true);

  beforeEach(() => {
    simVars.clear();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number) => {
      simVars.set(name, value);
      return Promise.resolve();
    });
    const registeredNames: string[] = [];
    (SimVar as any).GetRegisteredId = (name: string) => {
      if (!registeredNames.includes(name)) {
        registeredNames.push(name);
      }
      return registeredNames.indexOf(name);
    };
    (SimVar as any).GetSimVarValueFastReg = (id: number) => simVars.get(registeredNames[id]) ?? 0;
    // RegisteredSimVar writes go through Coherent.call('setValueReg_Number', id, value)
    vi.spyOn(Coherent, 'call').mockImplementation(((name: string, id: number, value: number) => {
      if (name === 'setValueReg_Number') {
        simVars.set(registeredNames[id], value);
      }
      return Promise.resolve();
    }) as any);

    // no failure page requested by the FWC (0 would be the ENG page)
    simVars.set('L:A32NX_ECAM_SFAIL', SdPages.NONE);

    bus = new EventBus();
    dmc = new DmcSdPageLogic(bus);
    dmc.init();
    const publisher = bus.getPublisher<any>();
    publisher.pub('a32nx_ecp_system_switch_word', FAILED_ECP_WORD, false, true);
    publisher.pub('a32nx_ecp_warning_switch_word', FAILED_ECP_WORD, false, true);
    dmc.update(50);
  });

  /* l.46788-46793: the ALL pb pages through the system pages; released, the page shown stays selected */
  it('pages through the system pages with the ALL pb', () => {
    // a short push: the first system page, at the release
    setDiscrete('all', true);
    dmc.update(50);
    setDiscrete('all', false);
    dmc.update(50);
    expect(selectedPage()).toBe(SdPages.ENG);
    // held: the next page every 3 s (3.5 s here)
    setDiscrete('all', true);
    for (let i = 0; i < 70; i++) {
      dmc.update(50);
    }
    expect(selectedPage()).toBe(SdPages.BLEED);
    // released after the hold: that page stays selected
    setDiscrete('all', false);
    dmc.update(50);
    dmc.update(5_000);
    expect(selectedPage()).toBe(SdPages.BLEED);
  });

  /* l.46768-46773: STS displays the STATUS page, CLR clears it */
  it('displays the STATUS page with the STS pb and clears it with the CLR pb', () => {
    setDiscrete('sts', true);
    dmc.update(50);
    setDiscrete('sts', false);
    dmc.update(50);
    expect(selectedPage()).toBe(SdPages.STS);

    setDiscrete('clr', true);
    dmc.update(50);
    setDiscrete('clr', false);
    dmc.update(50);
    expect(selectedPage()).toBe(SdPages.NONE);
  });

  it('selects no page without a push (the failed ECP words alone press nothing)', () => {
    dmc.update(5_000);
    expect(selectedPage()).toBe(SdPages.NONE);
  });
});
