// Copyright (c) 2025 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { MappedSubject, SubscribableMapFunctions, Subscription } from '@microsoft/msfs-sdk';
import { EcamInfos } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { FwsCore, FwsSuppressableItem } from './FwsCore';

export interface FwsInfoItem extends FwsSuppressableItem {}

export interface FwsInfoDict {
  [key: keyof typeof EcamInfos]: FwsInfoItem;
}

export class FwsInformation {
  public readonly subscriptions: Subscription[] = [];

  constructor(private fws: FwsCore) {}
  /** INFO shown on SD */
  info: FwsInfoDict = {
    700200050: {
      // ENG 1 IDLE ONLY: THR LEVER FAULT on ground, ENG 1 REVERSER UNLOCKED
      simVarIsActive: this.fws.engineIdleOnly[0],
    },
    700200051: {
      // ENG 2 IDLE ONLY: THR LEVER FAULT on ground, ENG 2 REVERSER UNLOCKED
      simVarIsActive: this.fws.engineIdleOnly[1],
    },
    700200052: {
      // ENG 3 IDLE ONLY: THR LEVER FAULT on ground, ENG 3 REVERSER UNLOCKED
      simVarIsActive: this.fws.engineIdleOnly[2],
    },
    700200053: {
      // ENG 4 IDLE ONLY: THR LEVER FAULT on ground, ENG 4 REVERSER UNLOCKED
      simVarIsActive: this.fws.engineIdleOnly[3],
    },
    700200054: {
      // ENG 1 CLB ONLY: THR LEVER FAULT in flight
      simVarIsActive: this.fws.engineClbOnly[0],
    },
    700200055: {
      // ENG 2 CLB ONLY: THR LEVER FAULT in flight
      simVarIsActive: this.fws.engineClbOnly[1],
    },
    700200056: {
      // ENG 3 CLB ONLY: THR LEVER FAULT in flight
      simVarIsActive: this.fws.engineClbOnly[2],
    },
    700200057: {
      // ENG 4 CLB ONLY: THR LEVER FAULT in flight
      simVarIsActive: this.fws.engineClbOnly[3],
    },
    220200004: {
      // LAND 2 ONLY
      simVarIsActive: this.fws.land3FailPassiveInop,
    },
    220200005: {
      // LAND 3 SINGLE ONLY
      simVarIsActive: this.fws.land3FailOperationalInop,
    },
    // CDS EFIS BKUP CTL, CURSOR CTL and KEYBOARD FAULT STATUS INFO, see FwsCdsControlAlerts
    310200001: {
      // CAPT BARO REF : STD ONLY
      simVarIsActive: this.fws.efisBkupCtlFault[0],
    },
    310200002: {
      // F/O BARO REF : STD ONLY
      simVarIsActive: this.fws.efisBkupCtlFault[1],
    },
    310200003: {
      // CAPT KEYBOARD CURSOR CTL AVAIL
      simVarIsActive: this.fws.kccuCursorCtlFault[0],
    },
    310200004: {
      // F/O KEYBOARD CURSOR CTL AVAIL
      simVarIsActive: this.fws.kccuCursorCtlFault[1],
    },
    310200005: {
      // CAPT SOFT KEYBOARD AVAIL
      simVarIsActive: this.fws.kccuKeyboardFault[0],
    },
    310200006: {
      // F/O SOFT KEYBOARD AVAIL
      simVarIsActive: this.fws.kccuKeyboardFault[1],
    },
    220200006: {
      // FOR AUTOLAND: MAN ROLL OUT ONLY
      simVarIsActive: this.fws.rollOutFault,
    },
    220200010: {
      // APPR 1 ONLY
      simVarIsActive: this.fws.land2Inop,
    },
    220200016: {
      // CAT 3 SINGLE ONLY: ENG 1(2)(3)(4) SHUT DOWN with the APU off
      simVarIsActive: this.fws.engineShutDownCat3SingleOnly,
    },
    270200003: {
      // F/CTL BKUP CTL ACTIVE
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.directLawCondition,
        this.fws.allPrimFailed,
        this.fws.allSecFaultCondition,
      ),
    },
    270200004: {
      // AUDIOS NOT AVAIL : WINDHSHEAR, SPEED SPEED
      simVarIsActive: this.fws.fcdc12FaultCondition,
    },
    270200005: {
      // F/CTL INDICATIONS LOST
      simVarIsActive: this.fws.fcdc12FaultCondition,
    },
    340200002: {
      // ALTN LAW : PROT LOST
      simVarIsActive: this.fws.altnLawCondition,
    },
    340200004: {
      // DIRECT LAW : PROT LOST
      simVarIsActive: this.fws.directLawCondition,
    },
  };

  public destroy(): void {
    this.subscriptions.forEach((sub) => sub.destroy());

    for (const key in this.info) {
      const element = this.info[key];

      if ('destroy' in element.simVarIsActive) {
        element.simVarIsActive.destroy();
      }
    }
  }
}
