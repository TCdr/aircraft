// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  isDmeFlagShown,
  isIlsFlagShown,
  isV1InopShown,
  landingSystemFlagText,
  landingSystemPowerTopics,
  PFD_FLAG_FLASH_SECONDS,
} from './PfdFlags';

describe('A32NX PFD V1 INOP flag', () => {
  const takeoff = { v1Knots: 142, anyFmHealthy: true, fwcFlightPhase: 2 };

  it('is not shown while the FM sends the V1', () => {
    expect(isV1InopShown(takeoff)).toBe(false);
  });

  it('replaces the V1 when no FM is healthy', () => {
    expect(isV1InopShown({ ...takeoff, anyFmHealthy: false })).toBe(true);
  });

  it('is not shown without an entered V1', () => {
    expect(isV1InopShown({ ...takeoff, v1Knots: -1, anyFmHealthy: false })).toBe(false);
  });

  it('is not shown after flight phase 4, when the V1 is no longer displayed', () => {
    expect(isV1InopShown({ ...takeoff, anyFmHealthy: false, fwcFlightPhase: 5 })).toBe(false);
  });
});

describe('A32NX PFD ILS and DME flags', () => {
  const normal = { lsSelected: true, ilsReceiverPowered: true, dmeInterrogatorPowered: true };

  it('shows no flag with the receivers working', () => {
    expect(isIlsFlagShown(normal)).toBe(false);
    expect(isDmeFlagShown(normal)).toBe(false);
  });

  it('shows the ILS flag when the MMR loses its power', () => {
    expect(isIlsFlagShown({ ...normal, ilsReceiverPowered: false })).toBe(true);
    expect(isDmeFlagShown({ ...normal, ilsReceiverPowered: false })).toBe(false);
  });

  it('shows the ILS flag when the GLS receiver is failed on a GLS approach', () => {
    expect(isIlsFlagShown({ ...normal, glsReceiverFailed: true })).toBe(true);
    expect(isIlsFlagShown({ ...normal, lsSelected: false, glsReceiverFailed: true })).toBe(false);
    expect(isDmeFlagShown({ ...normal, glsReceiverFailed: true })).toBe(false);
  });

  it('shows the ILS flag when the ILS receiver is failed with its power still on', () => {
    expect(isIlsFlagShown({ ...normal, ilsReceiverFailed: true })).toBe(true);
    expect(isIlsFlagShown({ ...normal, lsSelected: false, ilsReceiverFailed: true })).toBe(false);
    expect(isDmeFlagShown({ ...normal, ilsReceiverFailed: true })).toBe(false);
  });

  it('shows no ILS flag on a GLS for a failed ILS receiver, as the GLS function of the MMR still works', () => {
    const glsWithFailedIls = { ...normal, glsSelected: true, ilsReceiverFailed: true };
    expect(isIlsFlagShown(glsWithFailedIls)).toBe(false);
    expect(isIlsFlagShown({ ...glsWithFailedIls, glsReceiverFailed: true })).toBe(true);
    expect(isIlsFlagShown({ ...normal, glsSelected: true, ilsReceiverPowered: false })).toBe(true);
  });

  it('shows no DME flag on a GLS, whose distance comes from the MMR and not from the DME', () => {
    expect(isDmeFlagShown({ ...normal, glsSelected: true, dmeInterrogatorPowered: false })).toBe(false);
    expect(isDmeFlagShown({ ...normal, glsSelected: false, dmeInterrogatorPowered: false })).toBe(true);
  });

  it('shows the DME flag when the DME interrogator fails', () => {
    expect(isDmeFlagShown({ ...normal, dmeInterrogatorPowered: false })).toBe(true);
    expect(isIlsFlagShown({ ...normal, dmeInterrogatorPowered: false })).toBe(false);
  });

  it('shows no flag without the LS information (LS pushbutton off)', () => {
    const failed = { lsSelected: false, ilsReceiverPowered: false, dmeInterrogatorPowered: false };
    expect(isIlsFlagShown(failed)).toBe(false);
    expect(isDmeFlagShown(failed)).toBe(false);
  });

  it('names the onside receiver: ILS1/DME1 on PFD 1, ILS2/DME2 on PFD 2', () => {
    expect(landingSystemFlagText('ILS', 1)).toBe('ILS1');
    expect(landingSystemFlagText('DME', 1)).toBe('DME1');
    expect(landingSystemFlagText('ILS', 2)).toBe('ILS2');
    expect(landingSystemFlagText('DME', 2)).toBe('DME2');
  });

  it('powers DME 1 from AC ESS SHED and DME 2 from AC 2, and leaves the power of the MMRs to the systems', () => {
    expect(landingSystemPowerTopics(1)).toEqual({ dmeInterrogator: 'a32nx_elec_ac_ess_shed_bus_is_powered' });
    expect(landingSystemPowerTopics(2)).toEqual({ dmeInterrogator: 'a32nx_elec_ac_2_bus_is_powered' });
  });

  it('flashes the flags for 9 s', () => {
    expect(PFD_FLAG_FLASH_SECONDS).toBe(9);
  });
});
