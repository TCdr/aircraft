// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380FailureDefinitions } from '@failures';
import {
  ALL_DISPLAY_UNITS,
  DisplayUnitFailure,
  DisplayUnitID,
  displayUnitFailedVar,
  isDisplayUnitFaultTriggered,
  isDisplayUnitPowered,
} from './CdsDisplayUnits';
import { DcElectricalBus } from './electrical';

/** The FCOM name of each DU (A380 FCOM DSC-31-15-10, a380_fcom.txt:62972-62980) */
const FCOM_NAME: Record<DisplayUnitID, string> = {
  [DisplayUnitID.CaptPfd]: 'CAPT PFD',
  [DisplayUnitID.CaptNd]: 'CAPT ND',
  [DisplayUnitID.CaptMfd]: 'CAPT MFD',
  [DisplayUnitID.Ewd]: 'EWD',
  [DisplayUnitID.Sd]: 'SD',
  [DisplayUnitID.FoMfd]: 'F/O MFD',
  [DisplayUnitID.FoNd]: 'F/O ND',
  [DisplayUnitID.FoPfd]: 'F/O PFD',
};

describe('CDS display units (A380 FCOM DSC-31-15)', () => {
  it('lists the 8 DUs of the FCOM, each once', () => {
    expect(ALL_DISPLAY_UNITS.map((du) => FCOM_NAME[du])).toEqual([
      'CAPT PFD',
      'CAPT ND',
      'CAPT MFD',
      'EWD',
      'SD',
      'F/O MFD',
      'F/O ND',
      'F/O PFD',
    ]);
  });

  it('gives each DU its own ATA 31 flyPad failure (31000-31007), named after the DU', () => {
    const ids = ALL_DISPLAY_UNITS.map((du) => DisplayUnitFailure[du]);
    expect(ids).toEqual([31000, 31001, 31002, 31003, 31004, 31005, 31006, 31007]);
    for (const du of ALL_DISPLAY_UNITS) {
      const definition = A380FailureDefinitions.find(([, id]) => id === DisplayUnitFailure[du]);
      expect(definition, FCOM_NAME[du]).toEqual([31, DisplayUnitFailure[du], `${FCOM_NAME[du]} display unit`]);
    }
  });

  it('publishes the failed state of each DU in its own L:var, the ND ones read by the ndwxr gauge', () => {
    expect(ALL_DISPLAY_UNITS.map(displayUnitFailedVar)).toEqual([
      'L:A380X_CDS_CAPT_PFD_DU_FAILED',
      'L:A380X_CDS_CAPT_ND_DU_FAILED',
      'L:A380X_CDS_CAPT_MFD_DU_FAILED',
      'L:A380X_CDS_EWD_DU_FAILED',
      'L:A380X_CDS_SD_DU_FAILED',
      'L:A380X_CDS_FO_MFD_DU_FAILED',
      'L:A380X_CDS_FO_ND_DU_FAILED',
      'L:A380X_CDS_FO_PFD_DU_FAILED',
    ]);
    const ndwxrGauge = readFileSync(
      resolve(__dirname, '../../../../../fbw-common/src/wasm/ndwxr/src/gauge.cpp'),
      'utf-8',
    );
    for (const du of [DisplayUnitID.CaptNd, DisplayUnitID.FoNd]) {
      expect(ndwxrGauge).toContain(`"${displayUnitFailedVar(du).substring(2)}"`);
    }
  });

  it('powers each DU from its FCOM supply, either busbar being enough (DSC-31-15-95, a380_fcom.txt:63286-63297)', () => {
    const only =
      (...powered: DcElectricalBus[]) =>
      (bus: DcElectricalBus) =>
        powered.includes(bus);
    const poweredDus = (isBusPowered: (bus: DcElectricalBus) => boolean) =>
      ALL_DISPLAY_UNITS.filter((du) => isDisplayUnitPowered(du, isBusPowered)).map((du) => FCOM_NAME[du]);

    expect(poweredDus(only(DcElectricalBus.DcEss, DcElectricalBus.DcEssInFlight))).toEqual([
      'CAPT PFD',
      'CAPT ND',
      'CAPT MFD',
      'EWD',
    ]);
    expect(poweredDus(only(DcElectricalBus.Dc1))).toEqual(['CAPT ND', 'CAPT MFD', 'F/O MFD', 'F/O ND']);
    expect(poweredDus(only(DcElectricalBus.Dc2))).toEqual(['SD', 'F/O MFD', 'F/O ND', 'F/O PFD']);
    expect(poweredDus(only())).toEqual([]);
  });

  it('triggers CDS ... DU FAULT for a failed DU that is powered (PRO-ABN-ECAM-10-31, a380_fcom.txt:157893)', () => {
    expect(isDisplayUnitFaultTriggered(true, true)).toBe(true);
    expect(isDisplayUnitFaultTriggered(true, false)).toBe(false);
    expect(isDisplayUnitFaultTriggered(false, true)).toBe(false);
    expect(isDisplayUnitFaultTriggered(false, false)).toBe(false);
  });
});
