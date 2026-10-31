// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { discreteWordWithBits, startCruiseFwc } from '../FwcControlsAlertProbe';
import { noComputedDataWord, normalWord } from '../PseudoFwcTestBed';
import { isGearNotUplockedForVle, VleGearPositionInputs } from './LandingGearOverspeed';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const gearUpAndLocked: VleGearPositionInputs = {
  gearLockedUp: true,
  uplockPositionAvailable: true,
  gearDoorNotClosed: false,
};

/* OVER SPEED VLE: above VLE with the L/G not uplocked or the L/G doors not closed */
describe('OVER SPEED VLE gear condition', () => {
  it('is false with the gear locked up and the doors closed', () => {
    expect(isGearNotUplockedForVle(gearUpAndLocked)).toBe(false);
  });

  it('is true with the gear not locked up', () => {
    expect(isGearNotUplockedForVle({ ...gearUpAndLocked, gearLockedUp: false })).toBe(true);
  });

  it('is true with a gear door not closed', () => {
    expect(isGearNotUplockedForVle({ ...gearUpAndLocked, gearDoorNotClosed: true })).toBe(true);
  });

  // Seen in the sim: DC EMER CONFIG (DC 1 + DC 2 + DC ESS) at FL180, 290 kt, gear up gave a false red OVER SPEED -VLE
  it('is false with both LGCIUs lost (no uplock position: the FWC cannot see the gear not uplocked)', () => {
    expect(
      isGearNotUplockedForVle({ gearLockedUp: false, uplockPositionAvailable: false, gearDoorNotClosed: false }),
    ).toBe(false);
  });

  describe('PseudoFWC OVER SPEED VLE', () => {
    // LGCIU discrete word 1 bit 17: the LH gear door is not closed; word 3 bit 11: the LH gear is not locked up
    const LH_DOOR_NOT_CLOSED_BIT = 17;
    const LH_GEAR_NOT_LOCKED_UP_BIT = 11;

    /** Whether the FWC warns of the VLE overspeed at 300 kt (VLE is 280 kt) with these LGCIU words, in cruise */
    function vleWarning(setup: (simvars: Map<string, number>) => void): boolean {
      const rig = startCruiseFwc();
      setup(rig.simvars);
      rig.bus.getPublisher<any>().pub('a32nx_adr_computed_airspeed_1', normalWord(300), false, true);
      rig.run(1);
      return (rig.fwc as any).vleOverspeedWarning.get();
    }

    it('warns above VLE with the gear not locked up or a gear door not closed, not with the gear locked up', () => {
      expect(vleWarning(() => {})).toBe(false);
      expect(
        vleWarning((simvars) =>
          simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_3', discreteWordWithBits(LH_GEAR_NOT_LOCKED_UP_BIT)),
        ),
      ).toBe(true);
      expect(
        vleWarning((simvars) =>
          simvars.set('L:A32NX_LGCIU_2_DISCRETE_WORD_1', discreteWordWithBits(LH_DOOR_NOT_CLOSED_BIT)),
        ),
      ).toBe(true);
    });

    it('does not warn with both LGCIUs lost, and uses the uplock position of either LGCIU', () => {
      expect(
        vleWarning((simvars) => {
          simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_3', noComputedDataWord());
          simvars.set('L:A32NX_LGCIU_2_DISCRETE_WORD_3', noComputedDataWord());
        }),
      ).toBe(false);
      expect(
        vleWarning((simvars) => {
          simvars.set('L:A32NX_LGCIU_1_DISCRETE_WORD_3', noComputedDataWord());
          simvars.set('L:A32NX_LGCIU_2_DISCRETE_WORD_3', discreteWordWithBits(LH_GEAR_NOT_LOCKED_UP_BIT));
        }),
      ).toBe(true);
    });
  });
});
