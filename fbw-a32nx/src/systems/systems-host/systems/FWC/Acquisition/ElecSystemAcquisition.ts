// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { ElecSystemInputs } from '../Logic/ElecSystemAlerts';

/**
 * Reads the electrical system state that the ELEC system alerts need (Logic/ElecSystemAlerts) from the Rust electrical
 * system: the battery charge limiters, the IDG oil of each engine generator, the
 * generator loads and the static inverter fault.
 */
export class ElecSystemAcquisition {
  private readonly bool = (name: string) => RegisteredSimVar.createBoolean(`L:A32NX_${name}`);

  private readonly pair = (name: (n: number) => string) => [this.bool(name(1)), this.bool(name(2))] as const;

  private readonly bclBatteryFault = this.pair((n) => `ELEC_BCL_${n}_BAT_FAULT`);

  private readonly bclFault = this.pair((n) => `ELEC_BCL_${n}_FAULT`);

  private readonly idgConnected = this.pair((n) => `ELEC_ENG_GEN_${n}_IDG_IS_CONNECTED`);

  private readonly idgOilLowPressure = this.pair((n) => `ELEC_ENG_GEN_${n}_IDG_OIL_LOW_PRESSURE`);

  private readonly idgOilOutletTemperature = [1, 2].map((n) =>
    RegisteredSimVar.create<number>(`L:A32NX_ELEC_ENG_GEN_${n}_IDG_OIL_OUTLET_TEMPERATURE`, 'celsius'),
  );

  private readonly engineGeneratorLoadNormal = this.pair((n) => `ELEC_ENG_GEN_${n}_LOAD_NORMAL`);

  private readonly engineGeneratorLineContactorClosed = this.pair((n) => `ELEC_CONTACTOR_9XU${n}_IS_CLOSED`);

  private readonly apuGeneratorLoadNormal = this.bool('ELEC_APU_GEN_1_LOAD_NORMAL');

  private readonly apuGeneratorContactorClosed = this.bool('ELEC_CONTACTOR_3XS_IS_CLOSED');

  private readonly staticInverterFault = this.bool('ELEC_STAT_INV_FAULT');

  /** The APU generator supplies the network (its line contactor is closed) */
  public get apuGenOnline(): boolean {
    return this.apuGeneratorContactorClosed.get();
  }

  public read(): ElecSystemInputs {
    const both = (vars: readonly [RegisteredSimVar<boolean>, RegisteredSimVar<boolean>]) =>
      [vars[0].get(), vars[1].get()] as const;
    return {
      bclBatteryFault: both(this.bclBatteryFault),
      bclFault: both(this.bclFault),
      idgConnected: both(this.idgConnected),
      idgOilLowPressure: both(this.idgOilLowPressure),
      idgOilOutletTemperature: [this.idgOilOutletTemperature[0].get(), this.idgOilOutletTemperature[1].get()],
      engineGeneratorLoadNormal: both(this.engineGeneratorLoadNormal),
      engineGeneratorLineContactorClosed: both(this.engineGeneratorLineContactorClosed),
      apuGeneratorLoadNormal: this.apuGeneratorLoadNormal.get(),
      apuGeneratorContactorClosed: this.apuGeneratorContactorClosed.get(),
      staticInverterFault: this.staticInverterFault.get(),
    };
  }
}
