// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the GLS words on the ILS bus (fbw-common GlsReceiver.h) and of what the generated FmgcComputer does with them:
// run test/run_tests.sh.
//
// Built with -DWITHOUT_THE_FIX, the ILS bus keeps the words of the detuned ILS receiver on a GLS approach, the FMS inputs
// (fmsInputsOf) are the ones of the radio, and the autoland warning reads the radio: the checks of the GLS words, inputs and
// warning then fail.

#include <cmath>
#include <cstdio>
#include <cstring>
#include <initializer_list>

#include "../src/fmgc/AutolandWarning.h"
#include "../src/fmgc/Fmgc.h"
#include "FlsReceiver.h"
#include "GlsReceiver.h"
#include "MultiModeReceiverHealth.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double FEET_PER_NM = 6076.12;
static constexpr unsigned int SSM_FAILURE_WARNING = 0b00;
static constexpr unsigned int SSM_NCD = 0b01;
static constexpr unsigned int SSM_NORMAL = 0b11;

/// A runway heading north at 45 N 0 E, 100 ft high, 3000 m long, and the 3 degree GLS procedure on channel 20001
static GlsApproachDefinition northApproach() {
  GlsApproachDefinition approach;
  approach.valid = true;
  approach.channel = 20001;
  approach.thresholdLatitudeDeg = 45;
  approach.thresholdLongitudeDeg = 0;
  approach.thresholdAltitudeFt = 100;
  approach.runwayLengthM = 3000;
  approach.courseTrueDeg = 0;
  approach.gpaDeg = 3;
  approach.thresholdCrossingHeightFt = 50;
  return approach;
}

/// The FMS guidance inputs the way FlyByWireInterface gives them. Without the fix a GLS approach gets the ones of the radio: the
/// detuned NAV 3 gives no distance and no glide slope angle, and its FLS beam blocks LAND.
static GlsFmsGuidanceInputs fmsInputsOf(bool glsMode, const GlsApproachDefinition& approach, const GlsDeviations& deviations,
                                        bool flsBeamValid, double radioDistanceNm, double radioGsAngleDeg) {
#ifdef WITHOUT_THE_FIX
  glsMode = false;
#endif
  return GlsReceiver::fmsGuidanceInputs(glsMode, approach, deviations, flsBeamValid, radioDistanceNm, radioGsAngleDeg);
}

static void positionSouthOfThreshold(double distanceNm, double eastNm, double& latitude, double& longitude) {
  latitude = 45 - distanceNm / 60;
  longitude = eastNm / (60 * std::cos(45 * M_PI / 180));
}

static double onPathAltitudeFt(const GlsApproachDefinition& approach, double distanceNm) {
  const double interceptPointNm = approach.thresholdCrossingHeightFt / std::tan(approach.gpaDeg * M_PI / 180) / FEET_PER_NM;
  return approach.thresholdAltitudeFt + (distanceNm + interceptPointNm) * FEET_PER_NM * std::tan(approach.gpaDeg * M_PI / 180);
}

static GlsDeviations deviationsOnThePath(const GlsApproachDefinition& approach, double distanceNm, double eastNm = 0, double extraFt = 0) {
  double latitude, longitude;
  positionSouthOfThreshold(distanceNm, eastNm, latitude, longitude);
  return GlsReceiver::compute(approach, latitude, longitude, onPathAltitudeFt(approach, distanceNm) + extraFt);
}

/// What the detuned NAV 3 gives on a GLS approach: nothing computed, frequency word zero
static base_ils_bus ilsBusOfTheDetunedReceiver() {
  base_ils_bus bus{};
  bus.runway_heading_deg.SSM = SSM_NCD;
  bus.ils_frequency_mhz.SSM = SSM_NORMAL;
  bus.ils_frequency_mhz.Data = 0;
  bus.localizer_deviation_deg.SSM = SSM_NCD;
  bus.glideslope_deviation_deg.SSM = SSM_NCD;
  return bus;
}

static base_ils_bus busOnApproach(const GlsApproachDefinition& uplink, int mmrChannel, bool mmrFailed, bool stationFailed,
                                  const GlsDeviations& deviations) {
  base_ils_bus bus = ilsBusOfTheDetunedReceiver();
#ifndef WITHOUT_THE_FIX
  GlsReceiver::applyToIlsBus(bus, uplink, mmrChannel, mmrFailed, stationFailed, deviations);
#else
  (void)uplink;
  (void)mmrChannel;
  (void)mmrFailed;
  (void)stationFailed;
  (void)deviations;
#endif
  return bus;
}

static void busWordsOfAReceivingMmr() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations deviations = deviationsOnThePath(approach, 8, 0.2, 100);
  expect(deviations.lateralValid && deviations.verticalValid, "setup: 8 NM out is inside the service volume");

  const base_ils_bus bus = busOnApproach(approach, 20001, false, false, deviations);
  expect(bus.runway_heading_deg.SSM == SSM_NORMAL && bus.runway_heading_deg.Data == 0, "true course on the runway heading word");
  expect(bus.ils_frequency_mhz.SSM == SSM_NORMAL && bus.ils_frequency_mhz.Data == 20001, "channel in the frequency word");
  expect(bus.localizer_deviation_deg.SSM == SSM_NORMAL &&
             std::abs(bus.localizer_deviation_deg.Data - deviations.lateralDeviationDeg) < 1e-5 && bus.localizer_deviation_deg.Data < -0.5,
         "lateral deviation on the localizer word, beam to the left of an aircraft east of the course");
  expect(bus.glideslope_deviation_deg.SSM == SSM_NORMAL &&
             std::abs(bus.glideslope_deviation_deg.Data - deviations.verticalDeviationDeg) < 1e-5 && bus.glideslope_deviation_deg.Data > 0.1,
         "vertical deviation on the glide slope word, positive above the path");
}

