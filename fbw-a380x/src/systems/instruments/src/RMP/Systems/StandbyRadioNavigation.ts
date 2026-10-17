// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ConsumerSubject, EventBus, Instrument, MappedSubject, SimVarValueType, Subject } from '@microsoft/msfs-sdk';
import {
  RmpState,
  RmpStateControllerEvents,
} from '../../../../../../../fbw-common/src/systems/instruments/src/RMP/Systems';
import { KeypadEvents, SystemKeys } from './KeypadController';

/*
 * STBY RAD NAV mode of the RMP (backup tuning of the navaids when the FMS cannot tune them).
 *
 * A380 FCOM DSC-34-10-60-10 Standby RadNav (a380_fcom.txt l.86641-86649): "If all three FMCs fail, the flight crew can
 * use the RMP 1 or RMP 2 [...] for back up tuning. The RMP backup tuning is available when any of RMP1 or RMP2 is
 * switched to RAD NAV STBY mode by pressing the RAD NAV STDBY." "RMP 3 is not used for navaids tuning."
 * DSC-23-10 (l.47426): RMP 3 replaces a failed RMP "(not for STBY RAD NAV control)".
 * DSC-23-20 NAV page (l.49003-49004): "The flight crew must press the RAD NAV STBY key to enable the NAV page access
 * key." (The NAV page itself is not built yet: the FCOM has no figure of it.)
 * DSC-23-20 VHF page (l.48288-48289): "after deactivation of the RAD NAV STBY mode, the RMP display defaults to the VHF
 * page."
 */

export interface StandbyRadioNavigationEvents {
  /** Whether this RMP is in STBY RAD NAV mode (selected and the RMP on). */
  rmp_stby_rad_nav_active: boolean;
}

/**
 * Whether an RMP can be switched to STBY RAD NAV mode.
 * @param rmpIndex the RMP (1 Captain, 2 First Officer, 3 overhead)
 * @returns true for RMP 1 and RMP 2 only
 */
export function hasStandbyRadioNavigation(rmpIndex: number): boolean {
  return rmpIndex === 1 || rmpIndex === 2;
}

/**
 * The STBY RAD NAV selection after a press of the guarded key: each press switches the mode on or off.
 * @param rmpIndex the RMP
 * @param selected whether the mode is selected before the press
 * @returns whether the mode is selected after the press
 */
export function standbyRadioNavigationAfterKeyPress(rmpIndex: number, selected: boolean): boolean {
  return hasStandbyRadioNavigation(rmpIndex) ? !selected : false;
}

/**
 * Whether the RMP tunes the navaids: STBY RAD NAV selected, on an RMP that is on and not failed (an RMP off or failed
 * has no output to the receivers).
 * @param selected whether STBY RAD NAV is selected
 * @param rmpState the RMP state
 * @returns true when the mode is active
 */
export function isStandbyRadioNavigationActive(selected: boolean, rmpState: RmpState): boolean {
  return selected && rmpState === RmpState.On;
}

/**
 * Whether the RMP display goes back to the VHF page: when the STBY RAD NAV mode is deactivated (l.48288-48289).
 * @param wasActive whether the mode was active before
 * @param isActive whether the mode is active now
 * @returns true at the deactivation
 */
export function returnsToVhfPage(wasActive: boolean, isActive: boolean): boolean {
  return wasActive && !isActive;
}

/**
 * Manages the STBY RAD NAV key of one RMP: the mode selection, the key light (L:A380X_RMP_n_STBY_NAV, rmp.xml) and the
 * bus event for the page stack. The FMS stops tuning the navaids while an RMP is in this mode (NavaidTuner, which reads
 * the same L:var).
 */
export class StandbyRadioNavigationManager implements Instrument {
  private readonly sub = this.bus.getSubscriber<KeypadEvents & RmpStateControllerEvents>();

  private readonly selected = Subject.create(false);

  private readonly rmpState = ConsumerSubject.create(this.sub.on('rmp_state'), RmpState.OffStandby);

  private readonly active = MappedSubject.create(
    ([selected, rmpState]) => isStandbyRadioNavigationActive(selected, rmpState),
    this.selected,
    this.rmpState,
  );

  constructor(
    private readonly bus: EventBus,
    private readonly rmpIndex: 1 | 2 | 3,
  ) {
    this.sub.on('keypad_system_key_pressed').handle((key) => {
      if (key === SystemKeys.StandbyRadNav) {
        this.selected.set(standbyRadioNavigationAfterKeyPress(this.rmpIndex, this.selected.get()));
      }
    });

    const pub = this.bus.getPublisher<StandbyRadioNavigationEvents>();
    this.active.sub((active) => {
      SimVar.SetSimVarValue(`L:A380X_RMP_${this.rmpIndex}_STBY_NAV`, SimVarValueType.Bool, active);
      pub.pub('rmp_stby_rad_nav_active', active, false, true);
    }, true);
  }

  /** @inheritdoc */
  init(): void {
    // noop
  }

  /** @inheritdoc */
  onUpdate(): void {
    // noop
  }
}
