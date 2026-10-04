// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { A380Failure, A380FailureDefinitions } from './a380';

// The flyPad failures page lists exactly A380FailureDefinitions; a definition is [ATA chapter, id, name].
const listedIds = A380FailureDefinitions.map(([, id]) => id);
const enumIds: number[] = Object.values(A380Failure);

describe('A380X flyPad failure definitions', () => {
  it('lists every failure id only once', () => {
    const duplicates = listedIds.filter((id, index) => listedIds.indexOf(id) !== index);
    expect(duplicates).toEqual([]);
  });

  it('only lists ids that exist in the A380Failure enum', () => {
    expect(listedIds.filter((id) => !enumIds.includes(id))).toEqual([]);
  });

  it('files every failure under the ATA chapter of its id', () => {
    const misfiled = A380FailureDefinitions.filter(([ata, id]) => Math.floor(id / 1000) !== ata);
    expect(misfiled).toEqual([]);
  });

  it('lists all landing gear proximity sensor (32004-32015) and jammed actuator (32020-32025) failures', () => {
    // The Rust map in a380_systems_wasm/src/lib.rs reacts to all of these ids.
    const gearIds = [
      32004, 32005, 32006, 32007, 32008, 32009, 32010, 32011, 32012, 32013, 32014, 32015, 32020, 32021, 32022, 32023,
      32024, 32025,
    ];
    expect(gearIds.filter((id) => !listedIds.includes(id))).toEqual([]);
  });

  it('names the gear failures after the sensor or actuator the Rust map fails', () => {
    // a380_systems_wasm/src/lib.rs: 32_004 = UplockGearNose1, 32_006 = UplockGearRight1, 32_013 = DownlockDoorRight1, 32_022 = GearRight.
    expect(A380Failure.GearProxSensorDamageGearUplockNose1).toBe(32004);
    expect(A380Failure.GearProxSensorDamageGearUplockRight1).toBe(32006);
    expect(A380Failure.GearProxSensorDamageGearDoorOpenedRight1).toBe(32013);
    expect(A380Failure.GearActuatorJammedGearRight).toBe(32022);

    const nameOf = (id: number) => A380FailureDefinitions.find(([, listedId]) => listedId === id)?.[2];
    expect(nameOf(32004)).toBe('Proximity sensor damage uplock nose gear #1');
    expect(nameOf(32006)).toBe('Proximity sensor damage uplock right gear #1');
  });

  it('names the buses, TRs and controllers as the A380 FCOM and SD do (failure names audit 2026-10-03)', () => {
    const label = (id: number) => A380FailureDefinitions.find(([, i]) => i === id)?.[2];
    expect(label(24002)).toBe('ESS TR');
    expect(label(24003)).toBe('APU TR');
    expect(label(24104)).toBe('AC EMER');
    expect(label(24105)).toBe('AC ESS');
    expect(label(24106)).toBe('AC EHA (247XP)');
    expect(label(24112)).toBe('DC APU (309PP)');
    expect(label(32000)).toBe('LGCIS 1 power supply');
    expect(label(32021)).toBe('Left main gears (body + wing) jammed actuator');
    expect(label(34003)).toBe('XPDR 1');
    expect(label(34004)).toBe('XPDR 2');
    expect(A380FailureDefinitions.every(([, , name]) => !name.includes('Foward') && !name.includes('LGCIU'))).toBe(
      true,
    );
  });

  it('does not list ROLLOUT (22001), which no system reacts to', () => {
    expect(listedIds).not.toContain(22001);
  });
});
