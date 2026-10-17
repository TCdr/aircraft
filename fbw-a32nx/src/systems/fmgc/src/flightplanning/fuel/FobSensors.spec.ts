// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { areFobSensorsInvalid, FobSensorComputer, FobSensors, fobSensorsText, parseFobEntry } from './FobSensors';

describe('FUEL PRED FOB [4R] entry', () => {
  it('parses the four sensor entries', () => {
    expect(parseFobEntry('/FF+FQ')).toEqual({ fob: null, sensors: FobSensors.FuelFlowAndQuantity });
    expect(parseFobEntry('/FQ+FF')).toEqual({ fob: null, sensors: FobSensors.FuelFlowAndQuantity });
    expect(parseFobEntry('/FF')).toEqual({ fob: null, sensors: FobSensors.FuelFlow });
    expect(parseFobEntry('/FQ')).toEqual({ fob: null, sensors: FobSensors.FuelQuantity });
  });

  it('parses a FOB alone, with leading zeros omitted, and a FOB with sensors', () => {
    expect(parseFobEntry('8.5')).toEqual({ fob: 8.5, sensors: null });
    expect(parseFobEntry('.5')).toEqual({ fob: 0.5, sensors: null });
    expect(parseFobEntry('12')).toEqual({ fob: 12, sensors: null });
    expect(parseFobEntry('8.5/FQ')).toEqual({ fob: 8.5, sensors: FobSensors.FuelQuantity });
    expect(parseFobEntry('/FF + FQ')).toEqual({ fob: null, sensors: FobSensors.FuelFlowAndQuantity });
  });

  it('rejects other entries', () => {
    for (const entry of ['', '/', '/XX', '8.55', 'FF', '/FF+', '1234', '8.5/']) {
      expect(parseFobEntry(entry)).toBeNull();
    }
  });

  it('shows the selected sensors as FF+FQ, FF or FQ', () => {
    expect(fobSensorsText(FobSensors.FuelFlowAndQuantity)).toBe('FF+FQ');
    expect(fobSensorsText(FobSensors.FuelFlow)).toBe('FF');
    expect(fobSensorsText(FobSensors.FuelQuantity)).toBe('FQ');
  });
});

describe('SENSOR IS INVALID conditions', () => {
  it('the sole selected sensor invalid, or both of the selected sensors invalid', () => {
    expect(areFobSensorsInvalid(FobSensors.FuelQuantity, true, false)).toBe(true);
    expect(areFobSensorsInvalid(FobSensors.FuelFlow, false, true)).toBe(true);
    expect(areFobSensorsInvalid(FobSensors.FuelFlowAndQuantity, true, false)).toBe(false);
    expect(areFobSensorsInvalid(FobSensors.FuelFlowAndQuantity, false, false)).toBe(true);
  });

  it('refuses a selection or a FOB entry the sensors cannot serve, and keeps the previous selection', () => {
    const computer = new FobSensorComputer();
    expect(computer.selectSensors(FobSensors.FuelQuantity, true, false)).toBe(false);
    expect(computer.sensors).toBe(FobSensors.FuelFlowAndQuantity);
    expect(computer.enterFob(8, 0.5, false)).toBe(false);
    expect(computer.sensors).toBe(FobSensors.FuelFlowAndQuantity);
  });
});

describe('FMS FOB from the selected sensors', () => {
  it('FF+FQ by default: the gauged FOB', () => {
    const computer = new FobSensorComputer();
    expect(computer.sensors).toBe(FobSensors.FuelFlowAndQuantity);
    expect(computer.compute({ fuelQuantity: 10, fuelQuantityValid: true, fuelUsed: 0.2 })).toBe(10);
  });

  it('FF: the last FQ value minus the fuel burnt since, so a fuel leak is not seen', () => {
    const computer = new FobSensorComputer();
    computer.compute({ fuelQuantity: 10, fuelQuantityValid: true, fuelUsed: 0.2 });
    expect(computer.selectSensors(FobSensors.FuelFlow, true, true)).toBe(true);
    // 0.3 t burnt by the engines, 0.5 t lost through a leak: the FQ shows 9.2, the fuel flow 9.7
    expect(computer.compute({ fuelQuantity: 9.2, fuelQuantityValid: true, fuelUsed: 0.5 })).toBeCloseTo(9.7, 6);
  });

  it('FQ: the gauged FOB', () => {
    const computer = new FobSensorComputer();
    computer.selectSensors(FobSensors.FuelQuantity, true, true);
    expect(computer.compute({ fuelQuantity: 9.2, fuelQuantityValid: true, fuelUsed: 0.5 })).toBe(9.2);
  });

  it('FF+FQ with both FQI channels failed: the fuel flow value from the last FQ value', () => {
    const computer = new FobSensorComputer();
    computer.compute({ fuelQuantity: 10, fuelQuantityValid: true, fuelUsed: 1 });
    expect(computer.compute({ fuelQuantity: 0, fuelQuantityValid: false, fuelUsed: 1.4 })).toBeCloseTo(9.6, 6);
  });

  it('no FQ value ever and no crew entry: no FOB', () => {
    const computer = new FobSensorComputer();
    expect(computer.compute({ fuelQuantity: 0, fuelQuantityValid: false, fuelUsed: 0 })).toBeNull();
  });

  it('a crew FOB entry: the fuel flow integration starts from it, on the FF sensors', () => {
    const computer = new FobSensorComputer();
    computer.compute({ fuelQuantity: 10, fuelQuantityValid: true, fuelUsed: 1 });
    expect(computer.enterFob(9.5, 1, true)).toBe(true);
    expect(computer.sensors).toBe(FobSensors.FuelFlow);
    expect(computer.compute({ fuelQuantity: 9.8, fuelQuantityValid: true, fuelUsed: 1.2 })).toBeCloseTo(9.3, 6);
  });

  it('a fuel used counter reset does not make the fuel flow value jump', () => {
    const computer = new FobSensorComputer();
    computer.compute({ fuelQuantity: 10, fuelQuantityValid: true, fuelUsed: 0.4 });
    computer.selectSensors(FobSensors.FuelFlow, true, true);
    expect(computer.compute({ fuelQuantity: 9.9, fuelQuantityValid: true, fuelUsed: 0.5 })).toBeCloseTo(9.9, 6);
    // counter back to 0, then 0.1 t burnt
    expect(computer.compute({ fuelQuantity: 9.8, fuelQuantityValid: true, fuelUsed: 0.1 })).toBeCloseTo(9.8, 6);
  });

  it('the FOB never goes below 0', () => {
    const computer = new FobSensorComputer();
    computer.enterFob(0.2, 0, true);
    expect(computer.compute({ fuelQuantity: 1, fuelQuantityValid: true, fuelUsed: 0.5 })).toBe(0);
  });

  it('reset: back to FF+FQ without a reference FOB', () => {
    const computer = new FobSensorComputer();
    computer.enterFob(9.5, 1, true);
    computer.reset();
    expect(computer.sensors).toBe(FobSensors.FuelFlowAndQuantity);
    expect(computer.compute({ fuelQuantity: 0, fuelQuantityValid: false, fuelUsed: 0 })).toBeNull();
  });
});
