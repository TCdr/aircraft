//  Copyright (c) 2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0

/**
 * Company takeoff data exchanged between the A380X FMS and the flypad takeoff calculator, which plays the company
 * ground station (A380 FCOM DSC-22-FMS company takeoff data: a request for up to two runways, and uplinks received
 * with or without a request). The events are synced between the instruments.
 */
export interface CompanyTakeoffDataEvents {
  /**
   * The FMS takeoff data: sent by the FMS with SEND T.O REQUEST (COMPANY T.O DATA REQUEST page), or as the answer to
   * a flypad import request.
   */
  cpny_to_fms_data: CompanyTakeoffDataRequest;
  /** The flypad asks the FMS for its takeoff data (the value is a request id, returned in the answer) */
  cpny_to_fms_data_request: number;
  /** The flypad uplinks takeoff data to the FMS */
  cpny_to_uplink: CompanyTakeoffDataUplink;
}

/** The takeoff conditions of one runway of a request */
export interface CompanyTakeoffDataRequestRunway {
  /** Runway ident, without the airport (e.g. 27R) */
  runway: string;
  /** Magnetic wind direction in degrees */
  windDirection: number | null;
  /** Wind speed in knots */
  windSpeed: number | null;
  /** Baro setting in hPa */
  qnh: number | null;
  /** Runway condition, index of the FMS list (0 = DRY) */
  runwayCondition: number | null;
  /** Takeoff thrust rating */
  thrust: 'TOGA' | 'FLEX' | 'DERATED' | null;
  /** Flap configuration 1 (1+F), 2 or 3 */
  flaps: number | null;
  /** Takeoff shift in metres */
  shift: number | null;
  /** T.O LIMIT: the remaining takeoff runway length in metres */
  toLimit: number | null;
}

export interface CompanyTakeoffDataRequest {
  /** The id of the flypad request this answers, or null for a request sent by the flight crew */
  answersRequestId: number | null;
  /** Departure airport ICAO code */
  departure: string | null;
  /** Takeoff weight in kg */
  tow: number | null;
  /** Takeoff CG in % MAC */
  cg: number | null;
  /** Outside air temperature in °C */
  oat: number | null;
  /** The requested runways (the first one is the active runway when known) */
  runways: CompanyTakeoffDataRequestRunway[];
}

export interface CompanyTakeoffDataUplink {
  /** Departure airport ICAO code */
  departure: string;
  /** Runway ident, without the airport (e.g. 27R) */
  runway: string;
  /** Takeoff weight in kg */
  tow: number;
  /** Takeoff CG in % MAC */
  cg: number | null;
  /** Baro setting in hPa */
  qnh: number;
  /** Magnetic wind direction in degrees */
  windDirection: number;
  /** Wind speed in knots */
  windSpeed: number;
  /** Runway condition, index of the FMS list (0 = DRY) */
  runwayCondition: number;
  /** Outside air temperature in °C */
  oat: number;
  /** Takeoff speeds in knots; null when the calculator gives none (V1 and VR in real data only mode) */
  v1: number | null;
  vr: number | null;
  v2: number;
  /** Takeoff thrust rating */
  thrust: 'TOGA' | 'FLEX';
  /** FLEX temperature in °C, for a FLEX thrust rating */
  flexTemperature: number | null;
  /** Flap configuration 1 (1+F), 2 or 3 */
  flaps: number;
  /** Takeoff shift in metres (null for a takeoff from the runway threshold) */
  shift: number | null;
  /** T.O LIMIT: the remaining takeoff runway length, in metres */
  toLimit: number | null;
  /** Thrust reduction, acceleration and engine-out acceleration altitudes in feet */
  thrustReductionAltitude: number | null;
  accelerationAltitude: number | null;
  engineOutAccelerationAltitude: number | null;
  /** The noise procedure parameters, or null without a noise procedure */
  noise: CompanyTakeoffDataNoise | null;
  /** The maximum takeoff weight limited by performance, in kg */
  mtowPerf: number;
}

/** The noise procedure parameters (A380 FCOM DSC-22-FMS-20-30, PERF page - noise parameters) */
export interface CompanyTakeoffDataNoise {
  /** NOISE END altitude in feet */
  endAltitude: number;
  /** Speed in knots */
  speed: number;
  /** THR: the N1 in % */
  n1: number;
}
