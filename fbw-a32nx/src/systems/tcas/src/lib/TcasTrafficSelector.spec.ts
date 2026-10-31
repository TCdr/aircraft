// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isIntruderShownForTrafficSelector } from './TcasTrafficSelector';
import { TcasThreat } from './TcasConstants';
import {
  createTcasComputer,
  setHealthyTcasInputs,
  setSimVar,
  southboundIntruder,
} from '../components/TcasComputerTestBed';

/* THRT shows the proximate and other intruders only if a TA or RA is present, within +-2 700 ft. */
describe('TCAS TRAFFIC selector', () => {
  const thrtBand = [-2700, 2700] as const;

  it('THRT without a TA or RA hides the other intruders', () => {
    expect(isIntruderShownForTrafficSelector(true, 1000, thrtBand, false, false)).toBe(false);
  });

  it('THRT always shows the TA or RA intruder itself', () => {
    expect(isIntruderShownForTrafficSelector(true, 1000, thrtBand, true, true)).toBe(true);
  });

  it('THRT shows the proximate and other intruders while a TA or RA is present', () => {
    expect(isIntruderShownForTrafficSelector(true, -2000, thrtBand, false, true)).toBe(true);
  });

  it('THRT keeps the +-2 700 ft band during a TA or RA', () => {
    expect(isIntruderShownForTrafficSelector(true, 3000, thrtBand, false, true)).toBe(false);
  });

  it('ALL, ABV and BLW show every intruder of their band', () => {
    expect(isIntruderShownForTrafficSelector(false, 9000, [-2700, 9900], false, false)).toBe(true);
    expect(isIntruderShownForTrafficSelector(false, -9000, [-2700, 9900], false, false)).toBe(false);
  });

  describe('in the TCAS computer', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const OTHER_INTRUDER = 1111111;
    const CLOSE_INTRUDER = 2222222;

    /** The IDs of the intruders on the ND with the selector position and the intruders given */
    async function shownIntruders(selector: TcasThreat, closeIntruder: boolean): Promise<string[]> {
      setHealthyTcasInputs();
      setSimVar('L:A32NX_SWITCH_TCAS_Traffic_Position', selector);
      const tcas = createTcasComputer((second) => [
        // 20 NM away and 2 000 ft above: no TA, inside the +-2 700 ft band of every selector position
        southboundIntruder(OTHER_INTRUDER, 20, 2000, second),
        ...(closeIntruder ? [southboundIntruder(CLOSE_INTRUDER, 0.4, 300, second)] : []),
      ]);
      await tcas.runSeconds(6);
      return tcas.lastSentIds();
    }

    it('ALL shows an intruder without a TA or RA, THRT does not', async () => {
      expect(await shownIntruders(TcasThreat.ALL, false)).toEqual([String(OTHER_INTRUDER)]);
      expect(await shownIntruders(TcasThreat.THREAT, false)).toEqual([]);
    });

    it('THRT shows the other intruders while the TCAS has a TA or RA on a close intruder', async () => {
      const shown = await shownIntruders(TcasThreat.THREAT, true);
      expect(shown).toContain(String(CLOSE_INTRUDER));
      expect(shown).toContain(String(OTHER_INTRUDER));
    });
  });
});
