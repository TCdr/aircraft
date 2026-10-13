// @ts-strict-ignore
// Copyright (c) 2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ConsumerSubject,
  EventBus,
  GameStateProvider,
  Instrument,
  MappedSubject,
  SimVarValueType,
  Subject,
  Wait,
} from '@microsoft/msfs-sdk';
import { GroundSupportEvents, MsfsElectricsEvents, MsfsFlightModelEvents, MsfsMiscEvents } from '@flybywiresim/fbw-sdk';

/** Ground speed above which the external power is disconnected, as the aircraft is moving (knots) */
const GPU_DISCONNECT_GROUND_VELOCITY = 0.3;

/**
 * Whether the FBW external power (L:A32NX_EXT_PWR_AVAIL) must connect when the sim's own external power
 * (A:EXTERNAL POWER AVAILABLE, set by the sim's ground power unit or jetway, or by GSX 4) changes.
 * Only the moment the sim's power becomes available connects it, without waiting for the GPU door animation: a flight
 * crew who disconnected it with the flyPad GPU button while the sim's power stays available keeps it disconnected.
 * @param simExtPowerWasAvailable whether any sim external power was available before the change
 * @param simExtPowerIsAvailable whether any sim external power is available now
 * @param fbwExtPowerAvailable whether the FBW external power is already available
 * @param groundVelocityKnots the aircraft ground speed, in knots
 * @returns true when the FBW external power must be connected
 */
export function shouldConnectOnSimExtPowerChange(
  simExtPowerWasAvailable: boolean,
  simExtPowerIsAvailable: boolean,
  fbwExtPowerAvailable: boolean,
  groundVelocityKnots: number,
): boolean {
  const becameAvailable = !simExtPowerWasAvailable && simExtPowerIsAvailable;
  const aircraftStopped = groundVelocityKnots <= GPU_DISCONNECT_GROUND_VELOCITY;
  return becameAvailable && !fbwExtPowerAvailable && aircraftStopped;
}

/**
 * Whether the FBW external power must disconnect when the sim's own external power changes: when the sim's power goes
 * away (GSX GPU removed, jetway retracted, sim GPU disconnected), an external power that was connected from the sim's
 * power (when it became available, at a powered stand, or by the GPU door) goes with it. An external power connected
 * otherwise (e.g. by the GSX synchronization) stays.
 * @param simExtPowerWasAvailable whether any sim external power was available before the change
 * @param simExtPowerIsAvailable whether any sim external power is available now
 * @param fbwExtPowerAvailable whether the FBW external power is available
 * @param connectedBySimPower whether this FBW external power was connected from the sim's power or the GPU door
 * @returns true when the FBW external power must be disconnected
 */
export function shouldDisconnectOnSimExtPowerChange(
  simExtPowerWasAvailable: boolean,
  simExtPowerIsAvailable: boolean,
  fbwExtPowerAvailable: boolean,
  connectedBySimPower: boolean,
): boolean {
  const wentAway = simExtPowerWasAvailable && !simExtPowerIsAvailable;
  return wentAway && fbwExtPowerAvailable && connectedBySimPower;
}

export class GPUManagement implements Instrument {
  private readonly sub = this.bus.getSubscriber<
    MsfsElectricsEvents & MsfsFlightModelEvents & MsfsMiscEvents & GroundSupportEvents & GPUControlEvents
  >();

  private readonly gpuDoorOpenPercent = ConsumerSubject.create(
    this.sub.on(`msfs_interactive_point_open_${this.gpuDoorIndex}`),
    0,
  );
  private readonly gpuHookedUp = MappedSubject.create(
    ([gpuDoorOpenPercent]) => gpuDoorOpenPercent >= 1,
    this.gpuDoorOpenPercent,
  );

  private readonly groundVelocity = ConsumerSubject.create(this.sub.on('msfs_ground_velocity'), 0);

  private readonly isInAircraft = Subject.create(0);

  private readonly msfsExtPowerAvailStates = new Map<number, ConsumerSubject<boolean>>();

  private readonly ExtPowerAvailStates = new Map<number, ConsumerSubject<boolean>>();

  private readonly isIngame = MappedSubject.create(
    ([gameState, isInAircraft]) => gameState === GameState.ingame && isInAircraft === 1,
    GameStateProvider.get(),
    this.isInAircraft,
  );

  /** Whether any sim external power was available at the last check, to see it become available or go away */
  private simExtPowerWasAvailable = false;

  /**
   * Whether this class connected the FBW external power: always from the sim's power (powered stand, sim power
   * becoming available) or the GPU door, so it goes when the sim's power goes
   */
  private extPowerConnectedBySimPower = false;

