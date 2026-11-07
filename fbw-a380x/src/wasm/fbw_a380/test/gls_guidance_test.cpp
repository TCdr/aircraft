// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the GLS words on the ILS bus (fbw-common GlsReceiver.h) and of what the generated A380PrimComputerFg model does
// with them: run test/run_tests.sh.
//
// Built with -DWITHOUT_THE_FIX, the ILS bus keeps the words of the detuned ILS receiver on a GLS approach and the FMS inputs are
// the ones of the radio: the checks of the GLS words and inputs then fail.

#include <cmath>
#include <cstdio>
#include <cstring>
#include <initializer_list>

#include "A380PrimComputerFg.h"
#include "FlsReceiver.h"
#include "GlsReceiver.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double FEET_PER_NM = 6076.12;
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
  expect(busOnApproach(approach, 20001, true, false, inVolume).localizer_deviation_deg.SSM == SSM_NCD, "failed MMR: no computed data");
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

static void ilsModeLeavesTheBusAlone() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations deviations = deviationsOnThePath(approach, 8);
  const base_ils_bus untouched = ilsBusOfTheDetunedReceiver();

  base_ils_bus ilsMode = untouched;
  GlsReceiver::applyToIlsBus(ilsMode, approach, 0, false, false, deviations);
  expect(std::memcmp(&ilsMode, &untouched, sizeof(untouched)) == 0, "MMR in ILS mode: the words are unchanged bit for bit");

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

  const GlsFmsGuidanceInputs withGls = GlsReceiver::fmsGuidanceInputs(true, approach, gls, beam.valid, 0, 0);
  expect(!withGls.flsApproachActive, "GLS active: the FG is not told of an FLS approach, so LAND is not blocked");
  GlsApproachDefinition noUplink = approach;
  noUplink.valid = false;
  const GlsFmsGuidanceInputs glsModeNotReceived = GlsReceiver::fmsGuidanceInputs(true, noUplink, GlsDeviations{}, beam.valid, 0, 0);
  expect(!glsModeNotReceived.flsApproachActive, "GLS mode without a station: an FLS beam is still not applied");
  const GlsFmsGuidanceInputs withoutGls = GlsReceiver::fmsGuidanceInputs(false, approach, gls, beam.valid, 0, 0);
  expect(withoutGls.flsApproachActive, "no GLS: the FLS beam still blocks LAND");
}

static void fmsInputsOfTheOuterLoops() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations gls = deviationsOnThePath(approach, 8);
  const GlsFmsGuidanceInputs inputs = GlsReceiver::fmsGuidanceInputs(true, approach, gls, false, 0, 0);
  expect(std::abs(inputs.locDistanceNm - 8) < 0.05, "ILS-DME distance of the outer loops is the distance to the threshold");
  expect(inputs.unrealisticGsAngleDeg == -3, "glide slope angle of the outer loops is minus the GPA, as -NAV RAW GLIDE SLOPE");

  const GlsFmsGuidanceInputs radio = GlsReceiver::fmsGuidanceInputs(false, approach, gls, false, 6.5, -2.9);
  expect(radio.locDistanceNm == 6.5 && radio.unrealisticGsAngleDeg == -2.9 && !radio.flsApproachActive,
         "no GLS: the inputs are the ones of the radio");
}

constexpr double TIME_STEP_S = 0.05;
constexpr double APPROACH_SPEED_KNOTS = 140.0;
constexpr double APPR_PUSHBUTTON_WORD = 33554432.0;  // bit 26 of the FCU AFS discrete word 1, set by the A380FcuComputer

static void setArinc(base_arinc_429& word, double value) {
  word.SSM = SSM_NORMAL;
  word.Data = static_cast<float>(value);
}

