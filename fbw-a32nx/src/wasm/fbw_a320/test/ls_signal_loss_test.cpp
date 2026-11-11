// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the loss of the LOC or G/S signal in the flight guidance (fbw-common LandingSystemSignalLoss.h, applied in
// src/fmgc/Fmgc.cpp) with the generated FmgcComputer: run test/run_tests.sh.
//
// The generated model reads a word with no computed data as valid with a deviation of zero, so without the monitor the autopilot
// keeps flying a beam that is not there. The AP and the FDs disengage when LOC or G/S has been lost for 7 s above 200 ft radio
// height, and the FDs come back in HDG V/S.
//
// Built with -DWITHOUT_THE_FIX the model gets its inputs unchanged and the checks of the disconnection fail.

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <initializer_list>
#include <new>

#include "../src/fmgc/Fmgc.h"
#include "LandingSystemSignalLoss.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static void expectAtFrameTime(bool condition, const char* what, double frameTimeS) {
  if (!condition) {
    std::printf("FAIL %s (frame time %.3f s)\n", what, frameTimeS);
    ++failures;
  }
}

constexpr double TIME_STEP_S = 0.05;
// Frame times of the sim: 60 and 30 fps, 4x sim rate at 60 and 30 fps, slow frames, and a high sim rate at a low frame rate
constexpr double FRAME_TIMES_S[] = {0.016, 0.033, 0.067, 0.1, 0.133, 0.15, 0.25, 0.5, 0.6, 1.0};
// Bits 26 and 27 of the FCU discrete word 2: the FD 1 and FD 2 off levels
constexpr double FLIGHT_DIRECTORS_OFF_WORD = 100663296.0;
constexpr double APPROACH_SPEED_KNOTS = 140.0;
constexpr uint32_T NORMAL_OPERATION = 3;
constexpr uint32_T NO_COMPUTED_DATA = 1;
constexpr uint32_T FAILURE_WARNING = 0;
// Bit 23 of the FCU discrete word 1 (APPR pushed) and bit 13 of the word 2 (LOC pushed)
constexpr double APPR_PUSHBUTTON_WORD = 4194304.0;
constexpr double LOC_PUSHBUTTON_WORD = 4096.0;
// bits 11 and 13: what the FMGC needs from a FAC to let the autopilot engage
constexpr float FAC_DISCRETE_WORD_2_AP_AVAILABLE = 5120.0F;
// The aircraft starts 0.5 degree above the beam and to the side, and flies onto it
constexpr double START_GLIDE_SLOPE_DEVIATION_DEG = 0.5;
constexpr double START_LOCALIZER_DEVIATION_DEG = -0.2;

enum class Side { Both, Own, Opposite };

static void setWord(base_arinc_429& word, double value) {
  word.SSM = NORMAL_OPERATION;
  word.Data = static_cast<float>(value);
}

/// Master's Fmgc leaves its power supply and self-test state uninitialised (the module gets zeroed memory in the sim), so the test
/// gives it zeroed memory too, instead of whatever the stack holds
static Fmgc& zeroedFmgc(bool isUnit1) {
  void* memory = std::calloc(1, sizeof(Fmgc));
  return *new (memory) Fmgc(isUnit1);
}

class ApproachFlight {
 public:
  explicit ApproachFlight(bool isUnit1 = true) : fmgc(zeroedFmgc(isUnit1)) {
    auto& discrete = fmgc.modelInputs.in.discrete_inputs;
    discrete.is_unit_1 = isUnit1;
    discrete.fcu_opp_healthy = discrete.fcu_own_healthy = discrete.fac_opp_healthy = discrete.fac_own_healthy = true;
    discrete.fmgc_opp_healthy = true;
    discrete.fwc_opp_valid = discrete.fwc_own_valid = discrete.pfd_opp_valid = discrete.pfd_own_valid = true;
    discrete.bscu_opp_valid = discrete.bscu_own_valid = true;
    discrete.nav_control_own = true;
    auto& fms = fmgc.modelInputs.in.fms_inputs;
    fms.fm_valid = true;
    fms.fms_flight_phase = fmgc_flight_phase::Approach;
    fms.selected_approach_type = fmgc_approach_type::ILS;
    fms.fms_loc_distance = 8;
    fms.fms_unrealistic_gs_angle_deg = -3;
    auto* words = reinterpret_cast<base_arinc_429*>(&fmgc.modelInputs.in.bus_inputs);
    for (size_t i = 0; i < sizeof(fmgc.modelInputs.in.bus_inputs) / sizeof(base_arinc_429); ++i) {
      words[i].SSM = NORMAL_OPERATION;
      words[i].Data = 0;
    }
    setRadioHeight(2500);
    setBeam(Side::Both, true, 0, true, 0);
  }

