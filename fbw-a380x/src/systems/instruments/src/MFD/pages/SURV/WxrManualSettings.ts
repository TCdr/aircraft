// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Value of the WXR manual settings L:vars (L:A380X_WXR_GAIN, _TILT, _ELEVN) while nothing is entered */
export const WXR_NO_ENTRY = -9999;

/** The manual radar settings of the SURV/CONTROLS page, and the L:var of each */
export const WXR_MANUAL_SETTING_VARS = {
  gain: 'L:A380X_WXR_GAIN',
  tilt: 'L:A380X_WXR_TILT',
  elevn: 'L:A380X_WXR_ELEVN',
} as const;

export type WxrManualSetting = keyof typeof WXR_MANUAL_SETTING_VARS;

/**
 * Power-up: no manual GAIN, TILT or ELEVN value is entered. Done once when the MFD starts, because an L:var nobody has
 * written yet reads 0, and 0 is a valid entry: the first manual selection then kept 0 (TILT +0.0° on ground, ELEVN 0,
 * GAIN 0) instead of the FCOM default.
 */
export function initWxrManualSettings(write: (name: string, value: number) => void): void {
  Object.values(WXR_MANUAL_SETTING_VARS).forEach((name) => write(name, WXR_NO_ENTRY));
}

/**
 * The value a manual setting takes when the flight crew selects its manual mode (GAIN MAN, ELEVN or TILT), or null to
 * keep the value already entered. A380 FCOM DSC-34-20-30-20-10 (ELEVN and GAIN knobs): "The default ELEVN value is the
 * current aircraft altitude. The default TILT value is: On ground: +3.00°, In flight: 0°", "The default GAIN value is
 * 50 %"; the SURV/CONTROLS page of the MFD follows them.
 */
export function wxrManualDefaultOnSelection(
  setting: WxrManualSetting,
  storedValue: number,
  aircraft: { onGround: boolean; altitudeFeet: number },
): number | null {
  if (storedValue !== WXR_NO_ENTRY) {
    return null;
  }
  switch (setting) {
    case 'gain':
      return 50;
    case 'tilt':
      return aircraft.onGround ? 3 : 0;
    case 'elevn':
      // in hundreds of feet, as the ELEVN entry field takes it
      return Math.max(0, Math.round(aircraft.altitudeFeet / 100) * 100);
  }
}
