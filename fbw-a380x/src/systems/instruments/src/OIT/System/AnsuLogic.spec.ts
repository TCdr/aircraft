// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  ARU_START_DURATION_MS,
  aruStartDurationMs,
  AnsuSupplies,
  AruStartup,
  LAPTOP_RESTART_OFF_MS,
  LaptopNetworkConnection,
  NssAutoShutdown,
  OIT_RESTART_OFF_MS,
  PowerCycleRecovery,
  isAnsuAcSupplied,
  isAnsuPowered,
  isGatelinkAvailable,
  isGroundWirelessAvailable,
  isNssAvncsAvailable,
  sampleFrameStepMs,
} from './AnsuLogic';

const none: AnsuSupplies = { ac1: false, ac2: false, acEss: false, acEmer: false, dcHot1: false, dcHot2: false };
const only = (supply: keyof AnsuSupplies): AnsuSupplies => ({ ...none, [supply]: true });

describe('A380 ANSU power supplies', () => {
  it('powers NSS AVNCS ANSU 1 from AC 2 or BAT 2', () => {
    expect(isAnsuPowered('nss-avncs', 1, only('ac2'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 1, only('dcHot2'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 1, only('ac1'))).toBe(false);
    expect(isAnsuPowered('nss-avncs', 1, none)).toBe(false);
  });

  it('powers NSS AVNCS ANSU 2 from AC 1, AC EMER or BAT 1', () => {
    expect(isAnsuPowered('nss-avncs', 2, only('ac1'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 2, only('acEmer'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 2, only('dcHot1'))).toBe(true);
    expect(isAnsuPowered('nss-avncs', 2, only('ac2'))).toBe(false);
    expect(isAnsuPowered('nss-avncs', 2, only('acEss'))).toBe(false);
  });

  it('powers the FLT OPS ANSU from AC ESS or BAT 1, not from AC EMER', () => {
    expect(isAnsuPowered('flt-ops', 1, only('acEss'))).toBe(true);
    expect(isAnsuPowered('flt-ops', 1, only('dcHot1'))).toBe(true);
    expect(isAnsuPowered('flt-ops', 1, only('acEmer'))).toBe(false);
  });
});

describe('A380 ANSU AC supply', () => {
  it('is the AC busbar of each unit, never the battery', () => {
    expect(isAnsuAcSupplied('nss-avncs', 1, only('ac2'))).toBe(true);
    expect(isAnsuAcSupplied('nss-avncs', 1, only('ac1'))).toBe(false);
    expect(isAnsuAcSupplied('nss-avncs', 2, only('ac1'))).toBe(true);
    expect(isAnsuAcSupplied('nss-avncs', 2, only('acEmer'))).toBe(true);
    expect(isAnsuAcSupplied('nss-avncs', 2, only('ac2'))).toBe(false);
    expect(isAnsuAcSupplied('flt-ops', 1, only('acEss'))).toBe(true);
    expect(isAnsuAcSupplied('flt-ops', 1, only('acEmer'))).toBe(false);
    expect(isAnsuAcSupplied('nss-avncs', 1, only('dcHot2'))).toBe(false);
    expect(isAnsuAcSupplied('flt-ops', 1, only('dcHot1'))).toBe(false);
  });
});

describe('A380 NSS AVNCS ANSU redundancy', () => {
  it('keeps the NSS AVNCS applications with ANSU 1 failed: ANSU 2 takes over', () => {
    expect(isNssAvncsAvailable(false, true)).toBe(true);
  });

  it('keeps them with ANSU 2 failed', () => {
    expect(isNssAvncsAvailable(true, false)).toBe(true);
  });

  it('loses them with both ANSUs failed', () => {
    expect(isNssAvncsAvailable(false, false)).toBe(false);
  });
});

describe('A380 ARU start: 2 minutes at power-up', () => {
  it('operates 2 minutes after the aircraft power-up, not before', () => {
    const aru = new AruStartup();
    // cold and dark at the flight load, the crew powers the aircraft later
    expect(aru.update(false, AruStartup.FLIGHT_LOAD_WINDOW_MS + 1_000)).toBe(false);
    expect(aru.update(true, 100)).toBe(false);
    expect(aru.update(true, ARU_START_DURATION_MS - 1_000)).toBe(false);
    expect(aru.update(true, 1_000)).toBe(true);
  });

  it('starts again for 2 minutes after a power loss', () => {
    const aru = new AruStartup();
    aru.update(false, 0);
    aru.update(true, ARU_START_DURATION_MS);
    expect(aru.isOperating()).toBe(true);
    expect(aru.update(false, 100)).toBe(false);
    expect(aru.update(true, 60_000)).toBe(false);
    expect(aru.update(true, 60_000)).toBe(true);
  });

  it('is already operating in a flight loaded with the aircraft powered', () => {
    const aru = new AruStartup();
    // the first frame: the ANSU does not know its state yet
    expect(aru.update(false, 0)).toBe(false);
    expect(aru.update(true, 50)).toBe(true);
  });
});

describe('ARU start time follows the self-test time setting', () => {
  it('is the 2 minutes of the FCOM for REAL (12, also the default), 5/12 for FAST, 0 for INSTANT', () => {
    expect(aruStartDurationMs(12)).toBe(ARU_START_DURATION_MS);
    expect(aruStartDurationMs(5)).toBeCloseTo((ARU_START_DURATION_MS * 5) / 12);
    expect(aruStartDurationMs(0)).toBe(0);
  });

  it('counts a value above REAL, a negative one and a value that is not a number as REAL or INSTANT', () => {
    expect(aruStartDurationMs(15)).toBe(ARU_START_DURATION_MS);
    expect(aruStartDurationMs(Number.NaN)).toBe(ARU_START_DURATION_MS);
    expect(aruStartDurationMs(-3)).toBe(0);
  });

  // The crew powers the aircraft after the first seconds of the flight; the laptop is switched on at once
  const laptopStartedWithTheAnsu = (startDurationMs: number): boolean => {
    const aru = new AruStartup(startDurationMs);
    const laptop = new LaptopNetworkConnection();
    aru.update(false, AruStartup.FLIGHT_LOAD_WINDOW_MS + 1_000);
    const aruOperating = aru.update(true, 50);
    return laptop.update(true, aruOperating, aru.isFlightLoading());
  };

  it('INSTANT: a laptop started with the FLT OPS ANSU is not a stand-alone', () => {
    expect(laptopStartedWithTheAnsu(aruStartDurationMs(0))).toBe(false);
  });

  it('INSTANT: the ARU does not operate without a healthy FLT OPS ANSU', () => {
    const aru = new AruStartup(0);
    expect(aru.update(false, 5_000)).toBe(false);
    expect(aru.update(true, 50)).toBe(true);
    expect(aru.update(false, 50)).toBe(false);
  });

  it('REAL: a laptop started with the FLT OPS ANSU is a stand-alone (FCOM: the ARU starts for 2 minutes)', () => {
    expect(laptopStartedWithTheAnsu(aruStartDurationMs(12))).toBe(true);
  });

  it('FAST: the ARU operates after 5/12 of the 2 minutes', () => {
    const aru = new AruStartup(aruStartDurationMs(5));
    aru.update(false, AruStartup.FLIGHT_LOAD_WINDOW_MS + 1_000);
    expect(aru.update(true, 49_000)).toBe(false);
    expect(aru.update(true, 1_001)).toBe(true);
  });
});

describe('A380 laptop STANDALONE', () => {
  it('is connected when started with the ARU operating', () => {
    const laptop = new LaptopNetworkConnection();
    expect(laptop.update(true, true)).toBe(false);
  });

  it('started before the ARU: stays a stand-alone after the ARU start, until it is restarted', () => {
    const laptop = new LaptopNetworkConnection();
    expect(laptop.update(true, false)).toBe(true);
    expect(laptop.update(true, true)).toBe(true);
    // switched off, then on again
    expect(laptop.update(false, true)).toBe(false);
    expect(laptop.update(true, true)).toBe(false);
  });

  it('is a stand-alone while not connected to the network (ARU lost), connected again when it is back', () => {
    const laptop = new LaptopNetworkConnection();
    laptop.update(true, true);
    expect(laptop.update(true, false)).toBe(true);
    expect(laptop.isStandalone()).toBe(true);
    expect(laptop.update(true, true)).toBe(false);
  });

  it('a laptop running at the flight load of a powered aircraft is connected, not a stand-alone', () => {
    const laptop = new LaptopNetworkConnection();
    // the first frame: the ARU is not known to operate yet
    expect(laptop.update(true, false, true)).toBe(true);
    expect(laptop.update(true, true, true)).toBe(false);
    expect(laptop.update(true, true, false)).toBe(false);
  });

  it('is no stand-alone while switched off', () => {
    const laptop = new LaptopNetworkConnection();
    expect(laptop.update(false, false)).toBe(false);
  });
});

describe('NSS GATELINK pb-sw', () => {
  it('the gatelink works on the ground, connected, with the TWLU on', () => {
    expect(isGatelinkAvailable(true, true, false)).toBe(true);
  });

  it('the gatelink is lost with the pb-sw OFF, in flight, or without the network', () => {
    expect(isGatelinkAvailable(true, true, true)).toBe(false);
    expect(isGatelinkAvailable(true, false, false)).toBe(false);
    expect(isGatelinkAvailable(false, true, false)).toBe(false);
  });

  it('data from the ground is blocked on the ground by the pb-sw, not in flight', () => {
    expect(isGroundWirelessAvailable(true, true, true)).toBe(false);
    expect(isGroundWirelessAvailable(true, true, false)).toBe(true);
    expect(isGroundWirelessAvailable(true, false, true)).toBe(true);
    expect(isGroundWirelessAvailable(false, false, false)).toBe(false);
  });
});

describe('PowerCycleRecovery', () => {
  it('an OIT with a failure stays affected until it was off long enough and on again', () => {
    const oit = new PowerCycleRecovery(OIT_RESTART_OFF_MS);
    expect(oit.update(true, true, 0)).toBe(true);
    expect(oit.update(true, false, 1_000)).toBe(true);
    expect(oit.update(true, false, 1_000 + OIT_RESTART_OFF_MS - 1)).toBe(true);
    expect(oit.update(true, false, 1_000 + OIT_RESTART_OFF_MS)).toBe(true);
    expect(oit.update(true, true, 1_000 + OIT_RESTART_OFF_MS + 1)).toBe(false);
    expect(oit.update(true, true, 60_000)).toBe(false);
  });

  it('too short a power cycle does not clear the failure', () => {
    const oit = new PowerCycleRecovery(OIT_RESTART_OFF_MS);
    oit.update(true, false, 0);
    expect(oit.update(true, true, OIT_RESTART_OFF_MS - 1)).toBe(true);
  });

  it('the laptop needs its own, longer off time', () => {
    const laptop = new PowerCycleRecovery(LAPTOP_RESTART_OFF_MS);
    laptop.update(true, false, 0);
    expect(laptop.update(true, true, OIT_RESTART_OFF_MS)).toBe(true);
    laptop.update(true, false, 10_000);
    expect(laptop.update(true, true, 10_000 + LAPTOP_RESTART_OFF_MS)).toBe(false);
  });

  it('a new failure affects the device again after the old one went away', () => {
    const oit = new PowerCycleRecovery(OIT_RESTART_OFF_MS);
    oit.update(true, false, 0);
    expect(oit.update(true, true, OIT_RESTART_OFF_MS)).toBe(false);
    expect(oit.update(false, true, 20_000)).toBe(false);
    expect(oit.update(true, true, 21_000)).toBe(true);
  });

  it('time off before the failure does not count', () => {
    const oit = new PowerCycleRecovery(OIT_RESTART_OFF_MS);
    oit.update(false, false, 0);
    oit.update(true, false, 20_000);
    expect(oit.update(true, true, 20_001)).toBe(true);
  });

  it('never affects a device without a failure', () => {
    const oit = new PowerCycleRecovery(OIT_RESTART_OFF_MS);
    expect(oit.update(false, false, 0)).toBe(false);
    expect(oit.update(false, true, 1)).toBe(false);
  });
});

describe('NssAutoShutdown', () => {
  it('stays on while an AC bus is supplied', () => {
    const shutdown = new NssAutoShutdown();
    expect(shutdown.update(true, 1)).toBe(false);
    expect(shutdown.update(true, 100_000)).toBe(false);
  });

  it('ignores a short AC network transfer', () => {
    const shutdown = new NssAutoShutdown();
    shutdown.update(true, 1);
    expect(shutdown.update(false, 1_000)).toBe(false);
    expect(shutdown.update(false, 1_000 + NssAutoShutdown.AC_LOSS_DEBOUNCE_MS - 1)).toBe(false);
    expect(shutdown.update(true, 1_000 + NssAutoShutdown.AC_LOSS_DEBOUNCE_MS)).toBe(false);
    expect(shutdown.update(false, 20_000)).toBe(false);
  });

  it('shuts down after the aircraft is powered down, and restarts with the AC supply', () => {
    const shutdown = new NssAutoShutdown();
    shutdown.update(true, 1);
    shutdown.update(false, 1_000);
    expect(shutdown.update(false, 1_000 + NssAutoShutdown.AC_LOSS_DEBOUNCE_MS)).toBe(true);
    expect(shutdown.update(true, 60_000)).toBe(false);
  });

  it.each([15_000, 30_000, 60_000])('never shuts down when AC is first reported after %i ms of the flight', (acMs) => {
    const shutdown = new NssAutoShutdown();
    for (let t = 1_000; t < acMs; t += 1_000) {
      expect(shutdown.update(false, 5_000_000 + t)).toBe(false);
    }
    expect(shutdown.update(true, 5_000_000 + acMs)).toBe(false);
  });

  it('does not count the placeholder time 0 of the clock before its first event as a time without AC', () => {
    const shutdown = new NssAutoShutdown();
    shutdown.update(true, 4_000_000);
    expect(shutdown.update(false, 0)).toBe(false);
    expect(shutdown.update(false, 5_000_000)).toBe(false);
    expect(shutdown.update(false, 5_000_000 + NssAutoShutdown.AC_LOSS_DEBOUNCE_MS)).toBe(true);
  });
});

describe('sampleFrameStepMs', () => {
  it('counts no time at the first frame or for the jump from the placeholder clock 0 to the sim clock', () => {
    expect(sampleFrameStepMs(null, 0)).toBe(0);
    expect(sampleFrameStepMs(0, 5_000_000)).toBe(0);
  });

  it('counts a normal frame step, and at most one second of a load hitch', () => {
    expect(sampleFrameStepMs(5_000_000, 5_000_050)).toBe(50);
    expect(sampleFrameStepMs(5_000_000, 5_030_000)).toBe(1_000);
  });

  it('counts no time for a clock that stands still or goes back', () => {
    expect(sampleFrameStepMs(5_000_000, 5_000_000)).toBe(0);
    expect(sampleFrameStepMs(5_000_000, 4_000_000)).toBe(0);
  });
});

describe('FLT OPS laptop at a flight load of a powered aircraft', () => {
  const frameMs = 50;
  const simClockMs = 5_000_000;

  // Runs the classes of the instruments in their frame order for a flight loaded with the aircraft powered: the laptop
  // runs from frame 1, the clock reads the placeholder 0 at frame 1 and the sim clock from frame 2, the laptop updates
  // before the ANSU (so it reads the ANSU flag of the previous frame) and the batteries report at once while AC ESS
  // reports after acEssFrame. The FLT OPS ANSU flag is true from ansuFlagFrame (1 = written at the first frame).
  const standaloneAfterFlightLoad = (ansuFlagFrame: number, acEssFrame = 1): boolean => {
    const shutdown = new NssAutoShutdown();
    const aru = new AruStartup();
    const laptop = new LaptopNetworkConnection();
    let flag = false;
    let lastNow: number | null = null;
    let standalone = false;
    for (let frame = 1; frame <= 2_000; frame++) {
      const now = frame === 1 ? 0 : simClockMs + (frame - 2) * frameMs;
      const aruOperating = aru.update(flag, sampleFrameStepMs(lastNow, now));
      lastNow = now;
      standalone = laptop.update(true, aruOperating, aru.isFlightLoading());
      const supplies: AnsuSupplies = { ...none, dcHot1: true, acEss: frame >= acEssFrame };
      const shutDown = shutdown.update(isAnsuAcSupplied('flt-ops', 1, supplies), now);
      flag = frame >= ansuFlagFrame && !shutDown && isAnsuPowered('flt-ops', 1, supplies);
    }
    return standalone;
  };

  it.each([1, 2, 5, 20, 100])('is connected with the ANSU flag true from frame %i', (flagFrame) => {
    expect(standaloneAfterFlightLoad(flagFrame)).toBe(false);
  });

  it.each([1, 20, 120, 190])('is connected with AC ESS reporting at frame %i', (acEssFrame) => {
    expect(standaloneAfterFlightLoad(1, acEssFrame)).toBe(false);
  });

  it.each([15_000, 30_000, 60_000])('is connected when AC ESS is first reported after %i ms', (acMs) => {
    expect(standaloneAfterFlightLoad(1, acMs / frameMs)).toBe(false);
  });

  it('measured in the sim: AC ESS first reports 69 s after the load, the laptop is switched on at 129 s', () => {
    const shutdown = new NssAutoShutdown();
    const aru = new AruStartup(aruStartDurationMs(0));
    const laptop = new LaptopNetworkConnection();
    let anyShutdown = false;
    let standalone = false;
    let previousMs: number | null = null;
    for (let elapsedMs = 0; elapsedMs <= 180_000; elapsedMs += 50) {
      const now = elapsedMs === 0 ? 0 : simClockMs + elapsedMs;
      const supplies: AnsuSupplies = { ...none, dcHot1: true, acEss: elapsedMs >= 68_917 };
      const shutDown = shutdown.update(isAnsuAcSupplied('flt-ops', 1, supplies), now);
      anyShutdown ||= shutDown;
      const ansuHealthy = !shutDown && isAnsuPowered('flt-ops', 1, supplies);
      const aruOperating = aru.update(ansuHealthy, sampleFrameStepMs(previousMs, now));
      previousMs = now;
      standalone = laptop.update(elapsedMs >= 129_102, aruOperating, aru.isFlightLoading());
    }
    expect(anyShutdown).toBe(false);
    expect(standalone).toBe(false);
  });

  it('is a stand-alone when the ANSU is not healthy until after the first seconds of the flight', () => {
    expect(standaloneAfterFlightLoad(AruStartup.FLIGHT_LOAD_WINDOW_MS / frameMs + 100)).toBe(true);
  });
});