  void setRadioHeight(double heightFt) {
    auto& buses = fmgc.modelInputs.in.bus_inputs;
    setWord(buses.ra_own_bus.radio_height_ft, heightFt);
    setWord(buses.ra_opp_bus.radio_height_ft, heightFt);
  }

  void invalidateRadioAltimeters() {
    auto& buses = fmgc.modelInputs.in.bus_inputs;
    buses.ra_own_bus.radio_height_ft.SSM = NO_COMPUTED_DATA;
    buses.ra_opp_bus.radio_height_ft.SSM = NO_COMPUTED_DATA;
  }

  /// A beam with the given deviations on the bus of one or both receivers
  void setBeam(Side side, bool locNormal, double locDeviation, bool gsNormal, double gsDeviation) {
    for (Side bus : {Side::Own, Side::Opposite}) {
      if (side != Side::Both && side != bus) {
        continue;
      }
      base_ils_bus& ils = bus == Side::Own ? fmgc.modelInputs.in.bus_inputs.ils_own_bus : fmgc.modelInputs.in.bus_inputs.ils_opp_bus;
      ils.runway_heading_deg.SSM = locNormal ? NORMAL_OPERATION : NO_COMPUTED_DATA;
      ils.runway_heading_deg.Data = 0;
      ils.ils_frequency_mhz.SSM = NORMAL_OPERATION;
      ils.ils_frequency_mhz.Data = 110.3F;
      ils.localizer_deviation_deg.SSM = locNormal ? NORMAL_OPERATION : NO_COMPUTED_DATA;
      ils.localizer_deviation_deg.Data = static_cast<float>(locDeviation);
      ils.glideslope_deviation_deg.SSM = gsNormal ? NORMAL_OPERATION : NO_COMPUTED_DATA;
      ils.glideslope_deviation_deg.Data = static_cast<float>(gsDeviation);
    }
  }

  /// The receiver of one or both buses is dead: failure warning on every word
  void killReceiver(Side side) {
    for (Side bus : {Side::Own, Side::Opposite}) {
      if (side != Side::Both && side != bus) {
        continue;
      }
      base_ils_bus& ils = bus == Side::Own ? fmgc.modelInputs.in.bus_inputs.ils_own_bus : fmgc.modelInputs.in.bus_inputs.ils_opp_bus;
      ils.runway_heading_deg.SSM = ils.ils_frequency_mhz.SSM = FAILURE_WARNING;
      ils.localizer_deviation_deg.SSM = ils.glideslope_deviation_deg.SSM = FAILURE_WARNING;
    }
  }

  void fly(double seconds) {
    for (double t = 0.0; t < seconds; t += frameTimeS) {
      step();
    }
  }

  /// True when the autopilot is engaged in every frame of the next `seconds`
  bool autopilotStaysEngaged(double seconds) {
    for (double t = 0.0; t < seconds; t += frameTimeS) {
      step();
      if (!apEngaged()) {
        return false;
      }
    }
    return true;
  }

  void invalidateOwnRadioAltimeter() { fmgc.modelInputs.in.bus_inputs.ra_own_bus.radio_height_ft.SSM = NO_COMPUTED_DATA; }

  void pressButtons(double fcuWord1, double fcuWord2) {
    setWord(fmgc.modelInputs.in.bus_inputs.fcu_bus.fcu_discrete_word_1, fcuWord1);
    setWord(fmgc.modelInputs.in.bus_inputs.fcu_bus.fcu_discrete_word_2, fcuWord2);
    fly(0.3);
    setWord(fmgc.modelInputs.in.bus_inputs.fcu_bus.fcu_discrete_word_1, 0);
    setWord(fmgc.modelInputs.in.bus_inputs.fcu_bus.fcu_discrete_word_2, 0);
  }

