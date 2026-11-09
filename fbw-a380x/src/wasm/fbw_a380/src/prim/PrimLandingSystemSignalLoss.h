// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#pragma once

#include "../Arinc429Utils.h"
#include "../model/A380PrimComputerFg_types.h"
#include "LandingSystemSignalLoss.h"

/// The loss of the LOC or G/S signal in the flight guidance of one PRIM, applied to the inputs of the generated A380PrimComputerFg.
/// All three PRIMs run it on the same buses and radio height, so they agree on the pulses. Nothing here touches the FCU, its lights or
/// the client data: only the copy of the inputs that the model reads. That copy is also echoed into the model outputs (the FCTL input
/// and the flight data recorder), where nothing reads the pushbutton bit or the authorisation of the autopilot.
class PrimLandingSystemSignalLoss {
 public:
  /// Bit 23 of the AFS discrete word 1 (FD pushbutton)
  static constexpr int FD_PUSHBUTTON_BIT = 23;
  /// Design choice: the sequence follows the state of the flight directors, not a clock, because the model needs at least one frame
  /// per pushbutton edge and the frame time grows with the sim rate. The timeout only keeps a flight director that does not follow
  /// the pushbutton from holding the autopilot off.
  static constexpr double FD_SEQUENCE_TIMEOUT_S = 1.0;

  /// `previousOutputs` are the outputs of the model of the previous frame, which hold the engaged modes
  void apply(double deltaTimeS, const prim_outputs& previousOutputs, prim_outputs& modelInputs) {
    const auto& ils = modelInputs.data.bus_inputs;
    const auto& lateral = previousOutputs.fg_mode_logic.lateral_modes;
    const auto& longitudinal = previousOutputs.fg_mode_logic.longitudinal_modes;
    const bool flightDirectorsEngaged = previousOutputs.fg_logic.fd_1_engaged || previousOutputs.fg_logic.fd_2_engaged;

    LandingSystemSignalLoss::Inputs inputs;
    inputs.localizerModeEngaged = lateral.loc_cpt_active || lateral.loc_trk_active || lateral.land_active;
    inputs.localizerModeArmedOrEngaged = inputs.localizerModeEngaged || previousOutputs.fg_mode_logic.armed_modes.loc_armed;
    inputs.glideSlopeModeEngaged = longitudinal.gs_capt_active || longitudinal.gs_trk_active;
    inputs.radioHeightValid = !modelInputs.general_logic.all_ra_failure;
    inputs.radioHeightFt = modelInputs.general_logic.ra_computation_data_ft;
    inputs.signal = LandingSystemSignalLoss::flownSignal(ils.ils_1_bus, ils.ils_2_bus);

    // The transmitter rule names the localizer modes only, a lost glide slope disengages on an FLS approach alone
    LandingSystemSignalLoss::Rules rules;
    rules.glideSlopeLossDisengages = modelInputs.data.adcn_inputs.fms.fls_approach_active;
    rules.bothReceiversLostDisengagesAtOnce = true;

    if (sequence != Sequence::Idle) {
      advanceSequence(deltaTimeS, flightDirectorsEngaged);
    }

    const LandingSystemSignalLoss::Output loss = monitor.update(deltaTimeS, inputs, rules);
    const bool newTrip = loss.disengage && !wasDisengaging;
    wasDisengaging = loss.disengage;
    // The flight directors are only switched back on when they were on: the crew's choice of FDs off is kept
    if (newTrip && sequence == Sequence::Idle && flightDirectorsEngaged) {
      beginSequence();
    }

    if (!loss.disengage && sequence == Sequence::Idle) {
      return;
    }

    modelInputs.fctl_logic.ap_authorised = false;
    if (sequence != Sequence::Idle) {
      if (isPressing()) {
        Arinc429Utils::setBit(modelInputs.data.bus_inputs.fcu_1_bus.afs_discrete_word_1, FD_PUSHBUTTON_BIT, true);
        Arinc429Utils::setBit(modelInputs.data.bus_inputs.fcu_2_bus.afs_discrete_word_1, FD_PUSHBUTTON_BIT, true);
      }
      framesInState++;
    }
  }

  /// The triple click of the mode reversions is raised through the FG mode logic that the FCTL model forwards to the FCDC. It is
  /// raised once per disconnection that switches the flight directors, for the length of the sequence.
  void raiseTripleClick(prim_outputs& fctlInputs) const {
    if (sequence != Sequence::Idle) {
      fctlInputs.fg_mode_logic.ap_fd_mode_reversion = true;
    }
  }

 private:
  /// The flight directors go off with the first pushbutton press and on again with the second one, which engages them in the basic
  /// modes (HDG/TRACK and V/S/FPA) because the autopilot is off. Every step lasts at least one frame.
  enum class Sequence { Idle, FirstPress, FirstRelease, SecondPress, SecondRelease };

  void beginSequence() {
    sequence = Sequence::FirstPress;
    framesInState = 0;
    secondsInSequence = 0;
  }

  void advanceSequence(double deltaTimeS, bool flightDirectorsEngaged) {
    secondsInSequence += deltaTimeS;
    if (secondsInSequence > FD_SEQUENCE_TIMEOUT_S) {
      sequence = Sequence::Idle;
      return;
    }
    if (framesInState < 1) {
      return;
    }
    switch (sequence) {
      case Sequence::FirstPress:
        if (!flightDirectorsEngaged) {
          enter(Sequence::FirstRelease);
        }
        break;
      case Sequence::FirstRelease:
        enter(Sequence::SecondPress);
        break;
      case Sequence::SecondPress:
        if (flightDirectorsEngaged) {
          enter(Sequence::SecondRelease);
        }
        break;
      case Sequence::SecondRelease:
        enter(Sequence::Idle);
        break;
      case Sequence::Idle:
        break;
    }
  }

  void enter(Sequence next) {
    sequence = next;
    framesInState = 0;
  }

  bool isPressing() const { return sequence == Sequence::FirstPress || sequence == Sequence::SecondPress; }

  LandingSystemSignalLoss::Monitor monitor;
  Sequence sequence = Sequence::Idle;
  int framesInState = 0;
  double secondsInSequence = 0;
  bool wasDisengaging = false;
};
