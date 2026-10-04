// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Bits of the CPIOM B TCS discrete word (L:A32NX_COND_CPIOM_B{n}_TCS_DISCRETE_WORD) set by the trim air monitoring of
 * the temperature controller (a380_systems air_conditioning/cpiom_b.rs, docs/a380-simvars.md).
 */
export const TCS_TRIM_AIR_BITS = {
  ckptDuctOvht: 17,
  cabinDuctOvhtHotAir1: 18,
  cabinDuctOvhtHotAir2: 19,
  fwdCargoDuctOvht: 20,
  ckptTrimAirValveFault: 21,
  cabinTrimAirValveFault: 22,
  fwdCargoTrimAirValveFault: 23,
} as const;

/** Duct overheats and jammed trim air valves, as the FWS reads them from the TCS discrete word */
export interface TrimAirMonitoringFlags {
  ckptDuctOvht: boolean;
  /** A cabin duct supplied by HOT AIR 1 is overheated */
  cabinDuctOvhtHotAir1: boolean;
  /** A cabin duct supplied by HOT AIR 2 is overheated */
  cabinDuctOvhtHotAir2: boolean;
  fwdCargoDuctOvht: boolean;
  ckptTrimAirValveFault: boolean;
  cabinTrimAirValveFault: boolean;
  fwdCargoTrimAirValveFault: boolean;
}

/** One hot-air valve, as the FWS reads it */
export interface HotAirValveFlags {
  pbOn: boolean;
  /** The valve is open (TCS discrete word bit 15/16) */
  open: boolean;
  /** The valve position disagrees with its command (TCS discrete word bit 13/14) */
  disagrees: boolean;
}

/** The pack pb-sws PACK 1 and PACK 2 */
export type PackPbsOn = readonly [boolean, boolean];

/** Reads the trim air monitoring bits of a TCS discrete word (no data reads as no fault) */
export function readTrimAirMonitoringFlags(word: {
  bitValueOr(bit: number, defaultValue: boolean): boolean;
}): TrimAirMonitoringFlags {
  return {
    ckptDuctOvht: word.bitValueOr(TCS_TRIM_AIR_BITS.ckptDuctOvht, false),
    cabinDuctOvhtHotAir1: word.bitValueOr(TCS_TRIM_AIR_BITS.cabinDuctOvhtHotAir1, false),
    cabinDuctOvhtHotAir2: word.bitValueOr(TCS_TRIM_AIR_BITS.cabinDuctOvhtHotAir2, false),
    fwdCargoDuctOvht: word.bitValueOr(TCS_TRIM_AIR_BITS.fwdCargoDuctOvht, false),
    ckptTrimAirValveFault: word.bitValueOr(TCS_TRIM_AIR_BITS.ckptTrimAirValveFault, false),
    cabinTrimAirValveFault: word.bitValueOr(TCS_TRIM_AIR_BITS.cabinTrimAirValveFault, false),
    fwdCargoTrimAirValveFault: word.bitValueOr(TCS_TRIM_AIR_BITS.fwdCargoTrimAirValveFault, false),
  };
}

/** The hot-air valve stays open against a close command (the TADD closed-command disagree monitor, 14 s) */
function hotAirJammedOpen(valve: HotAirValveFlags): boolean {
  return valve.disagrees && valve.open;
}

/** Which hot-air valves the COND DUCT OVHT procedure asks to close: [HOT AIR 1, HOT AIR 2] */
function hotAirValvesToClose(flags: TrimAirMonitoringFlags): [boolean, boolean] {
  return [flags.cabinDuctOvhtHotAir1 || flags.fwdCargoDuctOvht, flags.ckptDuctOvht || flags.cabinDuctOvhtHotAir2];
}

/**
 * COND DUCT OVHT (A380 FCOM PRO-ABN-ECAM-10-21-10, a380_fcom.txt:132563-132573): an overheat (above 70 deg C) in a
 * cockpit, cabin or forward cargo duct.
 */
export function condDuctOvhtActive(flags: TrimAirMonitoringFlags): boolean {
  return flags.ckptDuctOvht || flags.cabinDuctOvhtHotAir1 || flags.cabinDuctOvhtHotAir2 || flags.fwdCargoDuctOvht;
}

/**
 * Lines of COND DUCT OVHT (EcamAbnormalSensedAta212223[211800028]) to show and checked, a380_fcom.txt:132599-132623:
 * CKPT DUCT OVHT: HOT AIR 2 OFF, if jammed open PACK 2 OFF. CABIN DUCT OVHT: HOT AIR 1(2) OFF depending on the duct, if
 * jammed open PACK 1(2) OFF, CARGO TEMP MONITOR. FWD CARGO DUCT OVHT: HOT AIR 1 OFF, if jammed open PACK 1 OFF.
 */