static void noComputedDataWhenOutOfVolumeOrFailed() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations outOfVolume = deviationsOnThePath(approach, 30);
  expect(!outOfVolume.lateralValid && !outOfVolume.verticalValid, "setup: 30 NM out is outside the service volume");
  const base_ils_bus far = busOnApproach(approach, 20001, false, false, outOfVolume);
  expect(far.localizer_deviation_deg.SSM == SSM_NCD && far.glideslope_deviation_deg.SSM == SSM_NCD, "out of the volume: no computed data");
  expect(far.ils_frequency_mhz.SSM == SSM_NORMAL && far.ils_frequency_mhz.Data == 20001, "out of the volume: the channel is still sent");

  const GlsDeviations inVolume = deviationsOnThePath(approach, 8);
  expect(busOnApproach(approach, 20001, true, false, inVolume).localizer_deviation_deg.SSM == SSM_FAILURE_WARNING,
         "failed MMR: failure warning, so that the flight guidance flies the other MMR");
  expect(busOnApproach(approach, 20001, false, true, inVolume).glideslope_deviation_deg.SSM == SSM_NCD,
         "failed ground station: no computed data");
  const base_ils_bus otherChannel = busOnApproach(approach, 20002, false, false, inVolume);
  expect(otherChannel.localizer_deviation_deg.SSM == SSM_NCD && otherChannel.glideslope_deviation_deg.SSM == SSM_NCD &&
             otherChannel.ils_frequency_mhz.Data == 20002,
         "MMR set to another channel than the uplinked one receives nothing");

  // Past the glide path intercept point only the glide slope is lost, the roll out follows the localizer
  const GlsDeviations pastTheInterceptPoint = deviationsOnThePath(approach, -0.2);
  const base_ils_bus rollOut = busOnApproach(approach, 20001, false, false, pastTheInterceptPoint);
  expect(rollOut.localizer_deviation_deg.SSM == SSM_NORMAL && rollOut.glideslope_deviation_deg.SSM == SSM_NCD,
         "past the glide path intercept point: localizer words stay, glide slope is lost");
}

/// Each MMR follows its own failure, the ground station failure takes both: the failed MMR keeps its GLS mode (channel in the
/// frequency word) but sends failure warning, so it cannot fall back to a stale ILS beam; the lost ground station is a lost signal
static void eachMmrFollowsItsOwnFailure() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations inVolume = deviationsOnThePath(approach, 8);
  struct Case {
    const char* name;
    bool mmr1Failed;
    bool mmr2Failed;
    bool stationFailed;
    bool mmr1Valid;
    bool mmr2Valid;
  };
  const Case cases[] = {
      {"nothing failed", false, false, false, true, true},
      {"MMR 1 failed", true, false, false, false, true},
      {"MMR 2 failed", false, true, false, true, false},
      {"both MMRs failed", true, true, false, false, false},
      {"ground station failed", false, false, true, false, false},
  };
  for (const Case& c : cases) {
    const base_ils_bus mmr1 = busOnApproach(approach, 20001, c.mmr1Failed, c.stationFailed, inVolume);
    const base_ils_bus mmr2 = busOnApproach(approach, 20001, c.mmr2Failed, c.stationFailed, inVolume);
    const unsigned int expected1 = c.mmr1Failed ? SSM_FAILURE_WARNING : c.mmr1Valid ? SSM_NORMAL : SSM_NCD;
    const unsigned int expected2 = c.mmr2Failed ? SSM_FAILURE_WARNING : c.mmr2Valid ? SSM_NORMAL : SSM_NCD;
    char what[160];
    std::snprintf(what, sizeof(what), "%s: MMR 1 words", c.name);
    expect(mmr1.localizer_deviation_deg.SSM == expected1 && mmr1.glideslope_deviation_deg.SSM == expected1 &&
               mmr1.runway_heading_deg.SSM == expected1,
           what);
    std::snprintf(what, sizeof(what), "%s: MMR 2 words", c.name);
    expect(mmr2.localizer_deviation_deg.SSM == expected2 && mmr2.glideslope_deviation_deg.SSM == expected2 &&
               mmr2.runway_heading_deg.SSM == expected2,
           what);
    std::snprintf(what, sizeof(what), "%s: the channel stays in the frequency words", c.name);
    expect(mmr1.ils_frequency_mhz.Data == 20001 && mmr2.ils_frequency_mhz.Data == 20001, what);
  }
}

/// With no GLS tuned nothing is added to the bus and the FMS inputs are the ones of the radio, bit for bit
static void ilsModeLeavesTheBusAndTheFmsInputsAlone() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations deviations = deviationsOnThePath(approach, 8);

  base_ils_bus ilsBeam = ilsBusOfTheDetunedReceiver();
  ilsBeam.runway_heading_deg.SSM = SSM_NORMAL;
  ilsBeam.runway_heading_deg.Data = 183.5F;
  ilsBeam.ils_frequency_mhz.Data = 110.3F;
  ilsBeam.localizer_deviation_deg.SSM = SSM_NORMAL;
  ilsBeam.localizer_deviation_deg.Data = -0.37F;
  ilsBeam.glideslope_deviation_deg.SSM = SSM_NORMAL;
  ilsBeam.glideslope_deviation_deg.Data = 0.12F;
  const base_ils_bus untouched = ilsBeam;

  base_ils_bus ilsMode = untouched;
  GlsReceiver::applyToIlsBus(ilsMode, approach, 0, false, false, deviations);
  expect(std::memcmp(&ilsMode, &untouched, sizeof(untouched)) == 0, "MMR in ILS mode with an uplink: the words are unchanged bit for bit");
  base_ils_bus noUplinkMode = untouched;
  GlsReceiver::applyToIlsBus(noUplinkMode, GlsApproachDefinition{}, 0, false, false, GlsDeviations{});
  expect(std::memcmp(&noUplinkMode, &untouched, sizeof(untouched)) == 0, "MMR in ILS mode, no uplink at all: the words are unchanged bit for bit");

  const GlsFmsGuidanceInputs radio = GlsReceiver::fmsGuidanceInputs(false, approach, deviations, false, 6.5, -2.9);
  expect(radio.locDistanceNm == 6.5 && radio.unrealisticGsAngleDeg == -2.9 && !radio.flsApproachActive,
         "no GLS: the FMS inputs are the ones of the radio, bit for bit");

  const AutolandMonitorInputs radioMonitor = {true, 0.11, true, -0.21};
  const AutolandMonitorInputs monitor = GlsReceiver::autolandMonitorInputs(false, false, deviations, radioMonitor);
  expect(std::memcmp(&monitor, &radioMonitor, sizeof(monitor)) == 0, "no GLS: the autoland monitor reads the radio, bit for bit");
}

static void glsModeWithoutAnUplinkSendsNoComputedData() {
  GlsApproachDefinition noUplink = northApproach();
  noUplink.valid = false;
  base_ils_bus bus = ilsBusOfTheDetunedReceiver();
  // A stale ILS beam on the bus must not survive on a GLS channel
  bus.localizer_deviation_deg.SSM = SSM_NORMAL;
  bus.localizer_deviation_deg.Data = 1.5F;
  bus.glideslope_deviation_deg.SSM = SSM_NORMAL;
  bus.glideslope_deviation_deg.Data = 0.7F;
  GlsReceiver::applyToIlsBus(bus, noUplink, 20001, false, false, GlsDeviations{});
  expect(bus.localizer_deviation_deg.SSM == SSM_NCD && bus.glideslope_deviation_deg.SSM == SSM_NCD && bus.runway_heading_deg.SSM == SSM_NCD,
         "GLS channel without an uplink: no computed data");
  expect(bus.ils_frequency_mhz.SSM == SSM_NORMAL && bus.ils_frequency_mhz.Data == 20001, "GLS channel without an uplink: the channel is sent");
}

