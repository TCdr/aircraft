// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  SensedAvionicsDoors,
  SensedDoors,
  doorProximitySensorFaultVar,
  isDoorDetectedNotClosed,
} from './DoorProximitySensors';

describe('door proximity sensors', () => {
  it('a closed door with a working sensor is detected closed', () => {
    expect(isDoorDetectedNotClosed(false, false)).toBe(false);
  });

  it('an open door, or a closed door with a failed sensor, is not detected closed', () => {
    expect(isDoorDetectedNotClosed(true, false)).toBe(true);
    expect(isDoorDetectedNotClosed(false, true)).toBe(true);
  });

  it('has one sensor fault L:var per door of the DOOR cautions', () => {
    expect(SensedDoors.length).toBe(8);
    expect(SensedAvionicsDoors.length).toBe(4);
    expect(doorProximitySensorFaultVar('L_FWD_CABIN')).toBe('L:A32NX_DOOR_L_FWD_CABIN_PROX_SENSOR_FAULT');
    expect(doorProximitySensorFaultVar('AFT_CARGO')).toBe('L:A32NX_DOOR_AFT_CARGO_PROX_SENSOR_FAULT');
    expect(doorProximitySensorFaultVar('R_AFT_AVIONICS')).toBe('L:A32NX_DOOR_R_AFT_AVIONICS_PROX_SENSOR_FAULT');
  });
});