export function condDuctOvhtItems(
  flags: TrimAirMonitoringFlags,
  hotAir: readonly [HotAirValveFlags, HotAirValveFlags],
  packOn: PackPbsOn,
): { show: boolean[]; checked: boolean[] } {
  const cabin = flags.cabinDuctOvhtHotAir1 || flags.cabinDuctOvhtHotAir2;
  const jammed = [hotAirJammedOpen(hotAir[0]), hotAirJammedOpen(hotAir[1])];
  const cabinJammed = (flags.cabinDuctOvhtHotAir1 && jammed[0]) || (flags.cabinDuctOvhtHotAir2 && jammed[1]);
  return {
    show: [
      flags.ckptDuctOvht, // CKPT DUCT OVHT
      flags.ckptDuctOvht, // HOT AIR 2 OFF
      flags.ckptDuctOvht, // IF HOT AIR JAMMED OPEN
      flags.ckptDuctOvht, // PACK 2 OFF
      cabin, // CABIN DUCT OVHT
      flags.cabinDuctOvhtHotAir1, // HOT AIR 1 OFF
      flags.cabinDuctOvhtHotAir2, // HOT AIR 2 OFF
      cabin, // IF HOT AIR JAMMED OPEN
      flags.cabinDuctOvhtHotAir1, // PACK 1 OFF
      flags.cabinDuctOvhtHotAir2, // PACK 2 OFF
      cabin, // CARGO TEMP MONITOR
      flags.fwdCargoDuctOvht, // FWD CARGO DUCT OVHT
      flags.fwdCargoDuctOvht, // HOT AIR 1 OFF
      flags.fwdCargoDuctOvht, // IF HOT AIR JAMMED OPEN
      flags.fwdCargoDuctOvht, // PACK 1 OFF
    ],
    checked: [
      false,
      !hotAir[1].pbOn,
      jammed[1],
      !packOn[1],
      false,
      !hotAir[0].pbOn,
      !hotAir[1].pbOn,
      cabinJammed,
      !packOn[0],
      !packOn[1],
      false,
      false,
      !hotAir[0].pbOn,
      jammed[0],
      !packOn[0],
    ],
  };
}

/**
 * Lines of the deferred procedure WHEN DUCT OVHT OUT (EcamDeferredProcAta212223[210700003]), a380_fcom.txt:132645-132651:
 * HOT AIR 1(2) ON for the valve closed by the procedure, and if it was jammed open PACK 1(2) ON.
 */
export function condDuctOvhtOutItems(
  flags: TrimAirMonitoringFlags,
  hotAir: readonly [HotAirValveFlags, HotAirValveFlags],
  packOn: PackPbsOn,
): { show: boolean[]; checked: boolean[] } {
  const closed = hotAirValvesToClose(flags);
  const jammed = (closed[0] && hotAirJammedOpen(hotAir[0])) || (closed[1] && hotAirJammedOpen(hotAir[1]));
  return {
    show: [closed[0], closed[1], closed[0] || closed[1], closed[0], closed[1]],
    checked: [hotAir[0].pbOn, hotAir[1].pbOn, jammed, packOn[0], packOn[1]],
  };
}

/** STATUS INOP SYS of COND DUCT OVHT (a380_fcom.txt:132655-132666), EcamInopSys ids */
export function condDuctOvhtInopSys(flags: TrimAirMonitoringFlags): string[] {
  const inopSys: string[] = [];
  if (flags.ckptDuctOvht) {
    inopSys.push('210300019'); // CKPT TEMP REGUL
  }
  if (flags.cabinDuctOvhtHotAir1 || flags.cabinDuctOvhtHotAir2) {
    inopSys.push('210300020'); // CAB PART TEMP REGUL
  }
  if (flags.fwdCargoDuctOvht) {
    inopSys.push('210300018'); // FWD CRG TEMP REGUL
  }
  return inopSys;
}

/** STATUS INFO of COND DUCT OVHT (a380_fcom.txt:132668-132674), EcamInfos ids */
export function condDuctOvhtInfo(flags: TrimAirMonitoringFlags): string[] {
  // CABIN TEMP REGUL DEGRADED, and FWD CRG TEMP REGUL DEGRADED if the forward cargo is affected
  return flags.fwdCargoDuctOvht ? ['210200001', '210200003'] : ['210200001'];
}

/**
 * COND FWD CARGO TEMP REGUL FAULT (a380_fcom.txt:132245-132279): the temperature regulation of the forward cargo is
 * lost or degraded; "In the case of trim air valve failure: CARGO TRIM AIR VLV FAULT". The only cause the model has is
 * a jammed forward cargo trim air valve. Design choice: that is a DEGRADED regulation (the aircraft has two forward
 * cargo trim air valves, a380_fcom.txt:5346-5347, and DSC-21-10-30 says a jammed valve loses the "optimized"
 * regulation, a380_fcom.txt:6108-6109): CARGO TEMP MONITOR and the INFO FWD CRG TEMP REGUL DEGRADED, no INOP SYS.
 */
export function fwdCargoTempRegulFaultActive(flags: TrimAirMonitoringFlags): boolean {
  return flags.fwdCargoTrimAirValveFault;
}

/** Lines of COND FWD CARGO TEMP REGUL FAULT (CARGO TRIM AIR VLV FAULT, CARGO TEMP MONITOR) to show */
export function fwdCargoTempRegulFaultItemsToShow(flags: TrimAirMonitoringFlags): boolean[] {
  return [flags.fwdCargoTrimAirValveFault, flags.fwdCargoTrimAirValveFault];
}