  void engageAutopilot() {
    fmgc.modelInputs.in.discrete_inputs.fcu_ap_button = true;
    fly(0.3);
    fmgc.modelInputs.in.discrete_inputs.fcu_ap_button = false;
    fly(2.0);
  }

  /// With the autopilot engaged and APPR (or LOC) pressed, from above the beam onto it: LOC and G/S track on the ILS
  void flyToTrack(bool pressLocOnly = false) {
    setBeam(Side::Both, true, START_LOCALIZER_DEVIATION_DEG, true, START_GLIDE_SLOPE_DEVIATION_DEG);
    fly(6.0);
    engageAutopilot();
    captureTheApproach(pressLocOnly);
  }

  /// APPR (or LOC) pressed with the autopilot engaged, from above the beam onto it
  void captureTheApproach(bool pressLocOnly = false) {
    if (pressLocOnly) {
      pressButtons(0, LOC_PUSHBUTTON_WORD);
    } else {
      pressButtons(APPR_PUSHBUTTON_WORD, 0);
    }
    fly(3.0);
    constexpr int STEPS = 12;
    for (int step = 0; step <= STEPS; step++) {
      const double remaining = static_cast<double>(STEPS - step) / STEPS;
      setBeam(Side::Both, true, START_LOCALIZER_DEVIATION_DEG * remaining, true, START_GLIDE_SLOPE_DEVIATION_DEG * remaining);
      fly(1.0);
    }
    fly(5.0);
  }

  /// The beam on the path, as after flyToTrack
  void setBeamOnThePath(Side side = Side::Both) { setBeam(side, true, 0, true, 0); }

  const fmgc_outputs& out() const { return fmgc.getDebugOutputs(); }
  bool apEngaged() const { return out().logic.ap_own_engaged; }
  bool fdEngaged() const { return out().logic.fd_own_engaged; }
  bool locEngaged() const { return out().ap_fd_logic.lateral_modes.loc_cpt_active || out().ap_fd_logic.lateral_modes.loc_trk_active; }
  bool locArmed() const { return out().ap_fd_logic.armed_modes.loc_armed; }
  bool gsArmed() const { return out().ap_fd_logic.armed_modes.glide_armed; }
  bool gsEngaged() const { return out().ap_fd_logic.longitudinal_modes.gs_capt_active || out().ap_fd_logic.longitudinal_modes.gs_trk_active; }
  bool landEngaged() const { return out().ap_fd_logic.lateral_modes.land_active; }
  bool headingMode() const { return out().ap_fd_logic.lateral_modes.hdg_active || out().ap_fd_logic.lateral_modes.trk_active; }
  bool verticalSpeedMode() const { return out().ap_fd_logic.longitudinal_modes.vs_active || out().ap_fd_logic.longitudinal_modes.fpa_active; }
  bool basicModes() const { return headingMode() && verticalSpeedMode(); }
  bool stillOnTheApproach() const { return apEngaged() && locEngaged() && gsEngaged(); }

  Fmgc& fmgc;
  double time = 0.0;
  double frameTimeS = TIME_STEP_S;

 private:
  void step() {
    time += frameTimeS;
    auto& buses = fmgc.modelInputs.in.bus_inputs;
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
    fmgc.modelInputs.in.time.dt = frameTimeS;
    fmgc.modelInputs.in.time.simulation_time = time;
    fmgc.modelInputs.in.time.monotonic_time = time;
    fmgc.update(frameTimeS, time, false, true);
  }
};

/// The loss of the signal of both receivers for `lostSeconds`, from the track at `radioHeightFt`
struct Outcome {
  bool autopilot, fd, loc, glideSlope, land, locArmed, glideSlopeArmed, basicModes;
};

static Outcome outcomeOf(const ApproachFlight& flight) {
  return {flight.apEngaged(), flight.fdEngaged(),  flight.locEngaged(),  flight.gsEngaged(),
          flight.landEngaged(), flight.locArmed(), flight.gsArmed(),      flight.headingMode() && flight.verticalSpeedMode()};
}

static Outcome loseTheSignal(double radioHeightFt, double lostSeconds, bool locLost, bool gsLost, bool pressLocOnly = false) {
  ApproachFlight flight;
  flight.flyToTrack(pressLocOnly);
  flight.setRadioHeight(radioHeightFt);
  flight.fly(1.0);
  flight.setBeam(Side::Both, !locLost, 0, !gsLost, 0);
  flight.fly(lostSeconds);
  return outcomeOf(flight);
}

