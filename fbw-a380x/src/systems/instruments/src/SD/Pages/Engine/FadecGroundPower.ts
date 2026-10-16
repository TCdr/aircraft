// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The FADEC supply from the aircraft electrical network while the engine is not running, for the ENG SD page
 * (EngineParametersAvailability). A380 FCOM DSC-70-20-10 FADEC ELECTRICAL SUPPLY (a380_fcom.txt l.111401-111403): "The
 * aircraft electrical network supplies the FADEC for 15 min at aircraft power-up. The aircraft electrical network
 * supplies the FADEC for 10 min when the FADEC GND PWR pb is pressed." ENG FADEC GND PWR PANEL (l.112701-112704): "On
 * ground, the aircraft electrical network supplies the FADEC for 10 min, provided that: The ENG FIRE pb-sw is not
 * pressed, The FADEC is not self-powered." (the FIRE pb and the running engine stay in areEngineParametersShown).
 *
 * Design choices:
 * - Aircraft power-up is the AC bus of the engine becoming powered (L:A32NX_ELEC_AC_n_BUS_IS_POWERED).
 * - The FADEC GND PWR pb is a latched pb (L:A32NX_OVHD_FADEC_n): setting it ON starts the 10 min, setting it OFF ends
 *   them, pressing it OFF and ON again gives 10 more minutes.
 * - The times are absolute sim times (E:ABSOLUTE TIME), so that a timer keeps running while the ENG page is not shown
 *   (the React page is unmounted then). A power or pb change while the page is not shown is seen at the next update.
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

  /**
   * @param i the inputs
   * @returns whether the aircraft electrical network supplies the FADEC
   */
  public update(i: FadecGroundPowerInputs): boolean {
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
