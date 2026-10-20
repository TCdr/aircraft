// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { DmcSwitchingKnob } from '@flybywiresim/fbw-sdk';
import {
  ENGINE_DISCREPANCY_PARAMETERS,
  EngineDiscrepancyInputs,
  EngineIndicationDiscrepancyAlerts,
  engineDiscrepancyKey,
} from './EngineIndicationDiscrepancyAlerts';
import { ewdLines, pseudoFwcSource } from './FwcAlertSpecHelpers';

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

  it('the PseudoFWC updates and shows the alerts', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain(
      'this.engineIndicationDiscrepancyAlerts.update(readEngineDiscrepancyInputs(this.dmcSwitchingKnob.get()));',
    );
    expect(fwc).toContain('...this.engineIndicationDiscrepancyAlerts.ewdFailures,');
  });
});