static void aShortLossKeepsTheApproach() {
  const Outcome shortLoss = loseTheSignal(1000, 6.5, true, true);
  expect(shortLoss.autopilot && shortLoss.loc && shortLoss.glideSlope, "6.5 s without LOC and G/S at 1000 ft: AP, LOC and G/S stay");

  // The signal that comes back before 7 s starts the count again
  ApproachFlight flight;
  flight.flyToTrack();
  flight.setRadioHeight(1000);
  for (int loss = 0; loss < 3; loss++) {
    flight.setBeam(Side::Both, false, 0, false, 0);
    flight.fly(4.0);
    flight.setBeamOnThePath();
    flight.fly(1.0);
  }
  expect(flight.stillOnTheApproach(), "three losses of 4 s with the signal back between them: no disconnection");
}

static void sevenSecondsDisengageTheAutopilotAndTheFlightDirectors() {
  const Outcome lost = loseTheSignal(1000, 9.0, true, true);
  expect(!lost.autopilot, "7 s without LOC and G/S at 1000 ft: AP off");
  expect(!lost.loc && !lost.glideSlope && !lost.locArmed && !lost.glideSlopeArmed, "LOC and G/S are neither engaged nor armed");
  expect(lost.fd && lost.basicModes, "the FD comes back in HDG V/S");
}

static void aLostGlideSlopeDisengagesToo() {
  const Outcome lostGlideSlope = loseTheSignal(1000, 9.0, false, true);
  expect(!lostGlideSlope.autopilot && !lostGlideSlope.glideSlope && lostGlideSlope.fd, "G/S lost alone for 7 s: AP off, G/S off");
  const Outcome lostLocalizer = loseTheSignal(1000, 9.0, true, false);
  expect(!lostLocalizer.autopilot && !lostLocalizer.loc && lostLocalizer.fd, "LOC lost alone for 7 s: AP off, LOC off");
  const Outcome localizerOnly = loseTheSignal(1000, 9.0, false, true, true);
  expect(localizerOnly.autopilot && localizerOnly.loc && !localizerOnly.glideSlope,
         "approach flown with LOC only (G/S never engaged), G/S lost: the autopilot stays on the localizer");
}

static void belowTwoHundredFeetNothingDisengages() {
  const Outcome land300 = loseTheSignal(300, 9.0, true, true);
  expect(!land300.autopilot, "LAND engaged at 300 ft, signal lost 9 s: AP off");
  const Outcome land150 = loseTheSignal(150, 12.0, true, true);
  expect(land150.autopilot && land150.land, "signal lost 12 s at 150 ft: the autopilot stays in LAND");

  // The autoland warning is what tells the crew there
  ApproachFlight bothDead;
  bothDead.flyToTrack();
  bothDead.setRadioHeight(150);
  bothDead.fly(5.0);
  expect(bothDead.apEngaged() && bothDead.landEngaged(), "setup: LAND at 150 ft");
  bothDead.killReceiver(Side::Both);
  bothDead.fly(12.0);
  expect(bothDead.apEngaged() && bothDead.landEngaged(), "both receivers dead 12 s at 150 ft: the autopilot stays in LAND");
}

static void descendingBelowTwoHundredFeetBeforeSevenSecondsDoesNotTrip() {
  ApproachFlight flight;
  flight.flyToTrack();
  flight.setRadioHeight(350);
  flight.fly(1.0);
  flight.setBeam(Side::Both, false, 0, false, 0);
  for (double heightFt = 350; heightFt > 100; heightFt -= 50) {
    flight.setRadioHeight(heightFt);
    flight.fly(1.0);
  }
  flight.fly(8.0);
  expect(flight.apEngaged() && flight.landEngaged(), "signal lost from 350 ft, below 200 ft after 3 s: the autopilot stays in LAND");
}

