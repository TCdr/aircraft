// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429SignStatusMatrix, FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTcasFault, isTcasStandbyWithoutAltitudeSensors, TcasFaultInputs } from './TcasFault';
import { A320Failure, A320FailureDefinitions } from '../../../failures/src/a320';
import {
  arincWord,
  createTcasComputer,
  readSimVar,
  setHealthyTcasInputs,
  setSimVar,
  southboundIntruder,
  TCAS_FAULT_VAR,
  TCAS_MODE_VAR,
  TCAS_STATE_VAR,
} from '../components/TcasComputerTestBed';

/* Amber TCAS on the ND and the PFD and NAV TCAS FAULT on an internal failure of the TCAS. */
describe('TCAS fault', () => {
  const healthy: TcasFaultInputs = {
    pressureAltitudeValid: true,
    radioAltitudeFailed: false,
    powered: true,
    internalFailure: false,
  };

  it('is not shown with a healthy, powered TCAS and valid altitudes', () => {
    expect(isTcasFault(healthy)).toBe(false);
  });

  it('is shown on an internal failure of the TCAS computer', () => {
    expect(isTcasFault({ ...healthy, internalFailure: true })).toBe(true);
  });

  it('is shown when the TCAS cannot deliver RA data (altitude inputs)', () => {
    expect(isTcasFault({ ...healthy, pressureAltitudeValid: false })).toBe(true);
    expect(isTcasFault({ ...healthy, radioAltitudeFailed: true })).toBe(true);
  });

  it('is a flyPad failure of ATA 34', () => {
    expect(A320Failure.TcasComputer).toBe(34060);
    expect(A320FailureDefinitions.some(([ata, id]) => ata === 34 && id === A320Failure.TcasComputer)).toBe(true);
  });

  describe('in the TCAS computer', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const FAULT_AND_TARA = { fault: 1, state: 0, mode: 2 };
    const readOutputs = () => ({
      fault: readSimVar(TCAS_FAULT_VAR),
      state: readSimVar(TCAS_STATE_VAR),
      mode: readSimVar(TCAS_MODE_VAR),
    });

    it('shows no fault with healthy inputs and the switch in TA/RA', async () => {
      setHealthyTcasInputs();
      const tcas = createTcasComputer();
      await tcas.runSeconds(2);
      expect(readOutputs()).toEqual({ fault: 0, state: 0, mode: 2 });
    });

    it('reads the flyPad failure of the TCAS computer and shows the fault, out of standby', async () => {
      setHealthyTcasInputs();
      vi.spyOn(FailuresConsumer.prototype, 'isActive').mockImplementation((id) => id === A320Failure.TcasComputer);
      const tcas = createTcasComputer();
      await tcas.runSeconds(2);
      expect(readOutputs()).toEqual(FAULT_AND_TARA);
    });

    it('drops the traffic of the ND on the internal failure', async () => {
      setHealthyTcasInputs();
      const traffic = (second: number) => [southboundIntruder(1234567, 20, 1000, second)];
      const healthyComputer = createTcasComputer(traffic);
      await healthyComputer.runSeconds(5);
      expect(healthyComputer.lastSentIds()).toEqual(['1234567']);

      vi.spyOn(FailuresConsumer.prototype, 'isActive').mockImplementation((id) => id === A320Failure.TcasComputer);
      const failed = createTcasComputer(traffic);
      await failed.runSeconds(5);
      expect(failed.lastSentIds()).toEqual([]);
    });

    it('shows the fault with an invalid pressure altitude of the selected ADR', async () => {
      setHealthyTcasInputs();
      setSimVar('L:A32NX_ADIRS_ADR_1_ALTITUDE', arincWord(10_000, Arinc429SignStatusMatrix.NoComputedData));
      const tcas = createTcasComputer();
      await tcas.runSeconds(2);
      expect(readOutputs().fault).toBe(1);
    });
  });
});

/*
 * The green TCAS STBY memo also appears when both ATCs or both RAs are failed, or on a triple ADR failure. Standby, not
 * a TCAS fault.
 */
describe('TCAS standby without altitude sensors', () => {
  it('stays operative with one radio altimeter and one ADR', () => {
    expect(isTcasStandbyWithoutAltitudeSensors(true, false, [false, false, true])).toBe(false);
    expect(isTcasStandbyWithoutAltitudeSensors(false, true, [true, false, false])).toBe(false);
    expect(isTcasStandbyWithoutAltitudeSensors(false, false, [true, true, true])).toBe(false);
  });

  it('is in standby when both radio altimeters are failed', () => {
    expect(isTcasStandbyWithoutAltitudeSensors(true, true, [true, true, true])).toBe(true);
  });

  it('is in standby on a triple ADR failure', () => {
    expect(isTcasStandbyWithoutAltitudeSensors(false, false, [false, false, false])).toBe(true);
  });

  describe('in the TCAS computer', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('goes to STBY with both radio altimeters failed, which also clears the TCAS fault', async () => {
      setHealthyTcasInputs();
      const failed = arincWord(0, Arinc429SignStatusMatrix.FailureWarning);
      setSimVar('L:A32NX_RA_1_RADIO_ALTITUDE', failed);
      setSimVar('L:A32NX_RA_2_RADIO_ALTITUDE', failed);
      const tcas = createTcasComputer();
      await tcas.runSeconds(2);
      expect(readSimVar(TCAS_MODE_VAR)).toBe(0);
      expect(readSimVar(TCAS_FAULT_VAR)).toBe(0);
    });

    it('goes to STBY on a triple ADR failure, which also clears the TCAS fault', async () => {
      setHealthyTcasInputs();
      for (const adr of [1, 2, 3]) {
        setSimVar(`L:A32NX_ADIRS_ADR_${adr}_ALTITUDE`, arincWord(0, Arinc429SignStatusMatrix.FailureWarning));
      }
      const tcas = createTcasComputer();
      await tcas.runSeconds(2);
      expect(readSimVar(TCAS_MODE_VAR)).toBe(0);
      expect(readSimVar(TCAS_FAULT_VAR)).toBe(0);
    });

    it('stays out of standby with one radio altimeter failed', async () => {
      setHealthyTcasInputs();
      setSimVar('L:A32NX_RA_1_RADIO_ALTITUDE', arincWord(0, Arinc429SignStatusMatrix.FailureWarning));
      const tcas = createTcasComputer();
      await tcas.runSeconds(2);
      expect(readSimVar(TCAS_MODE_VAR)).toBe(2);
    });
  });
});
