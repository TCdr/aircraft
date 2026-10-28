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

// The SEC speed brake lever and ground spoiler function under the flyPad failures of the lever transducers and of the
// ground spoiler function (Failures::SpeedBrakeLeverSec1, SpeedBrakeLeverSec3, GroundSpoilerFunctionSec1..3).

/// A SEC whose speed brake lever transducers have failed reads a retracted lever: no speed brake and no ground spoiler
/// arming from that SEC (the ground spoilers then extend only with the reverse selection).
inline double speedBrakeLeverSeenBySec(double leverPosition, bool transducersFailed) {
  return transducersFailed ? 0 : leverPosition;
}

/// Design choice: a forward thrust lever angle between idle and the climb detent. The ground spoiler logic of the SEC
/// extends the spoilers with the levers at idle or in reverse; read at this angle it never does, while the speed brake
/// logic (which retracts the speed brakes at high thrust) sees no change.
inline constexpr double groundSpoilerBlockingThrustLeverDeg = 20;

/// A SEC that lost its ground spoiler function is never armed by the lever and never sees the thrust levers at idle
/// or in reverse; its roll and speed brake functions work.
inline double leverWithoutGroundArming(double leverPosition, bool groundFunctionLost) {
  return groundFunctionLost && leverPosition < 0 ? 0 : leverPosition;
}

inline double thrustLeverWithoutGroundSpoilers(double thrustLeverAngle, bool groundFunctionLost) {
  return groundFunctionLost && thrustLeverAngle < groundSpoilerBlockingThrustLeverDeg ? groundSpoilerBlockingThrustLeverDeg
                                                                                      : thrustLeverAngle;
}
