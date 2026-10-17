// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, NO_STATUS, cautionItem } from './FwcAlertItem';

/*
 * The DOOR cautions of the A320: a cabin door (emergency exit, cargo door) not detected closed by the proximity
 * sensors.
 * - In flight: IF ABN CAB V/S: MAX FL 100/MEA-MORA, and the same in the STATUS.
 * - On ground: crew awareness, title only.
 * Shown in flight phases 2, 3, 6 and 9 (the same for every door and both variants).
 * The doors of the sim: the four passenger/service doors (MSFS interactive points 0 L FWD, 1 R FWD, 2 L AFT, 3 R AFT),
 * the overwing emergency exits (points 6 L, 7 R; the A320 ECAM has one EMER EXIT title per side) and the two cargo doors
 * (their lock, L:A32NX_FWD(AFT)_DOOR_CARGO_LOCKED, from the Rust cargo door). The avionics doors (DOOR L(R)(FWD)(AFT)
 * AVIONICS) are not in the sim.
 */

export const DOOR_PHASE_INHIBITION = [1, 4, 5, 7, 8, 10];

/** The doors with a caution, in the order of their EwdMessages codes (keys 5200101 to 5200108) */
export const DoorAlertKeys = {
  leftForwardCabin: '5200101',
  rightForwardCabin: '5200102',
  leftAftCabin: '5200103',
  rightAftCabin: '5200104',
  leftEmergencyExit: '5200105',
  rightEmergencyExit: '5200106',
  forwardCargo: '5200107',
  aftCargo: '5200108',
} as const;

export type DoorAlertKey = (typeof DoorAlertKeys)[keyof typeof DoorAlertKeys];

const DOOR_KEYS: readonly DoorAlertKey[] = [
  DoorAlertKeys.leftForwardCabin,
  DoorAlertKeys.rightForwardCabin,
  DoorAlertKeys.leftAftCabin,
  DoorAlertKeys.rightAftCabin,
  DoorAlertKeys.leftEmergencyExit,
  DoorAlertKeys.rightEmergencyExit,
  DoorAlertKeys.forwardCargo,
  DoorAlertKeys.aftCargo,
];

/** Each door: true when it is not closed */
export type DoorsNotClosed = Readonly<Record<DoorAlertKey, boolean>>;

/** A cabin door or emergency exit is not detected closed: its MSFS interactive point is open at all */
export function isInteractivePointNotClosed(openPercent: number): boolean {
  return openPercent > 0;
}

/**
 * The lines of a DOOR caution: 0 title; in flight 1 .IF ABN CAB V/S:, 2 MAX FL 100/MEA-MORA
 * @param inFlight the aircraft is in flight (the in flight variant of the caution)
 */
function doorAlertLines(inFlight: boolean): (number | null)[] {
  return [0, inFlight ? 1 : null, inFlight ? 2 : null];
}

/** The STATUS codes of the DOOR cautions (StatusMessages): IF ABN CAB V/S: then MAX FL 100/MEA-MORA */
const DoorStatusCodes = {
  ifAbnormalCabinVs: '520500001',
  maxFl100: '520400001',
} as const;

/** The STATUS of a DOOR caution in flight: IF ABN CAB V/S: MAX FL 100/MEA-MORA */
function doorAlertStatus(inFlight: boolean): StatusLines {
  return inFlight ? { left: [DoorStatusCodes.ifAbnormalCabinVs, DoorStatusCodes.maxFl100], inopSys: [] } : NO_STATUS();
}

export class DoorAlerts {
  private inFlight = false;

  private readonly notClosed = DOOR_KEYS.reduce(
    (subjects, key) => {
      subjects[key] = Subject.create(false);
      return subjects;
    },
    {} as Record<DoorAlertKey, Subject<boolean>>,
  );

  /**
   * @param doors which doors are not closed
   * @param onGround the aircraft is on ground (the ground variant of the cautions)
   */
  update(doors: DoorsNotClosed, onGround: boolean): void {
    this.inFlight = !onGround;
    for (const key of DOOR_KEYS) {
      this.notClosed[key].set(doors[key]);
    }
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = DOOR_KEYS.reduce(
    (items, key) => {
      items[key] = cautionItem(
        key,
        3,
        this.notClosed[key],
        DOOR_PHASE_INHIBITION,
        () => doorAlertLines(this.inFlight),
        EcamSysPage.DOOR,
        () => doorAlertStatus(this.inFlight),
      );
      return items;
    },
    {} as Record<string, FwcAlertItem>,
  );
}

/* Acquisition (not unit tested: SimVar reads only) */

export function readDoorsNotClosed(): DoorsNotClosed {
  const point = (index: number) =>
    isInteractivePointNotClosed(SimVar.GetSimVarValue(`INTERACTIVE POINT OPEN:${index}`, 'percent'));
  return {
    [DoorAlertKeys.leftForwardCabin]: point(0),
    [DoorAlertKeys.rightForwardCabin]: point(1),
    [DoorAlertKeys.leftAftCabin]: point(2),
    [DoorAlertKeys.rightAftCabin]: point(3),
    [DoorAlertKeys.leftEmergencyExit]: point(6),
    [DoorAlertKeys.rightEmergencyExit]: point(7),
    [DoorAlertKeys.forwardCargo]: !SimVar.GetSimVarValue('L:A32NX_FWD_DOOR_CARGO_LOCKED', 'bool'),
    [DoorAlertKeys.aftCargo]: !SimVar.GetSimVarValue('L:A32NX_AFT_DOOR_CARGO_LOCKED', 'bool'),
  } as DoorsNotClosed;
}