static void oneWorkingReceiverKeepsTheApproach() {
  for (Side dead : {Side::Own, Side::Opposite}) {
    ApproachFlight flight;
    flight.flyToTrack();
    flight.setRadioHeight(1000);
    flight.killReceiver(dead);
    flight.fly(12.0);
    expect(flight.stillOnTheApproach() && flight.fdEngaged(), "one receiver dead for 12 s: the other one is flown, AP, LOC and G/S stay");
  }
  // One receiver only has no signal: the flight guidance flies it (no computed data is valid in the model), so the rule counts
  ApproachFlight oneNoSignal;
  oneNoSignal.flyToTrack();
  oneNoSignal.setRadioHeight(1000);
  oneNoSignal.setBeam(Side::Opposite, false, 0, false, 0);
  oneNoSignal.fly(12.0);
  expect(oneNoSignal.stillOnTheApproach(), "the opposite bus loses its signal while the own bus is flown: no disconnection");
}

static void bothReceiversDeadIsASignalLoss() {
  ApproachFlight flight;
  flight.flyToTrack();
  flight.setRadioHeight(1000);
  flight.killReceiver(Side::Both);
  flight.fly(6.0);
  expect(flight.stillOnTheApproach(), "both receivers dead: still engaged after 6 s");
  flight.fly(3.0);
  expect(!flight.apEngaged() && !flight.locEngaged() && flight.fdEngaged(), "both receivers dead for 9 s: AP off, FD back in basic modes");
}

static void theFlightDirectorsComeBackAtAnyFrameTime() {
  for (double frameTimeS : FRAME_TIMES_S) {
    ApproachFlight flight;
    flight.flyToTrack();
    flight.setRadioHeight(1000);
    flight.fly(1.0);
    flight.frameTimeS = frameTimeS;
    flight.setBeam(Side::Both, false, 0, false, 0);
    flight.fly(10.0);
    expectAtFrameTime(!flight.apEngaged(), "signal lost: AP off", frameTimeS);
    expectAtFrameTime(flight.fdEngaged() && flight.basicModes(), "signal lost: the FD ends ON in HDG V/S", frameTimeS);
  }
}

static void theCrewCanEngageTheAutopilotAfterTheTrip() {
  for (double frameTimeS : {0.05, 0.5}) {
    ApproachFlight flight;
    flight.flyToTrack();
    flight.setRadioHeight(1000);
    flight.fly(1.0);
    flight.frameTimeS = frameTimeS;
    flight.setBeam(Side::Both, false, 0, false, 0);
    flight.fly(10.0);
    expectAtFrameTime(!flight.apEngaged(), "setup: the autopilot tripped", frameTimeS);

    // The signal stays lost and no approach mode is armed or engaged any more: the monitor must not trip again
    flight.fly(1.5);
    flight.engageAutopilot();
    expectAtFrameTime(flight.apEngaged(), "the crew engages the autopilot 1.5 s after the trip", frameTimeS);
    expectAtFrameTime(flight.autopilotStaysEngaged(15.0), "signal still lost, no LS mode: no second trip", frameTimeS);
    expectAtFrameTime(!flight.locArmed() && !flight.locEngaged(), "no LS mode is armed or engaged after the trip", frameTimeS);
  }

  ApproachFlight flight;
  flight.flyToTrack();
  flight.setRadioHeight(1000);
  flight.fly(1.0);
  flight.setBeam(Side::Both, false, 0, false, 0);
  flight.fly(9.0);
  flight.setBeam(Side::Both, true, START_LOCALIZER_DEVIATION_DEG, true, START_GLIDE_SLOPE_DEVIATION_DEG);
  flight.fly(1.0);
  flight.engageAutopilot();
  expect(flight.apEngaged(), "the signal is back: the crew engages the autopilot");
  flight.captureTheApproach();
  expect(flight.stillOnTheApproach(), "the approach is captured again after the trip");
  flight.setBeam(Side::Both, false, 0, false, 0);
  flight.fly(6.0);
  expect(flight.apEngaged(), "second loss: not tripped yet after 6 s");
  flight.fly(3.0);
  expect(!flight.apEngaged(), "second loss: tripped after 7 s, the monitor armed again");
}