static void glsWinsOverTheFlsBeam() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations gls = deviationsOnThePath(approach, 8, 0, 200);

  FlsBeamDefinition beam;
  beam.valid = true;
  beam.anchorLatitudeDeg = 45;
  beam.anchorLongitudeDeg = 0;
  beam.anchorAltitudeFt = 150;
  beam.courseTrueDeg = 0;
  beam.slopeDeg = 3;
  beam.lateral = true;
  FlsDeviations fls;
  fls.valid = true;
  fls.lateralDeviationDeg = 1.5;
  fls.verticalDeviationDeg = -0.7;

  base_ils_bus bus = ilsBusOfTheDetunedReceiver();
  FlsReceiver::applyToIlsBus(bus, beam, fls);
  expect(bus.localizer_deviation_deg.Data == 1.5F, "setup: the FLS beam is on the bus");
#ifndef WITHOUT_THE_FIX
  GlsReceiver::applyToIlsBus(bus, approach, 20001, false, false, gls);
#endif
  expect(std::abs(bus.localizer_deviation_deg.Data - gls.lateralDeviationDeg) < 1e-5 &&
             std::abs(bus.glideslope_deviation_deg.Data - gls.verticalDeviationDeg) < 1e-5,
         "GLS words replace the FLS ones");

  const GlsFmsGuidanceInputs withGls = fmsInputsOf(true, approach, gls, beam.valid, 0, 0);
  expect(!withGls.flsApproachActive, "GLS active: the FG is not told of an FLS approach, so LAND is not blocked");
  GlsApproachDefinition noUplink = approach;
  noUplink.valid = false;
  const GlsFmsGuidanceInputs glsModeNotReceived = fmsInputsOf(true, noUplink, GlsDeviations{}, beam.valid, 0, 0);
  expect(!glsModeNotReceived.flsApproachActive, "GLS mode without a station: an FLS beam is still not applied");
  const GlsFmsGuidanceInputs withoutGls = GlsReceiver::fmsGuidanceInputs(false, approach, gls, beam.valid, 0, 0);
  expect(withoutGls.flsApproachActive, "no GLS: the FLS beam still blocks LAND");
}

static void fmsInputsOfTheOuterLoops() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations gls = deviationsOnThePath(approach, 8);
  const GlsFmsGuidanceInputs inputs = fmsInputsOf(true, approach, gls, false, 0, 0);
  expect(std::abs(inputs.locDistanceNm - 8) < 0.05, "ILS-DME distance of the outer loops is the distance to the threshold");
  expect(inputs.unrealisticGsAngleDeg == -3, "glide slope angle of the outer loops is minus the GPA, as -NAV RAW GLIDE SLOPE");
}

// The AUTOLAND warning light reads what the receiver in use gives. NAV 3 is detuned on a GLS approach: it is invalid there.
static AutolandWarning::Inputs autolandInputsOnAnApproach() {
  AutolandWarning::Inputs in;
  in.apEngaged = true;
  in.landOrFlareMode = true;
  in.aircraftRadioHeightFt = 150;
  in.radioAltimeters[0].isValid = true;
  in.radioAltimeters[1].isValid = true;
  in.radioAltimeters[0].heightFt = 150;
  in.radioAltimeters[1].heightFt = 150;
  return in;
}

/// The inputs the way FlyByWireInterface builds them: the radio readings, replaced by the GLS ones in GLS mode
static AutolandWarning::Inputs autolandInputsFrom(bool glsMode, bool glsReceiving, const GlsDeviations& gls, const AutolandMonitorInputs& radio) {
  AutolandWarning::Inputs in = autolandInputsOnAnApproach();
#ifndef WITHOUT_THE_FIX
  const AutolandMonitorInputs monitor = GlsReceiver::autolandMonitorInputs(glsMode, glsReceiving, gls, radio);
#else
  (void)glsMode;
  (void)glsReceiving;
  (void)gls;
  const AutolandMonitorInputs monitor = radio;
#endif
  in.locSignalValid = monitor.locValid;
  in.locDeviationDeg = monitor.locErrorDeg;
  in.glideSignalValid = monitor.gsValid;
  in.glideDeviationDeg = monitor.gsErrorDeg;
  return in;
}

static void autolandWarningReadsTheGlsDeviations() {
  const GlsApproachDefinition approach = northApproach();
  const AutolandMonitorInputs detunedNav3 = {false, 0, false, 0};

  // A good GLS approach at 150 ft radio height: close to the path and the course
  const GlsDeviations onThePath = deviationsOnThePath(approach, 1.0, 0.0, 5);
  expect(onThePath.lateralValid && onThePath.verticalValid, "setup: 1 NM out is inside the service volume");
  AutolandWarning quiet;
  expect(!quiet.update(autolandInputsFrom(true, true, onThePath, detunedNav3), 0.05), "GLS on the path, NAV 3 detuned: no warning");

  // The same approach with the aircraft 0.3 degree off the course: past the quarter dot limit of the localizer
  const GlsDeviations offCourse = deviationsOnThePath(approach, 1.0, 0.0);
  GlsDeviations tooFarLeft = offCourse;
  tooFarLeft.lateralDeviationDeg = 0.3;
  AutolandWarning lateral;
  expect(lateral.update(autolandInputsFrom(true, true, tooFarLeft, detunedNav3), 0.05), "GLS localizer deviation above 0.2 degree: warning");

  GlsDeviations tooHigh = offCourse;
  tooHigh.verticalDeviationDeg = 0.5;
  AutolandWarning vertical;
  expect(vertical.update(autolandInputsFrom(true, true, tooHigh, detunedNav3), 0.05), "GLS glide deviation above 0.4 degree: warning");

  // Below 100 ft the glide slope is not monitored, below 15 ft the localizer is not either
  AutolandWarning low;
  AutolandWarning::Inputs lowInputs = autolandInputsFrom(true, true, tooHigh, detunedNav3);
  lowInputs.aircraftRadioHeightFt = 90;
  lowInputs.radioAltimeters[0].heightFt = 90;
  lowInputs.radioAltimeters[1].heightFt = 90;
  expect(!low.update(lowInputs, 0.05), "GLS glide deviation below 100 ft: no warning");

  // GLS mode on a station that is not received: the GLS is invalid, whatever NAV 3 might read
  const AutolandMonitorInputs staleNav3 = {true, 0.0, true, 0.0};
  AutolandWarning lost;
  expect(lost.update(autolandInputsFrom(true, false, GlsDeviations{}, staleNav3), 0.05), "GLS mode, not received: the signal is lost, warning");

  // No GLS mode: the radio is read as before, with its own limits
  AutolandWarning ils;
  expect(!ils.update(autolandInputsFrom(false, false, GlsDeviations{}, staleNav3), 0.05), "ILS mode, good ILS beam: no warning");
  AutolandWarning ilsLost;
  expect(ilsLost.update(autolandInputsFrom(false, false, GlsDeviations{}, detunedNav3), 0.05), "ILS mode, ILS lost: warning");
}

