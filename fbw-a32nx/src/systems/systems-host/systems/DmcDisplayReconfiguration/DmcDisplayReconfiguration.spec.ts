// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus, HEvent } from '@microsoft/msfs-sdk';
import { Arinc429OutputWord, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { DmcDisplayReconfiguration } from './DmcDisplayReconfiguration';
import {
  DisplayPicture,
  displayUnitPictureVar,
  ECAM_ND_XFR_KNOB_VAR,
  EcamNdXfrKnob,
  pfdNdXfrPushedEvent,
  pfdNdXfrVar,
  pictureOnOtherDuVar,
} from '../../../shared/src/DisplayReconfiguration';

/** The sim variables of a test (the SDK modules install the sim's SimVar functions, mocked here) */
const simVars = new Map<string, number>();

/** A raw ECP switch word with the given keys pressed */
function ecpWord(...pressedBits: number[]): number {
  const word = new Arinc429OutputWord();
  for (const bit of pressedBits) {
    word.setBitValue(bit, true);
  }
  word.setSsm(Arinc429SignStatusMatrix.NormalOperation);
  return word.getRawBusValue();
}

describe('DMC DU reconfiguration (A320 FCOM DSC-31-05-60)', () => {
  const activeFailures = new Set<number>();
  let bus: EventBus;
  let dmc: DmcDisplayReconfiguration;

  const picture = (du: Parameters<typeof displayUnitPictureVar>[0]) => simVars.get(displayUnitPictureVar(du));

  const onOtherDu = (eisPicture: Parameters<typeof pictureOnOtherDuVar>[0]) =>
    simVars.get(pictureOnOtherDuVar(eisPicture));

  beforeEach(() => {
    simVars.clear();
    activeFailures.clear();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number) => {
      simVars.set(name, value);
      return Promise.resolve();
    });

    // powered, all brightness knobs on, ECAM/ND XFR at NORM
    simVars.set('L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED', 1);
    simVars.set('L:A32NX_ELEC_AC_2_BUS_IS_POWERED', 1);
    for (const potentiometer of [88, 89, 90, 91, 92, 93]) {
      simVars.set(`LIGHT POTENTIOMETER:${potentiometer}`, 0.8);
    }
    simVars.set(ECAM_ND_XFR_KNOB_VAR, EcamNdXfrKnob.Norm);

    bus = new EventBus();
    dmc = new DmcDisplayReconfiguration(bus, {
      update: () => {},
      isActive: (failure) => activeFailures.has(failure),
    });
    dmc.init();
  });

  it('writes 0 (own picture) for every DU in the normal configuration', () => {
    dmc.update(20);
    for (const du of ['PFD_L', 'ND_L', 'UPPER_ECAM', 'LOWER_ECAM', 'ND_R', 'PFD_R'] as const) {
      expect(picture(du)).toBe(DisplayPicture.Own);
    }
    for (const eisPicture of ['PFD_L', 'ND_L', 'EWD', 'SD', 'ND_R', 'PFD_R'] as const) {
      expect(onOtherDu(eisPicture)).toBe(0);
    }
  });

  it('puts the E/WD on the lower ECAM DU when the upper ECAM DU fails', () => {
    activeFailures.add(A320Failure.UpperEcamDisplay);
    dmc.update(20);
    expect(picture('LOWER_ECAM')).toBe(DisplayPicture.EngineWarning);
    // the failed DU glass is blank, and the E/WD gauge keeps drawing for the lower DU
    expect(picture('UPPER_ECAM')).toBe(DisplayPicture.Blank);
    expect(onOtherDu('EWD')).toBe(1);
  });

  it('puts the PFD on the ND DU when the PFD brightness knob is turned OFF', () => {
    simVars.set('LIGHT POTENTIOMETER:90', 0);
    dmc.update(20);
    expect(picture('ND_R')).toBe(DisplayPicture.Pfd);
    expect(picture('PFD_R')).toBe(DisplayPicture.Blank);
    expect(picture('ND_L')).toBe(DisplayPicture.Own);
    expect(onOtherDu('PFD_R')).toBe(1);
    expect(onOtherDu('ND_R')).toBe(0);
  });

  it('cross-changes the PFD and ND images at each PFD/ND XFR push', () => {
    dmc.update(20);
    bus.getPublisher<HEvent>().pub('hEvent', pfdNdXfrPushedEvent('L'));
    dmc.update(20);
    expect(simVars.get(pfdNdXfrVar('L'))).toBe(1);
    expect(picture('PFD_L')).toBe(DisplayPicture.Nd);
    expect(picture('ND_L')).toBe(DisplayPicture.Pfd);

    bus.getPublisher<HEvent>().pub('hEvent', pfdNdXfrPushedEvent('L'));
    dmc.update(20);
    expect(simVars.get(pfdNdXfrVar('L'))).toBe(0);
    expect(picture('PFD_L')).toBe(DisplayPicture.Own);
  });

  it('keeps the PFD on an available DU when the swapped PFD DU then fails', () => {
    dmc.update(20);
    bus.getPublisher<HEvent>().pub('hEvent', pfdNdXfrPushedEvent('L'));
    dmc.update(20);
    activeFailures.add(A320Failure.LeftPfdDisplay);
    dmc.update(20);
    expect(picture('ND_L')).toBe(DisplayPicture.Pfd);
    expect(picture('PFD_L')).toBe(DisplayPicture.Blank);
  });

  it('moves the SD to the selected ND with ECAM/ND XFR', () => {
    simVars.set(ECAM_ND_XFR_KNOB_VAR, EcamNdXfrKnob.Fo);
    dmc.update(20);
    expect(picture('ND_R')).toBe(DisplayPicture.System);
    expect(picture('LOWER_ECAM')).toBe(DisplayPicture.EcamOnNd);
    expect(onOtherDu('SD')).toBe(1);
  });

  it('shows the SD on the lower DU while a system page pb is held, for 3 min at most', () => {
    activeFailures.add(A320Failure.UpperEcamDisplay);
    // ENG page key held: the SD comes after the 0.5 s hold confirmation
    simVars.set('L:A32NX_ECP_SYSTEM_SWITCH_WORD', ecpWord(11));
    dmc.update(20);
    expect(picture('LOWER_ECAM')).toBe(DisplayPicture.EngineWarning);
    dmc.update(600);
    expect(picture('LOWER_ECAM')).toBe(DisplayPicture.Own);
    dmc.update(181_000);
    expect(picture('LOWER_ECAM')).toBe(DisplayPicture.EngineWarning);
    // released: the next push displays the SD again
    simVars.set('L:A32NX_ECP_SYSTEM_SWITCH_WORD', ecpWord());
    dmc.update(20);
    simVars.set('L:A32NX_ECP_WARNING_SWITCH_WORD', ecpWord(13));
    dmc.update(20);
    dmc.update(600);
    expect(picture('LOWER_ECAM')).toBe(DisplayPicture.Own);
  });

  it('does not show the SD for a click that only selects or deselects a page', () => {
    activeFailures.add(A320Failure.UpperEcamDisplay);
    simVars.set('L:A32NX_ECP_SYSTEM_SWITCH_WORD', ecpWord(11));
    dmc.update(20);
    dmc.update(200);
    expect(picture('LOWER_ECAM')).toBe(DisplayPicture.EngineWarning);
    simVars.set('L:A32NX_ECP_SYSTEM_SWITCH_WORD', ecpWord());
    dmc.update(20);
    expect(picture('LOWER_ECAM')).toBe(DisplayPicture.EngineWarning);
  });

  it('has the SD gauge draw from the push on, before its picture appears on the upper DU (lower DU lost)', () => {
    activeFailures.add(A320Failure.LowerEcamDisplay);
    dmc.update(20);
    expect(onOtherDu('SD')).toBe(0);
    simVars.set('L:A32NX_ECP_SYSTEM_SWITCH_WORD', ecpWord(11));
    dmc.update(20);
    expect(picture('UPPER_ECAM')).toBe(DisplayPicture.Own);
    expect(onOtherDu('SD')).toBe(1);
    dmc.update(600);
    expect(picture('UPPER_ECAM')).toBe(DisplayPicture.System);
    expect(onOtherDu('SD')).toBe(1);
    simVars.set('L:A32NX_ECP_SYSTEM_SWITCH_WORD', ecpWord());
    dmc.update(20);
    expect(picture('UPPER_ECAM')).toBe(DisplayPicture.Own);
    expect(onOtherDu('SD')).toBe(0);
  });
});
