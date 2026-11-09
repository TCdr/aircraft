// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the loss of the LOC or G/S signal in the flight guidance of the PRIM (fbw-common LandingSystemSignalLoss.h, applied by
// src/prim/PrimLandingSystemSignalLoss.h) with the generated A380PrimComputerFg: run test/run_tests.sh.
//
// The generated model reads a word with no computed data as valid with a deviation of zero, so without the monitor the autopilot keeps
// flying a beam that is not there. The AP and the FDs disengage when the LOC signal has been lost for 7 s above 200 ft radio height
// (the G/S signal only on an FLS approach), at once when both receivers are lost with LOC armed or engaged, and the FDs come back in
// HDG/TRACK and V/S/FPA at any frame time. Built with -DWITHOUT_THE_FIX the model gets its inputs unchanged and the checks of the
// disconnection fail.

#include <cmath>
#include <cstdio>
#include <initializer_list>

#include "A380PrimComputerFg.h"
#include "../src/prim/PrimLandingSystemSignalLoss.h"

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
// Frame times of the sim: 60 and 30 fps, 4x sim rate at 60 and 30 fps, and slow frames
constexpr double FRAME_TIMES_S[] = {0.016, 0.033, 0.067, 0.1, 0.133, 0.15, 0.25};
constexpr double APPROACH_SPEED_KNOTS = 140.0;
constexpr unsigned int SSM_FAILURE_WARNING = 0;
constexpr unsigned int SSM_NCD = 1;
constexpr unsigned int SSM_NORMAL = 3;
constexpr double APPR_PUSHBUTTON_WORD = 33554432.0;  // bit 26 of the FCU AFS discrete word 1
constexpr double FD_PUSHBUTTON_WORD = 4194304.0;     // bit 23 of the FCU AFS discrete word 1
// The aircraft starts 0.5 degree above the beam and to the side, and flies onto it
constexpr double START_GLIDE_SLOPE_DEVIATION_DEG = 0.5;
constexpr double START_LOCALIZER_DEVIATION_DEG = -0.2;

enum class Side { Both, Ils1, Ils2 };

static void setArinc(base_arinc_429& word, double value) {
  word.SSM = SSM_NORMAL;
  word.Data = static_cast<float>(value);
}

