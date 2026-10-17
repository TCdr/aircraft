// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SdPages } from '../../../shared/src/SdPages';
import {
  oilPressurePulses,
  oilQuantityPulses,
  oilTemperatureAdvisorySeconds,
  oilTemperatureAdvisoryTimeExceeded,
  oilTemperatureClassName,
} from '../../../instruments/src/SD/Pages/Eng/EngOilIndications';
import {
  N1_VIBRATION_ADVISORY_UNITS,
  N2_VIBRATION_ADVISORY_UNITS,
  vibrationClassName,
} from '../../../instruments/src/SD/Pages/Eng/EngVibration';
import { idgTemperatureState } from '../../../instruments/src/SD/Pages/Elec/IdgIndications';
import { deltaPPulses } from '../../../instruments/src/SD/Pages/Crz/DeltaPIndication';
import { cabinAltitudePulses, cabinVsPulses } from '../../../instruments/src/SD/Pages/Press/PressIndications';

/*
 * The ECAM advisories of the A320: when a system parameter drifts out of its normal range, the relevant system page is
 * called on the SD and the value pulses green as long as it is out of its limits. Some advisories are inhibited in some
 * flight phases. The advisory conditions, in this order: APU (EGT > EGT MAX -33 C inhibited during the APU start; FLAP
 * OPEN; OIL QTY), CAB PR (V/S > 1 800 ft/min, CAB ALT >= 8 800 ft, delta P >= 1.5 PSI in phase 7), ELEC (IDG OIL TEMP
 * >= 147 C), ENG (oil pressure, oil temperature, oil quantity, nacelle temperature, vibrations), FUEL (wing imbalance
 * > 1 500 kg, fuel temperatures), OXY (CKPT OXY < 600 PSI).
 *
 * The conditions are those for which the SD pages pulse, with the same functions (EngOilIndications, EngVibration,
 * IdgIndications, DeltaPIndication, PressIndications), so that the page called shows the pulsing value. The aircraft has
 * no flight phase list for the advisory mode as a whole: only the advisories that name their phases are inhibited.
 * Not done: APU OIL QTY (LOW OIL LEVEL) and the ENG nacelle temperature (no data), the fuel temperatures (no fuel
 * temperature model), CKPT OXY (the DOOR/OXY page does not pulse it).
 */

/** APU advisory: the flap is not fully closed 3 min after the MASTER sw has been turned OFF */
export const APU_FLAP_OPEN_ADVISORY_SECONDS = 180;

/** FUEL advisory: in flight phases 2 and 6, the difference between the fuel quantities in the two wings is above
 * 1 500 kg */
const FUEL_IMBALANCE_ADVISORY_KG = 1500;
const FUEL_IMBALANCE_ADVISORY_PHASES = [2, 6];

/** The parameters of one engine, as the ENGINE page reads them */
export interface EngineAdvisoryInputs {
  /** The ENGINE page shows XX without FADEC power: nothing pulses */
  fadecPowered: boolean;
  oilPressurePsi: number;
  n2Percent: number;
  oilQuantityQt: number;
  oilTemperatureCelsius: number;
  n1VibrationUnits: number;
  n2VibrationUnits: number;
}

/** The monitored parameters */
export interface SdAdvisoryInputs {
  fwcFlightPhase: number;
  engines: EngineAdvisoryInputs[];
  idgOilTemperaturesCelsius: number[];
  cabinAltitudeFt: number;
  cabinVsFtMin: number;
  cabinDeltaPsi: number;
  leftWingFuelKg: number;
  rightWingFuelKg: number;
  /** null when the ECB sends no EGT */
  apuEgtCelsius: number | null;
  /** EGT MAX -33 C from the ECB (L:A32NX_APU_EGT_CAUTION, the amber limit of the APU page), null when not sent */
  apuEgtCautionCelsius: number | null;
  apuStarting: boolean;
  apuFlapNotClosed: boolean;
  apuMasterOn: boolean;
}

/** The order of the advisory list: the first page of a new advisory */
const PAGE_ORDER: readonly SdPages[] = [SdPages.APU, SdPages.PRESS, SdPages.ELEC, SdPages.ENG, SdPages.FUEL];

/** The pulsing state of one engine's values (the SD page hystereses) */
class EngineAdvisoryState {
  private oilQuantityPulsing = false;

  private oilPressurePulsing = false;

  private oilTemperatureSeconds = 0;

