// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_STARTSEQUENCE_A32NX_HPP
#define FLYBYWIRE_AIRCRAFT_STARTSEQUENCE_A32NX_HPP

#include <algorithm>

/**
 * @brief What the FADEC engine model does with the start sequence of the systems WASM.
 *
 * The systems WASM (Rust, systems::engine::engine_start) runs the FADEC start sequence: igniters, light-up, start faults,
 * automatic abort and dry crank, ENG MAN START (manual start, dry and wet crank), and the start and ignition failures. It
 * cuts the engine fuel (L:A32NX_ENGINE_n_FUEL_CUT) while the engine must not light up, and tells this engine model:
 * - L:A32NX_ENGINE_n_STARTER_MOTORING: keep the MSFS starter engaged although the fuel is cut or the ENG MASTER is OFF, so
 *   that MSFS turns the core without combustion (crank, start attempt not lit up yet, start valve stuck open);
 * - L:A32NX_ENGINE_n_START_PHASE: the phase of the start sequence (StartPhase);
 * - L:A32NX_ENGINE_n_START_N2_HANG / L:A32NX_ENGINE_n_START_EGT_OVERSHOOT: hung start / hot start (both for a stall);
 * - L:A32NX_ENGINE_n_STARTER_FAILED: the starter does not turn the engine.
 *
 * No MSFS SDK dependency: tested natively (test/run_tests.sh).
 */
