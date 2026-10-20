// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { A380Failure } from '@failures';
import {
  FwsGearSteeringAlerts,
  GEAR_STEERING_PHASE_INHIBITION,
  GearSteeringAircraftState,
  GearSteeringSystemInputs,
  gearSteeringAbnormalItems,
  readGearSteeringSystemInputs,
  retractionFaultChecked,
  retractionFaultItems,
} from './FwsGearSteeringAlerts';

/*
 * The ata31-32-33.ts table is read from the source text (importing EcamMessages in a test fails on a circular
 * import, see FwsElecAlertsStatus.spec.ts).
 */
const ata32 = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata31-32-33.ts'),
  'utf-8',
).replace(/\r\n/g, '\n');

/** Title and item names of an ata31-32-33.ts alert */
function procedure(key: number): { title: string; items: string[] } {
  const start = ata32.indexOf(`\n  ${key}: {`);
  const end = ata32.indexOf('\n  },', start);
  const block = ata32.slice(start, end);
  const title = block.match(/title: '\\x1b<4m\\x1b4m(?:L\/G|STEER)\\x1bm ([^']*)'/)?.[1] ?? '';
  const items = Array.from(block.matchAll(/name: '([^']*)'/g)).map((m) => m[1]);
  return { title, items };
}

function normalSystems(): GearSteeringSystemInputs {
  return {
    uplockFault: false,
    bogiePositionFault: false,
    gravityExtensionFault: false,
    retractionInhibited: false,
    retractionFault: false,
    weightOnWheelsFault: false,
    oleoPressureAbnormal: [false, false, false, false, false],
    oleoPressureMonitoringFault: [false, false, false, false, false],
    nwsAngleLimitExceeded: false,
    bwsNotLocked: false,
    pedalSteeringFault: false,
    captTillerFault: false,
    foTillerFault: false,
    lehgsOverheat: false,
    nwsDisconnectionFault: false,
    normalSelectorValveJammedOpen: false,
    alternateSelectorValveJammedOpen: false,
    bwsSelectorValveJammedOpen: false,
    nwsMode: 1,
    towPinInserted: false,
    towing: false,
  };
}

/** On ground at the gate, engines running */
function onGround(): GearSteeringAircraftState {
  return {
    onGround: true,
    gearLeverDown: true,
    allGearsDownlocked: true,
    oneEngineRunning: true,
    allEngineMastersOff: false,
    aboveGearDoorSpeed: false,
    groundSpeedKt: 0,
  };
}

/** Climb out after take-off, gear lever up */
function inFlight(): GearSteeringAircraftState {
  return { ...onGround(), onGround: false, gearLeverDown: false, groundSpeedKt: 200 };
}

const FRAME_MS = 100;

function alertsWith(
  systems: Partial<GearSteeringSystemInputs>,
  state: GearSteeringAircraftState = onGround(),
): FwsGearSteeringAlerts {
  const alerts = new FwsGearSteeringAlerts();
  alerts.update(FRAME_MS, { ...normalSystems(), ...systems }, state);
  return alerts;
}

function runFor(
  alerts: FwsGearSteeringAlerts,
  seconds: number,
  systems: GearSteeringSystemInputs,
  state: GearSteeringAircraftState,
): void {
  for (let elapsedMs = 0; elapsedMs < seconds * 1000; elapsedMs += FRAME_MS) {
    alerts.update(FRAME_MS, systems, state);
  }
}

function activeKeys(alerts: FwsGearSteeringAlerts): number[] {
  const items = gearSteeringAbnormalItems(alerts);
  return Object.keys(items)
    .map(Number)
    .filter((key) => items[key].simVarIsActive.get());
}

