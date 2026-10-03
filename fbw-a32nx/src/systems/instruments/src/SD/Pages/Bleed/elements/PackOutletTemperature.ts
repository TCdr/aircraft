// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The pack outlet temperature above which the BLEED page shows it amber, FCOM DSC-21-10-50 ECAM BLEED PAGE (1) */
const PACK_OUTLET_TEMPERATURE_AMBER_ABOVE_CELSIUS = 90;

/** The BLEED page pack outlet temperature: the value shown (in 5 °C steps) and whether it is amber */
export function packOutletTemperatureDisplay(outletTemperatureCelsius: number): { value: number; amber: boolean } {
  return {
    value: Math.round(outletTemperatureCelsius / 5) * 5,
    amber: outletTemperatureCelsius > PACK_OUTLET_TEMPERATURE_AMBER_ABOVE_CELSIUS,
  };
}
