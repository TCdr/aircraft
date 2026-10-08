// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_STARTSEQUENCE_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_STARTSEQUENCE_A380X_HPP

#include <algorithm>
#include <optional>

/**
 * @brief What the A380X FADEC engine model does with the start sequence of the systems WASM.
 *
 * The systems WASM (Rust, systems::engine::engine_start, a380_systems engine_failure.rs) runs the FADEC start sequence on the
 * ground: igniters, light-up, start faults, automatic abort and dry crank, ENG MAN START, start and ignition failures. It cuts
 * the engine fuel (L:A32NX_ENGINE_n_FUEL_CUT) while the engine must not light up and tells this engine model:
 * - L:A32NX_ENGINE_n_START_PHASE: the phase of the start sequence (StartPhase);
 * - L:A32NX_ENGINE_n_STARTER_MOTORING: the starter turns the core (start valve open, starter air, starter not failed) while the
 *   fuel is cut;
 * - L:A32NX_ENGINE_n_START_N2_HANG / L:A32NX_ENGINE_n_START_EGT_OVERSHOOT: hung start / hot start (both for a stall).
 *
 * On the A380X the ENG MASTER lever drives the MSFS starter (cockpit behaviour XML, FBW_ENGINE_Switch_Master_Template), and
 * MSFS turns the core with it whenever its APU bleed is on, whatever the FBW start valve. Therefore:
 * - a start attempt whose fuel the start sequence cuts is still a start (STARTING), not a shutdown;
 * - on the ground, during such a start, a core whose starter does not get air (start valve stuck closed, no starter air,
 *   starter failure) is brought to rest by the FADEC (MSFS corrected N2), so that it does not turn;
 * - the ENG MASTER OFF stops the MSFS starter: a dry crank with the master OFF is not modelled on the A380X.
 *
 * No MSFS SDK dependency: tested natively (test/run_tests.sh).
 */
namespace StartSequence_A380X {

/// L:A32NX_ENGINE_n_START_PHASE (systems::engine::engine_start::EngineStartPhase)
enum StartPhase {
  NONE            = 0,
  MOTORING        = 1,  // dry crank, or manual start before the ENG MASTER ON
  STARTING        = 2,  // start attempt
  AUTOMATIC_CRANK = 3,  // dry crank after an aborted attempt of an automatic start
  ABORTED         = 4,  // start over without success, until the ENG MASTER OFF
  WET_CRANK       = 5,  // ENG START CRANK, MAN START ON, ENG MASTER ON: fuel without ignition
};

/// Design choice, no FCOM value: a hung start (or a stall) leaves the core speed at 60 % of the idle N3.
constexpr double HUNG_START_N3_RATIO_OF_IDLE = 0.6;

/// Design choice, no FCOM value: the EGT of a hot start (or a stall) rises 30 °C/s above the normal start EGT after the
/// light-up, which takes it above the 745 °C start limit (FCOM DSC-70-90 l.113191) within a few seconds.
constexpr double EGT_OVERSHOOT_RATE_CELSIUS_PER_SECOND = 30.0;

/// Design choice: an unlit core follows the MSFS motoring speed with this time constant (seconds), and a core without starter
/// air runs down with it.
constexpr double UNLIT_N3_TIME_CONSTANT_SECONDS = 2.0;

/**
 * @brief The start sequence keeps the start going (STARTING) while it cuts the fuel: a start attempt not lit up yet, the
 * automatic dry crank between attempts, or a wet crank, on the ground with the ENG MASTER ON.
 */
inline bool startSequenceKeepsStarter(bool simOnGround, bool engineFuelCut, int startPhase) {
  return simOnGround && engineFuelCut && (startPhase == STARTING || startPhase == AUTOMATIC_CRANK || startPhase == WET_CRANK);
}

/**
 * @brief The start sequence motors the core with the ENG MASTER OFF (dry crank, or a manual start before the ENG MASTER ON):
 * the cockpit XML (pedestal.xml A380X_ENGINE_Switch_Master_Template) engages the MSFS starter from
 * L:A32NX_ENGINE_n_STARTER_MOTORING. The start sequence motors the core in the phases MOTORING and NONE (a start valve stuck
 * open) only with the ENG MASTER OFF.
 */
inline bool startSequenceCranks(bool starterMotoring, int startPhase) {
  return starterMotoring && (startPhase == MOTORING || startPhase == NONE);
}

/**
 * @brief The ENG MASTER as the engine model sees it: the MSFS starter, which follows the lever, unless the start sequence
 * engaged it for a crank with the lever OFF.
 */
inline bool engineMasterOn(bool simStarter, bool startSequenceCranks) {
  return simStarter && !startSequenceCranks;
}

/**
 * @brief During such a start, the core turns only if the starter gets air (L:A32NX_ENGINE_n_STARTER_MOTORING).
 */
inline bool coreHeldAtRest(bool startSequenceKeepsStarter, bool starterMotoring) {
  return startSequenceKeepsStarter && !starterMotoring;
}

/// The MSFS corrected N3 of a core brought to rest: it runs down with the time constant.
inline double restingCoreCorrectedN3(double correctedN3, double deltaTime) {
  return correctedN3 * (1.0 - (std::min)(1.0, deltaTime / UNLIT_N3_TIME_CONSTANT_SECONDS));
}

/**
 * @brief The MSFS corrected N3 the FADEC writes, frame after frame, for a core it brings to rest (coreHeldAtRest).
 *
 * Design choice: the core runs down from the speed it had when the hold began, along the FADEC's own value, and not from the
 * MSFS speed read back each frame. The MSFS starter (it follows the ENG MASTER lever) keeps adding its torque between two
 * writes; a run-down applied to the MSFS speed read back settles where the two balance, at about the starter acceleration
 * times the time constant: 5.7 % N3 with the APU bleed (sim test 2026-10-08, starter failure). The systems WASM detects a
 * failed starter as starter air with the core below 5 % N2 for 10 s (engine_start.rs STARTER_FAULT_MAX_N2_PERCENT), so the
 * starter failure was never detected. A380 FCOM DSC-70-80-30-20 (a380_fcom.txt l.112492-112493): "In the case of a starter
 * failure [...] the FADEC automatically aborts the engine start without further attempt of automatic start sequence."
 */
class RestingCore {
 public:
  /// The corrected N3 to write this frame; the hold begins at the MSFS corrected N3 of its first frame.
  double hold(double msfsCorrectedN3, double deltaTime) {
    heldCorrectedN3 = restingCoreCorrectedN3(heldCorrectedN3.value_or(msfsCorrectedN3), deltaTime);
    return *heldCorrectedN3;
  }

