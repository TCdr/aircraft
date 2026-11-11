// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the health of the multi-mode receivers on the ILS buses: which words a dead function takes away
// (fbw-common MultiModeReceiverHealth.h) and which MMR a bus belongs to (fbw-common IlsBusBuilder.h). Run test/run_tests.sh.

#include <cmath>
#include <cstdio>
#include <cstring>

#include "A380PrimComputerFg_types.h"
#include "IlsBusBuilder.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr unsigned int SSM_FAILURE_WARNING = 0b00;
static constexpr unsigned int SSM_NCD = 0b01;
static constexpr unsigned int SSM_NORMAL = 0b11;

static GlsApproachDefinition approach() {
  GlsApproachDefinition definition;
  definition.valid = true;
  definition.channel = 20001;
  definition.thresholdLatitudeDeg = 45;
  definition.thresholdAltitudeFt = 100;
  definition.runwayLengthM = 3000;
  definition.gpaDeg = 3;
  definition.thresholdCrossingHeightFt = 50;
  return definition;
}

/// A radio with a signal, no FLS beam and no GLS channel on either MMR, both MMRs working
static IlsBusSources workingIlsSources() {
  IlsBusSources sources;
  sources.radio = {true, 0.4, true, -0.2};
  sources.fmsCourseDeg = 87;
  sources.glsUplink = approach();
  sources.glsDeviations.lateralValid = sources.glsDeviations.verticalValid = true;
  sources.glsDeviations.lateralDeviationDeg = -0.5;
  sources.glsDeviations.verticalDeviationDeg = 0.3;
  return sources;
}

static void addFlsBeam(IlsBusSources& sources, bool lateral) {
  sources.flsBeam.valid = true;
  sources.flsBeam.lateral = lateral;
  sources.flsDeviations.valid = true;
  sources.flsDeviations.lateralDeviationDeg = 2.0;
  sources.flsDeviations.verticalDeviationDeg = -1.0;
}

static base_ils_bus busOf(int mmrIndex, const IlsBusSources& sources) {
  base_ils_bus bus{};
  IlsBusBuilder::build(bus, mmrIndex, sources);
  return bus;
}

/// The bus the builder puts out when both MMRs work, to compare the buses of a failed MMR with
static base_ils_bus busOfAWorkingMmr(IlsBusSources sources) {
  sources.mmrHealth = {};
  return busOf(0, sources);
}

static bool allWordsAre(const base_ils_bus& bus, unsigned int ssm) {
  return bus.runway_heading_deg.SSM == ssm && bus.ils_frequency_mhz.SSM == ssm && bus.localizer_deviation_deg.SSM == ssm &&
         bus.glideslope_deviation_deg.SSM == ssm;
}

static bool allDataAreZero(const base_ils_bus& bus) {
  return bus.runway_heading_deg.Data == 0 && bus.ils_frequency_mhz.Data == 0 && bus.localizer_deviation_deg.Data == 0 &&
         bus.glideslope_deviation_deg.Data == 0;
}

static bool lateralWordsAreDead(const base_ils_bus& bus) {
  return bus.runway_heading_deg.SSM == SSM_FAILURE_WARNING && bus.ils_frequency_mhz.SSM == SSM_FAILURE_WARNING &&
         bus.localizer_deviation_deg.SSM == SSM_FAILURE_WARNING && bus.runway_heading_deg.Data == 0 && bus.ils_frequency_mhz.Data == 0 &&
         bus.localizer_deviation_deg.Data == 0;
}

static bool lateralWordsAreSame(const base_ils_bus& a, const base_ils_bus& b) {
  return a.runway_heading_deg.SSM == b.runway_heading_deg.SSM && a.runway_heading_deg.Data == b.runway_heading_deg.Data &&
         a.ils_frequency_mhz.SSM == b.ils_frequency_mhz.SSM && a.ils_frequency_mhz.Data == b.ils_frequency_mhz.Data &&
         a.localizer_deviation_deg.SSM == b.localizer_deviation_deg.SSM && a.localizer_deviation_deg.Data == b.localizer_deviation_deg.Data;
}