constexpr double TIME_STEP_S = 0.05;
constexpr double APPROACH_SPEED_KNOTS = 140.0;
constexpr uint32_T NORMAL_OPERATION = 3;
// Bit 23 of the FCU discrete word 1 (APPR pushed), as Arinc429Utils numbers the bits
constexpr double APPR_PUSHBUTTON_WORD = 4194304.0;
// bits 11 and 13: what the FMGC needs from a FAC to let the autopilot engage
constexpr float FAC_DISCRETE_WORD_2_AP_AVAILABLE = 5120.0F;

static void setWord(base_arinc_429& word, double value) {
  word.SSM = NORMAL_OPERATION;
  word.Data = static_cast<float>(value);
}

/// All the words of the buses valid (SSM normal operation), zero data; the values the approach needs are set per frame.
static void makeAllBusWordsValid(base_fmgc_bus_inputs& buses) {
  auto* words = reinterpret_cast<base_arinc_429*>(&buses);
  const size_t count = sizeof(buses) / sizeof(base_arinc_429);
  for (size_t i = 0; i < count; ++i) {
    words[i].SSM = NORMAL_OPERATION;
    words[i].Data = 0;
  }
}

/// What an MMR without power puts on its ILS bus. Without the fix a dead MMR sends no computed data with zero deviations.
static void applyDeadMmr(base_ils_bus& bus, bool glsMode) {
#ifndef WITHOUT_THE_FIX
  MmrHealth unpowered;
  unpowered.powered = false;
  MultiModeReceiverHealth::applyToIlsBus(bus, unpowered, glsMode ? MmrFunction::Gls : MmrFunction::Ils);
#else
  (void)glsMode;
  bus.runway_heading_deg.SSM = bus.localizer_deviation_deg.SSM = bus.glideslope_deviation_deg.SSM = SSM_NCD;
  bus.runway_heading_deg.Data = bus.localizer_deviation_deg.Data = bus.glideslope_deviation_deg.Data = 0;
#endif
}

/// FMGC 1 in flight on a runway heading north, healthy, with the autopilot to engage and the APPR pushbutton to press
class ApproachFlight {
 public:
  ApproachFlight() : fmgc(true) {
    auto& discrete = fmgc.modelInputs.in.discrete_inputs;
    discrete.is_unit_1 = true;
    discrete.fcu_opp_healthy = discrete.fcu_own_healthy = discrete.fac_opp_healthy = discrete.fac_own_healthy = true;
    discrete.fmgc_opp_healthy = true;
    discrete.fwc_opp_valid = discrete.fwc_own_valid = discrete.pfd_opp_valid = discrete.pfd_own_valid = true;
    discrete.bscu_opp_valid = discrete.bscu_own_valid = true;
    discrete.nav_control_own = true;
    auto& fms = fmgc.modelInputs.in.fms_inputs;
    fms.fm_valid = true;
    fms.fms_flight_phase = fmgc_flight_phase::Approach;
    fms.selected_approach_type = fmgc_approach_type::ILS;
    makeAllBusWordsValid(fmgc.modelInputs.in.bus_inputs);
    setRadioHeight(2500);
    setIlsWords(0, 110.3, false, 0, false, 0);
  }

  void setRadioHeight(double heightFt) {
    auto& buses = fmgc.modelInputs.in.bus_inputs;
    setWord(buses.ra_own_bus.radio_height_ft, heightFt);
    setWord(buses.ra_opp_bus.radio_height_ft, heightFt);
    radioHeightFt = heightFt;
  }

  void setIlsWords(double courseTrueDeg, double frequency, bool locValid, double locDeviation, bool gsValid, double gsDeviation) {
    for (base_ils_bus* bus : {&fmgc.modelInputs.in.bus_inputs.ils_own_bus, &fmgc.modelInputs.in.bus_inputs.ils_opp_bus}) {
      bus->runway_heading_deg.SSM = locValid ? NORMAL_OPERATION : SSM_NCD;
      bus->runway_heading_deg.Data = static_cast<float>(courseTrueDeg);
      bus->ils_frequency_mhz.SSM = NORMAL_OPERATION;
      bus->ils_frequency_mhz.Data = static_cast<float>(frequency);
      bus->localizer_deviation_deg.SSM = locValid ? NORMAL_OPERATION : SSM_NCD;
      bus->localizer_deviation_deg.Data = static_cast<float>(locDeviation);
      bus->glideslope_deviation_deg.SSM = gsValid ? NORMAL_OPERATION : SSM_NCD;
      bus->glideslope_deviation_deg.Data = static_cast<float>(gsDeviation);
    }
  }

  void setBothIlsBuses(const base_ils_bus& bus) {
    fmgc.modelInputs.in.bus_inputs.ils_own_bus = bus;
    fmgc.modelInputs.in.bus_inputs.ils_opp_bus = bus;
  }

  /// Replaces what the guidance source would give the FMS inputs, for the whole flight
  void forceFmsGuidanceInputs(const GlsFmsGuidanceInputs& fms) {
    fmsOverride = fms;
    hasFmsOverride = true;
  }

  void setFmsGuidanceInputs(const GlsFmsGuidanceInputs& source) {
    const GlsFmsGuidanceInputs& fms = hasFmsOverride ? fmsOverride : source;
    auto& inputs = fmgc.modelInputs.in.fms_inputs;
    inputs.fls_approach_active = fms.flsApproachActive;
    inputs.fms_loc_distance = fms.locDistanceNm;
    inputs.fms_unrealistic_gs_angle_deg = fms.unrealisticGsAngleDeg;
  }