static void aTripWithTheFlightDirectorsOffLeavesThemOff() {
  ApproachFlight flight;
  flight.flyToTrack();
  setWord(flight.fmgc.modelInputs.in.bus_inputs.fcu_bus.fcu_discrete_word_2, FLIGHT_DIRECTORS_OFF_WORD);
  flight.fly(1.0);
  expect(flight.apEngaged() && !flight.fdEngaged(), "setup: the autopilot is engaged with the FDs off");
  flight.setRadioHeight(1000);
  flight.fly(1.0);
  flight.setBeam(Side::Both, false, 0, false, 0);
  flight.fly(10.0);
  expect(!flight.apEngaged(), "FDs off before the trip: AP off");
  expect(!flight.fdEngaged(), "FDs off before the trip: they are not switched on");
  expect(!flight.locEngaged() && !flight.locArmed(), "FDs off before the trip: LOC is neither engaged nor armed");
  flight.fly(1.5);
  flight.engageAutopilot();
  expect(flight.apEngaged(), "FDs off: the crew engages the autopilot after the trip");
  expect(flight.autopilotStaysEngaged(15.0), "FDs off, signal still lost: no trip every 0.5 s");
}

static void theHeightLimitIsTwoHundredFeet() {
  expect(!loseTheSignal(210, 9.0, true, true).autopilot, "signal lost 9 s at 210 ft: AP off");
  expect(loseTheSignal(200, 9.0, true, true).autopilot, "signal lost 9 s at exactly 200 ft: AP stays");
  expect(loseTheSignal(190, 9.0, true, true).autopilot, "signal lost 9 s at 190 ft: AP stays");
}

static void theRadioAltimeterOfTheOtherSideIsUsedWhenTheOwnOneFailed() {
  ApproachFlight ownFailed;
  ownFailed.flyToTrack();
  ownFailed.setRadioHeight(1000);
  ownFailed.invalidateOwnRadioAltimeter();
  ownFailed.fly(1.0);
  ownFailed.setBeam(Side::Both, false, 0, false, 0);
  ownFailed.fly(9.0);
  expect(!ownFailed.apEngaged() && ownFailed.fdEngaged() && ownFailed.basicModes(), "own radio altimeter failed, the other one valid: the 7 s rule trips");

  ApproachFlight bothFailed;
  bothFailed.flyToTrack();
  bothFailed.setRadioHeight(1000);
  bothFailed.invalidateRadioAltimeters();
  bothFailed.fly(1.0);
  bothFailed.setBeam(Side::Both, false, 0, false, 0);
  bothFailed.fly(9.0);
  expect(bothFailed.apEngaged() && bothFailed.locEngaged(), "both radio altimeters failed: the 7 s rule does not trip");
}

static void theFlightDirectorsAloneLoseTheApproachToo() {
  ApproachFlight flight;
  flight.setBeam(Side::Both, true, START_LOCALIZER_DEVIATION_DEG, true, START_GLIDE_SLOPE_DEVIATION_DEG);
  flight.fly(6.0);
  flight.captureTheApproach();
  expect(!flight.apEngaged() && flight.fdEngaged() && flight.locEngaged() && flight.gsEngaged(), "setup: LOC and G/S with the FDs only");
  flight.setRadioHeight(1000);
  flight.fly(1.0);
  flight.setBeam(Side::Both, false, 0, false, 0);
  flight.fly(6.0);
  expect(flight.locEngaged() && flight.gsEngaged(), "FDs only: LOC and G/S stay for 6 s without the signal");
  flight.fly(3.0);
  expect(!flight.locEngaged() && !flight.gsEngaged() && !flight.locArmed() && !flight.gsArmed(),
         "FDs only, signal lost 9 s: LOC and G/S are neither engaged nor armed");
  expect(flight.fdEngaged() && flight.basicModes(), "FDs only, signal lost 9 s: the FD comes back in HDG V/S");
}

static void theSecondFmgcDisengagesItsAutopilotToo() {
  ApproachFlight flight(false);
  flight.flyToTrack();
  expect(flight.stillOnTheApproach(), "setup: FMGC 2 flies the approach with its autopilot");
  flight.setRadioHeight(1000);
  flight.fly(1.0);
  flight.setBeam(Side::Both, false, 0, false, 0);
  flight.fly(6.0);
  expect(flight.stillOnTheApproach(), "FMGC 2: still engaged after 6 s without the signal");
  flight.fly(3.0);
  expect(!flight.apEngaged() && !flight.locEngaged() && !flight.gsEngaged(), "FMGC 2, signal lost 9 s: AP off, LOC and G/S off");
  expect(flight.fdEngaged() && flight.basicModes(), "FMGC 2, signal lost 9 s: the FD comes back in HDG V/S");
}