static bool glideSlopeWordIsSame(const base_ils_bus& a, const base_ils_bus& b) {
  return a.glideslope_deviation_deg.SSM == b.glideslope_deviation_deg.SSM &&
         a.glideslope_deviation_deg.Data == b.glideslope_deviation_deg.Data;
}

static bool sameBytes(const base_ils_bus& a, const base_ils_bus& b) {
  return std::memcmp(&a, &b, sizeof(base_ils_bus)) == 0;
}

static MmrHealth unpowered() {
  MmrHealth health;
  health.powered = false;
  return health;
}

static MmrHealth ilsReceiverFailed() {
  MmrHealth health;
  health.ilsReceiverFailed = true;
  return health;
}

static MmrHealth glsFunctionFailed() {
  MmrHealth health;
  health.glsFailed = true;
  return health;
}

static MmrHealth flsFunctionLost() {
  MmrHealth health;
  health.flsFailed = true;
  return health;
}

/// The failure of the whole box takes all three functions
static MmrHealth wholeMmrFailed() {
  MmrHealth health;
  health.ilsReceiverFailed = health.glsFailed = health.flsFailed = true;
  return health;
}

static void functionsAreOperativeOnlyWhenPoweredAndNotFailed() {
  const MmrHealth working;
  expect(working.ilsOperative() && working.glsOperative() && working.flsOperative(), "a powered MMR without failures has all functions");
  expect(!unpowered().ilsOperative() && !unpowered().glsOperative() && !unpowered().flsOperative(), "an unpowered MMR has no function");
  expect(!ilsReceiverFailed().ilsOperative() && ilsReceiverFailed().glsOperative() && ilsReceiverFailed().flsOperative(),
         "a failed ILS receiver leaves the GLS and FLS functions");
  expect(glsFunctionFailed().ilsOperative() && !glsFunctionFailed().glsOperative() && glsFunctionFailed().flsOperative(),
         "a failed GLS function leaves the ILS receiver and the FLS function");
  expect(flsFunctionLost().ilsOperative() && flsFunctionLost().glsOperative() && !flsFunctionLost().flsOperative(),
         "a lost FLS function leaves the ILS receiver and the GLS function");
  expect(!wholeMmrFailed().ilsOperative() && !wholeMmrFailed().glsOperative() && !wholeMmrFailed().flsOperative(),
         "a failed MMR has no function");
}

static void healthIsReadFromTheSimVars() {
  const MmrHealth working = MmrHealth::fromSimVars(1, 0, 0);
  expect(working.powered && !working.ilsReceiverFailed && !working.glsFailed, "powered, nothing failed");
  const MmrHealth notWritten = MmrHealth::fromSimVars(0, 0, 0);
  expect(!notWritten.powered, "a power variable that was never written reads as a box without power");
  const MmrHealth ilsOnly = MmrHealth::fromSimVars(1, 1, 0);
  expect(ilsOnly.ilsReceiverFailed && !ilsOnly.glsFailed, "the ILS failure is not the GLS failure");
  const MmrHealth glsOnly = MmrHealth::fromSimVars(1, 0, 1);
  expect(!glsOnly.ilsReceiverFailed && glsOnly.glsFailed, "the GLS failure is not the ILS failure");
  expect(!working.flsFailed && !ilsOnly.flsFailed && !glsOnly.flsFailed, "an aircraft without an FLS failure variable has a working FLS");
  const MmrHealth flsOnly = MmrHealth::fromSimVars(1, 0, 0, 1);
  expect(flsOnly.flsFailed && !flsOnly.ilsReceiverFailed && !flsOnly.glsFailed, "the FLS failure is neither the ILS nor the GLS failure");
}