  void fly(double seconds) {
    for (double t = 0.0; t < seconds; t += TIME_STEP_S) {
      step();
    }
  }

  void pushApproachButton() {
    setWord(fmgc.modelInputs.in.bus_inputs.fcu_bus.fcu_discrete_word_1, APPR_PUSHBUTTON_WORD);
    fly(0.3);
    setWord(fmgc.modelInputs.in.bus_inputs.fcu_bus.fcu_discrete_word_1, 0);
  }

  void engageAutopilot() {
    fmgc.modelInputs.in.discrete_inputs.fcu_ap_button = true;
    fly(0.3);
    fmgc.modelInputs.in.discrete_inputs.fcu_ap_button = false;
    fly(2.0);
  }

  const fmgc_outputs& out() const { return fmgc.getDebugOutputs(); }
  bool apEngaged() const { return out().logic.ap_own_engaged; }
  bool locEngaged() const { return out().ap_fd_logic.lateral_modes.loc_cpt_active || out().ap_fd_logic.lateral_modes.loc_trk_active; }
  bool locArmed() const { return out().ap_fd_logic.armed_modes.loc_armed; }
  bool gsArmed() const { return out().ap_fd_logic.armed_modes.glide_armed; }
  bool gsEngaged() const { return out().ap_fd_logic.longitudinal_modes.gs_capt_active || out().ap_fd_logic.longitudinal_modes.gs_trk_active; }
  bool landEngaged() const { return out().ap_fd_logic.lateral_modes.land_active; }
  bool flareEngaged() const { return out().ap_fd_logic.longitudinal_modes.flare_active; }
  bool rollOutEngaged() const { return out().ap_fd_logic.lateral_modes.rollout_submode_active; }

  /// A wheel speed above 70 kt on one side: what the generated model needs, with a valid BSCU, to enter ROLL OUT
  void setWheelSpeedAbove70Knots(bool above) {
    fmgc.modelInputs.in.discrete_inputs.left_wheel_spd_abv_70_kts = above;
    fmgc.modelInputs.in.discrete_inputs.right_wheel_spd_abv_70_kts = above;
  }

  /// The MMR (0 = ILS 1, the bus FMGC 1 flies first; 1 = ILS 2) that has no power, from the next step on; BOTH_MMRS for both; -1 for none
  static constexpr int BOTH_MMRS = 2;
  int deadMmr = -1;
  bool deadMmrInGlsMode = false;

  Fmgc fmgc;
  double time = 0.0;
  double radioHeightFt = 0.0;
  GlsFmsGuidanceInputs fmsOverride;
  bool hasFmsOverride = false;

 private:
  void step() {
    time += TIME_STEP_S;
    auto& buses = fmgc.modelInputs.in.bus_inputs;
    if (deadMmr == 0 || deadMmr == BOTH_MMRS) {
      applyDeadMmr(buses.ils_own_bus, deadMmrInGlsMode);
    }
    if (deadMmr == 1 || deadMmr == BOTH_MMRS) {
      applyDeadMmr(buses.ils_opp_bus, deadMmrInGlsMode);
    }
    for (base_adr_bus* adr : {&buses.adr_own_bus, &buses.adr_opp_bus, &buses.adr_3_bus}) {
      setWord(adr->altitude_standard_ft, 2500);
      setWord(adr->altitude_corrected_1_ft, 2500);
      setWord(adr->altitude_corrected_2_ft, 2500);
      setWord(adr->mach, 0.21);
      setWord(adr->airspeed_computed_kn, APPROACH_SPEED_KNOTS);
      setWord(adr->airspeed_true_kn, APPROACH_SPEED_KNOTS);
      setWord(adr->vertical_speed_ft_min, -700);
      setWord(adr->aoa_corrected_deg, 3);
      setWord(adr->corrected_average_static_pressure, 697);
    }
    for (base_ir_bus* ir : {&buses.ir_own_bus, &buses.ir_opp_bus, &buses.ir_3_bus}) {
      setWord(ir->pitch_angle_deg, 0);
      setWord(ir->roll_angle_deg, 0);
      setWord(ir->heading_magnetic_deg, 0);
      setWord(ir->heading_true_deg, 0);
      setWord(ir->track_angle_magnetic_deg, 0);
      setWord(ir->track_angle_true_deg, 0);
      setWord(ir->ground_speed_kn, APPROACH_SPEED_KNOTS);
      setWord(ir->flight_path_angle_deg, -3);
      setWord(ir->body_normal_accel_g, 1);
      setWord(ir->vertical_accel_g, 1);
      setWord(ir->inertial_alt_ft, 2500);
      setWord(ir->inertial_vertical_speed_ft_s, -12);
    }
    for (base_fac_bus* fac : {&buses.fac_own_bus, &buses.fac_opp_bus}) {
      setWord(fac->v_ls_kn, 120);
      setWord(fac->v_stall_kn, 100);
      setWord(fac->v_alpha_prot_kn, 110);
      setWord(fac->v_alpha_lim_kn, 105);
      setWord(fac->v_max_kn, 340);
      setWord(fac->total_weight_lbs, 140000);
      setWord(fac->center_of_gravity_pos_percent, 30);
      setWord(fac->discrete_word_2, FAC_DISCRETE_WORD_2_AP_AVAILABLE);
    }
    setWord(buses.fcu_bus.selected_alt_ft, 3000);
    setWord(buses.fcu_bus.selected_spd_kts, APPROACH_SPEED_KNOTS);
    setWord(buses.fcu_bus.selected_hdg_deg, 0);
    fmgc.modelInputs.in.time.dt = TIME_STEP_S;
    fmgc.modelInputs.in.time.simulation_time = time;
    fmgc.modelInputs.in.time.monotonic_time = time;
    fmgc.update(TIME_STEP_S, time, false, true);
  }
};

enum class GuidanceSource {
  Ils,
  Gls,
  GlsWithFlsBeam,
  IlsWithFlsBeam,
};

constexpr double APPROACH_DISTANCE_NM = 8;
constexpr double RADIO_FREQUENCY_MHZ = 110.3;