/// PRIM 1 in flight, master, healthy, on a runway heading north, with the autopilot 1 engaged and the APPR pushbutton to press
class ApproachFlight {
 public:
  ApproachFlight() {
    fg.initialize();
    inputs.data.sim_data.computer_running = true;
    inputs.fctl_logic.ap_authorised = true;
    inputs.fctl_logic.is_master_prim = true;
    inputs.data.discrete_inputs.fcu_1_healthy = true;
    inputs.data.discrete_inputs.fcu_2_healthy = true;
    inputs.data.discrete_inputs.is_unit_1 = true;
    inputs.general_logic.engine_running = true;
    inputs.data.adcn_inputs.fms.selected_approach_type = fmgc_approach_type::ILS;
    inputs.general_logic.flap_handle_index = 2;
    inputs.flight_envelope.v_max_kn = 340;
    inputs.flight_envelope.v_ls_kn = 120;
    inputs.general_logic.adr_computation_data.V_ias_kn = APPROACH_SPEED_KNOTS;
    inputs.general_logic.adr_computation_data.mach = 0.21;
    inputs.general_logic.ra_computation_data_ft = 2500;
    base_ir_bus* irBuses[] = {&inputs.data.bus_inputs.ir_1_bus, &inputs.data.bus_inputs.ir_2_bus, &inputs.data.bus_inputs.ir_3_bus};
    for (base_ir_bus* ir : irBuses) {
      setArinc(ir->ground_speed_kn, APPROACH_SPEED_KNOTS);
      setArinc(ir->track_angle_true_deg, 0);
      setArinc(ir->track_angle_magnetic_deg, 0);
      setArinc(ir->heading_true_deg, 0);
      setArinc(ir->heading_magnetic_deg, 0);
      setArinc(ir->pitch_angle_deg, 0);
      setArinc(ir->roll_angle_deg, 0);
      setArinc(ir->flight_path_angle_deg, -3);
      setArinc(ir->inertial_alt_ft, 2500);
      setArinc(ir->body_normal_accel_g, 1);
    }
    base_adr_bus* adrBuses[] = {&inputs.data.bus_inputs.adr_1_bus, &inputs.data.bus_inputs.adr_2_bus, &inputs.data.bus_inputs.adr_3_bus};
    for (base_adr_bus* adr : adrBuses) {
      setArinc(adr->altitude_standard_ft, 2500);
      setArinc(adr->altitude_corrected_1_ft, 2500);
      setArinc(adr->altitude_corrected_2_ft, 2500);
      setArinc(adr->mach, 0.21);
      setArinc(adr->airspeed_computed_kn, APPROACH_SPEED_KNOTS);
      setArinc(adr->airspeed_true_kn, APPROACH_SPEED_KNOTS);
      setArinc(adr->vertical_speed_ft_min, -700);
    }
    setArinc(inputs.data.bus_inputs.fcu_1_bus.afs_discrete_word_1, 0);
    setArinc(inputs.data.bus_inputs.fcu_2_bus.afs_discrete_word_1, 0);
  }

  void setIlsWords(double courseTrueDeg, double frequency, bool locValid, double locDeviation, bool gsValid, double gsDeviation) {
    for (base_ils_bus* bus : {&inputs.data.bus_inputs.ils_1_bus, &inputs.data.bus_inputs.ils_2_bus}) {
      bus->runway_heading_deg.SSM = locValid ? SSM_NORMAL : SSM_NCD;
      bus->runway_heading_deg.Data = static_cast<float>(courseTrueDeg);
      bus->ils_frequency_mhz.SSM = SSM_NORMAL;
      bus->ils_frequency_mhz.Data = static_cast<float>(frequency);
      bus->localizer_deviation_deg.SSM = locValid ? SSM_NORMAL : SSM_NCD;
      bus->localizer_deviation_deg.Data = static_cast<float>(locDeviation);
      bus->glideslope_deviation_deg.SSM = gsValid ? SSM_NORMAL : SSM_NCD;
      bus->glideslope_deviation_deg.Data = static_cast<float>(gsDeviation);
    }
  }

  /// Replaces what the guidance source would give the FMS inputs, for the whole flight
  void forceFmsGuidanceInputs(const GlsFmsGuidanceInputs& fms) {
    fmsOverride = fms;
    hasFmsOverride = true;
  }

  void setFmsGuidanceInputs(const GlsFmsGuidanceInputs& source) {
    const GlsFmsGuidanceInputs& fms = hasFmsOverride ? fmsOverride : source;
    inputs.data.adcn_inputs.fms.fls_approach_active = fms.flsApproachActive;
    inputs.data.adcn_inputs.fms.fms_loc_distance = fms.locDistanceNm;
    inputs.data.adcn_inputs.fms.fms_unrealistic_gs_angle_deg = fms.unrealisticGsAngleDeg;
  }

  void fly(double seconds) {
    for (double t = 0.0; t < seconds; t += TIME_STEP_S) {
      step();
    }
  }

