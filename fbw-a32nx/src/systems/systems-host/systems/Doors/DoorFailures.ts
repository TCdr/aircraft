// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SensedDoor, doorProximitySensorFaultVar } from '@shared/DoorProximitySensors';

/** The part of the failures consumer this system uses. */
export type DoorFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** A failure and the L:var that publishes it */
interface PublishedFailure {
  failure: number;
  faultVar: string;
  published: boolean | undefined;
}

/** The proximity sensor failure of each door */
const DOOR_SENSOR_FAILURES: [SensedDoor, number][] = [
  ['L_FWD_CABIN', A320Failure.LeftForwardCabinDoorProximitySensor],
  ['R_FWD_CABIN', A320Failure.RightForwardCabinDoorProximitySensor],
  ['L_AFT_CABIN', A320Failure.LeftAftCabinDoorProximitySensor],
  ['R_AFT_CABIN', A320Failure.RightAftCabinDoorProximitySensor],
  ['L_EMER_EXIT', A320Failure.LeftEmergencyExitProximitySensor],
  ['R_EMER_EXIT', A320Failure.RightEmergencyExitProximitySensor],
  ['FWD_CARGO', A320Failure.ForwardCargoDoorProximitySensor],
  ['AFT_CARGO', A320Failure.AftCargoDoorProximitySensor],
];

/** The CDLS parts with a status light on the CKPT DOOR CONT overhead panel */
const CDLS_STATUS_LIGHT_FAILURES: [number, string][] = [
  [A320Failure.CockpitDoorUpperLatch, 'L:A32NX_CDLS_UPPER_LATCH_FAULT'],
  [A320Failure.CockpitDoorMidLatch, 'L:A32NX_CDLS_MID_LATCH_FAULT'],
  [A320Failure.CockpitDoorLowerLatch, 'L:A32NX_CDLS_LOWER_LATCH_FAULT'],
  [A320Failure.CockpitDoorPressureSensor1, 'L:A32NX_CDLS_PRESSURE_SENSOR_1_FAULT'],
  [A320Failure.CockpitDoorPressureSensor2, 'L:A32NX_CDLS_PRESSURE_SENSOR_2_FAULT'],
];

const CDLS_FAULT_VAR = 'L:A32NX_CDLS_FAULT';

/**
 * Publishes the ATA 52 door failures of the A32NX for the model behaviours and the instruments:
 * - Door proximity sensors: L:A32NX_DOOR_{door}_PROX_SENSOR_FAULT, read by the DOOR cautions (FWC/Logic/DoorAlerts.ts)
 *   and the SD DOOR/OXY page through @shared/DoorProximitySensors: a failed sensor no longer detects its door closed
 *   (the door is not detected closed by the proximity sensors).
 * - Cockpit door locking system (CDLS): the strike (upper, mid, lower latch) and pressure sensor (CHAN 1, 2) status
 *   lights of the CKPT DOOR CONT overhead panel, each on when its part is faulty; the pedestal COCKPIT DOOR FAULT light
 *   comes on when a system failure is identified (latch, pressure sensors, control unit) (L:A32NX_CDLS_FAULT).
 * Design choice: the failures only light the indications; the door itself has no latch or decompression model in the
 * sim (the pedestal COCKPIT DOOR switch opens and closes it, L:A32NX_COCKPIT_DOOR_LOCKED).
 */
export class DoorFailures implements Instrument {
  private readonly doorSensors: PublishedFailure[] = DOOR_SENSOR_FAILURES.map(([door, failure]) => ({
    failure,
    faultVar: doorProximitySensorFaultVar(door),
    published: undefined,
  }));

  private readonly cdlsStatusLights: PublishedFailure[] = CDLS_STATUS_LIGHT_FAILURES.map(([failure, faultVar]) => ({
    failure,
    faultVar,
    published: undefined,
  }));

  private cdlsFaultPublished: boolean | undefined = undefined;

  /** @param failuresConsumer The failures consumer. */
  constructor(private readonly failuresConsumer: DoorFailuresSource = new FailuresConsumer()) {}

  /** @inheritdoc */
  public init(): void {
    for (const published of [...this.doorSensors, ...this.cdlsStatusLights]) {
      this.failuresConsumer.register(published.failure);
    }
    this.failuresConsumer.register(A320Failure.CockpitDoorControlUnit);
  }

  /** @inheritdoc */
  public onUpdate(): void {
    this.failuresConsumer.update();

    for (const published of [...this.doorSensors, ...this.cdlsStatusLights]) {
      this.publish(published, this.failuresConsumer.isActive(published.failure));
    }

    const cdlsFault =
      this.cdlsStatusLights.some((light) => light.published === true) ||
      this.failuresConsumer.isActive(A320Failure.CockpitDoorControlUnit);
    if (cdlsFault !== this.cdlsFaultPublished) {
      this.cdlsFaultPublished = cdlsFault;
      SimVar.SetSimVarValue(CDLS_FAULT_VAR, 'bool', cdlsFault);
    }
  }

  /** Writes the L:var of a failure when it changes */
  private publish(published: PublishedFailure, active: boolean): void {
    if (active !== published.published) {
      published.published = active;
      SimVar.SetSimVarValue(published.faultVar, 'bool', active);
    }
  }
}