class ApproachFlight {
 public:
  explicit ApproachFlight(bool flsApproach = false) {
    fg.initialize();
    inputs.data.sim_data.computer_running = true;
    inputs.fctl_logic.ap_authorised = true;
    inputs.fctl_logic.is_master_prim = true;
    inputs.data.discrete_inputs.fcu_1_healthy = true;
    inputs.data.discrete_inputs.fcu_2_healthy = true;
    inputs.data.discrete_inputs.is_unit_1 = true;
    inputs.general_logic.engine_running = true;
    inputs.data.adcn_inputs.fms.selected_approach_type = fmgc_approach_type::ILS;
    inputs.data.adcn_inputs.fms.fls_approach_active = flsApproach;
    inputs.data.adcn_inputs.fms.fms_loc_distance = 8;
    inputs.data.adcn_inputs.fms.fms_unrealistic_gs_angle_deg = -3;
    inputs.general_logic.flap_handle_index = 2;
    inputs.flight_envelope.v_max_kn = 340;
    inputs.flight_envelope.v_ls_kn = 120;
    inputs.general_logic.adr_computation_data.V_ias_kn = APPROACH_SPEED_KNOTS;
    inputs.general_logic.adr_computation_data.mach = 0.21;
    setRadioHeight(2500);
    for (base_ir_bus* ir : {&inputs.data.bus_inputs.ir_1_bus, &inputs.data.bus_inputs.ir_2_bus, &inputs.data.bus_inputs.ir_3_bus}) {
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
    for (base_adr_bus* adr : {&inputs.data.bus_inputs.adr_1_bus, &inputs.data.bus_inputs.adr_2_bus, &inputs.data.bus_inputs.adr_3_bus}) {
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
    setBeam(Side::Both, true, 0, true, 0);
  }

  void setRadioHeight(double heightFt) { inputs.general_logic.ra_computation_data_ft = heightFt; }

  /// A beam with the given deviations on the bus of one or both receivers
  void setBeam(Side side, bool locNormal, double locDeviation, bool gsNormal, double gsDeviation) {
    for (Side bus : {Side::Ils1, Side::Ils2}) {
      if (side != Side::Both && side != bus) {
        continue;
      }
      base_ils_bus& ils = bus == Side::Ils1 ? inputs.data.bus_inputs.ils_1_bus : inputs.data.bus_inputs.ils_2_bus;
      ils.runway_heading_deg.SSM = locNormal ? SSM_NORMAL : SSM_NCD;
      ils.runway_heading_deg.Data = 0;
      ils.ils_frequency_mhz.SSM = SSM_NORMAL;
      ils.ils_frequency_mhz.Data = 110.3F;
      ils.localizer_deviation_deg.SSM = locNormal ? SSM_NORMAL : SSM_NCD;
      ils.localizer_deviation_deg.Data = static_cast<float>(locDeviation);
      ils.glideslope_deviation_deg.SSM = gsNormal ? SSM_NORMAL : SSM_NCD;
      ils.glideslope_deviation_deg.Data = static_cast<float>(gsDeviation);
    }
  }

  /// The receiver of one or both buses is dead: failure warning on every word
  void killReceiver(Side side) {
    for (Side bus : {Side::Ils1, Side::Ils2}) {
      if (side != Side::Both && side != bus) {
        continue;
      }
      base_ils_bus& ils = bus == Side::Ils1 ? inputs.data.bus_inputs.ils_1_bus : inputs.data.bus_inputs.ils_2_bus;
      ils.runway_heading_deg.SSM = ils.ils_frequency_mhz.SSM = SSM_FAILURE_WARNING;
      ils.localizer_deviation_deg.SSM = ils.glideslope_deviation_deg.SSM = SSM_FAILURE_WARNING;
    }
  }

  void fly(double seconds) {
    for (double t = 0.0; t < seconds; t += frameTimeS) {
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

  /// With the autopilot engaged and APPR pressed, from above the beam onto it: LOC and G/S track
  void flyToTrack() {
    setBeam(Side::Both, true, START_LOCALIZER_DEVIATION_DEG, true, START_GLIDE_SLOPE_DEVIATION_DEG);
    fly(6.0);
    engageAutopilot();
    captureTheApproach();
  }

  /// APPR pressed with the autopilot engaged, from above the beam onto it
  void captureTheApproach() {
    pushButton(APPR_PUSHBUTTON_WORD);
    fly(3.0);
    constexpr int STEPS = 12;
    for (int step = 0; step <= STEPS; step++) {
      const double remaining = static_cast<double>(STEPS - step) / STEPS;
      setBeam(Side::Both, true, START_LOCALIZER_DEVIATION_DEG * remaining, true, START_GLIDE_SLOPE_DEVIATION_DEG * remaining);
      fly(1.0);
    }
    fly(5.0);
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

  void setBeamOnThePath() { setBeam(Side::Both, true, 0, true, 0); }

  const prim_outputs& out() const { return fg.A380PrimComputerFg_Y.out; }
  bool apEngaged() const { return out().fg_logic.ap_1_engaged; }
  bool fdEngaged() const { return out().fg_logic.fd_1_engaged; }
  bool locEngaged() const { return out().fg_mode_logic.lateral_modes.loc_cpt_active || out().fg_mode_logic.lateral_modes.loc_trk_active; }
  bool locArmed() const { return out().fg_mode_logic.armed_modes.loc_armed; }
  bool gsEngaged() const { return out().fg_mode_logic.longitudinal_modes.gs_capt_active || out().fg_mode_logic.longitudinal_modes.gs_trk_active; }
  bool landEngaged() const { return out().fg_mode_logic.lateral_modes.land_active; }
  bool basicModes() const {
    const auto& lateral = out().fg_mode_logic.lateral_modes;
    const auto& longitudinal = out().fg_mode_logic.longitudinal_modes;
    return (lateral.hdg_active || lateral.trk_active) && (longitudinal.vs_active || longitudinal.fpa_active);
  }
  bool stillOnTheApproach() const { return apEngaged() && locEngaged() && gsEngaged(); }
  bool fdBarsFlashing() const { return out().fg_mode_logic.pitch_fd_bars_flashing || out().fg_mode_logic.roll_fd_bars_flashing; }

  A380PrimComputerFg fg;
  PrimLandingSystemSignalLoss signalLoss;
  prim_outputs inputs{};
  double time = 0.0;
  double frameTimeS = TIME_STEP_S;
  /// Rising edges of the triple click request that the seam puts on the input of the FCTL model (the FCDC triggers on an edge)
  int tripleClicks = 0;
  bool tripleClickRaised = false;

 private:
  void step() {
    time += frameTimeS;
    inputs.data.time.dt = frameTimeS;
    inputs.data.time.simulation_time = time;
    inputs.data.time.monotonic_time = time;
    // As Prim.cpp does it: the seam changes the copy that the model reads
    prim_outputs modelInputs = inputs;
#ifndef WITHOUT_THE_FIX
    signalLoss.apply(frameTimeS, fg.A380PrimComputerFg_Y.out, modelInputs);
#endif
    fg.A380PrimComputerFg_U.in = modelInputs;
    fg.step();
#ifndef WITHOUT_THE_FIX
    prim_outputs fctlInputs = fg.A380PrimComputerFg_Y.out;
    signalLoss.raiseTripleClick(fctlInputs);
    const bool raised = fctlInputs.fg_mode_logic.ap_fd_mode_reversion;
    tripleClicks += raised && !tripleClickRaised ? 1 : 0;
    tripleClickRaised = raised;
#endif
  }
};

struct Outcome {
  bool autopilot, fd, loc, locArmed, glideSlope, land, basicModes;
};

static Outcome outcomeOf(const ApproachFlight& flight) {
  return {flight.apEngaged(), flight.fdEngaged(), flight.locEngaged(), flight.locArmed(), flight.gsEngaged(), flight.landEngaged(), flight.basicModes()};
}

static Outcome loseTheSignal(double radioHeightFt, double lostSeconds, bool locLost, bool gsLost, bool flsApproach = false) {
  ApproachFlight flight(flsApproach);
  flight.flyToTrack();
  flight.setRadioHeight(radioHeightFt);
  flight.fly(1.0);
  flight.setBeam(Side::Both, !locLost, 0, !gsLost, 0);
  flight.fly(lostSeconds);
  return outcomeOf(flight);
}

static void aShortLossKeepsTheApproach() {
  expect(loseTheSignal(2500, 0.1, false, false).autopilot, "setup: the autopilot is engaged on the approach");
  const Outcome shortLoss = loseTheSignal(1000, 6.5, true, true);
  expect(shortLoss.autopilot && shortLoss.loc && shortLoss.glideSlope, "6.5 s without LOC and G/S at 1000 ft: AP, LOC and G/S stay");

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
  expect(!lost.loc && !lost.locArmed && !lost.glideSlope, "LOC and G/S are neither engaged nor armed");
  expect(lost.fd && lost.basicModes, "the FDs come back in HDG/TRACK and V/S/FPA");
}

static void aLostGlideSlopeDisengagesOnAnFlsApproachOnly() {
  const Outcome ils = loseTheSignal(1000, 9.0, false, true);
  expect(ils.autopilot && ils.glideSlope, "G/S lost alone on an ILS: the transmitter rule names the LOC modes only, no disconnection");
  const Outcome fls = loseTheSignal(1000, 9.0, false, true, true);
  expect(!fls.autopilot && !fls.glideSlope && fls.fd, "G/S lost alone on an FLS approach: AP off");
  const Outcome localizer = loseTheSignal(1000, 9.0, true, false);
  expect(!localizer.autopilot && !localizer.loc && localizer.fd, "LOC lost alone for 7 s: AP off");
}

static void belowTwoHundredFeetNothingDisengages() {
  const Outcome land300 = loseTheSignal(300, 9.0, true, true);
  expect(!land300.autopilot, "signal lost 9 s at 300 ft: AP off");
  const Outcome land150 = loseTheSignal(150, 12.0, true, true);
  expect(land150.autopilot && land150.land, "signal lost 12 s at 150 ft: the autopilot stays in LAND");
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
  for (Side dead : {Side::Ils1, Side::Ils2}) {
    ApproachFlight flight;
    flight.flyToTrack();
    flight.setRadioHeight(1000);
    flight.killReceiver(dead);
    flight.fly(12.0);
    expect(flight.stillOnTheApproach() && flight.fdEngaged(), "one receiver dead for 12 s: the other one is flown, AP, LOC and G/S stay");
  }
  for (Side dead : {Side::Ils1, Side::Ils2}) {
    ApproachFlight flight;
    flight.flyToTrack();
    flight.setRadioHeight(150);
    flight.killReceiver(dead);
    flight.fly(5.0);
    expect(flight.apEngaged() && flight.landEngaged(), "one receiver dead in LAND: the other one is flown, no disconnection");
  }
}

static void bothReceiversDeadDisengageAtOnce() {
  // LOC armed, nothing captured yet
  ApproachFlight armed;
  armed.setBeam(Side::Both, true, START_LOCALIZER_DEVIATION_DEG * 20, true, START_GLIDE_SLOPE_DEVIATION_DEG * 20);
  armed.fly(6.0);
  armed.engageAutopilot();
  armed.pushButton(APPR_PUSHBUTTON_WORD);
  armed.fly(1.0);
  expect(armed.apEngaged() && armed.locArmed(), "setup: LOC armed, the autopilot engaged");
  armed.killReceiver(Side::Both);
  armed.fly(0.3);
  expect(!armed.apEngaged(), "both receivers dead with LOC armed: AP off within 0.3 s");
  armed.fly(1.0);
  expect(armed.fdEngaged() && armed.basicModes() && !armed.locArmed(), "both receivers dead with LOC armed: the FDs are back in HDG/TRACK and V/S/FPA");

  ApproachFlight tracking;
  tracking.flyToTrack();
  tracking.setRadioHeight(1000);
  tracking.killReceiver(Side::Both);
  tracking.fly(0.3);
  expect(!tracking.apEngaged(), "both receivers dead with LOC and G/S engaged: AP off within 0.3 s, no 7 s wait");

  ApproachFlight land;
  land.flyToTrack();
  land.setRadioHeight(150);
  land.fly(2.0);
  expect(land.landEngaged(), "setup: LAND engaged");
  land.killReceiver(Side::Both);
  land.fly(0.3);
  expect(!land.apEngaged(), "both receivers dead in LAND below 200 ft: AP off at once, the 200 ft limit is for the signal loss only");
}

static void noLocalizerModeNoDisconnection() {
  ApproachFlight flight;
  flight.fly(6.0);
  flight.engageAutopilot();
  flight.killReceiver(Side::Both);
  flight.fly(5.0);
  expect(flight.apEngaged(), "both receivers dead with no approach mode armed or engaged: the autopilot stays engaged");
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

static void theFlightDirectorsComeBackAtAnyFrameTime() {
  for (double frameTimeS : FRAME_TIMES_S) {
    for (bool bothReceiversDead : {false, true}) {
      ApproachFlight flight;
      flight.flyToTrack();
      flight.setRadioHeight(1000);
      flight.fly(1.0);
      flight.frameTimeS = frameTimeS;
      if (bothReceiversDead) {
        flight.killReceiver(Side::Both);
      } else {
        flight.setBeam(Side::Both, false, 0, false, 0);
      }
      flight.fly(bothReceiversDead ? 3.0 : 9.0);
      expectAtFrameTime(!flight.apEngaged(), "signal lost: AP off", frameTimeS);
      expectAtFrameTime(flight.fdEngaged() && flight.basicModes(), "signal lost: the FDs end ON in HDG/TRACK and V/S/FPA", frameTimeS);
      expectAtFrameTime(flight.tripleClicks == 1, "signal lost with the FDs engaged: one triple click request", frameTimeS);
      expectAtFrameTime(flight.fdBarsFlashing(), "signal lost with the FDs engaged: the FD bars flash", frameTimeS);
    }
  }
}

static void theCrewCanEngageTheAutopilotAfterTheTrip() {
  for (double frameTimeS : {0.05, 0.25}) {
    ApproachFlight flight;
    flight.flyToTrack();
    flight.setRadioHeight(1000);
    flight.fly(1.0);
    flight.frameTimeS = frameTimeS;
    flight.setBeam(Side::Both, false, 0, false, 0);
    flight.fly(9.0);
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
  for (bool bothReceiversDead : {false, true}) {
    ApproachFlight flight;
    flight.flyToTrack();
    flight.pushButton(FD_PUSHBUTTON_WORD);
    flight.fly(1.0);
    expect(flight.apEngaged() && !flight.fdEngaged(), "setup: the autopilot is engaged with the FDs off");
    flight.setRadioHeight(1000);
    flight.fly(1.0);
    if (bothReceiversDead) {
      flight.killReceiver(Side::Both);
    } else {
      flight.setBeam(Side::Both, false, 0, false, 0);
    }
    flight.fly(bothReceiversDead ? 3.0 : 9.0);
    expect(!flight.apEngaged(), "FDs off before the trip: AP off");
    expect(!flight.fdEngaged(), "FDs off before the trip: they are not switched on");
    expect(!flight.locEngaged() && !flight.locArmed(), "FDs off before the trip: LOC is neither engaged nor armed");
    expect(flight.tripleClicks == 0, "FDs off before the trip: no triple click request");
    flight.fly(1.5);
    flight.engageAutopilot();
    expect(flight.apEngaged(), "FDs off: the crew engages the autopilot after the trip");
    expect(flight.autopilotStaysEngaged(15.0), "FDs off, signal still lost: no trip every 0.5 s");
  }
}

static void aShortDropoutOfBothReceiversIsRiddenThrough() {
  struct Dropout {
    double frameTimeS;
    int frames;
  };
  for (const Dropout dropout : {Dropout{0.016, 3}, Dropout{0.033, 3}, Dropout{0.1, 1}}) {
    ApproachFlight flight;
    flight.flyToTrack();
    flight.setRadioHeight(1000);
    flight.frameTimeS = dropout.frameTimeS;
    flight.killReceiver(Side::Both);
    flight.fly((dropout.frames - 0.5) * dropout.frameTimeS);
    flight.setBeamOnThePath();
    expectAtFrameTime(flight.autopilotStaysEngaged(3.0), "both receivers dead for a few frames (under 0.2 s): no disconnection", dropout.frameTimeS);
  }
  ApproachFlight flight;
  flight.flyToTrack();
  flight.setRadioHeight(1000);
  flight.killReceiver(Side::Both);
  flight.fly(0.3);
  flight.setBeamOnThePath();
  flight.fly(0.5);
  expect(!flight.apEngaged(), "both receivers dead for 0.3 s: the disconnection is confirmed");
}

static void flareAndRollOutDisengageAtOnce() {
  ApproachFlight flare;
  flare.flyToTrack();
  flare.setRadioHeight(150);
  flare.fly(2.0);
  flare.setRadioHeight(30);
  flare.fly(2.0);
  expect(flare.out().fg_mode_logic.longitudinal_modes.flare_active, "setup: FLARE engaged");
  flare.killReceiver(Side::Both);
  flare.fly(0.5);
  expect(!flare.apEngaged(), "both receivers dead in FLARE: AP off at once");

  ApproachFlight rollOut;
  rollOut.flyToTrack();
  rollOut.setRadioHeight(150);
  rollOut.fly(2.0);
  rollOut.setRadioHeight(30);
  rollOut.fly(2.0);
  rollOut.setRadioHeight(0);
  rollOut.inputs.general_logic.on_ground = true;
  rollOut.fly(3.0);
  expect(rollOut.out().fg_mode_logic.lateral_modes.rollout_submode_active, "setup: ROLL OUT engaged");
  rollOut.killReceiver(Side::Both);
  rollOut.fly(0.5);
  expect(!rollOut.apEngaged(), "both receivers dead in ROLL OUT: AP off at once");

  ApproachFlight touchdown;
  touchdown.flyToTrack();
  touchdown.setRadioHeight(150);
  touchdown.fly(2.0);
  touchdown.setRadioHeight(0);
  touchdown.inputs.general_logic.on_ground = true;
  touchdown.setBeam(Side::Both, false, 0, false, 0);
  touchdown.fly(12.0);
  expect(touchdown.apEngaged() || !touchdown.locEngaged(), "no 7 s trip on the ground (radio height 0)");
}

static void theHeightLimitIsTwoHundredFeet() {
  expect(!loseTheSignal(210, 9.0, true, true).autopilot, "signal lost 9 s at 210 ft: AP off");
  expect(loseTheSignal(200, 9.0, true, true).autopilot, "signal lost 9 s at exactly 200 ft: AP stays");
  expect(loseTheSignal(190, 9.0, true, true).autopilot, "signal lost 9 s at 190 ft: AP stays");
}

static void aFailedRadioAltimeterStopsTheSevenSecondRule() {
  ApproachFlight flight;
  flight.flyToTrack();
  flight.setRadioHeight(1000);
  flight.fly(1.0);
  flight.inputs.general_logic.all_ra_failure = true;
  flight.setBeam(Side::Both, false, 0, false, 0);
  flight.fly(9.0);
  // The model has its own rule for a failed radio altimeter, so the autopilot is no witness: the monitor shows as a triple click
  expect(flight.tripleClicks == 0, "radio height failed, signal lost 9 s: the monitor does not trip (the stale 1000 ft is not used)");
}

static void noRadioHeightNoSevenSecondRule() {
  LandingSystemSignalLoss::Monitor monitor;
  LandingSystemSignalLoss::Inputs inputs;
  inputs.localizerModeEngaged = inputs.localizerModeArmedOrEngaged = true;
  inputs.radioHeightValid = false;
  inputs.radioHeightFt = 1000;
  inputs.signal.localizerSsm = inputs.signal.glideSlopeSsm = SSM_NCD;
  LandingSystemSignalLoss::Rules rules;
  bool tripped = false;
  for (int frame = 0; frame < 400; frame++) {
    tripped = tripped || monitor.update(TIME_STEP_S, inputs, rules).disengage;
  }
  expect(!tripped, "no valid radio height: the monitor does not trip");
}

int main() {
  aShortLossKeepsTheApproach();
  sevenSecondsDisengageTheAutopilotAndTheFlightDirectors();
  aLostGlideSlopeDisengagesOnAnFlsApproachOnly();
  belowTwoHundredFeetNothingDisengages();
  descendingBelowTwoHundredFeetBeforeSevenSecondsDoesNotTrip();
  oneWorkingReceiverKeepsTheApproach();
  bothReceiversDeadDisengageAtOnce();
  noLocalizerModeNoDisconnection();
  aGoodSignalNeverTrips();
  noRadioHeightNoSevenSecondRule();
  theFlightDirectorsComeBackAtAnyFrameTime();
  theCrewCanEngageTheAutopilotAfterTheTrip();
  aTripWithTheFlightDirectorsOffLeavesThemOff();
  aShortDropoutOfBothReceiversIsRiddenThrough();
  flareAndRollOutDisengageAtOnce();
  theHeightLimitIsTwoHundredFeet();
  aFailedRadioAltimeterStopsTheSevenSecondRule();
  if (failures > 0) {
    std::printf("ls_signal_loss_test: %d check(s) FAILED\n", failures);
    return 1;
  }
  std::printf("ls_signal_loss_test: all checks passed\n");
  return 0;
}
