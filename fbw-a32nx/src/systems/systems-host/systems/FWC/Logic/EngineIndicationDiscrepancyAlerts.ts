// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { DmcSwitchingKnob } from '@flybywiresim/fbw-sdk';
import { isDiscrepancyCheckVisible } from '../../../../instruments/src/EWD/EngineIndicationAccuracy';
import { FwcAlertItem, awarenessItem, readBool } from './FwcAlertItem';

/*
 * ENG 1(2) N1 or N2 or EGT or FF DISCREPANCY of the A320 FWC: the DMC finds that a displayed engine value differs from
 * the value on the FADEC-DMC bus (systems engine/engine_monitoring_fault.rs, flyPad failures 77020-77051, writes
 * L:A32NX_ENGINE_n_<N1|N2|EGT|FF>_DISCREPANCY). The E/WD shows an amber CHECK under the value. Switching the E/WD
 * from DMC 1 to DMC 3 (EIS DMC switching selector on CAPT 3) recovers the normal indication, and the alert goes with
 * the CHECK. Crew awareness, one title per parameter, no STATUS, inhibited in phases 3, 4, 5, 8.
 */

export const ENGINE_DISCREPANCY_PARAMETERS = ['N1', 'N2', 'EGT', 'FF'] as const;

export type EngineDiscrepancyParameter = (typeof ENGINE_DISCREPANCY_PARAMETERS)[number];

/** The alert key of a parameter of an engine: 77081, the engine number, the parameter index */
export function engineDiscrepancyKey(engine: 1 | 2, parameter: EngineDiscrepancyParameter): string {
  return `77081${engine}${ENGINE_DISCREPANCY_PARAMETERS.indexOf(parameter)}`;
}

const ENGINE_DISCREPANCY_PHASE_INHIBITION = [3, 4, 5, 8];

export interface EngineDiscrepancyInputs {
  /** L:A32NX_ENGINE_n_<parameter>_DISCREPANCY, per engine, in the ENGINE_DISCREPANCY_PARAMETERS order */
  readonly discrepancy: readonly [readonly boolean[], readonly boolean[]];
  /** L:A32NX_FADEC_POWERED_ENGn: without its FADEC the values are XX, nothing to compare */
  readonly fadecPowered: readonly [boolean, boolean];
  readonly dmcSwitchingKnob: DmcSwitchingKnob;
}

/** The discrepancy the DMC driving the E/WD sees, as for the amber CHECK under the indication */
function isEngineDiscrepancyAlert(
  inputs: EngineDiscrepancyInputs,
  engineIndex: 0 | 1,
  parameterIndex: number,
): boolean {
  return isDiscrepancyCheckVisible(
    inputs.discrepancy[engineIndex][parameterIndex],
    inputs.dmcSwitchingKnob,
    inputs.fadecPowered[engineIndex],
  );
}

export class EngineIndicationDiscrepancyAlerts {
  private readonly active = [
    ENGINE_DISCREPANCY_PARAMETERS.map(() => Subject.create(false)),
    ENGINE_DISCREPANCY_PARAMETERS.map(() => Subject.create(false)),
  ];

  update(inputs: EngineDiscrepancyInputs): void {
    this.active.forEach((engineAlerts, engineIndex) =>
      engineAlerts.forEach((alert, parameterIndex) =>
        alert.set(isEngineDiscrepancyAlert(inputs, engineIndex as 0 | 1, parameterIndex)),
      ),
    );
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = this.buildItems();

  private buildItems(): Record<string, FwcAlertItem> {
    const items: Record<string, FwcAlertItem> = {};
    for (const engine of [1, 2] as const) {
      ENGINE_DISCREPANCY_PARAMETERS.forEach((parameter, parameterIndex) => {
        const key = engineDiscrepancyKey(engine, parameter);
        items[key] = awarenessItem(
          key,
          1,
          this.active[engine - 1][parameterIndex],
          ENGINE_DISCREPANCY_PHASE_INHIBITION,
        );
      });
    }
    return items;
  }
}

/**
 * Reads the discrepancy flags of the systems and the FADEC supply
 * @param dmcSwitchingKnob L:A32NX_EIS_DMC_SWITCHING_KNOB
 */
export function readEngineDiscrepancyInputs(dmcSwitchingKnob: DmcSwitchingKnob): EngineDiscrepancyInputs {
  const engineDiscrepancy = (engine: number) =>
    ENGINE_DISCREPANCY_PARAMETERS.map((parameter) => readBool(`L:A32NX_ENGINE_${engine}_${parameter}_DISCREPANCY`));
  return {
    discrepancy: [engineDiscrepancy(1), engineDiscrepancy(2)],
    fadecPowered: [readBool('L:A32NX_FADEC_POWERED_ENG1'), readBool('L:A32NX_FADEC_POWERED_ENG2')],
    dmcSwitchingKnob,
  };
}