/// What the FMGC gets on both ILS buses and from the FMS for an aircraft this far above the path and east of the course.
/// The ILS source gets the same deviations as the GLS, from the detuned receiver's side of the bus.
static void feedGuidance(ApproachFlight& flight, GuidanceSource source, double eastNm, double aboveThePathFt, bool lost = false,
                         double distanceNm = APPROACH_DISTANCE_NM) {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations deviations = deviationsOnThePath(approach, distanceNm, eastNm, aboveThePathFt);
  const bool flsBeamValid = source == GuidanceSource::GlsWithFlsBeam || source == GuidanceSource::IlsWithFlsBeam;
  const bool glsActive = source == GuidanceSource::Gls || source == GuidanceSource::GlsWithFlsBeam;

  if (glsActive) {
    base_ils_bus bus = ilsBusOfTheDetunedReceiver();
    if (flsBeamValid) {
      // The FLS words come first on the bus, the GLS ones replace them
      FlsBeamDefinition beam;
      beam.valid = true;
      beam.lateral = true;
      FlsDeviations fls;
      fls.valid = true;
      fls.lateralDeviationDeg = 2.0;
      fls.verticalDeviationDeg = -1.0;
      FlsReceiver::applyToIlsBus(bus, beam, fls);
    }
#ifndef WITHOUT_THE_FIX
    GlsReceiver::applyToIlsBus(bus, approach, approach.channel, false, lost, deviations);
#endif
    flight.setBothIlsBuses(bus);
  } else {
    flight.setIlsWords(0, RADIO_FREQUENCY_MHZ, !lost && deviations.lateralValid, deviations.lateralDeviationDeg,
                       !lost && deviations.verticalValid, deviations.verticalDeviationDeg);
  }
  // A GLS approach leaves NAV 3 detuned, so the radio gives no distance and no glide slope angle there
  const double radioDistanceNm = glsActive ? 0 : distanceNm;
  const double radioGsAngleDeg = glsActive ? 0 : -3;
  flight.setFmsGuidanceInputs(fmsInputsOf(glsActive, approach, deviations, flsBeamValid, radioDistanceNm, radioGsAngleDeg));
}

/// The aircraft above the path and just east of the course, the autopilot engaged and APPR pressed, then onto the path
static void flyToGlideSlopeTrack(ApproachFlight& flight, GuidanceSource source) {
  constexpr double HIGH_FT = 420;
  feedGuidance(flight, source, 0.03, HIGH_FT);
  flight.fly(6.0);
  flight.engageAutopilot();
  flight.pushApproachButton();
  flight.fly(3.0);
  for (int step = 0; step <= 12; step++) {
    feedGuidance(flight, source, 0, HIGH_FT * (12 - step) / 12);
    flight.fly(1.0);
  }
  flight.fly(5.0);
}

static const char* nameOf(GuidanceSource source) {
  switch (source) {
    case GuidanceSource::Ils:
      return "ILS";
    case GuidanceSource::Gls:
      return "GLS";
    case GuidanceSource::GlsWithFlsBeam:
      return "GLS with an FLS beam";
    case GuidanceSource::IlsWithFlsBeam:
      return "ILS with an FLS beam";
  }
  return "";
}

static void armingCaptureAndLandOnTheGlsWords() {
  for (GuidanceSource source : {GuidanceSource::Ils, GuidanceSource::Gls, GuidanceSource::GlsWithFlsBeam}) {
    char what[160];
    {
      ApproachFlight arming;
      feedGuidance(arming, source, 0.03, 420);
      arming.fly(6.0);
      arming.engageAutopilot();
      arming.pushApproachButton();
      arming.fly(1.0);
      std::snprintf(what, sizeof(what), "%s: LOC and G/S armed or engaged after APPR", nameOf(source));
      expect(arming.apEngaged() && (arming.locArmed() || arming.locEngaged()) && (arming.gsArmed() || arming.gsEngaged()), what);
    }

    ApproachFlight flight;
    flyToGlideSlopeTrack(flight, source);
    std::snprintf(what, sizeof(what), "%s: LOC and G/S track engaged on the approach", nameOf(source));
    expect(flight.apEngaged() && flight.locEngaged() && flight.gsEngaged(), what);

    flight.setRadioHeight(380);
    flight.fly(3.0);
    std::snprintf(what, sizeof(what), "%s: LAND engages below 400 ft", nameOf(source));
    expect(flight.apEngaged() && flight.landEngaged(), what);
  }
}

struct LandingOutcome {
  bool landBeforeFlare = false;
  bool flare = false;
  bool landAtTouchdown = false;
  bool rollOut = false;
  bool autopilotAfterRollOut = false;
  double flareStartRadioHeightFt = -1;
  double rollOutStartDistanceNm = 99;
};

/// Distance of the glide path intercept point from the threshold (negative, beyond it): the ground point of the path
static double interceptPointDistanceNm(const GlsApproachDefinition& approach) {
  return -approach.thresholdCrossingHeightFt / std::tan(approach.gpaDeg * M_PI / 180) / FEET_PER_NM;
}

/// From the glide slope track at 8 NM down the path at the approach speed, the radio height following the path, through LAND and
/// FLARE to the glide path intercept point. Past it the aircraft is on the ground: the glide slope words are invalid (the receiver
/// makes them so), the radio height is 0 and, once `wheelsSpinning`, a main wheel is above 70 kt.
static LandingOutcome landOnThePath(GuidanceSource source, bool wheelsSpinning) {
  const GlsApproachDefinition approach = northApproach();
  constexpr double SECONDS_PER_STEP = 1.0;
  constexpr double NM_PER_STEP = APPROACH_SPEED_KNOTS / 3600.0 * SECONDS_PER_STEP;
  const double groundPointNm = interceptPointDistanceNm(approach);

  ApproachFlight flight;
  flyToGlideSlopeTrack(flight, source);
  LandingOutcome outcome;
  for (double distanceNm = APPROACH_DISTANCE_NM; distanceNm > groundPointNm - 0.4; distanceNm -= NM_PER_STEP) {
    const bool onTheGround = distanceNm <= groundPointNm;
    const double radioHeightFt = onTheGround ? 0.0 : onPathAltitudeFt(approach, distanceNm) - approach.thresholdAltitudeFt;
    feedGuidance(flight, source, 0, 0, false, distanceNm);
    flight.setRadioHeight(radioHeightFt);
    flight.setWheelSpeedAbove70Knots(onTheGround && wheelsSpinning);
    flight.fly(SECONDS_PER_STEP);

    if (flight.landEngaged() && !flight.flareEngaged()) {
      outcome.landBeforeFlare = true;
    }
    if (flight.flareEngaged() && !outcome.flare) {
      outcome.flare = true;
      outcome.flareStartRadioHeightFt = radioHeightFt;
    }
    if (flight.rollOutEngaged() && !outcome.rollOut) {
      outcome.rollOut = true;
      outcome.rollOutStartDistanceNm = distanceNm;
    }
    outcome.landAtTouchdown = flight.landEngaged();
  }
  outcome.autopilotAfterRollOut = flight.apEngaged();
  return outcome;
}

