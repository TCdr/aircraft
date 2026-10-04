// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The symbols of a wing tank pump on the SD FUEL page */
export enum WingPumpIndication {
  /** Inline - Green: pump pressure is normal (pump contactor on) */
  InlineGreen,
  /** "LO" - Amber: pump pressure is low (pump contactor on) */
  LoAmber,
  /** Crossline - Amber: pump contactor is off */
  CrosslineAmber,
}

/**
 * The wing tank pump symbol of the SD FUEL page, A320 FCOM DSC-28-20-F WING PUMP INDICATIONS (a320_fcom.txt l.43062).
 * @param pbOn whether the pump pb-sw is ON (pump contactor on)
 * @param lowPressure whether the pump delivery pressure is low with the pb-sw ON (L:A32NX_FUEL_PUMP_n_LO_PR)
 * @param busPowered whether the bus that the SD takes as the pump supply is powered: without it, the pump cannot run
 */
export function wingPumpIndication(pbOn: boolean, lowPressure: boolean, busPowered: boolean): WingPumpIndication {
  if (!pbOn) {
    return WingPumpIndication.CrosslineAmber;
  }
  return lowPressure || !busPowered ? WingPumpIndication.LoAmber : WingPumpIndication.InlineGreen;
}

/**
 * Whether the X FEED valve symbol of the SD FUEL page is green, A320 FCOM DSC-28-20-F X FEED INDICATIONS
 * (a320_fcom.txt l.43122):
 * - Inline - Green: The valve is open.
 * - Inline - Amber: The valve is open, with X Feed pb off.
 * - Crossline - Green: The valve is closed.
 * - Crossline - Amber: The valve is closed with X feed pb ON.
 * - Transit - Amber: The valve is in transit.
 * @param openPercentage the valve position, 0 (closed) to 100 (open)
 * @param pbOn whether the X FEED pb-sw is ON (L:A32NX_OVHD_FUEL_XFEED_PB_IS_ON)
 * @returns true for green, false for amber
 */
export function isCrossFeedValveGreen(openPercentage: number, pbOn: boolean): boolean {
  return pbOn ? openPercentage >= 100 : openPercentage <= 0;
}
