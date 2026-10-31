// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Test bed of the specs that run the whole TcasComputer (no shipped code imports this file)

import { vi } from 'vitest';
import {
  AirDataSwitchingKnob,
  Arinc429SignStatusMatrix,
  Arinc429Word,
  GenericDataListenerSync,
} from '@flybywiresim/fbw-sdk';
import { mockSimVars, MockedSimVarValues } from '../../../../../../fbw-common/src/jest/MockedSimVars';
import { TcasComputer } from './TcasComputer';
import { JS_NPCPlane, TcasMode, TcasThreat } from '../lib/TcasConstants';

const FEET_PER_METRE = 3.281;
const OWN_ALTITUDE_FT = 10_000;
const OWN_ALTITUDE_ABOVE_GROUND_FT = 8_000;
const OWN_LATITUDE = 45;
const OWN_LONGITUDE = 0;
/** Degrees of latitude that make one nautical mile */
const DEGREES_PER_NAUTICAL_MILE = 1 / 60;

export const arincWord = (value: number, ssm = Arinc429SignStatusMatrix.NormalOperation) =>
  Arinc429Word.getRawWord(value, ssm);

/** The simvars of the test, replaced by setHealthyTcasInputs */
let simVars: MockedSimVarValues = new Map();

export const setSimVar = (name: string, value: number) => {
  simVars.set(name, value);
};
export const readSimVar = (name: string): number => Number(simVars.get(name) ?? 0);

/** The L:var the TCAS computer writes for the TCAS mode of the panel (0 STBY, 1 TA, 2 TA/RA) */
export const TCAS_MODE_VAR = 'L:A32NX_TCAS_MODE';
export const TCAS_FAULT_VAR = 'L:A32NX_TCAS_FAULT';
export const TCAS_TA_ONLY_VAR = 'L:A32NX_TCAS_TA_ONLY';
export const TCAS_STATE_VAR = 'L:A32NX_TCAS_STATE';

/**
 * A healthy A32NX at 10 000 ft, TCAS switch in TA/RA, ATC altitude reporting on, transponder on, both radio altimeters
 * and all three ADRs valid. Call it first in each test: it replaces the simvars by an empty set of in-memory ones.
 */
export function setHealthyTcasInputs(): void {
  simVars = new Map();
  mockSimVars(simVars);
  setSimVar('L:A32NX_ELEC_DC_1_BUS_IS_POWERED', 1);
  setSimVar('L:A32NX_SWITCH_TCAS_Position', TcasMode.TARA);
  setSimVar('L:A32NX_SWITCH_ATC_ALT', 1);
  // the air data knob in NORM: the pressure altitude comes from the ADR of the active transponder
  setSimVar('L:A32NX_AIR_DATA_SWITCHING_KNOB', AirDataSwitchingKnob.Norm);
  setSimVar('TRANSPONDER STATE:1', 4);
  setSimVar('L:A32NX_SWITCH_TCAS_Traffic_Position', TcasThreat.ALL);
  setSimVar('PLANE LATITUDE', OWN_LATITUDE);
  setSimVar('PLANE LONGITUDE', OWN_LONGITUDE);
  setSimVar('PLANE ALTITUDE', OWN_ALTITUDE_FT);
  setSimVar('PLANE ALT ABOVE GROUND', OWN_ALTITUDE_ABOVE_GROUND_FT);
  for (const adr of [1, 2, 3]) {
    setSimVar(`L:A32NX_ADIRS_ADR_${adr}_ALTITUDE`, arincWord(OWN_ALTITUDE_FT));
  }
  // above 2 500 ft the radio altimeters would send no computed data: a valid word keeps the inputs plain
  for (const radioAltimeter of [1, 2]) {
    setSimVar(`L:A32NX_RA_${radioAltimeter}_RADIO_ALTITUDE`, arincWord(OWN_ALTITUDE_ABOVE_GROUND_FT));
  }
}

/** Own altitude plus a relative altitude, as the metres the traffic API reports */
const intruderAltitudeMetres = (relativeAltitudeFt: number) => (OWN_ALTITUDE_FT + relativeAltitudeFt) / FEET_PER_METRE;

/**
 * Creates the TCAS computer and returns a function that runs it for one second, with the given traffic as the answer of
 * the traffic API of that second.
 * @param trafficOfSecond the intruders of each second (the position is what the speed of the intruder is taken from)
 */
export function createTcasComputer(trafficOfSecond: (second: number) => JS_NPCPlane[] = () => []) {
  let second = 0;
  vi.spyOn(Coherent, 'call').mockImplementation(((name: string) =>
    name === 'GET_AIR_TRAFFIC' ? Promise.resolve(trafficOfSecond(second)) : new Promise(() => {})) as never);
  const sentTraffic: { ID: string }[][] = [];
  vi.spyOn(GenericDataListenerSync.prototype, 'sendEvent').mockImplementation(((
    topic: string,
    data: { ID: string }[],
  ) => {
    if (topic === 'A32NX_TCAS_TRAFFIC') {
      sentTraffic.push(data.map((intruder) => ({ ...intruder })));
    }
  }) as never);
  TcasComputer.init();

  return {
    /** The IDs of the intruders sent to the ND in the last second */
    lastSentIds: () => (sentTraffic.length > 0 ? sentTraffic[sentTraffic.length - 1].map((i) => i.ID) : []),
    async runSeconds(seconds: number): Promise<void> {
      for (let i = 0; i < seconds; i++) {
        second++;
        TcasComputer.update(1000);
        // the traffic API answers asynchronously
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

const INTRUDER_GROUND_SPEED_KT = 100;

/**
 * An intruder north of the own aircraft that flies south at 100 kt: the computer takes the ground speed of an intruder
 * from its movement between two answers of the traffic API, and shows nothing below 30 kt.
 * @param uId the unique id of the intruder
 * @param distanceNauticalMiles the distance north of the own aircraft at second 0
 * @param relativeAltitudeFt the altitude above the own aircraft
 * @param second the second of the answer
 */
export function southboundIntruder(
  uId: number,
  distanceNauticalMiles: number,
  relativeAltitudeFt: number,
  second: number,
): JS_NPCPlane {
  const distanceFlown = (INTRUDER_GROUND_SPEED_KT / 3600) * second;
  return {
    name: `intruder ${uId}`,
    uId,
    lat: OWN_LATITUDE + (distanceNauticalMiles - distanceFlown) * DEGREES_PER_NAUTICAL_MILE,
    lon: OWN_LONGITUDE,
    alt: intruderAltitudeMetres(relativeAltitudeFt),
    isOnGround: false,
    heading: 180,
  };
}