describe('L/G and STEER alert conditions', () => {
  it('raises no alert on a normal aircraft', () => {
    expect(activeKeys(alertsWith({}))).toEqual([]);
    expect(activeKeys(alertsWith({}, inFlight()))).toEqual([]);
  });

  it.each<[string, Partial<GearSteeringSystemInputs>, number]>([
    ['ABNORM OLEO PRESS', { oleoPressureAbnormal: [false, false, false, true, false] }, 320800031],
    ['BOGIE POSITION FAULT', { bogiePositionFault: true }, 320800032],
    ['GEAR UPLOCK FAULT', { uplockFault: true }, 320800041],
    ['GRVTY EXTN FAULT', { gravityExtensionFault: true }, 320800042],
    ['OLEO PRESS MONITORING SYS FAULT', { oleoPressureMonitoringFault: [true, false, false, false, false] }, 320800043],
    ['RETRACTION FAULT', { retractionFault: true }, 320800044],
    ['WEIGHT ON WHEELS FAULT', { weightOnWheelsFault: true }, 320800046],
    ['ALTN STEER SYS HOT', { lehgsOverheat: true }, 320800048],
    ['B/W STEER NOT LOCKED', { bwsNotLocked: true }, 320800050],
    ['CAPT STEER TILLER FAULT', { captTillerFault: true }, 320800051],
    ['FO STEER TILLER FAULT', { foTillerFault: true }, 320800052],
    ['N/W STEER ANGLE LIMIT EXCEEDED', { nwsAngleLimitExceeded: true }, 320800056],
    ['N/W STEER DISC FAULT', { towPinInserted: true, nwsDisconnectionFault: true }, 320800057],
    ['PEDAL STEER CTL FAULT', { pedalSteeringFault: true }, 320800061],
    ['STEER SEL VLV JAMMED OPEN', { nwsMode: 0, normalSelectorValveJammedOpen: true }, 320800062],
  ])('raises %s alone from its condition', (_, systems, key) => {
    expect(activeKeys(alertsWith(systems))).toEqual([key]);
  });

  it('raises N/W STEER DISC FAULT only with the tow sw in the towing position', () => {
    expect(activeKeys(alertsWith({ nwsDisconnectionFault: true }))).toEqual([]);
  });

  it('raises N/W STEER NOT DISC after 3 s of tow with the nose wheel steering connected', () => {
    const alerts = new FwsGearSteeringAlerts();
    const towed = { ...normalSystems(), towing: true };
    runFor(alerts, 2.5, towed, onGround());
    expect(alerts.nwSteerNotDisc.get()).toBe(false);
    runFor(alerts, 1, towed, onGround());
    expect(alerts.nwSteerNotDisc.get()).toBe(true);

    // The ground crew sets the tow pin: the NWS is disconnected
    runFor(alerts, 0.1, { ...towed, towPinInserted: true }, onGround());
    expect(alerts.nwSteerNotDisc.get()).toBe(false);

    // With the disconnection failed the NWS stays connected during the tow
    runFor(alerts, 3.5, { ...towed, towPinInserted: true, nwsDisconnectionFault: true }, onGround());
    expect(alerts.nwSteerNotDisc.get()).toBe(true);
    expect(alerts.nwSteerDiscFault.get()).toBe(true);
  });

  it('keeps N/W STEER ANGLE LIMIT EXCEEDED on ground after the tow, until the next flight', () => {
    const alerts = alertsWith({ nwsAngleLimitExceeded: true });
    alerts.update(FRAME_MS, normalSystems(), onGround());
    expect(alerts.nwSteerAngleLimitExceeded.get()).toBe(true);
    alerts.update(FRAME_MS, normalSystems(), inFlight());
    expect(alerts.nwSteerAngleLimitExceeded.get()).toBe(false);
  });

  it('senses a selector valve jammed open only while the SCS commands it closed', () => {
    // Normal NWS: the normal selector valve is open
    expect(alertsWith({ nwsMode: 1, normalSelectorValveJammedOpen: true }).steerSelVlvJammedOpen.get()).toBe(false);
    expect(alertsWith({ nwsMode: 1, alternateSelectorValveJammedOpen: true }).steerSelVlvJammedOpen.get()).toBe(true);
    expect(alertsWith({ nwsMode: 2, alternateSelectorValveJammedOpen: true }).steerSelVlvJammedOpen.get()).toBe(false);
    // The BWS steers on ground below 30 kt with an engine running
    expect(alertsWith({ bwsSelectorValveJammedOpen: true }).steerSelVlvJammedOpen.get()).toBe(false);
    expect(
      alertsWith(
        { bwsSelectorValveJammedOpen: true },
        { ...onGround(), oneEngineRunning: false },
      ).steerSelVlvJammedOpen.get(),
    ).toBe(true);
    expect(
      alertsWith(
        { bwsSelectorValveJammedOpen: true },
        { ...onGround(), groundSpeedKt: 40 },
      ).steerSelVlvJammedOpen.get(),
    ).toBe(true);
  });

  it('reads the Rust signals and the FWS-only flyPad failures', () => {
    const values: { [name: string]: number } = {
      'L:A32NX_LG_UPLOCK_FAULT': 1,
      'L:A32NX_LG_RETRACTION_INHIBITED': 1,
      'L:A32NX_STEERING_BWS_NOT_LOCKED': 1,
      'L:A32NX_STEERING_NWS_MODE': 2,
      'PUSHBACK STATE': 3,
      'L:FSDT_GSX_DEPARTURE_STATE': 5,
    };
    const failed: number[] = [A380Failure.GearOleoPressureAbnormalLeftWing, A380Failure.SteeringNoseWheelDisconnection];
    const inputs = readGearSteeringSystemInputs(
      (name) => values[name] ?? 0,
      (failure) => failed.includes(failure),
    );

    expect(inputs.uplockFault).toBe(true);
    expect(inputs.retractionInhibited).toBe(true);
    expect(inputs.bwsNotLocked).toBe(true);
    expect(inputs.nwsMode).toBe(2);
    expect(inputs.towing).toBe(true);
    expect(inputs.oleoPressureAbnormal).toEqual([false, true, false, false, false]);
    expect(inputs.nwsDisconnectionFault).toBe(true);
    expect(inputs.retractionFault).toBe(false);

    const noTow = readGearSteeringSystemInputs(
      (name) => (name === 'PUSHBACK STATE' ? 3 : 0),
      () => false,
    );
    expect(noTow.towing).toBe(false);
  });
});

