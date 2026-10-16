// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Register } from '@flybywiresim/fbw-sdk';
import { SimVarValueType } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { oilQuantityPulses, oilTemperatureClass } from '../../../instruments/src/SD/Pages/Engine/OilIndications';
import { vibrationClassName } from '../../../instruments/src/SD/Pages/Engine/elements/EngineVibration';
import { cabinVsPulses } from '@shared/CabinPressureIndications';

/*
 * ECAM advisories (A380 FCOM DSC-31-40-10 ADVISORY, a380_fcom.txt l.72199-72342):
 * l.72203-72206 "An advisory indicates that a monitored parameter from an aircraft system is going outside from its
 * normal operational range but has not reached a level that would trigger an alert. An advisory is triggered when the
 * affected parameter pulses in green on the applicable SD page."
 * l.72215-72229 "When there is an advisory condition for a system, the SD displays the applicable page, as follows:
 * - If the SD displays a flight phase page: If there is an advisory condition, the SD automatically displays the
 *   associated system display page, and the associated pushbutton on the ECP comes on.
 * - If the SD displays a page that has been manually selected by the flight crew, the associated pushbutton on the ECP
 *   flashes until the fight crew presses it.
 * - If the SD displays a system display page following an ECAM alert or following a flight crew manual selection, there
 *   is no indication on the EWD and on SD until the flight crew clears the procedure or the SD displays the system pages
 *   associated to the flight phase.
 * - If the EWD displays memos and/or limitations, an [ADV] indication appears, and pulses at the bottom right of the
 *   screen."
 * l.72237-72241 "The EWD no longer displays the [ADV] indication, when: The flight crew presses the associated pushbutton
 * on the ECP, or The parameter, source of the advisory indication, returns to its defined operational range."
 * l.72244 "Engines, pressurization, and APU systems have ECAM advisory conditions."
 *
 * The conditions are those for which the SD pages pulse (the same functions): ENGINE oil quantity, oil temperature and
 * rotor vibrations (l.72259-72278), CAB PRESS cabin vertical speed (l.72306-72312). Not done: the nacelle temperature,
 * the APU OIL LVL LO advisories, which the SD pages do not pulse yet, and the delta P and cabin altitude advisories, which
 * the CAB PRESS and CRUISE pages pulse (CabinPressureIndications) but which need the flight phase and a state here.
 */

/** The parameters of one engine for its advisories */
export interface EngineAdvisoryInputs {
  oilQuantityQt: number;
  /** L:A32NX_AUTOTHRUST_TLA:n, degrees (inhibits the oil quantity advisory at TOGA and in reverse) */
  thrustLeverAngle: number;
  /** L:A32NX_AUTOTHRUST_MODE (inhibits the oil quantity advisory at a FLEX takeoff, a go-around and in alpha floor) */
  autothrustMode: number;
  oilTemperatureCelsius: number;
  n1VibrationUnits: number;
  n2VibrationUnits: number;
  n3VibrationUnits: number;
}

/**
 * Whether an engine parameter pulses on the ENGINE page: oil quantity (l.72259-72267), oil temperature above 163 C
 * (l.72271-72272), rotor vibration above 5 units (l.72274-72277). The oil quantity limit is the 1.2 qt of the ENGINE page
 * (DSC-70-90, OilIndications); the advisory table says 4 quarts (l.72261)
 */
export function engineAdvisory(engine: EngineAdvisoryInputs): boolean {
  return (
    oilQuantityPulses(engine.oilQuantityQt, engine.thrustLeverAngle, engine.autothrustMode) ||
    oilTemperatureClass(engine.oilTemperatureCelsius) === 'FillPulse' ||
    [engine.n1VibrationUnits, engine.n2VibrationUnits, engine.n3VibrationUnits].some(
      (vibration) => vibrationClassName(vibration) === 'FillPulse',
    )
  );
}

/** The parameters of the advisories */
export interface AdvisoryInputs {
  engines: EngineAdvisoryInputs[];
  cabinVerticalSpeedFtMin: number;
}

/**
 * The SD pages that have an advisory condition, in the order of the FCOM table (engines, then pressurization)
 * @param inputs the monitored parameters
 */
export function advisoryPages(inputs: AdvisoryInputs): SdPages[] {
  const pages: SdPages[] = [];
  if (inputs.engines.some(engineAdvisory)) {
    pages.push(SdPages.Eng);
  }
  if (cabinVsPulses(inputs.cabinVerticalSpeedFtMin)) {
    pages.push(SdPages.Press);
  }
  return pages;
}

/** Half period of the flashing ECP pushbutton, ms. Design choice: 1 Hz, the FCOM gives no rate. */
const PB_FLASH_HALF_PERIOD_MS = 500;