  /// The core is not held at rest this frame: MSFS turns it again.
  void release() { heldCorrectedN3.reset(); }

 private:
  std::optional<double> heldCorrectedN3;
};

/**
 * @brief The OFF engine state becomes ON for an engine that runs at the load of a flight (on the ground or in the air): ENG
 * START selector at NORM, MSFS starter on (it follows the ENG MASTER lever), core above 20 % N3, and MSFS burning in it.
 *
 * Without the combustion a cold engine became ON as soon as its MSFS starter turned the core past 20 % with the ENG MASTER ON
 * at NORM on the ground: the FADEC showed it running and the auto relight selected igniters A + B for an unlit engine (sim
 * test 2026-10-07). A normal start (ENG START at IGN/START, also the aircraft presets) goes through STARTING.
 */
inline bool offEngineIsRunning(int engineIgniter, bool engineStarter, double simN3, bool simCombustion) {
  return engineIgniter == 1 && engineStarter && simN3 > 20 && simCombustion;
}

/**
 * @brief A start (STARTING, RESTARTING) is over when the core reaches idle, unless a hung start or a stall holds it below.
 */
inline bool startReachesIdle(bool engineStarter, double simN3, double idleN3, bool n3Hang) {
  return engineStarter && simN3 >= (idleN3 - 0.1) && !n3Hang;
}

/**
 * @brief The N3 of a core that turns without combustion during a ground start: it follows the motoring speed (the start N3
 * of the MSFS N3 without the floor at the previous value that the start of a burning engine has) with a time constant.
 */
inline double unlitStartN3(double previousN3, double motoredN3, double deltaTime) {
  const double blend = (std::min)(1.0, deltaTime / UNLIT_N3_TIME_CONSTANT_SECONDS);
  return previousN3 + (motoredN3 - previousN3) * blend;
}

/// The N3 of a hung start or a stall: it hangs below idle.
inline double hungStartN3(double n3, double idleN3, bool n3Hang) {
  return n3Hang ? (std::min)(n3, HUNG_START_N3_RATIO_OF_IDLE * idleN3) : n3;
}

/// The EGT excess of a hot start or a stall: it grows while the systems WASM reports the overshoot, and is gone otherwise.
inline double egtOvershoot(double previousExcess, bool overshoot, double deltaTime) {
  return overshoot ? previousExcess + EGT_OVERSHOOT_RATE_CELSIUS_PER_SECOND * deltaTime : 0.0;
}

}  // namespace StartSequence_A380X

#endif  // FLYBYWIRE_AIRCRAFT_STARTSEQUENCE_A380X_HPP
