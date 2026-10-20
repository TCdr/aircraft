#pragma once

// The PRIM, SEC and FCDC inputs and the spoiler orders under the flyPad failures of the sidesticks, the rudder pedals, the
// rudder trim motors, the speed brakes lever, the wheel speed inputs of the PRIMs and the spoilers. Pure functions, no MSFS SDK:
// tested natively by test/flight_control_input_failures_test.cpp (test/run_tests.sh).

#include <algorithm>
#include <array>

namespace FlightControlInputFailures {

/// The sidestick positions the PRIMs and SECs receive
struct SidestickPositions {
  double captPitch;
  double captRoll;
  double foPitch;
  double foRoll;
};

/// The sim has one pilot control input, read as the CAPT sidestick. A sidestick whose transducers have failed sends nothing
/// (F/CTL L(R) SIDESTICK FAULT).
/// Design choice: with the CAPT sidestick failed, the input is read as the F/O sidestick, as the crew would fly with the other
/// sidestick; with both failed, no sidestick order reaches the computers.
inline SidestickPositions sidestickPositions(double simPitch, double simRoll, bool captSidestickFailed, bool foSidestickFailed) {
  if (!captSidestickFailed) {
    return {simPitch, simRoll, 0, 0};
  }
  if (!foSidestickFailed) {
    return {0, 0, simPitch, simRoll};
  }
  return {0, 0, 0, 0};
}

/// The rudder pedal order of the PRIMs and SECs: the sim pedal axis plus the zero-force offset of the rudder trim (degrees / 30).
/// With the rudder pedal transducers failed (F/CTL RUDDER PEDAL FAULT) the pedals no longer command the rudders and the manual
/// rudder trim is lost; yaw damping and turn coordination stay with the computers.
inline double rudderPedalOrder(double simPedal, double rudderTrimDeg, bool pedalTransducersFailed) {
  return pedalTransducersFailed ? 0 : -(simPedal + rudderTrimDeg / 30);
}

/// The rudder pedal position for the nose wheel steering (percent). With the rudder pedal transducers failed, the NWS control
/// through the pedals is lost (the tiller remains).
inline double rudderPedalSteeringPercent(double simPedal, bool pedalTransducersFailed) {
  return pedalTransducersFailed ? 0 : std::max(-100., std::min(100., -100. * simPedal));
}

/// Whether the rudder trim follows the command of the active SEC. SEC 1 drives rudder trim motor 1, SEC 3 motor 2; with one
/// motor failed the other SEC takes over with its motor (F/CTL RUDDER TRIM 1(2) FAULT, redundancy loss). With both channels lost
/// the zero-force position stays at the last trim selection (F/CTL RUDDER TRIM FAULT).
inline bool rudderTrimMoves(bool sec1TrimActive,
                            bool sec3TrimActive,
                            bool sec1Healthy,
                            bool sec3Healthy,
                            bool trimMotor1Failed,
                            bool trimMotor2Failed) {
  const bool channel1Available = sec1Healthy && !trimMotor1Failed;
  const bool channel2Available = sec3Healthy && !trimMotor2Failed;
  return (sec1TrimActive || sec3TrimActive) && (channel1Available || channel2Available);
}

/// The PRIM speed brake lever input: -0.05 when the ground spoilers are armed, else the lever position (0 to 1). With the
/// lever transducers failed (F/CTL SPEED BRAKES FAULT) the PRIMs see the lever retracted and not armed: no speed brakes, the
/// ground spoilers extend only at reverser selection.
inline double primSpeedBrakeLeverPosition(bool groundSpoilersArmed, double leverPosition, bool leverFailed) {
  if (leverFailed) {
    return 0;
  }
  return groundSpoilersArmed ? -0.05 : leverPosition;
}

/// The FCDC speed brake lever inputs, lost with the lever transducers like the PRIM ones
inline bool fcdcGroundSpoilersArmed(bool groundSpoilersArmed, bool leverFailed) {
  return groundSpoilersArmed && !leverFailed;
}

inline double fcdcSpeedBrakeLeverPosition(double leverPosition, bool leverFailed) {
  return leverFailed ? 0 : leverPosition;
}

/// A wheel speed as the PRIMs receive it. With their wheel speed inputs failed the PRIMs do not have the information to extend
/// the ground spoilers (F/CTL GND SPLRs FAULT): the generated PRIM logic extends them only above a wheel speed threshold.
inline double primWheelSpeed(double wheelSpeed, bool primWheelSpeedInputsFailed) {
  return primWheelSpeedInputsFailed ? 0 : wheelSpeed;
}

/// Failed spoiler actuators of one wing, spoiler 1 at index 0
using SpoilerFailures = std::array<bool, 8>;

/// Whether a spoiler is lost: its actuator failed, or the actuator of the symmetric spoiler failed (the PRIMs inhibit it so
/// that the roll stays symmetric), except for spoilers 5 and 6 (EBHAs), which keep their symmetric spoiler.
inline bool spoilerLost(int spoilerIndex, bool ownActuatorFailed, bool symmetricActuatorFailed) {
  const bool keepsSymmetric = spoilerIndex == 4 || spoilerIndex == 5;
  return ownActuatorFailed || (symmetricActuatorFailed && !keepsSymmetric);
}

/// The commanded position of a spoiler: a lost spoiler retracts.
inline double spoilerCommand(double commandDeg, int spoilerIndex, const SpoilerFailures& ownWing, const SpoilerFailures& otherWing) {
  return spoilerLost(spoilerIndex, ownWing[spoilerIndex], otherWing[spoilerIndex]) ? 0 : commandDeg;
}

}  // namespace FlightControlInputFailures