/** What the SD shows, for the advisory display */
export interface AdvisorySdState {
  /** The page selected with the ECP (L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX), SdPages.None in flight phase mode */
  selectedPage: SdPages;
  /** The SD shows the page of an ECAM alert (L:A32NX_ECAM_SFAIL) */
  alertPageShown: boolean;
  /** The EWD shows memos and/or limitations (no procedure or checklist) */
  ewdShowsMemos: boolean;
  /** A running time, ms (flashing) */
  timeMs: number;
}

/** The outputs of the advisory display */
export interface AdvisoryDisplay {
  /** The page the SD shows automatically in flight phase mode, SdPages.None if none */
  automaticPage: SdPages;
  /** The ECP pushbutton the advisory lights at this time (steady or flashing), SdPages.None if none */
  litPushbutton: SdPages;
  /** The ADV indication of the EWD */
  ewdAdvIndication: boolean;
}

/** The ECAM advisory display: automatic page, ECP pushbutton light and EWD ADV indication (see the FCOM above) */
export class FwsAdvisoryDisplay {
  /** The advisory pages whose ECP pushbutton the crew has pressed, until the parameter is back in range */
  private readonly acknowledged = new Set<SdPages>();

  /**
   * @param pages the pages with an advisory condition (advisoryPages)
   * @param sd what the SD and the EWD show
   * @returns the advisory display
   */
  update(pages: readonly SdPages[], sd: AdvisorySdState): AdvisoryDisplay {
    // the parameter back in range: a new advisory of that page is shown again
    for (const page of Array.from(this.acknowledged)) {
      if (!pages.includes(page)) {
        this.acknowledged.delete(page);
      }
    }
    // the crew pressed the pushbutton of an advisory page: the page is selected
    if (pages.includes(sd.selectedPage)) {
      this.acknowledged.add(sd.selectedPage);
    }

    const none: AdvisoryDisplay = { automaticPage: SdPages.None, litPushbutton: SdPages.None, ewdAdvIndication: false };
    if (pages.length === 0 || sd.alertPageShown) {
      // l.72222-72224: no indication while the SD shows the page of an ECAM alert
      return none;
    }

    const unacknowledged = pages.filter((page) => !this.acknowledged.has(page));
    const ewdAdvIndication = sd.ewdShowsMemos && unacknowledged.length > 0;

    if (sd.selectedPage === SdPages.None) {
      // flight phase mode: the SD shows the advisory page and its pushbutton comes on
      return { automaticPage: pages[0], litPushbutton: pages[0], ewdAdvIndication };
    }

    // a page selected by the crew: the pushbutton of the advisory flashes until pressed
    const flashOn = Math.floor(sd.timeMs / PB_FLASH_HALF_PERIOD_MS) % 2 === 0;
    const flashing = unacknowledged.length > 0 && flashOn ? unacknowledged[0] : SdPages.None;
    return { automaticPage: SdPages.None, litPushbutton: flashing, ewdAdvIndication };
  }
}

/** Reads the monitored parameters of the advisories from the simvars (the same as the SD pages) */
export class FwsAdvisoryInputsReader {
  private readonly cabinVs = Arinc429Register.empty();

  read(): AdvisoryInputs {
    const engines: EngineAdvisoryInputs[] = [];
    for (let engine = 1; engine <= 4; engine++) {
      engines.push({
        oilQuantityQt: SimVar.GetSimVarValue(`L:A32NX_ENGINE_OIL_QTY:${engine}`, SimVarValueType.Number),
        thrustLeverAngle: SimVar.GetSimVarValue(`L:A32NX_AUTOTHRUST_TLA:${engine}`, SimVarValueType.Number),
        autothrustMode: SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_MODE', SimVarValueType.Enum),
        oilTemperatureCelsius: SimVar.GetSimVarValue(`GENERAL ENG OIL TEMPERATURE:${engine}`, 'celsius'),
        n1VibrationUnits: SimVar.GetSimVarValue(`L:A32NX_ENGINE_${engine}_N1_VIBRATION`, SimVarValueType.Number),
        n2VibrationUnits: SimVar.GetSimVarValue(`L:A32NX_ENGINE_${engine}_N2_VIBRATION`, SimVarValueType.Number),
        n3VibrationUnits: SimVar.GetSimVarValue(`L:A32NX_ENGINE_${engine}_N3_VIBRATION`, SimVarValueType.Number),
      });
    }
    // the CAB PRESS page: the cabin V/S of a pressure controller, else the manual one (CabinVerticalSpeed.tsx)
    let cabinVerticalSpeedFtMin = SimVar.GetSimVarValue('L:A32NX_PRESS_MAN_CABIN_VS', 'feet per minute');
    for (const system of [1, 2]) {
      this.cabinVs.setFromSimVar(`L:A32NX_PRESS_CABIN_VS_B${system}`);
      if (this.cabinVs.isNormalOperation()) {
        cabinVerticalSpeedFtMin = this.cabinVs.value;
        break;
      }
    }
    return { engines, cabinVerticalSpeedFtMin };
  }
}
