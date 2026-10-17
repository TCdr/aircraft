// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { ElecNetworkState } from '../Logic/ElecBusAlerts';

/**
 * Reads the electrical network state that the ELEC bus alerts need (Logic/ElecBusAlerts) from the Rust electrical system
 * (A32NX_ELEC_{name}_BUS_IS_POWERED, A32NX_ELEC_CONTACTOR_{name}_IS_CLOSED,
 * A32NX_ELEC_{name}_POTENTIAL_NORMAL, A32NX_OVHD_ELEC_AC_ESS_FEED_PB_IS_NORMAL), and the overhead selectors used by the
 * ELEC procedure lines.
 */
export class ElecNetworkAcquisition {
  private readonly busPowered = (name: string) => RegisteredSimVar.createBoolean(`L:A32NX_ELEC_${name}_BUS_IS_POWERED`);

  private readonly contactorClosed = (name: string) =>
    RegisteredSimVar.createBoolean(`L:A32NX_ELEC_CONTACTOR_${name}_IS_CLOSED`);

  private readonly acBus1 = this.busPowered('AC_1');

  private readonly acBus2 = this.busPowered('AC_2');

  private readonly acEss = this.busPowered('AC_ESS');

  private readonly acEssShed = this.busPowered('AC_ESS_SHED');

  private readonly dcBus1 = this.busPowered('DC_1');

  private readonly dcBus2 = this.busPowered('DC_2');

  private readonly dcEss = this.busPowered('DC_ESS');

  private readonly dcEssShed = this.busPowered('DC_ESS_SHED');

  private readonly dcBat = this.busPowered('DC_BAT');

  /** AC ESS feed contactor between AC BUS 2 and AC ESS BUS */
  private readonly contactor3XC2 = this.contactorClosed('3XC2');

  /** Contactor between the static inverter and AC ESS BUS */
  private readonly contactor15XE2 = this.contactorClosed('15XE2');

  /** Contactor between battery 2 and the DC ESS BUS */
  private readonly contactor2XB2 = this.contactorClosed('2XB2');

  /** Engine generator line contactors 1 and 2, APU generator contactor */
  private readonly contactor9XU1 = this.contactorClosed('9XU1');

  private readonly contactor9XU2 = this.contactorClosed('9XU2');

  private readonly contactor3XS = this.contactorClosed('3XS');

  private readonly acEssFeedPbNormal = RegisteredSimVar.createBoolean('L:A32NX_OVHD_ELEC_AC_ESS_FEED_PB_IS_NORMAL');

  private readonly tr1PotentialNormal = RegisteredSimVar.createBoolean('L:A32NX_ELEC_TR_1_POTENTIAL_NORMAL');

  private readonly tr2PotentialNormal = RegisteredSimVar.createBoolean('L:A32NX_ELEC_TR_2_POTENTIAL_NORMAL');

  /** The VENT BLOWER and EXTRACT pb-sw: 1 = AUTO, 0 = OVRD (A320_NEO_INTERIOR.xml, the OVRD light is the inverse) */
  private readonly blowerPbAuto = RegisteredSimVar.createBoolean('L:A32NX_VENTILATION_BLOWER_TOGGLE');

  private readonly extractPbAuto = RegisteredSimVar.createBoolean('L:A32NX_VENTILATION_EXTRACT_TOGGLE');

  /** The GPWS SYS pb-sw is OFF */
  private readonly gpwsSysOffVar = RegisteredSimVar.createBoolean('L:A32NX_GPWS_SYS_OFF');

  /** @returns the electrical network now */
  public readNetwork(): ElecNetworkState {
    return {
      acBus1Powered: this.acBus1.get(),
      acBus2Powered: this.acBus2.get(),
      acEssBusPowered: this.acEss.get(),
      acEssShedBusPowered: this.acEssShed.get(),
      dcBus1Powered: this.dcBus1.get(),
      dcBus2Powered: this.dcBus2.get(),
      dcEssBusPowered: this.dcEss.get(),
      dcEssShedBusPowered: this.dcEssShed.get(),
      dcBatBusPowered: this.dcBat.get(),
      acEssFedByAcBus2: this.contactor3XC2.get(),
      acEssFeedPbNormal: this.acEssFeedPbNormal.get(),
      staticInverterSuppliesAcEss: this.contactor15XE2.get(),
      battery2SuppliesDcEss: this.contactor2XB2.get(),
      tr1PotentialNormal: this.tr1PotentialNormal.get(),
      tr2PotentialNormal: this.tr2PotentialNormal.get(),
    };
  }

  /** The VENT BLOWER pb-sw is at AUTO (not OVRD) */
  public get blowerAuto(): boolean {
    return this.blowerPbAuto.get();
  }

  /** The VENT EXTRACT pb-sw is at AUTO (not OVRD) */
  public get extractAuto(): boolean {
    return this.extractPbAuto.get();
  }

  public get gpwsSysOff(): boolean {
    return this.gpwsSysOffVar.get();
  }

  /** The APU generator is on line (3XS closed) */
  public get apuGenOnline(): boolean {
    return this.contactor3XS.get();
  }

  /** Only one of GEN 1, GEN 2 and APU GEN supplies the network (line contactors closed) */
  public get onlyOneGenOperating(): boolean {
    return (
      [this.contactor9XU1.get(), this.contactor9XU2.get(), this.contactor3XS.get()].filter((closed) => closed)
        .length === 1
    );
  }
}