/// ROLL OUT needs LAND, a radio height at the ground and, with a valid BSCU, a main wheel above 70 kt: the nose gear is not read
/// (the FMGC reads it only without a valid BSCU).
static void descendThroughTheInterceptPointIntoFlareAndRollOut() {
  for (GuidanceSource source : {GuidanceSource::Ils, GuidanceSource::Gls}) {
    const LandingOutcome rolling = landOnThePath(source, true);
    const LandingOutcome notRolling = landOnThePath(source, false);
    char what[200];
    std::snprintf(what, sizeof(what), "%s: LAND is engaged before the flare", nameOf(source));
    expect(rolling.landBeforeFlare, what);
    std::snprintf(what, sizeof(what), "%s: FLARE engages at or below 42 ft radio height", nameOf(source));
    expect(rolling.flare && rolling.flareStartRadioHeightFt > 0 && rolling.flareStartRadioHeightFt <= 42, what);
    std::snprintf(what, sizeof(what), "%s: LAND stays engaged past the glide path intercept point, where the glide slope words are lost",
                  nameOf(source));
    expect(rolling.landAtTouchdown && notRolling.landAtTouchdown, what);
    std::snprintf(what, sizeof(what), "%s: ROLL OUT engages on the ground at the intercept point with a main wheel above 70 kt",
                  nameOf(source));
    expect(rolling.rollOut && std::abs(rolling.rollOutStartDistanceNm - interceptPointDistanceNm(northApproach())) < 0.1, what);
    std::snprintf(what, sizeof(what), "%s: no ROLL OUT on the ground without a wheel speed, so the wheel speed is what engages it",
                  nameOf(source));
    expect(!notRolling.rollOut, what);
    std::snprintf(what, sizeof(what), "%s: the autopilot is still engaged in ROLL OUT", nameOf(source));
    expect(rolling.autopilotAfterRollOut, what);
  }
}

static void flsBeamWithoutGlsStillBlocksLand() {
  ApproachFlight flight;
  flyToGlideSlopeTrack(flight, GuidanceSource::IlsWithFlsBeam);
  expect(flight.locEngaged() && flight.gsEngaged(), "FLS beam, no GLS: LOC and G/S track still engage");
  flight.setRadioHeight(380);
  flight.fly(3.0);
  expect(!flight.landEngaged(), "FLS beam, no GLS: LAND is blocked, so the GLS case above proves the input is what unblocks it");
}

struct Outcome {
  bool autopilot, loc, glideSlope, land;
  bool operator==(const Outcome& other) const {
    return autopilot == other.autopilot && loc == other.loc && glideSlope == other.glideSlope && land == other.land;
  }
};

static Outcome outcomeAfterLosingTheSignal(GuidanceSource source, double radioHeightFt, double lostSeconds) {
  ApproachFlight flight;
  flyToGlideSlopeTrack(flight, source);
  flight.setRadioHeight(radioHeightFt);
  flight.fly(1.0);
  feedGuidance(flight, source, 0, 0, true);
  flight.fly(lostSeconds);
  return {flight.apEngaged(), flight.locEngaged(), flight.gsEngaged(), flight.landEngaged()};
}

// Loss of the signal. The receivers mark the lost words as no computed data, and FmgcComputer_MATLABFunction_m treats every SSM but
// failure warning as valid, so the generated FmgcComputer does not see the loss on either bus. What this proves is that the GLS bus
// words drive the model exactly as the ILS ones do at any height, so a GLS approach is no worse off than an ILS approach; it does not
// prove that the loss is detected.
static void signalLossIsTreatedAsOnAnIls() {
  for (double radioHeightFt : {1000.0, 300.0, 150.0}) {
    const Outcome ils = outcomeAfterLosingTheSignal(GuidanceSource::Ils, radioHeightFt, 10.0);
    const Outcome gls = outcomeAfterLosingTheSignal(GuidanceSource::Gls, radioHeightFt, 10.0);
    char what[160];
    std::snprintf(what, sizeof(what), "loss of the signal at %.0f ft: GLS words give the ILS outcome", radioHeightFt);
    expect(gls == ils, what);
  }
}

/// The 7 s loss rule: seven seconds without computed data at 1000 ft radio height with LOC and G/S engaged should disengage them, and
/// below 200 ft the autopilot stays engaged. The generated FmgcComputer does not do this for a plain ILS: it reads no computed data as
/// valid, so LOC and G/S stay engaged however long the words are lost (a gap of the A32NX model, left as it is). What is checked is
/// that the GLS words behave exactly as the ILS ones, and that the autopilot stays engaged in LAND below 200 ft.
static void sevenSecondLossRule() {
  for (double lostSeconds : {5.0, 8.0}) {
    const Outcome ils = outcomeAfterLosingTheSignal(GuidanceSource::Ils, 1000, lostSeconds);
    const Outcome gls = outcomeAfterLosingTheSignal(GuidanceSource::Gls, 1000, lostSeconds);
    char what[160];
    std::snprintf(what, sizeof(what), "%.0f s without computed data at 1000 ft: GLS words give the ILS outcome", lostSeconds);
    expect(gls == ils, what);
  }
  const Outcome ilsAfterEightSeconds = outcomeAfterLosingTheSignal(GuidanceSource::Ils, 1000, 8.0);
  if (ilsAfterEightSeconds.loc && ilsAfterEightSeconds.glideSlope) {
    std::printf("NOTE 7 s loss rule: plain ILS, 8 s without computed data at 1000 ft, LOC and G/S stay engaged (model gap)\n");
  }
  // Both MMRs failed (or the ground station): the feed above marks both GLS buses as no computed data
  const Outcome bothMmrsFailed = outcomeAfterLosingTheSignal(GuidanceSource::Gls, 1000, 8.0);
  std::printf("NOTE both GLS words no computed data for 8 s at 1000 ft: autopilot %s, LOC %s, G/S %s, LAND %s (the real aircraft disengages the AP and FD; the model does not)\n",
              bothMmrsFailed.autopilot ? "engaged" : "off", bothMmrsFailed.loc ? "engaged" : "off",
              bothMmrsFailed.glideSlope ? "engaged" : "off", bothMmrsFailed.land ? "engaged" : "off");
  for (GuidanceSource source : {GuidanceSource::Ils, GuidanceSource::Gls}) {
    const Outcome belowTwoHundred = outcomeAfterLosingTheSignal(source, 150, 10.0);
    char what[160];
    std::snprintf(what, sizeof(what), "%s: 10 s without computed data at 150 ft: the autopilot stays engaged in LAND", nameOf(source));
    expect(belowTwoHundred.autopilot && belowTwoHundred.land, what);
  }
}

