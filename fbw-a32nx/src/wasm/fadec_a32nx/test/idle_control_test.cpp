// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the FADEC idle setting (src/Fadec/IdleControl_A32NX.hpp): run test/run_tests.sh. Modulated idle rises
// with the engine bleed demand, approach idle (in flight, FLAPS lever not at 0, or without the EIU data) is above it whatever the
// bleed demand, and on ground without the bleed valve status the idle is that of every valve open. Built with -DWITHOUT_THE_FIX,
// the idle setting is the minimum idle in every case and ignores the lost valve status: the checks fail.

#include <cstdio>

#include "../src/Fadec/IdleControl_A32NX.hpp"

using IdleControl_A32NX::BleedDemand;
using IdleControl_A32NX::IdleMode;

static int failures = 0;

static void expect(const char* what, bool condition, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.3f)\n", what, value);
    ++failures;
  }
}

/// The idle setting above the minimum idle in corrected N2, percent
static double idleCN2Increase(bool onGround, double flapsHandleIndex, const BleedDemand& bleed) {
#ifdef WITHOUT_THE_FIX
  (void)onGround;
  (void)flapsHandleIndex;
  (void)bleed;
  return 0.0;
#else
  return IdleControl_A32NX::idleCN2Increase(IdleControl_A32NX::idleMode(onGround, flapsHandleIndex, false), bleed);
#endif
}

static constexpr BleedDemand NO_BLEED{false, false, false};
static constexpr BleedDemand PACKS{true, false, false};
static constexpr BleedDemand ALL_BLEED{true, true, true};

/// The modulated idle increase with the bleed valve status lost or not (ENG 1(2) BLEED STATUS FAULT)
static double modulatedIdleCN2Increase(bool onGround, bool bleedValveStatusLost, const BleedDemand& measured) {
#ifdef WITHOUT_THE_FIX
  (void)onGround;
  (void)bleedValveStatusLost;
  return IdleControl_A32NX::idleCN2Increase(IdleMode::MODULATED, measured);
#else
  return IdleControl_A32NX::idleCN2Increase(IdleMode::MODULATED,
                                            IdleControl_A32NX::fadecBleedDemand(measured, onGround, bleedValveStatusLost));
#endif
}

/// The modulated idle increase with the recirculation minimum N2 raise or not
static double recirculationIdleCN2Increase(const BleedDemand& bleed, bool raised) {
#ifdef WITHOUT_THE_FIX
  (void)raised;
  return IdleControl_A32NX::idleCN2Increase(IdleMode::MODULATED, bleed);
#else
  return IdleControl_A32NX::idleCN2Increase(IdleMode::MODULATED, bleed, raised);
#endif
}

int main() {
  // Mode selection: approach idle only in flight with the FLAPS lever out of 0
  expect("in flight, FLAPS 0: modulated", IdleControl_A32NX::idleMode(false, 0, false) == IdleMode::MODULATED, 0);
  expect("in flight, FLAPS 1: approach", IdleControl_A32NX::idleMode(false, 1, false) == IdleMode::APPROACH, 1);
  expect("in flight, FLAPS FULL: approach", IdleControl_A32NX::idleMode(false, 4, false) == IdleMode::APPROACH, 4);
  expect("on ground, FLAPS 3: modulated", IdleControl_A32NX::idleMode(true, 3, false) == IdleMode::MODULATED, 3);
  // Without the EIU data only approach idle is available, on ground and in flight with the FLAPS lever at 0
  expect("EIU data lost, in flight, FLAPS 0: approach", IdleControl_A32NX::idleMode(false, 0, true) == IdleMode::APPROACH, 0);
  expect("EIU data lost, on ground: approach", IdleControl_A32NX::idleMode(true, 0, true) == IdleMode::APPROACH, 0);

  // Modulated idle: the minimum idle without bleed demand, higher with each consumer
  const double clean = idleCN2Increase(false, 0, NO_BLEED);
  const double packs = idleCN2Increase(false, 0, PACKS);
  const double allBleed = idleCN2Increase(false, 0, ALL_BLEED);
  expect("modulated idle without bleed demand is the minimum idle", clean == 0.0, clean);
  expect("modulated idle rises with the packs", packs > clean, packs);
  expect("modulated idle rises with the anti-ice", allBleed > packs, allBleed);
  expect("modulated idle on ground also follows the bleed demand", idleCN2Increase(true, 2, ALL_BLEED) == allBleed,
         idleCN2Increase(true, 2, ALL_BLEED));

  // Approach idle: the same whatever the bleed demand, above every modulated idle
  const double approachClean = idleCN2Increase(false, 3, NO_BLEED);
  const double approachAllBleed = idleCN2Increase(false, 3, ALL_BLEED);
  expect("approach idle does not depend on the bleed demand", approachClean == approachAllBleed, approachAllBleed);
  expect("approach idle is above modulated idle with every bleed consumer", approachClean > allBleed, approachClean);

  // HI GND IDLE: without the bleed valve status, on ground the idle is that of every valve open, whatever the valves do
  const double everyValveOpen = IdleControl_A32NX::idleCN2Increase(IdleMode::MODULATED, ALL_BLEED);
  const double packsOnly = IdleControl_A32NX::idleCN2Increase(IdleMode::MODULATED, PACKS);
  const double groundStatusLost = modulatedIdleCN2Increase(true, true, NO_BLEED);
  expect("bleed valve status lost on ground: idle of every valve open", groundStatusLost == everyValveOpen, groundStatusLost);
  const double groundStatusLostPacks = modulatedIdleCN2Increase(true, true, PACKS);
  expect("bleed valve status lost on ground, packs on: idle of every valve open", groundStatusLostPacks == everyValveOpen,
         groundStatusLostPacks);
  const double flightStatusLost = modulatedIdleCN2Increase(false, true, NO_BLEED);
  expect("bleed valve status lost in flight: idle of the measured demand", flightStatusLost == 0.0, flightStatusLost);
  const double groundStatusKnown = modulatedIdleCN2Increase(true, false, PACKS);
  expect("bleed valve status known on ground: idle of the measured demand", groundStatusKnown == packsOnly, groundStatusKnown);

  // Fuel recirculation of the IDG cooling: the minimum N2 raise lifts the modulated idle, never above the approach idle, and does not
  // add to a higher bleed idle
  const double raised = recirculationIdleCN2Increase(NO_BLEED, true);
  expect("recirculation raises the minimum N2 of a modulated idle", raised > clean, raised);
  expect("recirculation raise stays below the approach idle", raised < approachClean, raised);
  const double raisedWithPacks = recirculationIdleCN2Increase(PACKS, true);
  expect("recirculation does not add to the bleed idle of the packs", raisedWithPacks == raised, raisedWithPacks);
  const double raisedWithAllBleed = recirculationIdleCN2Increase(ALL_BLEED, true);
  expect("a bleed idle above the raise stays", raisedWithAllBleed == allBleed, raisedWithAllBleed);
  expect("approach idle ignores the raise",
         IdleControl_A32NX::idleCN2Increase(IdleMode::APPROACH, NO_BLEED, true) == approachClean, approachClean);

  if (failures == 0) {
    std::printf("idle_control_test: all checks passed\n");
  }
  return failures == 0 ? 0 : 1;
}
