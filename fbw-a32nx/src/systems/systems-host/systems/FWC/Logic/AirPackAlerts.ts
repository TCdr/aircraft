// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { CondStatusCodes, StatusLines } from './CondStatus';
import { FwcAlertItem, awarenessItem, cautionItem, inopSysOnly, readBool } from './FwcAlertItem';

/*
 * AIR PACK 1(2) OVHT and AIR PACK 1(2) REGUL FAULT of the A320 FWC, inhibited in phases 3, 4, 5, 7, 8:
 * - PACK OVHT: the pack compressor outlet is above 260 deg C. The ACSC closes the pack flow control valve and lights
 *   the PACK pb-sw FAULT light until the compressor cools down (a320_systems air conditioning, flyPad pack overheat
 *   failure, L:A32NX_COND_PACK_n_OVERHEAT). Procedure -PACK OFF, then .WHEN PACK OVHT OUT: -PACK ON. The alert stays
 *   while the pack is OFF after the overheat, until the crew sets it ON again. STATUS: WHEN PACK OVHT OUT: PACK ON,
 *   INOP SYS PACK 1(2).
 * - PACK REGUL FAULT: the temperature regulation of the pack is degraded (flyPad pack regulation failure, which
 *   freezes the pack outlet temperature in the systems). Crew awareness, STATUS INOP SYS PACK 1(2) REGUL.
 */

export const AirPackAlertKeys = {
  overheat: ['2161211', '2161212'],
  regulationFault: ['2161213', '2161214'],
} as const;

export const AIR_PACK_PHASE_INHIBITION = [3, 4, 5, 7, 8];

const PACK_REGULATION_FAILURES = [A320Failure.Pack1Regulation, A320Failure.Pack2Regulation];

export interface AirPackInputs {
  /** L:A32NX_COND_PACK_n_OVERHEAT */
  readonly overheat: boolean;
  /** L:A32NX_OVHD_COND_PACK_n_PB_IS_ON */
  readonly pbOn: boolean;
  /** The flyPad pack regulation failure */
  readonly regulationFailed: boolean;
}

/**
 * PACK OVHT: on with the overheat, and kept while the PACK pb-sw is OFF after it, until the crew sets it ON again
 * @param wasActive the alert was on in the previous update
 */
export function isPackOverheatAlert(inputs: AirPackInputs, wasActive: boolean): boolean {
  return inputs.overheat || (wasActive && !inputs.pbOn);
}

/**
 * The lines of PACK OVHT: 0 title, 1 -PACK OFF while the pb-sw is ON, then 2 .WHEN PACK OVHT OUT: and 3 -PACK ON
 */
function packOverheatLines(pbOn: boolean): number[] {
  return pbOn ? [0, 1] : [0, 2, 3];
}

const STATUS = {
  whenPackOverheatOut: '210500005',
  packOn: ['210400011', '210400012'],
  pack: [CondStatusCodes.pack1, CondStatusCodes.pack2],
  packRegul: ['210300019', '240300163'],
} as const;

function packOverheatStatus(pack: 0 | 1): StatusLines {
  return { left: [STATUS.whenPackOverheatOut, STATUS.packOn[pack]], inopSys: [STATUS.pack[pack]] };
}

/** The part of the failures consumer the alerts use */
export type AirPackFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

export class AirPackAlerts {
  private readonly pbOn = [true, true];

  private readonly overheat = [Subject.create(false), Subject.create(false)];

  private readonly regulationFault = [Subject.create(false), Subject.create(false)];

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: AirPackFailuresSource = new FailuresConsumer()) {}

  /** Registers the failures, called once by the PseudoFWC init */
  init(): void {
    for (const failure of PACK_REGULATION_FAILURES) {
      this.failuresConsumer.register(failure);
    }
  }

  /** Reads the packs, then updates the alerts */
  update(): void {
    this.failuresConsumer.update();
    this.updateAlerts([readPackInputs(this.failuresConsumer, 1), readPackInputs(this.failuresConsumer, 2)]);
  }

  /** AIR PACK OVHT is on: the pack is OFF by the overheat procedure, not for an AIR PACK OFF caution */
  isOverheatAlertActive(pack: 0 | 1): boolean {
    return this.overheat[pack].get();
  }

  /** Updates the alerts from inputs already read */
  updateAlerts(packs: readonly [AirPackInputs, AirPackInputs]): void {
    packs.forEach((pack, index) => {
      this.pbOn[index] = pack.pbOn;
      this.overheat[index].set(isPackOverheatAlert(pack, this.overheat[index].get()));
      this.regulationFault[index].set(pack.regulationFailed);
    });
  }

  private overheatItem(pack: 0 | 1): FwcAlertItem {
    return cautionItem(
      AirPackAlertKeys.overheat[pack],
      4,
      this.overheat[pack],
      AIR_PACK_PHASE_INHIBITION,
      () => packOverheatLines(this.pbOn[pack]),
      EcamSysPage.BLEED,
      () => packOverheatStatus(pack),
    );
  }

  private regulationFaultItem(pack: 0 | 1): FwcAlertItem {
    return awarenessItem(
      AirPackAlertKeys.regulationFault[pack],
      1,
      this.regulationFault[pack],
      AIR_PACK_PHASE_INHIBITION,
      () => [0],
      inopSysOnly(STATUS.packRegul[pack]),
    );
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [AirPackAlertKeys.overheat[0]]: this.overheatItem(0),
    [AirPackAlertKeys.overheat[1]]: this.overheatItem(1),
    [AirPackAlertKeys.regulationFault[0]]: this.regulationFaultItem(0),
    [AirPackAlertKeys.regulationFault[1]]: this.regulationFaultItem(1),
  };
}

function readPackInputs(failures: AirPackFailuresSource, pack: 1 | 2): AirPackInputs {
  return {
    overheat: readBool(`L:A32NX_COND_PACK_${pack}_OVERHEAT`),
    pbOn: readBool(`L:A32NX_OVHD_COND_PACK_${pack}_PB_IS_ON`),
    regulationFailed: failures.isActive(PACK_REGULATION_FAILURES[pack - 1]),
  };
}