// Each FMGC flies its own bus first, so one bus that lost its signal while the other is good is flown by that side alone
static void anOwnBusWithoutSignalIsFlownByThatSide() {
  ApproachFlight flight;
  flight.flyToTrack();
  flight.setRadioHeight(1000);
  flight.fly(1.0);
  flight.setBeam(Side::Own, false, 0, false, 0);
  flight.fly(9.0);
  expect(!flight.apEngaged(), "own bus without signal for 9 s while the opposite bus is good: this FMGC trips");
}

// The radio altimeter loss has its own rule in the model, the monitor stays out of it
static void theMonitorNeedsAValidRadioHeight() {
  LandingSystemSignalLoss::Monitor monitor;
  LandingSystemSignalLoss::Inputs inputs;
  inputs.localizerModeEngaged = inputs.glideSlopeModeEngaged = true;
  inputs.radioHeightValid = false;
  inputs.radioHeightFt = 1000;
  inputs.signal.localizerSsm = inputs.signal.glideSlopeSsm = NO_COMPUTED_DATA;
  LandingSystemSignalLoss::Rules rules;
  rules.glideSlopeLossDisengages = true;
  bool tripped = false;
  for (int frame = 0; frame < 400; frame++) {
    tripped = tripped || monitor.update(TIME_STEP_S, inputs, rules).disengage;
  }
  expect(!tripped, "no valid radio height: the monitor does not trip");
}

static void aGoodSignalNeverTrips() {
  ApproachFlight flight;
  flight.flyToTrack();
  bool disengaged = false;
  for (double heightFt = 1000; heightFt > 250; heightFt -= 10) {
    flight.setRadioHeight(heightFt);
    flight.fly(1.0);
    disengaged = disengaged || !flight.apEngaged();
  }
  expect(!disengaged && flight.apEngaged() && (flight.locEngaged() || flight.landEngaged()), "good signal down to LAND: the autopilot never disengages");
}

static void bothReceiversLostAtOnceIsNotAnA32nxRule() {
  LandingSystemSignalLoss::Monitor monitor;
  LandingSystemSignalLoss::Inputs inputs;
  inputs.localizerModeArmedOrEngaged = true;
  inputs.signal.bothBusesFailureWarning = true;
  inputs.radioHeightValid = true;
  inputs.radioHeightFt = 1000;
  LandingSystemSignalLoss::Rules rules;
  rules.glideSlopeLossDisengages = true;
  bool tripped = false;
  for (int frame = 0; frame < 100; frame++) {
    tripped = tripped || monitor.update(TIME_STEP_S, inputs, rules).disengage;
  }
  expect(!tripped, "A32NX rules: both receivers lost with LOC armed does not disconnect at once");
  rules.bothReceiversLostDisengagesAtOnce = true;
  expect(!monitor.update(TIME_STEP_S, inputs, rules).disengage, "A380X rules: the first frame of both receivers lost is not enough");
  for (int frame = 0; frame < 5; frame++) {
    tripped = tripped || monitor.update(TIME_STEP_S, inputs, rules).disengage;
  }
  expect(tripped, "A380X rules: both receivers lost with LOC armed disconnects after the short confirmation");
}

int main() {
  aShortLossKeepsTheApproach();
  sevenSecondsDisengageTheAutopilotAndTheFlightDirectors();
  aLostGlideSlopeDisengagesToo();
  belowTwoHundredFeetNothingDisengages();
  descendingBelowTwoHundredFeetBeforeSevenSecondsDoesNotTrip();
  oneWorkingReceiverKeepsTheApproach();
  bothReceiversDeadIsASignalLoss();
  theMonitorNeedsAValidRadioHeight();
  aGoodSignalNeverTrips();
  bothReceiversLostAtOnceIsNotAnA32nxRule();
  theFlightDirectorsComeBackAtAnyFrameTime();
  theCrewCanEngageTheAutopilotAfterTheTrip();
  aTripWithTheFlightDirectorsOffLeavesThemOff();
  theHeightLimitIsTwoHundredFeet();
  theRadioAltimeterOfTheOtherSideIsUsedWhenTheOwnOneFailed();
  anOwnBusWithoutSignalIsFlownByThatSide();
  theFlightDirectorsAloneLoseTheApproachToo();
  theSecondFmgcDisengagesItsAutopilotToo();
  if (failures > 0) {
    std::printf("ls_signal_loss_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("ls_signal_loss_test: all checks passed\n");
  return 0;
}