  void pushButton(double word) {
    inputs.data.bus_inputs.fcu_1_bus.afs_discrete_word_1.Data = static_cast<float>(word);
    inputs.data.bus_inputs.fcu_2_bus.afs_discrete_word_1.Data = static_cast<float>(word);
    fly(0.3);
    inputs.data.bus_inputs.fcu_1_bus.afs_discrete_word_1.Data = 0;
    inputs.data.bus_inputs.fcu_2_bus.afs_discrete_word_1.Data = 0;
  }

  void engageAutopilot() {
    inputs.data.discrete_inputs.ap_1_pushbutton_pressed = true;
    fly(0.3);
    inputs.data.discrete_inputs.ap_1_pushbutton_pressed = false;
    fly(2.0);
  }

  const prim_outputs& out() const { return fg.A380PrimComputerFg_Y.out; }
  bool apEngaged() const { return out().fg_logic.ap_1_engaged; }
  bool locEngaged() const { return out().fg_mode_logic.lateral_modes.loc_cpt_active || out().fg_mode_logic.lateral_modes.loc_trk_active; }
  bool gsEngaged() const { return out().fg_mode_logic.longitudinal_modes.gs_capt_active || out().fg_mode_logic.longitudinal_modes.gs_trk_active; }
  bool landEngaged() const { return out().fg_mode_logic.lateral_modes.land_active; }

  A380PrimComputerFg fg;
  prim_outputs inputs{};
  double time = 0.0;
  GlsFmsGuidanceInputs fmsOverride;
  bool hasFmsOverride = false;