namespace StartSequence_A32NX {

/// L:A32NX_ENGINE_n_START_PHASE (systems::engine::engine_start::EngineStartPhase)
enum StartPhase {
  NONE            = 0,
  MOTORING        = 1,  // dry crank, or manual start before the ENG MASTER ON
  STARTING        = 2,  // start attempt
  AUTOMATIC_CRANK = 3,  // dry crank after an aborted attempt of an automatic start
  ABORTED         = 4,  // start over without success, until the ENG MASTER OFF
  WET_CRANK       = 5,  // ENG MODE CRANK, MAN START ON, ENG MASTER ON: fuel without ignition
};

/// A320 FCOM DSC-70-80-40 (a320_fcom.txt l.63707-63708): "The HP fuel valve opens: On ground: when N2 > 22 %".
constexpr double HP_FUEL_VALVE_OPEN_N2 = 22.0;

/// Design choice, no FCOM value: a hung start (or a stall) leaves the core speed at 60 % of the idle N2 (about 41 %), between
/// the light-up (22 %) and the end of the start (50 %).
constexpr double HUNG_START_N2_RATIO_OF_IDLE = 0.6;

/// Design choice, no FCOM value: the EGT of a hot start (or a stall) rises 30 °C/s above the normal start EGT after the
/// light-up, which takes it above the 725 °C start limit (FCOM PRO-ABN-ENG l.81366) within a few seconds.
constexpr double EGT_OVERSHOOT_RATE_CELSIUS_PER_SECOND = 30.0;

/// Design choice: an unlit core follows the MSFS motoring speed with this time constant (seconds), instead of jumping to it.
constexpr double UNLIT_N2_TIME_CONSTANT_SECONDS = 2.0;

enum class StarterCommand {
  NONE,     // leave the MSFS starter as it is
  ENGAGE,   // SET_STARTER_HELD 1
  RELEASE,  // SET_STARTER_HELD 0 and STARTER 0
};

struct StarterInputs {
  bool   starterHeld;           // the MSFS starter is held (the FBW "engine running or starting")
  bool   fuelValveFullyOpen;    // ENG MASTER ON and engine fuel not cut
  bool   fuelValveFullyClosed;  // ENG MASTER OFF or engine fuel cut
  bool   starterPressurized;    // starter air (L:A32NX_PNEU_ENG_n_STARTER_PRESSURIZED)
  bool   starterFailed;         // starter failure: the air does not turn the engine
  bool   starterMotoring;       // the start sequence turns the core without fuel
  bool   inFlightRelight;       // in flight, an engine out whose fuel is no longer cut is lighting up
  double simN2;                 // MSFS N2
};

/**
 * @brief Engages or releases the MSFS starter, which is how the FBW engine model starts, runs and stops the MSFS engine.
 *
 * Before the start sequence of the systems WASM: engaged when the fuel valve is open and (starter air or N2 above 20 % or an
 * in-flight relight lighting up); released when the fuel valve closes, or without starter air below 20 % N2. Now also engaged
 * while the start sequence motors the core without fuel, and a failed starter gives no starter air.
 */
inline StarterCommand starterCommand(const StarterInputs& in) {
  const bool starterAir = in.starterPressurized && !in.starterFailed;
  const bool motoring   = in.starterMotoring && starterAir;
  if (!in.starterHeld && (motoring || (in.fuelValveFullyOpen && (starterAir || in.simN2 >= 20 || in.inFlightRelight)))) {
    return StarterCommand::ENGAGE;
  }
  if (in.starterHeld && !motoring &&
      (in.fuelValveFullyClosed || (in.fuelValveFullyOpen && !starterAir && in.simN2 < 20 && !in.inFlightRelight))) {
    return StarterCommand::RELEASE;
  }
  return StarterCommand::NONE;
}

/**
 * @brief The OFF engine state may become ON when the MSFS engine turns with its starter above 20 % N2 at NORM and MSFS burns in
 * it (an engine running at the load of a flight). A core that the start sequence motors without fuel is not running, nor is a
 * core that the MSFS starter turns without combustion (the same rule marked a cold A380X engine ON at NORM, sim test
 * 2026-10-07). A normal start (ENG MODE at IGN/START, also the aircraft presets) goes through STARTING.
 */
inline bool offEngineIsRunning(int engineIgniter, bool engineStarter, double simN2, bool starterMotoring, bool simCombustion) {
  return engineIgniter == 1 && engineStarter && simN2 > 20 && !starterMotoring && simCombustion;
}

/**
 * @brief A start (STARTING, RESTARTING) is over when the core reaches idle, unless a hung start or a stall holds it below.
 */
inline bool startReachesIdle(bool engineStarter, double simN2, double idleN2, bool n2Hang) {
  return engineStarter && simN2 >= (idleN2 - 0.1) && !n2Hang;
}

/// The engine burns during the start: its fuel is not cut by the systems WASM.
inline bool startIsLit(bool engineFuelCut) {
  return !engineFuelCut;
}

/**
 * @brief The N2 of a core that turns without combustion during a start: it follows the motoring N2 (the start N2 of the MSFS
 * N2, without the floor at the previous value that the start of a burning engine has) with a time constant.
 */
inline double unlitStartN2(double previousN2, double motoredN2, double deltaTime) {
  const double blend = (std::min)(1.0, deltaTime / UNLIT_N2_TIME_CONSTANT_SECONDS);
  return previousN2 + (motoredN2 - previousN2) * blend;
}

/**
 * @brief The fuel flow shown during a start that has not lit up: the HP fuel valve is open in a start attempt or a wet crank
 * above 22 % N2, and the fuel flows without burning; no fuel otherwise (crank, abort, before the HP valve opens).
 */
inline bool fuelFlowsWithoutLightUp(int startPhase, double n2) {
  return (startPhase == STARTING || startPhase == WET_CRANK) && n2 >= HP_FUEL_VALVE_OPEN_N2;
}

/// The N2 of a hung start or a stall: it hangs below idle.
inline double hungStartN2(double n2, double idleN2, bool n2Hang) {
  return n2Hang ? (std::min)(n2, HUNG_START_N2_RATIO_OF_IDLE * idleN2) : n2;
}

/**
 * @brief The EGT excess of a hot start or a stall: it grows while the systems WASM reports the overshoot, and is gone
 * otherwise.
 */
inline double egtOvershoot(double previousExcess, bool overshoot, double deltaTime) {
  return overshoot ? previousExcess + EGT_OVERSHOOT_RATE_CELSIUS_PER_SECOND * deltaTime : 0.0;
}

}  // namespace StartSequence_A32NX

#endif  // FLYBYWIRE_AIRCRAFT_STARTSEQUENCE_A32NX_HPP
