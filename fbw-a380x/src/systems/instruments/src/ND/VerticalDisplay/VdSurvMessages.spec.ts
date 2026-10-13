// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { VdSurvMessageInputs, computeVdSurvMessages } from './VdSurvMessages';

/** Normal operation: TERR SYS on, TAWS and WXR fine, WX pb selected, WXR and WX ON VD buttons on */
const inputs = (i: Partial<VdSurvMessageInputs>): VdSurvMessageInputs => ({
  terrSysOff: false,
  terrFailed: false,
  wxPbSelected: true,
  wxrFailed: false,
  wxOnVdOff: false,
  wxrOff: false,
  ...i,
});

const none = { noTerrAndWxDataAvailable: false, terrInop: false, wxrInop: false, wxNotSel: false };

/* A380 FCOM DSC-31-20-40-30 SURV MESSAGES (a380_fcom.txt l.69819-69845) and DSC-34-20-30-20 (l.90208-90217) */
describe('VD SURV messages', () => {
  it('no message in normal operation', () => {
    expect(computeVdSurvMessages(inputs({}))).toEqual(none);
  });

  it('TERR SYS OFF: NO TERR AND WX DATA AVAILABLE, whatever the weather selection', () => {
    expect(computeVdSurvMessages(inputs({ terrSysOff: true }))).toEqual({ ...none, noTerrAndWxDataAvailable: true });
    expect(computeVdSurvMessages(inputs({ terrSysOff: true, wxPbSelected: false }))).toEqual({
      ...none,
      noTerrAndWxDataAvailable: true,
    });
  });

  it('WX ON VD OFF with the WX pb selected: WX NOT SEL', () => {
    expect(computeVdSurvMessages(inputs({ wxOnVdOff: true }))).toEqual({ ...none, wxNotSel: true });
  });

  it('WXR button OFF (it sets WX ON VD to OFF): WX NOT SEL', () => {
    expect(computeVdSurvMessages(inputs({ wxrOff: true }))).toEqual({ ...none, wxNotSel: true });
  });

  it('WX pb not selected: no weather message', () => {
    expect(computeVdSurvMessages(inputs({ wxPbSelected: false, wxOnVdOff: true }))).toEqual(none);
    expect(computeVdSurvMessages(inputs({ wxPbSelected: false, wxrFailed: true }))).toEqual(none);
  });

  it('failed WXR with the WX pb selected: WXR INOP, which replaces WX NOT SEL', () => {
    expect(computeVdSurvMessages(inputs({ wxrFailed: true }))).toEqual({ ...none, wxrInop: true });
    expect(computeVdSurvMessages(inputs({ wxrFailed: true, wxOnVdOff: true }))).toEqual({ ...none, wxrInop: true });
  });

  it('failed or deselected TAWS: TERR INOP', () => {
    expect(computeVdSurvMessages(inputs({ terrFailed: true }))).toEqual({ ...none, terrInop: true });
  });
});
