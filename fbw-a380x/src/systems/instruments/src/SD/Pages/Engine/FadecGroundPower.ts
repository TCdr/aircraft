// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The ground timers of the FADEC supply from the aircraft electrical network, for the FADEC supply model of the systems
 * WASM (a380_systems fadec_power.rs, which writes L:A32NX_FADEC_POWERED_ENGn for the ENG SD page). A380 FCOM
 * DSC-70-20-10 FADEC ELECTRICAL SUPPLY (a380_fcom.txt l.111401-111403): "The aircraft electrical network supplies the
 * FADEC for 15 min at aircraft power-up. The aircraft electrical network supplies the FADEC for 10 min when the FADEC
 * GND PWR pb is pressed." ENG FADEC GND PWR PANEL (l.112701-112704): "On ground, the aircraft electrical network
 * supplies the FADEC for 10 min, provided that: The ENG FIRE pb-sw is not pressed, The FADEC is not self-powered." (the
 * FIRE pb and the FADEC alternator are in the systems WASM).
 *
 * Design choices:
 * - Aircraft power-up is the AC bus of the engine becoming powered (L:A32NX_ELEC_AC_n_BUS_IS_POWERED).
 * - The FADEC GND PWR pb is a latched pb (L:A32NX_OVHD_FADEC_n): setting it ON starts the 10 min, setting it OFF ends
 *   them, pressing it OFF and ON again gives 10 more minutes.
 * - Each FADEC has its own power-up: the FCOM does not name the bus, and the FADECs have their own EIPMs ("There is
 *   one EIPM for two engines", l.111399, ENG 1(2)(3)(4) EIPM 1(2) reset), so a bus powered later (AC 3 + AC 4 from the
 *   APU GEN after AC 1 + AC 2 from EXT PWR 1) starts the 15 min of its FADECs later.
 * - The timers follow the real power-up and pb times whatever SD page is shown: the SD instrument loop (SD/index.tsx)
 *   samples the AC buses, the pbs and the sim time with updateFadecGroundPowerSupplies, also while the ENG page (a React
 *   page, unmounted while another page is shown) is not shown, and writes the result for the systems WASM with
 *   writeFadecGroundPowerSupplies (L:A32NX_ENGINE_n_FADEC_GND_SUPPLY). The times are absolute sim times
 *   (E:ABSOLUTE TIME).
 */

/** l.111401: 15 min at aircraft power-up */
export const FADEC_POWER_UP_SUPPLY_S = 15 * 60;
/** l.111402, l.112701: 10 min after the FADEC GND PWR pb */
export const FADEC_GND_PWR_PB_SUPPLY_S = 10 * 60;

export interface FadecGroundPowerInputs {
  /** absolute sim time, seconds */
  nowS: number;
  /** the AC bus of the engine is powered */
  aircraftPowered: boolean;
  /** the FADEC GND PWR pb of the engine is ON */
  groundPowerPbOn: boolean;
  onGround: boolean;
}

/** The supply timers of one FADEC */
export class FadecGroundPowerSupply {
  private wasPowered = false;

  private pbWasOn = false;

  /** sim time of the aircraft power-up, null when unpowered */
  private powerUpTimeS: number | null = null;

  /** sim time the FADEC GND PWR pb was set ON on ground, null when OFF or set ON in flight */
  private pbOnTimeS: number | null = null;

  private supplied = false;

  /** Whether the aircraft electrical network supplies the FADEC, as of the last update */
  public get isSupplied(): boolean {
    return this.supplied;
  }

  /**
   * @param i the inputs
   * @returns whether the aircraft electrical network supplies the FADEC
   */
  public update(i: FadecGroundPowerInputs): boolean {
    this.supplied = this.computeSupply(i);
    return this.supplied;
  }

  private computeSupply(i: FadecGroundPowerInputs): boolean {
    if (!(i.nowS > 0)) {
      // no sim time yet (instrument start): the power-up is taken at the first valid time
      return i.aircraftPowered;
    }
    if (!i.aircraftPowered) {
      this.powerUpTimeS = null;
    } else if (!this.wasPowered) {
      this.powerUpTimeS = i.nowS;
    }
    if (!i.groundPowerPbOn) {
      this.pbOnTimeS = null;
    } else if (!this.pbWasOn) {
      this.pbOnTimeS = i.onGround ? i.nowS : null;
    }
    this.wasPowered = i.aircraftPowered;
    this.pbWasOn = i.groundPowerPbOn;

    if (!i.aircraftPowered) {
      return false;
    }
    const powerUpSupply = this.isRunning(this.powerUpTimeS, FADEC_POWER_UP_SUPPLY_S, i.nowS);
    const pbSupply = i.onGround && this.isRunning(this.pbOnTimeS, FADEC_GND_PWR_PB_SUPPLY_S, i.nowS);
    return powerUpSupply || pbSupply;
  }

  /** Whether a timer started at startS still runs (a sim time set back counts from the start) */
  private isRunning(startS: number | null, durationS: number, nowS: number): boolean {
    if (startS === null) {
      return false;
    }
    return Math.max(0, nowS - startS) < durationS;
  }
}

/**
 * The timers of the four FADECs, kept outside the React page so that they survive the page changes of the SD
 * (index 0 = engine 1)
 */
export const fadecGroundPowerSupplies = [1, 2, 3, 4].map(() => new FadecGroundPowerSupply());

/** How often the SD instrument loop samples the AC buses, the FADEC GND PWR pbs and the sim time (real time, ms) */
export const FADEC_SUPPLY_SAMPLE_INTERVAL_MS = 500;

/**
 * Updates the timers of the four FADECs from the SimVars. Called by the SD instrument loop whatever page is shown, so
 * that a power-up or a pb press while another page is shown counts from its real time.
 * @param read reads one SimVar as a number (SimVar.GetSimVarValue(name, unit) in the sim); the Bool vars read 1,
 *   compared with > 0
 * @param supplies the timers to update, engine 1 first
 */
export function updateFadecGroundPowerSupplies(
  read: (name: string, unit: string) => number,
  supplies: FadecGroundPowerSupply[] = fadecGroundPowerSupplies,
): void {
  const nowS = read('E:ABSOLUTE TIME', 'seconds');
  const onGround = read('SIM ON GROUND', 'bool') > 0;
  supplies.forEach((supply, index) => {
    const engine = index + 1;
    supply.update({
      nowS,
      aircraftPowered: read(`L:A32NX_ELEC_AC_${engine}_BUS_IS_POWERED`, 'bool') > 0,
      groundPowerPbOn: read(`L:A32NX_OVHD_FADEC_${engine}`, 'bool') > 0,
      onGround,
    });
  });
}

/**
 * Writes whether each timer runs, for the FADEC supply model of the systems WASM.
 * @param write sets one Bool L:var (SimVar.SetSimVarValue in the sim)
 * @param supplies the timers to write, engine 1 first
 */
export function writeFadecGroundPowerSupplies(
  write: (name: string, value: boolean) => void,
  supplies: FadecGroundPowerSupply[] = fadecGroundPowerSupplies,
): void {
  supplies.forEach((supply, index) => write(`L:A32NX_ENGINE_${index + 1}_FADEC_GND_SUPPLY`, supply.isSupplied));
}
