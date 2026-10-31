// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DmcSwitchingKnob } from '@flybywiresim/fbw-sdk';
import {
  ENGINE_DISCREPANCY_PARAMETERS,
  EngineDiscrepancyInputs,
  EngineIndicationDiscrepancyAlerts,
  engineDiscrepancyKey,
} from './EngineIndicationDiscrepancyAlerts';
import { ewdLines } from './FwcAlertSpecHelpers';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { isAlertTriggered, startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const none = [false, false, false, false];

const healthy: EngineDiscrepancyInputs = {
  discrepancy: [none, none],
  fadecPowered: [true, true],
  dmcSwitchingKnob: DmcSwitchingKnob.Norm,
};

/** Engine 2 with a discrepancy on one parameter */
function engine2Discrepancy(parameterIndex: number): EngineDiscrepancyInputs {
  return { ...healthy, discrepancy: [none, none.map((_, index) => index === parameterIndex)] };
}

describe('ENG 1(2) N1 or N2 or EGT or FF DISCREPANCY', () => {
  it('one crew awareness title per engine and parameter, inhibited in phases 3, 4, 5, 8, no STATUS', () => {
    const alerts = new EngineIndicationDiscrepancyAlerts();
    expect(Object.keys(alerts.ewdFailures)).toHaveLength(8);
    ENGINE_DISCREPANCY_PARAMETERS.forEach((parameter, index) => {
      alerts.update(engine2Discrepancy(index));
      const item = alerts.ewdFailures[engineDiscrepancyKey(2, parameter)];
      expect(item.simVarIsActive.get()).toBe(true);
      expect(alerts.ewdFailures[engineDiscrepancyKey(1, parameter)].simVarIsActive.get()).toBe(false);
      expect(item.failure).toBe(1);
      expect(item.flightPhaseInhib).toEqual([3, 4, 5, 8]);
      expect(ewdLines(item)).toEqual([`ENG 2 ${parameter} DISCREPANCY`]);
      expect([...item.statusInfo(), ...item.inopSys()]).toEqual([]);
    });
  });

  it('goes with the discrepancy', () => {
    const alerts = new EngineIndicationDiscrepancyAlerts();
    const egt = alerts.ewdFailures[engineDiscrepancyKey(2, 'EGT')];
    alerts.update(engine2Discrepancy(2));
    expect(egt.simVarIsActive.get()).toBe(true);
    alerts.update(healthy);
    expect(egt.simVarIsActive.get()).toBe(false);
  });

  it('goes when the E/WD is switched to DMC 3 (normal indication recovered) or without the FADEC supply', () => {
    const alerts = new EngineIndicationDiscrepancyAlerts();
    const n1 = alerts.ewdFailures[engineDiscrepancyKey(2, 'N1')];
    alerts.update({ ...engine2Discrepancy(0), dmcSwitchingKnob: DmcSwitchingKnob.Capt });
    expect(n1.simVarIsActive.get()).toBe(false);
    alerts.update({ ...engine2Discrepancy(0), dmcSwitchingKnob: DmcSwitchingKnob.Fo });
    expect(n1.simVarIsActive.get()).toBe(true);
    alerts.update({ ...engine2Discrepancy(0), fadecPowered: [true, false] });
    expect(n1.simVarIsActive.get()).toBe(false);
  });
});

describe('the real FWC: engine indication discrepancy alerts', () => {
  let simvars: Map<string, number>;

  beforeEach(() => {
    ({ simvars } = installFwcSimVarMocks());
  });

  it('shows the alert of the parameter that the systems report discrepant, while the FADEC is powered', () => {
    const { fwc } = startCruiseFwc(simvars, () => {
      simvars.set('L:A32NX_FADEC_POWERED_ENG2', 1);
      simvars.set('L:A32NX_EIS_DMC_SWITCHING_KNOB', DmcSwitchingKnob.Norm);
    });
    const key = engineDiscrepancyKey(2, 'EGT');
    expect(isAlertTriggered(fwc, key)).toBe(false);

    simvars.set('L:A32NX_ENGINE_2_EGT_DISCREPANCY', 1);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(true);
    expect(isAlertTriggered(fwc, engineDiscrepancyKey(1, 'EGT'))).toBe(false);
    expect(isAlertTriggered(fwc, engineDiscrepancyKey(2, 'N1'))).toBe(false);

    simvars.set('L:A32NX_FADEC_POWERED_ENG2', 0);
    runFwc(fwc, 1);
    expect(isAlertTriggered(fwc, key)).toBe(false);
  });
});