  /**
   * @param engine the engine parameters
   * @param deltaSeconds the time since the previous update, s
   * @returns whether a value of the engine pulses
   */
  update(engine: EngineAdvisoryInputs, deltaSeconds: number): boolean {
    this.oilQuantityPulsing = oilQuantityPulses(this.oilQuantityPulsing, engine.oilQuantityQt);
    this.oilPressurePulsing = oilPressurePulses(this.oilPressurePulsing, engine.oilPressurePsi, engine.n2Percent);
    this.oilTemperatureSeconds = oilTemperatureAdvisorySeconds(
      this.oilTemperatureSeconds,
      engine.oilTemperatureCelsius,
      deltaSeconds,
    );
    if (!engine.fadecPowered) {
      return false;
    }
    const oilTemperaturePulses =
      oilTemperatureClassName(
        Math.round(engine.oilTemperatureCelsius / 5) * 5,
        engine.oilTemperatureCelsius,
        oilTemperatureAdvisoryTimeExceeded(this.oilTemperatureSeconds),
      ) === 'FillPulse';
    return (
      this.oilQuantityPulsing ||
      this.oilPressurePulsing ||
      oilTemperaturePulses ||
      vibrationClassName(engine.n1VibrationUnits, N1_VIBRATION_ADVISORY_UNITS) === 'FillPulse' ||
      vibrationClassName(engine.n2VibrationUnits, N2_VIBRATION_ADVISORY_UNITS) === 'FillPulse'
    );
  }
}

/** Which system page has an advisory: the page the DMC calls (DmcSdPageLogic, SdAdvisoryMode) */
export class SdAdvisoryMonitor {
  private readonly engines = [new EngineAdvisoryState(), new EngineAdvisoryState()];

  private cabinAltitudePulsing = false;

  private cabinVsPulsing = false;

  private deltaPPulsing = false;

  private apuFlapOpenSeconds = 0;

  private advisoryPage = SdPages.NONE;

  /**
   * @param inputs the monitored parameters
   * @param deltaSeconds the time since the previous update, s
   * @returns the advisory page, SdPages.NONE when no parameter is out of its normal range. The page called stays while
   * its advisory lasts; else the first page in the advisory list order.
   */
  update(inputs: SdAdvisoryInputs, deltaSeconds: number): SdPages {
    const pages = new Set<SdPages>();

    // APU
    this.apuFlapOpenSeconds =
      inputs.apuFlapNotClosed && !inputs.apuMasterOn ? this.apuFlapOpenSeconds + deltaSeconds : 0;
    const apuEgtHigh =
      inputs.apuEgtCelsius !== null &&
      inputs.apuEgtCautionCelsius !== null &&
      !inputs.apuStarting &&
      inputs.apuEgtCelsius > inputs.apuEgtCautionCelsius;
    if (apuEgtHigh || this.apuFlapOpenSeconds >= APU_FLAP_OPEN_ADVISORY_SECONDS) {
      pages.add(SdPages.APU);
    }

    // CAB PR, on the displayed values (50 ft and 50 ft/min steps), as the CRUISE and CAB PRESS pages
    this.cabinAltitudePulsing = cabinAltitudePulses(
      Math.round(inputs.cabinAltitudeFt / 50) * 50,
      this.cabinAltitudePulsing,
    );
    this.cabinVsPulsing = cabinVsPulses(Math.round(inputs.cabinVsFtMin / 50) * 50, this.cabinVsPulsing);
    this.deltaPPulsing = deltaPPulses(inputs.cabinDeltaPsi, inputs.fwcFlightPhase, this.deltaPPulsing);
    if (this.cabinAltitudePulsing || this.cabinVsPulsing || this.deltaPPulsing) {
      pages.add(SdPages.PRESS);
    }

    // ELEC
    if (inputs.idgOilTemperaturesCelsius.some((t) => idgTemperatureState(t) === 'advisory')) {
      pages.add(SdPages.ELEC);
    }

    // ENG (each engine keeps its hystereses, also when another one pulses)
    const enginePulses = inputs.engines.map((engine, index) => this.engines[index].update(engine, deltaSeconds));
    if (enginePulses.some((pulses) => pulses)) {
      pages.add(SdPages.ENG);
    }

    // FUEL
    if (
      FUEL_IMBALANCE_ADVISORY_PHASES.includes(inputs.fwcFlightPhase) &&
      Math.abs(inputs.leftWingFuelKg - inputs.rightWingFuelKg) > FUEL_IMBALANCE_ADVISORY_KG
    ) {
      pages.add(SdPages.FUEL);
    }

    if (!pages.has(this.advisoryPage)) {
      this.advisoryPage = PAGE_ORDER.find((page) => pages.has(page)) ?? SdPages.NONE;
    }
    return this.advisoryPage;
  }
}
