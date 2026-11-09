// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#pragma once

/// Loss of the LOC or G/S signal in the flight guidance. The generated flight guidance models read every ILS word that is not
/// failure warning as valid, and a word with no computed data as a deviation of zero, so they keep flying a beam that is not there.
/// This monitor sits beside them in the hand written wrappers and decides when the autopilot and the flight directors are to be
/// disengaged.
namespace LandingSystemSignalLoss {

/// SSM of an ARINC 429 word
constexpr unsigned int SSM_FAILURE_WARNING = 0;
constexpr unsigned int SSM_NORMAL_OPERATION = 3;

constexpr double SIGNAL_LOSS_CONFIRM_S = 7.0;
constexpr double SIGNAL_LOSS_MIN_RADIO_HEIGHT_FT = 200.0;

/// Design choice: a bus transfer, or the first frames before the receiver power is written, can show both receivers unpowered for a
/// few frames. A real receiver rides through such short interrupts, so the immediate disengagement waits this long.
constexpr double BOTH_RECEIVERS_LOST_CONFIRM_S = 0.2;

/// Design choice: long enough for both FMGCs, or the three PRIMs, to see the autopilot and the flight directors off for a few frames
/// even when their frames are not in step.
constexpr double DISENGAGE_PULSE_S = 0.5;

struct Rules {
  /// A glide slope that is lost while it is engaged disengages (the A32NX; on the A380X only on an FLS approach)
  bool glideSlopeLossDisengages = false;
  /// Both receivers lost disengages at once, at any height, when the localizer is armed or engaged (the A380X). Without it the lost
  /// signal of both receivers is a lost signal like any other.
  bool bothReceiversLostDisengagesAtOnce = false;
};

/// The words of the ILS bus that the flight guidance flies, and which of the two buses it picked
struct FlownIlsSignal {
  unsigned int localizerSsm = SSM_FAILURE_WARNING;
  unsigned int glideSlopeSsm = SSM_FAILURE_WARNING;
  /// The preferred bus and the other one are both failure warning: both receivers are lost, not just the signal
  bool bothBusesFailureWarning = false;
};

struct Inputs {
  /// LOC*, LOC (LOC B/C), LAND: the lateral mode that follows the localizer
  bool localizerModeEngaged = false;
  /// LOC armed, or any engaged mode from LOC* to ROLL OUT
  bool localizerModeArmedOrEngaged = false;
  /// G/S* or G/S
  bool glideSlopeModeEngaged = false;
  bool radioHeightValid = false;
  double radioHeightFt = 0;
  FlownIlsSignal signal;
};

/// The flight guidance flies the preferred bus unless one of its words is failure warning, then the other bus, as the generated
/// models choose it. A bus with no computed data is therefore flown.
template <typename IlsBus>
FlownIlsSignal flownSignal(const IlsBus& preferred, const IlsBus& other) {
  const auto usable = [](const IlsBus& bus) {
    return bus.localizer_deviation_deg.SSM != SSM_FAILURE_WARNING && bus.glideslope_deviation_deg.SSM != SSM_FAILURE_WARNING;
  };
  const IlsBus& flown = usable(preferred) ? preferred : other;
  FlownIlsSignal signal;
  signal.localizerSsm = flown.localizer_deviation_deg.SSM;
  signal.glideSlopeSsm = flown.glideslope_deviation_deg.SSM;
  signal.bothBusesFailureWarning = !usable(preferred) && !usable(other);
  return signal;
}

struct Output {
  /// True for DISENGAGE_PULSE_S after the signal loss is confirmed: the autopilot and the flight directors are to be off
  bool disengage = false;
  /// Time since the pulse started, only meaningful while `disengage` is true
  double secondsSinceTrip = 0;
};

class Monitor {
 public:
  Output update(double deltaTimeS, const Inputs& in, const Rules& rules) {
    if (pulseRemainingS > 0) {
      pulseRemainingS -= deltaTimeS;
      confirmTimerS = 0;
      bothReceiversLostTimerS = 0;
    } else {
      const bool bothReceiversLost =
          rules.bothReceiversLostDisengagesAtOnce && in.signal.bothBusesFailureWarning && in.localizerModeArmedOrEngaged;
      bothReceiversLostTimerS = bothReceiversLost ? bothReceiversLostTimerS + deltaTimeS : 0;
      confirmTimerS = signalLost(in, rules) ? confirmTimerS + deltaTimeS : 0;
      if (bothReceiversLostTimerS >= BOTH_RECEIVERS_LOST_CONFIRM_S || confirmTimerS >= SIGNAL_LOSS_CONFIRM_S) {
        trip();
      }
    }

    Output out;
    out.disengage = pulseRemainingS > 0;
    out.secondsSinceTrip = DISENGAGE_PULSE_S - pulseRemainingS;
    return out;
  }

 private:
  static bool signalLost(const Inputs& in, const Rules& rules) {
    if (!in.radioHeightValid || in.radioHeightFt <= SIGNAL_LOSS_MIN_RADIO_HEIGHT_FT) {
      return false;
    }
    const bool localizerLost = in.localizerModeEngaged && in.signal.localizerSsm != SSM_NORMAL_OPERATION;
    const bool glideSlopeLost = rules.glideSlopeLossDisengages && in.glideSlopeModeEngaged && in.signal.glideSlopeSsm != SSM_NORMAL_OPERATION;
    return localizerLost || glideSlopeLost;
  }

  void trip() {
    pulseRemainingS = DISENGAGE_PULSE_S;
    confirmTimerS = 0;
    bothReceiversLostTimerS = 0;
  }

  double confirmTimerS = 0;
  double bothReceiversLostTimerS = 0;
  double pulseRemainingS = 0;
};

}  // namespace LandingSystemSignalLoss