describe('L/G and STEER procedure lines', () => {
  it('shows NO L/G RETRACTION when all gears were down at the alert onset with an engine running', () => {
    const items = gearSteeringAbnormalItems(alertsWith({ bogiePositionFault: true }));
    expect(items[320800032].whichItemsToShow()).toEqual([true]);
    expect(items[320800032].limitationsAllPhases?.([])).toEqual(['320400006']);

    const gearUp = gearSteeringAbnormalItems(
      alertsWith({ uplockFault: true }, { ...inFlight(), allGearsDownlocked: false }),
    );
    expect(gearUp[320800041].whichItemsToShow()).toEqual([false]);

    const bws = alertsWith({ bwsNotLocked: true });
    const bwsItems = gearSteeringAbnormalItems(bws);
    expect(bwsItems[320800050].whichItemsToShow()).toEqual([true, true]);
    expect(bwsItems[320800050].inopSysApprLdg?.([])).toEqual(['320300014']);
    expect(bwsItems[320800050].info?.([])).toEqual(['800200003', '800200004', '800200005']);
  });

  it('shows the ON ... L/G line of each gear of the oleo pressure alerts', () => {
    const items = gearSteeringAbnormalItems(
      alertsWith({
        oleoPressureAbnormal: [true, false, false, false, true],
        oleoPressureMonitoringFault: [false, true, false, false, false],
      }),
    );
    expect(items[320800031].whichItemsToShow()).toEqual([true, false, false, false, true]);
    expect(items[320800043].whichItemsToShow()).toEqual([false, true, false, false, false]);
    expect(items[320800043].inopSysAllPhases?.([])).toEqual(['320300035']);
  });

  it('gives L/G RETRACTION FAULT its speed lines in flight and crew awareness on ground', () => {
    expect(retractionFaultItems(false, false)).toEqual([false, false, false, false, false, false, false]);
    expect(retractionFaultItems(true, false)).toEqual([true, false, true, true, true, false, false]);
    expect(retractionFaultItems(true, true)).toEqual([false, true, true, true, true, true, false]);
    expect(retractionFaultChecked(false, true, true)).toEqual([false, true, true, true, false, false, false]);
  });

  it('ticks the L/G RECYCLE and IF NOT SUCCESSFUL lines of L/G RETRACTION FAULT', () => {
    const alerts = new FwsGearSteeringAlerts();
    const fault = { ...normalSystems(), retractionFault: true, retractionInhibited: true };
    const items = gearSteeringAbnormalItems(alerts);
    alerts.update(FRAME_MS, fault, inFlight());
    expect(items[320800044].whichItemsChecked()).toEqual([false, true, false, false, false, false, false]);
    expect(items[320800044].limitationsAllPhases?.([])).toEqual(['260400002', '320400010']);
    expect(items[320800044].inopSysAllPhases?.([])).toEqual(['320300013']);
    expect(items[320800044].info?.([])).toEqual(['280200003']);

    // Lever down (the LGCIS no longer inhibit) then up again: still out of the retraction configuration
    alerts.update(FRAME_MS, { ...fault, retractionInhibited: false }, { ...inFlight(), gearLeverDown: true });
    alerts.update(FRAME_MS, fault, inFlight());
    expect(items[320800044].whichItemsChecked()).toEqual([false, true, true, true, false, false, false]);
  });

  it('gives N/W STEER POWERED on ground and ticks ALL ENG MASTERS OFF', () => {
    const items = gearSteeringAbnormalItems(
      alertsWith(
        { towPinInserted: true, nwsDisconnectionFault: true },
        { ...onGround(), oneEngineRunning: false, allEngineMastersOff: true },
      ),
    );
    expect(items[320800057].whichItemsToShow()).toEqual([true, true]);
    expect(items[320800057].whichItemsChecked()).toEqual([false, true]);
    expect(items[320800057].info?.([])).toEqual(['320200020']);
    expect(items[320800057].inopSysAllPhases?.([])).toEqual(['320300018']);
  });

  it('shows the selector valve lines of the jammed valve', () => {
    const normal = gearSteeringAbnormalItems(alertsWith({ nwsMode: 0, normalSelectorValveJammedOpen: true }));
    expect(normal[320800062].whichItemsToShow()).toEqual([true, true, false]);
    const alternate = gearSteeringAbnormalItems(alertsWith({ nwsMode: 0, alternateSelectorValveJammedOpen: true }));
    expect(alternate[320800062].whichItemsToShow()).toEqual([true, false, true]);
    const bws = gearSteeringAbnormalItems(
      alertsWith({ bwsSelectorValveJammedOpen: true }, { ...onGround(), oneEngineRunning: false }),
    );
    expect(bws[320800062].whichItemsToShow()).toEqual([false, false, false]);
    expect(bws[320800062].info?.([])).toEqual([]);
  });

  it('gives every alert as many lines as its ata31-32-33.ts procedure', () => {
    const items = gearSteeringAbnormalItems(alertsWith({}, inFlight()));
    for (const key of Object.keys(items).map(Number)) {
      expect([key, items[key].whichItemsToShow().length]).toEqual([key, procedure(key).items.length]);
      expect([key, items[key].whichItemsChecked().length]).toEqual([key, procedure(key).items.length]);
    }
  });

  it('uses the aircraft alert titles and flight phase inhibitions', () => {
    const items = gearSteeringAbnormalItems(alertsWith({}));
    const titles = Object.keys(items).map((key) => procedure(Number(key)).title);
    expect(titles).toEqual([
      'ABNORM OLEO PRESS',
      'BOGIE POSITION FAULT',
      'GEAR UPLOCK FAULT',
      'GRVTY EXTN FAULT',
      'OLEO PRESS MONITORING SYS FAULT',
      'RETRACTION FAULT',
      'WEIGHT ON WHEELS FAULT',
      'ALTN STEER SYS HOT',
      'B/W STEER NOT LOCKED',
      'CAPT STEER TILLER FAULT',
      'FO STEER TILLER FAULT',
      'N/W STEER ANGLE LIMIT EXCEEDED',
      'N/W STEER DISC FAULT',
      'N/W STEER NOT DISC',
      'PEDAL STEER CTL FAULT',
      'STEER SEL VLV JAMMED OPEN',
    ]);
    expect(items[320800044].flightPhaseInhib).toEqual(GEAR_STEERING_PHASE_INHIBITION.retractionFault);
    expect(GEAR_STEERING_PHASE_INHIBITION.retractionFault).toEqual([4, 5, 8, 9, 10, 11]);
    expect(GEAR_STEERING_PHASE_INHIBITION.nwSteerNotDisc).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('L/G and STEER alert wiring', () => {
  it('adds these alerts to the FWS abnormal sensed procedures and updates them every FWS frame', () => {
    const source = (file: string) => readFileSync(resolve(__dirname, file), 'utf-8');
    expect(source('FwsAbnormalSensed.ts')).toContain('...gearSteeringAbnormalItems(this.fws.gearSteeringAlerts)');
    expect(source('FwsCore.ts')).toContain('this.gearSteeringAlerts.update(');
  });
});
