// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { IlsNavaid } from '@flybywiresim/fbw-sdk';
import type { MmrRadioTuningStatus } from '@fmgc/navigation/NavaidTuner';
import { GlsApproachData } from '@fmgc/navigation/gls/GlsApproachData';
import {
  applyManualGls,
  applyRmpGls,
  applySelectedLandingSystem,
  canEnterLsCourse,
  leaveGlsMode,
  SelectedLandingSystem,
} from './LandingSystemTuning';

function idleMmr(): MmrRadioTuningStatus {
  return {
    databaseCourse: null,
    databaseBackcourse: false,
    frequency: null,
    course: null,
    courseManual: false,
    ident: null,
    manual: false,
    backcourse: false,
    slope: null,
  };
}

const ILS = { databaseId: 'ILS-IFRA', ident: 'IFRA', frequency: 110.3, locBearing: 246 } as unknown as IlsNavaid;

const GLS: GlsApproachData = {
  channel: 31434,
  rpi: 'G25P',
  course: 246,
  slope: -3,
  definition: null,
};

const OTHER_GLS: GlsApproachData = { ...GLS, channel: 28968, rpi: 'G25M', slope: -3.2 };

const NOTHING_SELECTED: SelectedLandingSystem = {
  facility: undefined,
  course: null,
  backcourse: false,
  slope: null,
  gls: null,
};

function selectedIls(): SelectedLandingSystem {
  return { facility: ILS, course: 246, backcourse: false, slope: -3, gls: null };
}

function selectedGls(gls: GlsApproachData): SelectedLandingSystem {
  return { ...NOTHING_SELECTED, gls };
}