 private:
  void step() {
    time += TIME_STEP_S;
    inputs.data.time.dt = TIME_STEP_S;
    inputs.data.time.simulation_time = time;
    inputs.data.time.monotonic_time = time;
    fg.A380PrimComputerFg_U.in = inputs;
    fg.step();
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

/// What the PRIM gets on both ILS buses and from the FMS for an aircraft this far above the path and east of the course.
/// The ILS source gets the same deviations as the GLS, from the detuned receiver's side of the bus.
static void feedGuidance(ApproachFlight& flight, GuidanceSource source, double eastNm, double aboveThePathFt, bool lost = false) {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations deviations = deviationsOnThePath(approach, APPROACH_DISTANCE_NM, eastNm, aboveThePathFt);
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
    GlsReceiver::applyToIlsBus(bus, approach, approach.channel, lost, false, deviations);
    flight.inputs.data.bus_inputs.ils_1_bus = bus;
    flight.inputs.data.bus_inputs.ils_2_bus = bus;
  } else {
    flight.setIlsWords(0, RADIO_FREQUENCY_MHZ, !lost, deviations.lateralDeviationDeg, !lost, deviations.verticalDeviationDeg);
  }
  flight.setFmsGuidanceInputs(GlsReceiver::fmsGuidanceInputs(glsActive, approach, deviations, flsBeamValid, APPROACH_DISTANCE_NM, -3));
}

/// The aircraft above the path and just east of the course, the autopilot engaged and APPR pressed, then onto the path
static void flyToGlideSlopeTrack(ApproachFlight& flight, GuidanceSource source) {
  constexpr double HIGH_FT = 420;
  feedGuidance(flight, source, 0.03, HIGH_FT);
  flight.fly(6.0);
  flight.engageAutopilot();
  flight.pushButton(APPR_PUSHBUTTON_WORD);
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

static void locGlideSlopeAndLandOnTheGlsWords() {
  for (GuidanceSource source : {GuidanceSource::Ils, GuidanceSource::Gls, GuidanceSource::GlsWithFlsBeam}) {
    ApproachFlight flight;
    flyToGlideSlopeTrack(flight, source);
    char what[160];
    std::snprintf(what, sizeof(what), "%s: LOC and G/S track engaged on the approach", nameOf(source));
    expect(flight.apEngaged() && flight.locEngaged() && flight.gsEngaged(), what);

    flight.inputs.general_logic.ra_computation_data_ft = 380;
    flight.fly(3.0);
    std::snprintf(what, sizeof(what), "%s: LAND engages below 400 ft", nameOf(source));
    expect(flight.apEngaged() && flight.landEngaged(), what);
  }
}

static void flsBeamWithoutGlsStillBlocksLand() {
  ApproachFlight flight;
  flyToGlideSlopeTrack(flight, GuidanceSource::IlsWithFlsBeam);
  expect(flight.locEngaged() && flight.gsEngaged(), "FLS beam, no GLS: LOC and G/S track still engage");
  flight.inputs.general_logic.ra_computation_data_ft = 380;
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
  flight.inputs.general_logic.ra_computation_data_ft = 300;
  flight.fly(3.0);
  flight.inputs.general_logic.ra_computation_data_ft = radioHeightFt;
  feedGuidance(flight, source, 0, 0, true);
  flight.fly(lostSeconds);
  return {flight.apEngaged(), flight.locEngaged(), flight.gsEngaged(), flight.landEngaged()};
}

// The generated A380PrimComputerFg keeps the autopilot and LAND engaged after a loss of the ILS words above 200 ft as well, so
// there is no disengagement to compare: what is checked is that the GLS words are treated exactly as the ILS ones, and that
// the loss below 200 ft is tolerated.
static void signalLossIsTreatedAsOnAnIls() {
  for (double radioHeightFt : {300.0, 150.0}) {
    const Outcome ils = outcomeAfterLosingTheSignal(GuidanceSource::Ils, radioHeightFt, 10.0);
    const Outcome gls = outcomeAfterLosingTheSignal(GuidanceSource::Gls, radioHeightFt, 10.0);
    char what[160];
    std::snprintf(what, sizeof(what), "loss of the signal at %.0f ft: GLS words give the ILS outcome", radioHeightFt);
    expect(gls == ils, what);
  }
  const Outcome belowTwoHundred = outcomeAfterLosingTheSignal(GuidanceSource::Gls, 150.0, 10.0);
  expect(belowTwoHundred.autopilot && belowTwoHundred.land, "loss of the GLS below 200 ft: the autopilot stays engaged in LAND");
}

/// The orders of the autopilot a few seconds after the aircraft is slightly high on the path and to the side, with the FMS inputs
/// forced from the start: the glide slope angle is stored when the glide slope is captured
static ap_raw_output_command ordersWithInputs(const GlsFmsGuidanceInputs& inputs) {
  ApproachFlight flight;
  flight.forceFmsGuidanceInputs(inputs);
  flyToGlideSlopeTrack(flight, GuidanceSource::Gls);
  feedGuidance(flight, GuidanceSource::Gls, 0.05, 80);
  flight.fly(5.0);
  return flight.out().fg_laws.ap_fd_1.autopilot;
}

// What the outer loops do with the two inputs: the distance scales the cross track term of the localizer law and the angle is the
// flight path angle the glide slope law steers to. With neither, as when NAV 3 is detuned, the orders change.
static void outerLoopsNeedTheDistanceAndTheAngle() {
  const GlsApproachDefinition approach = northApproach();
  const GlsDeviations deviations = deviationsOnThePath(approach, APPROACH_DISTANCE_NM);
  const GlsFmsGuidanceInputs fromGls = GlsReceiver::fmsGuidanceInputs(true, approach, deviations, false, 0, 0);
  const GlsFmsGuidanceInputs fromIls = GlsReceiver::fmsGuidanceInputs(false, approach, deviations, false, APPROACH_DISTANCE_NM, -3);
  const GlsFmsGuidanceInputs none = GlsReceiver::fmsGuidanceInputs(false, approach, deviations, false, 0, 0);

  const ap_raw_output_command gls = ordersWithInputs(fromGls);
  const ap_raw_output_command ils = ordersWithInputs(fromIls);
  const ap_raw_output_command withoutInputs = ordersWithInputs(none);
  expect(std::abs(gls.Theta_c_deg - ils.Theta_c_deg) < 0.05 && std::abs(gls.Phi_c_deg - ils.Phi_c_deg) < 0.05,
         "GLS inputs: same orders as with the ILS values on the same run");
  expect(std::abs(withoutInputs.Theta_c_deg - ils.Theta_c_deg) > 0.05, "without the inputs the orders differ, so they matter");
}

int main() {
  busWordsOfAReceivingMmr();
  noComputedDataWhenOutOfVolumeOrFailed();
  ilsModeLeavesTheBusAlone();
  glsModeWithoutAnUplinkSendsNoComputedData();
  glsWinsOverTheFlsBeam();
  fmsInputsOfTheOuterLoops();
  locGlideSlopeAndLandOnTheGlsWords();
  flsBeamWithoutGlsStillBlocksLand();
  signalLossIsTreatedAsOnAnIls();
  outerLoopsNeedTheDistanceAndTheAngle();
  if (failures > 0) {
    std::printf("gls_guidance_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("gls_guidance_test: all checks passed\n");
  return 0;
}