static void theActiveFunctionFollowsTheSourceOfTheWords() {
  expect(MultiModeReceiverHealth::activeFunction(0, false, false) == MmrFunction::Ils, "no channel, no beam: ILS");
  expect(MultiModeReceiverHealth::activeFunction(0, false, true) == MmrFunction::Ils, "no beam: ILS, whatever the lateral flag says");
  expect(MultiModeReceiverHealth::activeFunction(0, true, true) == MmrFunction::Fls, "a lateral beam: FLS");
  expect(MultiModeReceiverHealth::activeFunction(0, true, false) == MmrFunction::FlsGlideSlopeOverIls, "a vertical beam: FLS over the ILS");
  expect(MultiModeReceiverHealth::activeFunction(20001, true, true) == MmrFunction::Gls, "a GLS channel wins over a beam");
}

/// Which words each failure takes away, per function the MMR is set to: a failed ILS receiver kills the ILS and the lateral words
/// of an FLS glide slope beam, never the words an FLS lateral beam or a GLS gives
static void aDeadFunctionSendsFailureWarningOnItsWords() {
  struct Case {
    const char* name;
    MmrHealth health;
    bool flsBeam;
    bool flsLateral;
    int glsChannel;
    bool lateralDead;
    bool glideSlopeDead;
  };
  const Case cases[] = {
      {"unpowered, ILS", unpowered(), false, false, 0, true, true},
      {"unpowered, F-LOC", unpowered(), true, true, 0, true, true},
      {"unpowered, F-G/S over LOC", unpowered(), true, false, 0, true, true},
      {"unpowered, GLS", unpowered(), false, false, 20001, true, true},
      {"ILS receiver failed, ILS", ilsReceiverFailed(), false, false, 0, true, true},
      {"ILS receiver failed, F-LOC", ilsReceiverFailed(), true, true, 0, false, false},
      {"ILS receiver failed, F-G/S over LOC", ilsReceiverFailed(), true, false, 0, true, false},
      {"ILS receiver failed, GLS", ilsReceiverFailed(), false, false, 20001, false, false},
      {"GLS failed, GLS", glsFunctionFailed(), false, false, 20001, true, true},
      {"GLS failed, ILS", glsFunctionFailed(), false, false, 0, false, false},
      {"GLS failed, F-LOC", glsFunctionFailed(), true, true, 0, false, false},
      {"FLS lost, F-LOC", flsFunctionLost(), true, true, 0, true, true},
      {"FLS lost, F-G/S over LOC", flsFunctionLost(), true, false, 0, false, true},
      {"FLS lost, ILS", flsFunctionLost(), false, false, 0, false, false},
      {"FLS lost, GLS", flsFunctionLost(), false, false, 20001, false, false},
      {"MMR failed, ILS", wholeMmrFailed(), false, false, 0, true, true},
      {"MMR failed, F-LOC", wholeMmrFailed(), true, true, 0, true, true},
      {"MMR failed, F-G/S over LOC", wholeMmrFailed(), true, false, 0, true, true},
      {"MMR failed, GLS", wholeMmrFailed(), false, false, 20001, true, true},
  };
  for (const Case& c : cases) {
    IlsBusSources sources = workingIlsSources();
    if (c.flsBeam) {
      addFlsBeam(sources, c.flsLateral);
    }
    sources.glsChannel = {c.glsChannel, c.glsChannel};
    const base_ils_bus before = busOfAWorkingMmr(sources);
    sources.mmrHealth = {c.health, MmrHealth{}};
    const base_ils_bus bus = busOf(0, sources);

    char what[160];
    std::snprintf(what, sizeof(what), "%s: lateral words %s", c.name, c.lateralDead ? "failure warning, data 0" : "unchanged");
    expect(c.lateralDead ? lateralWordsAreDead(bus) : lateralWordsAreSame(bus, before), what);
    std::snprintf(what, sizeof(what), "%s: glide slope word %s", c.name, c.glideSlopeDead ? "failure warning, data 0" : "unchanged");
    expect(c.glideSlopeDead ? bus.glideslope_deviation_deg.SSM == SSM_FAILURE_WARNING && bus.glideslope_deviation_deg.Data == 0
                            : glideSlopeWordIsSame(bus, before),
           what);
  }
}

