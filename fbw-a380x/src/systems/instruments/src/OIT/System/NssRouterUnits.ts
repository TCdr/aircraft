// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  ClockEvents,
  ConsumerSubject,
  EventBus,
  Instrument,
  SimVarValueType,
  Subject,
  Subscribable,
  Subscription,
} from '@microsoft/msfs-sdk';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { OitSimvars } from '../OitSimvarPublisher';
import { AnsuIndex, aruStartDurationMs, AruStartup, isAnsuPowered, sampleFrameStepMs } from './AnsuLogic';
import { readAnsuSupplies } from './AircraftNetworkServerUnit';
import { isAvncsRouterSupplied, isSiruSupplied, RouterSupplies, SupplyHoldUp } from './NssRouterLogic';

/** @returns the state of the busbars that supply the NSS AVNCS routers */
function readRouterSupplies(): RouterSupplies {
  const isPowered = (busbar: string) =>
    SimVar.GetSimVarValue(`L:A32NX_ELEC_${busbar}_BUS_IS_POWERED`, SimVarValueType.Bool) > 0;
  return {
    ac1: isPowered('AC_1'),
    ac2: isPowered('AC_2'),
    // The A380 busbar names come from the A320: AC_ESS is the A380 AC EMER (491XP)
    acEmer: isPowered('AC_ESS'),
    dc1: isPowered('DC_1'),
    dc2: isPowered('DC_2'),
  };
}

/** A supplied NSS unit: the supply held through a short loss, and cut by the NSS MASTER sw OFF */
abstract class SuppliedNssUnit implements Instrument {
  protected readonly subscriptions: Subscription[] = [];

  protected readonly sub = this.bus.getSubscriber<OitSimvars & ClockEvents>();

  protected readonly simTime = ConsumerSubject.create(this.sub.on('simTime'), 0);

  protected readonly nssMasterOff = ConsumerSubject.create(this.sub.on('nssMasterOff'), false);

  private readonly supplyHoldUp = new SupplyHoldUp();

  protected readonly _powered = Subject.create(false);
  /** The unit has its supply: the busbars, held through a short network transfer, and the NSS MASTER sw not OFF */
  public readonly powered = this._powered as Subscribable<boolean>;

  protected abstract readonly poweredSimVar: string;

  constructor(protected readonly bus: EventBus) {}

  /** @returns whether the busbars of the unit supply it now */
  protected abstract isSupplied(supplies: RouterSupplies): boolean;

  /** @returns whether the unit counts as supplied until its busbars report, see SupplyHoldUp.update */
  protected isSupplyAssumed(): boolean {
    return false;
  }

  /** @inheritdoc */
  init(): void {
    this.subscriptions.push(
      this.simTime,
      this.nssMasterOff,
      this._powered.sub((powered) => SimVar.SetSimVarValue(this.poweredSimVar, SimVarValueType.Bool, powered), true),
    );
  }

  /** @inheritdoc */
  onUpdate(): void {
    const held = this.supplyHoldUp.update(
      this.isSupplied(readRouterSupplies()),
      this.simTime.get(),
      this.isSupplyAssumed(),
    );
    this._powered.set(held && !this.nssMasterOff.get());
  }

  destroy(): void {
    for (const s of this.subscriptions) {
      s.destroy();
    }
  }
}

/**
 * An NSS AVNCS Aircraft Router Unit (ARU 1 or 2): it connects its ANSU to the NSS AVNCS side, and ARU 2 also holds the
 * one-way link to the FLT OPS network. It has no flyPad failure: it goes with its supply.
 *
 * Design choices (the supply and the wiring of the units are known, the effects of a failure are not):
 * - The start takes the time of the FLT OPS ARU (AruStartup), scaled with the self-test time setting.
 * - An ANSU serves the NSS AVNCS applications only while its own ARU operates (the figure links each ANSU to one ARU).
 */
export class AvncsRouterUnit extends SuppliedNssUnit {
  protected readonly poweredSimVar = `L:A32NX_NSS_ARU_${this.index}_IS_POWERED`;

  private readonly operatingSimVar = `L:A32NX_NSS_ARU_${this.index}_IS_OPERATING`;

  private readonly startup = new AruStartup(aruStartDurationMs(AvncsRouterUnit.selfTestTimeSetting()));

  private lastSimTimeMs: number | null = null;

  private wasPowered = false;

  private readonly _operating = Subject.create(false);
  /** The unit finished its start and routes */
  public readonly operating = this._operating as Subscribable<boolean>;

  constructor(
    bus: EventBus,
    private readonly index: AnsuIndex,
  ) {
    super(bus);
  }

  /** @returns the self-test time of the flyPad realism page, read as the OIT loading screens do */
  private static selfTestTimeSetting(): number {
    return parseInt(NXDataStore.getLegacy('CONFIG_SELF_TEST_TIME', '12'));
  }

  protected isSupplied(supplies: RouterSupplies): boolean {
    return isAvncsRouterSupplied(this.index, supplies);
  }

  /**
   * Until its busbars report, the router goes with its ANSU, as the FLT OPS ARU does: a flight loaded with the aircraft
   * powered has the ANSUs supplied at once but the busbars report late, and the router, which the ANSU needs to serve the
   * applications, must not make the NSS AVNCS wait for them.
   * @returns whether the ANSU of this router has its supply
   */
  protected isSupplyAssumed(): boolean {
    return isAnsuPowered('nss-avncs', this.index, readAnsuSupplies());
  }

  /** @inheritdoc */
  init(): void {
    super.init();
    this.subscriptions.push(
      this._operating.sub(
        (operating) => SimVar.SetSimVarValue(this.operatingSimVar, SimVarValueType.Bool, operating),
        true,
      ),
    );
  }

  /** @inheritdoc */
  onUpdate(): void {
    super.onUpdate();
    const powered = this._powered.get();
    if (powered && !this.wasPowered) {
      // the setting may have changed in the session: a start reads it again, as the loading screens do
      this.startup.setStartDurationMs(aruStartDurationMs(AvncsRouterUnit.selfTestTimeSetting()));
    }
    this.wasPowered = powered;

    const now = this.simTime.get();
    this._operating.set(this.startup.update(powered, sampleFrameStepMs(this.lastSimTimeMs, now)));
    this.lastSimTimeMs = now;
  }
}

/**
 * The Secure Interface Router Unit (SIRU): it links the PMAT plugs of the maintenance personnel to the NSS AVNCS
 * servers. The crew applications do not use it, and the PMAT is not simulated, so the unit only has its supply.
 */
export class SecureInterfaceRouterUnit extends SuppliedNssUnit {
  protected readonly poweredSimVar = 'L:A32NX_NSS_SIRU_IS_POWERED';

  protected isSupplied(supplies: RouterSupplies): boolean {
    return isSiruSupplied(supplies);
  }
}
