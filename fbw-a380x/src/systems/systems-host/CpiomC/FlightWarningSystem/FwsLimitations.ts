// Copyright (c) 2025 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { MappedSubject, Subscription } from '@microsoft/msfs-sdk';
import { EcamLimitations } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { FwsCore, FwsSuppressableItem } from './FwsCore';

export enum FwsLimitationsPhases {
  AllPhases,
  ApprLdg,
}

export interface FwsLimitationsItem extends FwsSuppressableItem {
  /** Relevant phase shown on SD/EWD: ALL PHASES or APPR & LDG */
  phase: FwsLimitationsPhases;
  /** Shown on PFD */
  pfd?: boolean;
}

export interface FwsLimitationsDict {
  [key: keyof typeof EcamLimitations]: FwsLimitationsItem;
}

/**
 * The APPR & LDG column without the limitations the ALL PHASES column already shows: one key can be an APPR & LDG
 * limitation of one procedure and an ALL PHASES one of another (MAX SPEED 310/.86: F/CTL DIRECT LAW, NAV ALL AIR DATA
 * DISAGREE).
 */
export function withoutAllPhasesDuplicates(apprLdgKeys: string[], allPhasesKeys: string[]): string[] {
  return apprLdgKeys.filter((key) => !allPhasesKeys.includes(key));
}

export class FwsLimitations {
  public readonly subscriptions: Subscription[] = [];

  constructor(private fws: FwsCore) {}
  /** LIMITATIONS shown on SD */
  limitations: FwsLimitationsDict = {
    1: {
      simVarIsActive: this.fws.landAsap,
      phase: FwsLimitationsPhases.AllPhases,
      pfd: true,
    },

    230400001: {
      simVarIsActive: this.fws.allRmpFault,
      phase: FwsLimitationsPhases.AllPhases,
    },
    // F/CTL DIRECT LAW: "LIMITATIONS ON ECAM / APPR & LDG: MAX SPEED : 310/.86, MANEUVER WITH CARE", the same on the PFD
    // (A380 FCOM PRO-ABN-ECAM-10-27-10 F/CTL DIRECT LAW, a380_fcom.txt l.144962-144972, PDF page 5025)
    240400002: {
      // MAX SPEED: 310/.86
      simVarIsActive: this.fws.directLawCondition,
      phase: FwsLimitationsPhases.ApprLdg,
      pfd: true,
    },
    240400004: {
      // MANEUVER WITH CARE
      simVarIsActive: this.fws.directLawCondition,
      phase: FwsLimitationsPhases.ApprLdg,
      pfd: true,
    },
    260400001: {
      // APU bleed do not use
      simVarIsActive: this.fws.fireButtonEng1,
      phase: FwsLimitationsPhases.AllPhases,
    },
    270400002: {
      // MAX SPEED: 310 KT, not for ALT 1A
      simVarIsActive: MappedSubject.create(
        ([altnLaw, alt1A]) => altnLaw && !alt1A,
        this.fws.altnLawCondition,
        this.fws.altn1ALawCondition,
      ),
      phase: FwsLimitationsPhases.AllPhases,
      pfd: true,
    },
    290400001: {
      simVarIsActive: this.fws.allSlatSysFault,
      phase: FwsLimitationsPhases.ApprLdg,
    },
    290400002: {
      simVarIsActive: this.fws.allFlapSysFault,
      phase: FwsLimitationsPhases.ApprLdg,
    },
    800400002: {
      // LDG DIST AFFECTED
      simVarIsActive: this.fws.ldgDistAffected,
      phase: FwsLimitationsPhases.ApprLdg,
    },
    800400003: {
      // LDG PERF AFFECTED
      simVarIsActive: this.fws.ldgPerfAffected,
      phase: FwsLimitationsPhases.ApprLdg,
    },
  };

  public destroy(): void {
    this.subscriptions.forEach((sub) => sub.destroy());

    for (const key in this.limitations) {
      const element = this.limitations[key];
      if ('destroy' in element.simVarIsActive) {
        element.simVarIsActive.destroy();
      }
    }
  }
}