/// A receiver that only lost its signal is not dead: no computed data stays no computed data
static void noSignalStaysNoComputedData() {
  IlsBusSources sources = workingIlsSources();
  sources.radio.localizerValid = sources.radio.glideSlopeValid = false;
  const base_ils_bus bus = busOf(0, sources);
  expect(bus.localizer_deviation_deg.SSM == SSM_NCD && bus.glideslope_deviation_deg.SSM == SSM_NCD && bus.runway_heading_deg.SSM == SSM_NCD,
         "a healthy MMR without a signal sends no computed data");
}

/// A failed MMR on a GLS channel is dead (failure warning), a failed ground station or a position outside the volume is a lost signal
static void aFailedMmrIsToldFromALostSignal() {
  IlsBusSources sources = workingIlsSources();
  sources.glsChannel = {20001, 20001};
  sources.mmrHealth = {glsFunctionFailed(), MmrHealth{}};
  expect(allWordsAre(busOf(0, sources), SSM_FAILURE_WARNING), "failed MMR on a GLS channel: failure warning");

  sources.mmrHealth = {};
  sources.glsGroundStationFailed = true;
  const base_ils_bus stationFailed = busOf(0, sources);
  expect(stationFailed.localizer_deviation_deg.SSM == SSM_NCD && stationFailed.glideslope_deviation_deg.SSM == SSM_NCD,
         "failed ground station: no computed data");
}

/// The bus of MMR n is dead only when MMR n is: swapping the two, or dropping the health of one side, fails these
static void eachBusFollowsItsOwnMmr() {
  IlsBusSources sources = workingIlsSources();
  const base_ils_bus working = busOfAWorkingMmr(sources);
  for (int dead = 0; dead < 2; ++dead) {
    sources.mmrHealth = {};
    sources.mmrHealth[dead] = unpowered();
    char what[160];
    std::snprintf(what, sizeof(what), "MMR %d unpowered: its bus is dead", dead + 1);
    expect(allWordsAre(busOf(dead, sources), SSM_FAILURE_WARNING) && allDataAreZero(busOf(dead, sources)), what);
    std::snprintf(what, sizeof(what), "MMR %d unpowered: the other bus is untouched, bit for bit", dead + 1);
    expect(sameBytes(busOf(1 - dead, sources), working), what);
  }
}

/// Only the MMR set to a GLS channel shows the GLS words; the other keeps its ILS, and the health of each decides its own words
static void eachBusFollowsItsOwnGlsChannel() {
  IlsBusSources sources = workingIlsSources();
  sources.glsChannel = {0, 20001};
  sources.mmrHealth = {MmrHealth{}, glsFunctionFailed()};
  expect(busOf(0, sources).localizer_deviation_deg.SSM == SSM_NORMAL && busOf(0, sources).ils_frequency_mhz.Data == 0,
         "MMR 1 in ILS mode keeps its ILS words");
  expect(allWordsAre(busOf(1, sources), SSM_FAILURE_WARNING), "MMR 2 in GLS mode with its GLS function failed is dead");

  sources.mmrHealth = {glsFunctionFailed(), MmrHealth{}};
  expect(busOf(0, sources).localizer_deviation_deg.SSM == SSM_NORMAL, "a failed GLS function of MMR 1 does not touch MMR 1 in ILS mode");
  expect(busOf(1, sources).ils_frequency_mhz.Data == 20001 && busOf(1, sources).localizer_deviation_deg.SSM == SSM_NORMAL,
         "MMR 2 in GLS mode with a working GLS function sends the GLS words");
}