/// What the autopilot does with one MMR dead on the approach: it flies the other bus, and nothing differs from two working MMRs
struct OneMmrDeadOutcome {
  bool stillOnLocAndGlideSlope = false;
  ap_raw_output_command orders{};
};

static OneMmrDeadOutcome flyWithOneMmrDead(GuidanceSource source, int deadMmr) {
  ApproachFlight flight;
  flight.deadMmr = deadMmr;
  flight.deadMmrInGlsMode = source == GuidanceSource::Gls;
  flyToGlideSlopeTrack(flight, source);
  // Slightly high and to the side, so that the orders are not zero and a deviation of zero on a dead bus would show
  feedGuidance(flight, source, 0.05, 80);
  flight.fly(5.0);
  return {flight.apEngaged() && flight.locEngaged() && flight.gsEngaged(), flight.out().ap_fd_outer_loops.autopilot};
}

static void theFlightGuidanceFliesTheOtherMmrWhenOneIsDead() {
  for (GuidanceSource source : {GuidanceSource::Ils, GuidanceSource::Gls}) {
    const OneMmrDeadOutcome bothWorking = flyWithOneMmrDead(source, -1);
    for (int deadMmr : {0, 1}) {
      const OneMmrDeadOutcome oneDead = flyWithOneMmrDead(source, deadMmr);
      char what[200];
      std::snprintf(what, sizeof(what), "%s, MMR %d dead: AP, LOC and G/S track stay engaged", nameOf(source), deadMmr + 1);
      expect(bothWorking.stillOnLocAndGlideSlope && oneDead.stillOnLocAndGlideSlope, what);
      std::snprintf(what, sizeof(what), "%s, MMR %d dead: the orders are those of two working MMRs", nameOf(source), deadMmr + 1);
      expect(std::abs(oneDead.orders.Theta_c_deg - bothWorking.orders.Theta_c_deg) < 0.01 &&
                 std::abs(oneDead.orders.Phi_c_deg - bothWorking.orders.Phi_c_deg) < 0.01 && std::abs(bothWorking.orders.Phi_c_deg) > 0.01,
             what);
    }
  }
}

/// Both MMRs dead: no ILS bus is left to fly. The flight guidance does not drop the LOC and G/S modes yet (the loss rule is a
/// separate change), so this only reports what it does, as the loss-of-signal test above does.
static void bothMmrsDeadIsReported() {
  for (GuidanceSource source : {GuidanceSource::Ils, GuidanceSource::Gls}) {
    ApproachFlight flight;
    flyToGlideSlopeTrack(flight, source);
    expect(flight.locEngaged() && flight.gsEngaged(), "both MMRs dead: the approach was tracking before the loss");
    flight.deadMmr = ApproachFlight::BOTH_MMRS;
    flight.deadMmrInGlsMode = source == GuidanceSource::Gls;
    feedGuidance(flight, source, 0.05, 80);
    flight.fly(8.0);
    std::printf("NOTE %s, both MMRs dead for 8 s: autopilot %s, LOC %s, G/S %s (the real aircraft disengages the autopilot)\n", nameOf(source),
                flight.apEngaged() ? "engaged" : "off", flight.locEngaged() ? "engaged" : "off", flight.gsEngaged() ? "engaged" : "off");
  }
}

/// The orders of the autopilot a few seconds after the aircraft is slightly high on the path and to the side, with the FMS inputs
/// forced from the start: the glide slope angle is stored when the glide slope is captured
static ap_raw_output_command ordersWithInputs(const GlsFmsGuidanceInputs& inputs) {
  ApproachFlight flight;
  flight.forceFmsGuidanceInputs(inputs);
  flyToGlideSlopeTrack(flight, GuidanceSource::Gls);
  feedGuidance(flight, GuidanceSource::Gls, 0.05, 80);
  flight.fly(5.0);
  return flight.out().ap_fd_outer_loops.autopilot;
}

// What the outer loops do with the two inputs: the distance scales the cross track term of the localizer law and the angle is the
// flight path angle the glide slope law steers to. With neither, as when NAV 3 is detuned, the orders change.
static void outerLoopsNeedTheDistanceAndTheAngle() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations deviations = deviationsOnThePath(approach, APPROACH_DISTANCE_NM);
  const GlsFmsGuidanceInputs fromGls = fmsInputsOf(true, approach, deviations, false, 0, 0);
  const GlsFmsGuidanceInputs fromIls = GlsReceiver::fmsGuidanceInputs(false, approach, deviations, false, APPROACH_DISTANCE_NM, -3);
  const GlsFmsGuidanceInputs none = GlsReceiver::fmsGuidanceInputs(false, approach, deviations, false, 0, 0);

  const ap_raw_output_command gls = ordersWithInputs(fromGls);
  const ap_raw_output_command ils = ordersWithInputs(fromIls);
  const ap_raw_output_command withoutInputs = ordersWithInputs(none);
  expect(std::abs(gls.Theta_c_deg - ils.Theta_c_deg) < 0.05 && std::abs(gls.Phi_c_deg - ils.Phi_c_deg) < 0.05,
         "GLS inputs: same orders as with the ILS values on the same run");
  expect(std::abs(withoutInputs.Theta_c_deg - ils.Theta_c_deg) > 0.05 || std::abs(withoutInputs.Phi_c_deg - ils.Phi_c_deg) > 0.05,
         "without the inputs the orders differ, so they matter");
}

int main() {
  busWordsOfAReceivingMmr();
  noComputedDataWhenOutOfVolumeOrFailed();
  eachMmrFollowsItsOwnFailure();
  ilsModeLeavesTheBusAndTheFmsInputsAlone();
  glsModeWithoutAnUplinkSendsNoComputedData();
  glsWinsOverTheFlsBeam();
  fmsInputsOfTheOuterLoops();
  autolandWarningReadsTheGlsDeviations();
  armingCaptureAndLandOnTheGlsWords();
  flsBeamWithoutGlsStillBlocksLand();
  descendThroughTheInterceptPointIntoFlareAndRollOut();
  signalLossIsTreatedAsOnAnIls();
  sevenSecondLossRule();
  outerLoopsNeedTheDistanceAndTheAngle();
  theFlightGuidanceFliesTheOtherMmrWhenOneIsDead();
  bothMmrsDeadIsReported();
  if (failures > 0) {
    std::printf("gls_guidance_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("gls_guidance_test: all checks passed\n");
  return 0;
}