  private initialIngameFrame: boolean;
  constructor(
    private readonly bus: EventBus,
    private readonly gpuDoorIndex: number,
    private readonly numberOfGPUs: number,
  ) {
    for (let index = 1; index <= numberOfGPUs; index++) {
      const element = ConsumerSubject.create(this.sub.on(`msfs_external_power_available_${index}`), false);
      this.msfsExtPowerAvailStates.set(index, element);
    }

    for (let index = 1; index <= numberOfGPUs; index++) {
      const element = ConsumerSubject.create(this.sub.on(`ext_pwr_avail_${index}`), false);
      this.ExtPowerAvailStates.set(index, element);
    }
  }

  public init(): void {
    Wait.awaitSubscribable(this.isIngame, (state) => state, true).then(() => {
      this.sub.on('gpu_toggle').handle(this.toggleGPU.bind(this));
      this.gpuHookedUp.sub((v) => this.setEXTpower(v));
      this.groundVelocity.sub((v) => {
        // disable ext power when aircraft starts moving
        if (v > GPU_DISCONNECT_GROUND_VELOCITY && this.anyGPUAvail()) {
          this.toggleGPU();
        }
      });
      // The sim's external power can become available after the flight is loaded (the sim's GPU or jetway, or
      // GSX 4 which sets A:EXTERNAL POWER AVAILABLE) without any GPU door animation: connect it then too
      this.simExtPowerWasAvailable = this.anyMSFSGPUAvail();
      for (const simExtPowerAvailable of this.msfsExtPowerAvailStates.values()) {
        simExtPowerAvailable.sub(this.onSimExtPowerChanged.bind(this));
      }
      this.initialIngameFrame = true;
    });
  }

  public onUpdate(): void {
    if (this.initialIngameFrame) {
      if (this.anyMSFSGPUAvail()) {
        this.setEXTpower(true);
      }
      this.initialIngameFrame = false;
    } else {
      this.isInAircraft.set(SimVar.GetSimVarValue('E:IS AIRCRAFT', 'enum'));
    }
  }

  private onSimExtPowerChanged(): void {
    const simExtPowerIsAvailable = this.anyMSFSGPUAvail();
    if (
      shouldConnectOnSimExtPowerChange(
        this.simExtPowerWasAvailable,
        simExtPowerIsAvailable,
        this.anyGPUAvail(),
        this.groundVelocity.get(),
      )
    ) {
      this.setEXTpower(true);
    } else if (
      shouldDisconnectOnSimExtPowerChange(
        this.simExtPowerWasAvailable,
        simExtPowerIsAvailable,
        this.anyGPUAvail(),
        this.extPowerConnectedBySimPower,
      )
    ) {
      this.setEXTpower(false);
    }
    this.simExtPowerWasAvailable = simExtPowerIsAvailable;
  }

  private toggleGPU(): void {
    if (!this.anyGPUAvail()) {
      if (this.anyMSFSGPUAvail()) {
        // if msfs ground power is avail we are at a powered stand
        this.setEXTpower(true);
      } else {
        this.toggleMSFSGpu(); // if msfs ground power is not avail we call for gpu cart
      }
    } else {
      if (this.gpuHookedUp.get()) {
        this.toggleMSFSGpu();
      } else {
        this.setEXTpower(false);
      }
    }
  }

  private toggleMSFSGpu(): void {
    SimVar.SetSimVarValue('K:REQUEST_POWER_SUPPLY', 'Bool', true);
  }

  private setEXTpower(connect: boolean): void {
    this.extPowerConnectedBySimPower = connect;
    for (let index = 1; index <= this.numberOfGPUs; index++) {
      SimVar.SetSimVarValue(`L:A32NX_EXT_PWR_AVAIL:${index}`, SimVarValueType.Bool, connect);
      if (!connect) {
        if (this.numberOfGPUs === 1) {
          // provision for the a32nx
          SimVar.SetSimVarValue(`L:A32NX_OVHD_ELEC_EXT_PWR_PB_IS_ON`, SimVarValueType.Bool, false);
        } else {
          SimVar.SetSimVarValue(`L:A32NX_OVHD_ELEC_EXT_PWR_${index}_PB_IS_ON`, SimVarValueType.Bool, false);
        }
      }
    }
  }

  private anyMSFSGPUAvail(): boolean {
    let state = false;
    for (let index = 1; index <= this.numberOfGPUs; index++) {
      state ||= this.msfsExtPowerAvailStates.get(index).get();
    }
    return state;
  }

  private anyGPUAvail(): boolean {
    let state = false;
    for (let index = 1; index <= this.numberOfGPUs; index++) {
      state ||= this.ExtPowerAvailStates.get(index).get();
    }
    return state;
  }
}

export interface GPUControlEvents {
  /** event to toggle the GPU*/
  gpu_toggle: unknown;
}