/// Without a course there is no runway heading, whatever the radio receives
static void noCourseGivesNoRunwayHeading() {
  IlsBusSources sources = workingIlsSources();
  sources.fmsCourseDeg = -1;
  const base_ils_bus noCourse = busOf(1, sources);
  expect(noCourse.runway_heading_deg.SSM == SSM_NCD && noCourse.runway_heading_deg.Data == 0,
         "no course: runway heading is no computed data");
  expect(noCourse.localizer_deviation_deg.SSM == SSM_NORMAL, "no course: the localizer deviation is still sent");

  sources.fmsCourseDeg = 87;
  sources.localizerMagvarDeg = 3;
  const base_ils_bus withCourse = busOf(1, sources);
  expect(withCourse.runway_heading_deg.SSM == SSM_NORMAL && std::abs(withCourse.runway_heading_deg.Data - 84) < 1e-4,
         "a course gives the true runway heading");
  sources.fmsCourseDeg = 1;
  expect(std::abs(busOf(1, sources).runway_heading_deg.Data - 358) < 1e-4, "the heading wraps below zero");
}

/// The radio variables of PFD 1, the ISIS and the GPWS follow MMR 1 only
static void theRadioFollowsMmr1() {
  expect(IlsBusBuilder::radioConsumersSeeIlsSignal({MmrHealth{}, MmrHealth{}}), "both MMRs working: the radio is seen");
  expect(!IlsBusBuilder::radioConsumersSeeIlsSignal({unpowered(), MmrHealth{}}), "MMR 1 unpowered: no signal");
  expect(!IlsBusBuilder::radioConsumersSeeIlsSignal({ilsReceiverFailed(), MmrHealth{}}), "ILS 1 failed: no signal");
  expect(IlsBusBuilder::radioConsumersSeeIlsSignal({MmrHealth{}, unpowered()}), "MMR 2 unpowered: MMR 1 still sees the radio");
  expect(IlsBusBuilder::radioConsumersSeeIlsSignal({glsFunctionFailed(), MmrHealth{}}), "GLS 1 failed: the ILS radio is seen");
}

/// The flight guidance flies the bus of the other MMR when one receiver is dead, so the signal is gone only without any receiver
static void theAutolandMonitorNeedsOneIlsReceiver() {
  expect(IlsBusBuilder::anIlsReceiverIsOperative({MmrHealth{}, MmrHealth{}}), "both MMRs working: a receiver is operative");
  expect(IlsBusBuilder::anIlsReceiverIsOperative({ilsReceiverFailed(), MmrHealth{}}), "ILS 1 failed: ILS 2 is operative");
  expect(IlsBusBuilder::anIlsReceiverIsOperative({MmrHealth{}, unpowered()}), "MMR 2 unpowered: ILS 1 is operative");
  expect(!IlsBusBuilder::anIlsReceiverIsOperative({ilsReceiverFailed(), ilsReceiverFailed()}), "ILS 1 and 2 failed: no receiver");
  expect(!IlsBusBuilder::anIlsReceiverIsOperative({unpowered(), ilsReceiverFailed()}), "MMR 1 unpowered, ILS 2 failed: no receiver");
  expect(!IlsBusBuilder::anIlsReceiverIsOperative({wholeMmrFailed(), wholeMmrFailed()}), "MMR 1 and 2 failed: no receiver");
  expect(IlsBusBuilder::anIlsReceiverIsOperative({glsFunctionFailed(), flsFunctionLost()}),
         "GLS 1 failed, FLS 2 lost: the ILS receivers work");
}

int main() {
  functionsAreOperativeOnlyWhenPoweredAndNotFailed();
  healthIsReadFromTheSimVars();
  theActiveFunctionFollowsTheSourceOfTheWords();
  aDeadFunctionSendsFailureWarningOnItsWords();
  noSignalStaysNoComputedData();
  aFailedMmrIsToldFromALostSignal();
  eachBusFollowsItsOwnMmr();
  eachBusFollowsItsOwnGlsChannel();
  noCourseGivesNoRunwayHeading();
  theRadioFollowsMmr1();
  theAutolandMonitorNeedsOneIlsReceiver();
  if (failures > 0) {
    std::printf("mmr_health_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("mmr_health_test: all checks passed\n");
  return 0;
}
