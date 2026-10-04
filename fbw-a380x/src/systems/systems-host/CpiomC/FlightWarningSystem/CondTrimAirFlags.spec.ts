// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  condDuctOvhtActive,
  condDuctOvhtInfo,
  condDuctOvhtInopSys,
  condDuctOvhtItems,
  condDuctOvhtOutItems,
  fwdCargoTempRegulFaultActive,
  fwdCargoTempRegulFaultItemsToShow,
  HotAirValveFlags,
  PackPbsOn,
  readTrimAirMonitoringFlags,
  TrimAirMonitoringFlags,
} from './CondTrimAirFlags';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// The EcamMessages modules cannot be imported in a test (circular imports with their enums): read the source instead
const ata21Procedures = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23.ts'),
  'utf-8',
);

/** The lines (item names, in order) and the abnormal procedures it comes from, of one procedure in ata21-22-23.ts */
function procedure(id: number): { items: { name: string }[]; fromAbnormalProcs?: string[] } {
  const start = ata21Procedures.indexOf(`  ${id}: {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = ata21Procedures.slice(start);
  // The procedure ends at the first closing brace at its own indentation
  const block = rest.slice(0, /\r?\n {2}\},/.exec(rest)?.index ?? rest.length);
  const itemsBlock = block.slice(block.indexOf('items: ['));
  const from = /fromAbnormalProcs: \[([^\]]*)\]/.exec(block);
  return {
    items: [...itemsBlock.matchAll(/name: '([^']*)'/g)].map((match) => ({ name: match[1] })),
    fromAbnormalProcs: from ? [...from[1].matchAll(/'(\d+)'/g)].map((match) => match[1]) : undefined,
  };
}

const noFault: TrimAirMonitoringFlags = {
  ckptDuctOvht: false,
  cabinDuctOvhtHotAir1: false,
  cabinDuctOvhtHotAir2: false,
  fwdCargoDuctOvht: false,
  ckptTrimAirValveFault: false,
  cabinTrimAirValveFault: false,
  fwdCargoTrimAirValveFault: false,
};

const valveOn: HotAirValveFlags = { pbOn: true, open: true, disagrees: false };
const valveOff: HotAirValveFlags = { pbOn: false, open: false, disagrees: false };
/** HOT AIR pb OFF but the valve stays open: the TADD closed-command disagree monitor trips */
const valveJammedOpen: HotAirValveFlags = { pbOn: false, open: true, disagrees: true };
const packsOn: PackPbsOn = [true, true];

/** A TCS discrete word with the given bits set */
function word(...bits: number[]) {
  return { bitValueOr: (bit: number, _defaultValue: boolean) => bits.includes(bit) };
}

/** The names of the shown lines of a procedure */
function shownLines(items: { name: string }[], show: boolean[]): string[] {
  return items.filter((_, index) => show[index]).map((item) => item.name);
}

const ductOvhtItems = procedure(211800028).items;

describe('Trim air monitoring bits of the CPIOM B TCS discrete word', () => {
  it('reads bits 17 to 23', () => {
    expect(readTrimAirMonitoringFlags(word(17, 19, 22))).toEqual({
      ...noFault,
      ckptDuctOvht: true,
      cabinDuctOvhtHotAir2: true,
      cabinTrimAirValveFault: true,
    });
    expect(readTrimAirMonitoringFlags(word(18, 20, 21, 23))).toEqual({
      ...noFault,
      cabinDuctOvhtHotAir1: true,
      fwdCargoDuctOvht: true,
      ckptTrimAirValveFault: true,
      fwdCargoTrimAirValveFault: true,
    });
  });

  it('reads no fault from the hot-air valve bits 13 to 16', () => {
    expect(readTrimAirMonitoringFlags(word(13, 14, 15, 16))).toEqual(noFault);
  });
});

describe('COND DUCT OVHT (A380 FCOM PRO-ABN-ECAM-10-21-10)', () => {
  it('is active for any duct overheat and not for a jammed trim air valve', () => {
    expect(condDuctOvhtActive(noFault)).toBe(false);
    expect(condDuctOvhtActive({ ...noFault, ckptTrimAirValveFault: true, cabinTrimAirValveFault: true })).toBe(false);
    expect(condDuctOvhtActive({ ...noFault, ckptDuctOvht: true })).toBe(true);
    expect(condDuctOvhtActive({ ...noFault, cabinDuctOvhtHotAir1: true })).toBe(true);
    expect(condDuctOvhtActive({ ...noFault, cabinDuctOvhtHotAir2: true })).toBe(true);
    expect(condDuctOvhtActive({ ...noFault, fwdCargoDuctOvht: true })).toBe(true);
  });

  it('has as many show/checked entries as procedure lines', () => {
    const { show, checked } = condDuctOvhtItems(noFault, [valveOn, valveOn], packsOn);
    expect(show).toHaveLength(ductOvhtItems.length);
    expect(checked).toHaveLength(ductOvhtItems.length);
  });

  it('asks for HOT AIR 2 OFF for a cockpit duct overheat', () => {
    const { show, checked } = condDuctOvhtItems({ ...noFault, ckptDuctOvht: true }, [valveOn, valveOn], packsOn);
    expect(shownLines(ductOvhtItems, show)).toEqual(['CKPT DUCT OVHT', 'HOT AIR 2', 'HOT AIR JAMMED OPEN', 'PACK 2']);
    expect(checked[1]).toBe(false);
    expect(condDuctOvhtItems({ ...noFault, ckptDuctOvht: true }, [valveOn, valveOff], packsOn).checked[1]).toBe(true);
  });

  it('asks for the hot-air valve of the overheated cabin duct, and CARGO TEMP MONITOR', () => {
    const hotAir1 = condDuctOvhtItems({ ...noFault, cabinDuctOvhtHotAir1: true }, [valveOn, valveOn], packsOn);
    expect(shownLines(ductOvhtItems, hotAir1.show)).toEqual([
      'CABIN DUCT OVHT',
      'HOT AIR 1',
      'HOT AIR JAMMED OPEN',
      'PACK 1',
      'CARGO TEMP',
    ]);
    const hotAir2 = condDuctOvhtItems({ ...noFault, cabinDuctOvhtHotAir2: true }, [valveOn, valveOn], packsOn);
    expect(shownLines(ductOvhtItems, hotAir2.show)).toEqual([
      'CABIN DUCT OVHT',
      'HOT AIR 2',
      'HOT AIR JAMMED OPEN',
      'PACK 2',
      'CARGO TEMP',
    ]);
  });

  it('asks for HOT AIR 1 OFF for a forward cargo duct overheat', () => {
    const { show } = condDuctOvhtItems({ ...noFault, fwdCargoDuctOvht: true }, [valveOn, valveOn], packsOn);
    expect(shownLines(ductOvhtItems, show)).toEqual([
      'FWD CARGO DUCT OVHT',
      'HOT AIR 1',
      'HOT AIR JAMMED OPEN',
      'PACK 1',
    ]);
  });

  it('meets IF HOT AIR JAMMED OPEN only when the valve to close stays open', () => {
    const ckpt = { ...noFault, ckptDuctOvht: true };
    // Index 2: the jammed open condition of the cockpit case, index 3: PACK 2 OFF
    expect(condDuctOvhtItems(ckpt, [valveOn, valveOff], packsOn).checked[2]).toBe(false);
    expect(condDuctOvhtItems(ckpt, [valveOn, valveJammedOpen], packsOn).checked[2]).toBe(true);
    // A jammed HOT AIR 1 does not matter for a duct supplied by HOT AIR 2
    expect(condDuctOvhtItems(ckpt, [valveJammedOpen, valveOff], packsOn).checked[2]).toBe(false);
    expect(condDuctOvhtItems(ckpt, [valveOn, valveJammedOpen], [true, false]).checked[3]).toBe(true);

    const cabin = { ...noFault, cabinDuctOvhtHotAir1: true };
    expect(condDuctOvhtItems(cabin, [valveJammedOpen, valveOn], packsOn).checked[7]).toBe(true);
    expect(condDuctOvhtItems(cabin, [valveOff, valveJammedOpen], packsOn).checked[7]).toBe(false);
  });

  it('gives the FCOM STATUS of each case', () => {
    expect(condDuctOvhtInopSys({ ...noFault, ckptDuctOvht: true })).toEqual(['210300019']);
    expect(condDuctOvhtInopSys({ ...noFault, cabinDuctOvhtHotAir2: true })).toEqual(['210300020']);
    expect(condDuctOvhtInopSys({ ...noFault, fwdCargoDuctOvht: true })).toEqual(['210300018']);
    expect(condDuctOvhtInfo({ ...noFault, ckptDuctOvht: true })).toEqual(['210200001']);
    expect(condDuctOvhtInfo({ ...noFault, fwdCargoDuctOvht: true })).toEqual(['210200001', '210200003']);
  });

  it('WHEN DUCT OVHT OUT asks to restore the closed hot-air valve, and its pack if it was jammed open', () => {
    const deferredItems = procedure(210700003).items;
    expect(procedure(210700003).fromAbnormalProcs).toEqual(['211800028']);

    const ckpt = condDuctOvhtOutItems({ ...noFault, ckptDuctOvht: true }, [valveOn, valveOff], [true, true]);
    expect(ckpt.show).toHaveLength(deferredItems.length);
    expect(shownLines(deferredItems, ckpt.show)).toEqual(['HOT AIR 2', 'HOT AIR JAMMED OPEN', 'PACK 2']);
    expect(ckpt.checked[1]).toBe(false);
    expect(ckpt.checked[2]).toBe(false);

    const cargo = condDuctOvhtOutItems(
      { ...noFault, fwdCargoDuctOvht: true },
      [valveJammedOpen, valveOn],
      [false, true],
    );
    expect(shownLines(deferredItems, cargo.show)).toEqual(['HOT AIR 1', 'HOT AIR JAMMED OPEN', 'PACK 1']);
    expect(cargo.checked[2]).toBe(true);
    expect(cargo.checked[3]).toBe(false);
  });
});

describe('COND FWD CARGO TEMP REGUL FAULT (A380 FCOM PRO-ABN-ECAM-10-21-10)', () => {
  const items = procedure(211800030).items;

  it('is active for a jammed forward cargo trim air valve only', () => {
    expect(fwdCargoTempRegulFaultActive(noFault)).toBe(false);
    expect(fwdCargoTempRegulFaultActive({ ...noFault, cabinTrimAirValveFault: true, fwdCargoDuctOvht: true })).toBe(
      false,
    );
    expect(fwdCargoTempRegulFaultActive({ ...noFault, fwdCargoTrimAirValveFault: true })).toBe(true);
  });

  it('shows CARGO TRIM AIR VLV FAULT and CARGO TEMP MONITOR', () => {
    const show = fwdCargoTempRegulFaultItemsToShow({ ...noFault, fwdCargoTrimAirValveFault: true });
    expect(show).toHaveLength(items.length);
    expect(shownLines(items, show)).toEqual(['CARGO TRIM AIR VLV FAULT', 'CARGO TEMP']);
  });
});
