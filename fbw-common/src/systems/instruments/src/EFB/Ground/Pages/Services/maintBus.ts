// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The MAINT BUS switch of the A320 (forward entrance area, not in the cockpit model: the flyPad stands in for it). The
 * electrical system (Rust A320MaintenanceBusSwitch) reads it, and writes it back to 0 when the switch cannot latch or
 * trips.
 */
export const MAINT_BUS_SWITCH_VAR = 'L:A32NX_ELEC_MAINT_BUS_SW_IS_ON';

/** External power connected and normal (the EXT PWR AVAIL light) */
export const EXT_PWR_AVAIL_VAR = 'L:A32NX_EXT_PWR_AVAIL:1';

export type MaintBusRowState = 'unavailable' | 'off' | 'on';

/**
 * The state of the MAINT BUS row of the Services page. The MAINT BUS switch latches ON only with external power
 * connected and normal (AVAIL light on), then powers the AC and DC GND/FLT buses; it trips when the external power is
 * removed. OFF connects these buses to AC BUS 2 and DC BUS 2.
 * - unavailable: no external power, the switch cannot latch (greyed out)
 * - off / on: the switch position
 * @param switchOn the switch L:var
 * @param externalPowerAvailable whether external power is connected and normal
 */
export function maintBusRowState(switchOn: boolean, externalPowerAvailable: boolean): MaintBusRowState {
  if (!externalPowerAvailable) {
    return 'unavailable';
  }
  return switchOn ? 'on' : 'off';
}

/** The translation key of the status line of the MAINT BUS row */
export function maintBusStatusKey(state: MaintBusRowState): string {
  switch (state) {
    case 'on':
      return 'Ground.Services.MaintBusOn';
    case 'off':
      return 'Ground.Services.MaintBusOff';
    default:
      return 'Ground.Services.MaintBusNeedsExtPwr';
  }
}

/** The switch position after the row's switch is toggled: ON latches only with external power */
export function maintBusToggled(state: MaintBusRowState): boolean {
  return state === 'off';
}
