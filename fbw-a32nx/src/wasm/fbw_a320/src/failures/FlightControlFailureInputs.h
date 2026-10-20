// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#pragma once

// The ELAC and SEC inputs under the flyPad failures of the sidesticks, of the sidestick priority logic and of the
// stabilizer electrical control (Failures::CaptSidestick, FoSidestick, SidestickPriorityLogic, StabilizerElecControl).

/// The sidestick positions the ELACs and SECs receive
struct SidestickPositions {
  double captPitch;
  double captRoll;
  double foPitch;
  double foRoll;
};

/// The sim has one pilot control input, read as the CAPT sidestick. A sidestick whose pitch and roll transducers have
/// failed sends nothing (F/CTL L(R) SIDESTICK FAULT).
/// Design choice: with the CAPT sidestick failed, the input is read as the F/O sidestick, as the crew would fly with
/// the other sidestick; with both failed, no sidestick order reaches the computers.
inline SidestickPositions sidestickPositions(double simPitch, double simRoll, bool captSidestickFailed, bool foSidestickFailed) {
  if (!captSidestickFailed) {
    return {simPitch, simRoll, 0, 0};
  }
  if (!foSidestickFailed) {
    return {0, 0, simPitch, simRoll};
  }
  return {0, 0, 0, 0};
}

/// A failed sidestick priority logic circuit (F/CTL SIDESTICK PRIORITY) no longer passes the take over pb to the
/// computers: neither sidestick can take the priority.
inline bool priorityTakeoverPressed(bool takeoverPbPressed, bool priorityLogicFailed) {
  return takeoverPbPressed && !priorityLogicFailed;
}