describe('landing system tuning', () => {
  it('tunes the ILS as before', () => {
    const mmr = idleMmr();

    applySelectedLandingSystem(mmr, selectedIls());

    expect(mmr).toMatchObject({ frequency: 110.3, ident: 'IFRA', course: 246, slope: -3, facility: ILS });
    expect(mmr.gls).toBeUndefined();
  });

  it('leaves an idle MMR as it is without a selection', () => {
    const mmr = idleMmr();

    applySelectedLandingSystem(mmr, NOTHING_SELECTED);

    expect(mmr).toEqual(idleMmr());
  });

  it('puts the MMR in GLS mode and detunes the ILS receiver', () => {
    const mmr = idleMmr();

    applySelectedLandingSystem(mmr, selectedGls(GLS));

    expect(mmr.gls).toBe(GLS);
    expect(mmr).toMatchObject({ frequency: null, ident: 'G25P', course: 246, slope: -3, manual: false });
    expect(mmr.facility).toBeUndefined();
  });

  it('detunes an ILS that was tuned when a GLS is selected, and tunes the ILS again afterwards', () => {
    const mmr = idleMmr();
    applySelectedLandingSystem(mmr, selectedIls());

    applySelectedLandingSystem(mmr, selectedGls(GLS));
    expect(mmr.frequency).toBeNull();
    expect(mmr.facility).toBeUndefined();

    applySelectedLandingSystem(mmr, selectedIls());
    expect(mmr.frequency).toBe(110.3);
    expect(mmr.gls).toBeUndefined();
  });

  it('follows a change from one GLS to another, and clears the GLS when nothing is selected', () => {
    const mmr = idleMmr();
    applySelectedLandingSystem(mmr, selectedGls(GLS));

    applySelectedLandingSystem(mmr, selectedGls(OTHER_GLS));
    expect(mmr).toMatchObject({ ident: 'G25M', slope: -3.2 });

    applySelectedLandingSystem(mmr, NOTHING_SELECTED);
    expect(mmr).toEqual(idleMmr());
  });

  describe('priority', () => {
    it('keeps a manual GLS when the FMS selects an ILS or another GLS', () => {
      const mmr = idleMmr();
      applyManualGls(mmr, GLS);

      applySelectedLandingSystem(mmr, selectedIls());
      applySelectedLandingSystem(mmr, selectedGls(OTHER_GLS));

      expect(mmr.gls).toBe(GLS);
      expect(mmr.manual).toBe(true);
      expect(mmr.frequency).toBeNull();
    });

    it('keeps a manual ILS when the FMS selects a GLS', () => {
      const mmr: MmrRadioTuningStatus = { ...idleMmr(), manual: true, frequency: 109.5, ident: null };

      applySelectedLandingSystem(mmr, selectedGls(GLS));

      expect(mmr.gls).toBeUndefined();
      expect(mmr.frequency).toBe(109.5);
    });

    it('lets the FMS select again once the manual GLS is cleared', () => {
      const mmr = idleMmr();
      applyManualGls(mmr, GLS);

      applyManualGls(mmr, null);
      expect(mmr).toEqual(idleMmr());

      applySelectedLandingSystem(mmr, selectedIls());
      expect(mmr.frequency).toBe(110.3);
    });
  });

  describe('manual GLS', () => {
    it('sets the MMR to the GLS without a frequency', () => {
      const mmr = idleMmr();

      applyManualGls(mmr, GLS);

      expect(mmr).toMatchObject({ manual: true, frequency: null, ident: 'G25P', course: 246, slope: -3, gls: GLS });
      expect(mmr.databaseCourse).toBeNull();
    });

    it('tunes a channel that no airport has, with nothing to receive', () => {
      const mmr = idleMmr();
      const unknown: GlsApproachData = {
        channel: 20002,
        rpi: null,
        course: null,
        slope: null,
        definition: null,
      };

      applyManualGls(mmr, unknown);

      expect(mmr).toMatchObject({ manual: true, frequency: null, ident: null, course: null });
      expect(mmr.gls?.channel).toBe(20002);
    });
  });
  describe('tuning lock on final approach', () => {
    it('keeps an ILS when the FMS selects a GLS', () => {
      const mmr = idleMmr();
      applySelectedLandingSystem(mmr, selectedIls());

      applySelectedLandingSystem(mmr, selectedGls(GLS), true);

      expect(mmr.gls).toBeUndefined();
      expect(mmr).toMatchObject({ frequency: 110.3, ident: 'IFRA', facility: ILS });
    });

    it('keeps a GLS when the FMS selects an ILS, nothing, or another GLS (an ARRIVAL change)', () => {
      const mmr = idleMmr();
      applySelectedLandingSystem(mmr, selectedGls(GLS));

      applySelectedLandingSystem(mmr, selectedIls(), true);
      applySelectedLandingSystem(mmr, NOTHING_SELECTED, true);
      applySelectedLandingSystem(mmr, selectedGls(OTHER_GLS), true);

      expect(mmr.gls).toBe(GLS);
      expect(mmr).toMatchObject({ ident: 'G25P', frequency: null, slope: -3 });
    });

    it('keeps the ILS to ILS following of the MMR state, as before', () => {
      const mmr = idleMmr();
      applySelectedLandingSystem(mmr, selectedIls());
      const otherIls = {
        databaseId: 'ILS-IFRB',
        ident: 'IFRB',
        frequency: 111.1,
        locBearing: 70,
      } as unknown as IlsNavaid;

      applySelectedLandingSystem(
        mmr,
        { facility: otherIls, course: 70, backcourse: false, slope: -3, gls: null },
        true,
      );

      expect(mmr).toMatchObject({ ident: 'IFRB', frequency: 111.1 });
    });

    it('does not let a manual GLS entry or clearing change a GLS or an ILS', () => {
      const ilsMmr = idleMmr();
      applySelectedLandingSystem(ilsMmr, selectedIls());
      applyManualGls(ilsMmr, GLS, true);
      expect(ilsMmr.gls).toBeUndefined();
      expect(ilsMmr.manual).toBe(false);

      const glsMmr = idleMmr();
      applyManualGls(glsMmr, GLS);
      applyManualGls(glsMmr, OTHER_GLS, true);
      expect(glsMmr.gls).toBe(GLS);
      applyManualGls(glsMmr, null, true);
      expect(glsMmr.gls).toBe(GLS);
      expect(glsMmr.manual).toBe(true);
    });
  });

  describe('leaving GLS mode', () => {
    it('clears an FMS selected GLS so that the channel and uplink go away, and lets the selection run again later', () => {
      const mmr = idleMmr();
      applySelectedLandingSystem(mmr, selectedGls(GLS));

      leaveGlsMode(mmr);
      expect(mmr.gls).toBeUndefined();
      expect(mmr).toEqual(idleMmr());

      applySelectedLandingSystem(mmr, selectedGls(GLS));
      expect(mmr.gls).toBe(GLS);
    });

    it('clears a manual GLS too', () => {
      const mmr = idleMmr();
      applyManualGls(mmr, GLS);

      leaveGlsMode(mmr);

      expect(mmr.gls).toBeUndefined();
      expect(mmr.manual).toBe(false);
    });

    it('leaves an ILS alone', () => {
      const mmr = idleMmr();
      applySelectedLandingSystem(mmr, selectedIls());
      const before = { ...mmr };

      leaveGlsMode(mmr);

      expect(mmr).toEqual(before);
    });
  });
  describe('GLS tuned on the RMP', () => {
    it('sets the MMR to the GLS as a crew entry', () => {
      const mmr = idleMmr();

      applyRmpGls(mmr, GLS);

      expect(mmr.gls).toBe(GLS);
      expect(mmr.manual).toBe(true);
      expect(mmr.glsEntry).toBe('channel');
      expect(mmr.frequency).toBeNull();
      expect(mmr.course).toBe(246);
    });

    it('takes an ILS that was tuned off the MMR', () => {
      const mmr = idleMmr();
      applySelectedLandingSystem(mmr, selectedIls());

      applyRmpGls(mmr, GLS);

      expect(mmr.facility).toBeUndefined();
      expect(mmr.frequency).toBeNull();
      expect(mmr.gls).toBe(GLS);
    });

    it('changes to another channel and is left again with leaveGlsMode', () => {
      const mmr = idleMmr();
      applyRmpGls(mmr, GLS);

      applyRmpGls(mmr, OTHER_GLS);
      expect(mmr.gls).toBe(OTHER_GLS);

      leaveGlsMode(mmr);
      expect(mmr).toEqual(idleMmr());
    });
  });

  describe('course of a GLS', () => {
    it('cannot be entered by the crew, as the receiver takes it from the uplink', () => {
      const mmr = idleMmr();
      applyManualGls(mmr, GLS);
      expect(canEnterLsCourse(mmr)).toBe(false);
      expect(mmr.course).toBe(246);
    });

    it('can be entered on an ILS', () => {
      const mmr = idleMmr();
      applySelectedLandingSystem(mmr, selectedIls());
      expect(canEnterLsCourse(mmr)).toBe(true);
    });
  });

  describe('field of a manual GLS entry', () => {
    it('is recorded and cleared with the entry', () => {
      const mmr = idleMmr();
      applyManualGls(mmr, GLS, false, 'ident');
      expect(mmr.glsEntry).toBe('ident');
      applyManualGls(mmr, GLS, false);
      expect(mmr.glsEntry).toBe('channel');
      applyManualGls(mmr, null);
      expect(mmr.glsEntry).toBeUndefined();
    });

    it('is not set for a GLS the FMS selected', () => {
      const mmr = idleMmr();
      applySelectedLandingSystem(mmr, selectedGls(GLS));
      expect(mmr.glsEntry).toBeUndefined();
    });
  });
});
