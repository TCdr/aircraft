#pragma once

// The DEGRADED (N1) mode of the A380X FADECs in the FADEC models of the flight computers. No MSFS SDK: tested
// natively with the generated A380FadecComputer model by test/fadec_degraded_mode_test.cpp (test/run_tests.sh).
//
// The FADEC module (fadec_a380x FadecAirData_A380X) selects the air data of each FADEC and writes its mode,
// L:A32NX_ENGINE_n_FADEC_DEGRADED_MODE. A FADEC reverts to DEGRADED when P0, PT or TAT is totally lost. Then:
// - a thrust equivalent to the current thrust is kept until the crew moves the thrust lever,
// - with three or four engines in DEGRADED mode, the A/THR is lost.
// The FADEC model keeps turning its thrust lever angle into an N1 with the rating limits; the DEGRADED mode acts on its inputs.

#include <cmath>

namespace FadecDegradedMode {

constexpr int ENGINES = 4;

/// With three or four engines in DEGRADED mode, the A/THR is lost.
constexpr int DEGRADED_ENGINES_FOR_AUTOTHRUST_LOSS = 3;

inline bool autothrustLost(const bool degraded[ENGINES]) {
  int count = 0;
  for (int engine = 0; engine < ENGINES; ++engine) {
    count += degraded[engine] ? 1 : 0;
  }
  return count >= DEGRADED_ENGINES_FOR_AUTOTHRUST_LOSS;
}

/// The A/THR disconnection the FADECs order the PRIMs while the A/THR is lost: on the A/THR instinctive disconnect input of the
/// PRIM models (they have no other A/THR disconnection input), only while the A/THR is engaged or armed. The FWS reads the
/// instinctive disconnect pushbuttons themselves, so it still sees an involuntary disconnection (AUTO FLT A/THR OFF). A continuous input would make the PRIMs latch the A/THR inoperative for
/// the rest of the flight after 15 s; this way the A/THR comes back when the air data does.
inline bool autothrustDisconnectOrder(bool autothrustLostByDegradedEngines, bool autothrustEngagedLastFrame) {
  return autothrustLostByDegradedEngines && autothrustEngagedLastFrame;
}

/// The rating limits of the FADEC model for the forward thrust lever range (percent N1)
struct RatingLimits {
  double idle;
  double climb;
  /// The limit of the FLX/MCT detent: FLEX when the FADEC model uses its FLEX limit, MCT otherwise
  double maximumContinuousOrFlex;
  double takeoffGoAround;
};

/// The forward thrust lever angles of the FADEC model detents (degrees)
constexpr double IDLE_DEG = 0.0;
constexpr double CLB_DEG = 25.0;
constexpr double MCT_DEG = 35.0;
constexpr double TOGA_DEG = 45.0;

/// The thrust lever angle at which the FADEC model sets this N1: the inverse of its piecewise linear lever law (idle to CLB,
/// CLB to MCT or FLEX, MCT or FLEX to TOGA).
inline double thrustLeverAngleOfN1(double n1, const RatingLimits& limits) {
  struct Segment {
    double fromDeg, toDeg, fromN1, toN1;
  };
  const Segment segments[] = {
      {IDLE_DEG, CLB_DEG, limits.idle, limits.climb},
      {CLB_DEG, MCT_DEG, limits.climb, limits.maximumContinuousOrFlex},
      {MCT_DEG, TOGA_DEG, limits.maximumContinuousOrFlex, limits.takeoffGoAround},
  };
  if (n1 <= limits.idle) {
    return IDLE_DEG;
  }
  for (const Segment& segment : segments) {
    if (n1 <= segment.toN1) {
      if (segment.toN1 <= segment.fromN1) {
        return segment.fromDeg;
      }
      const double fraction = std::fmax(0.0, (n1 - segment.fromN1) / (segment.toN1 - segment.fromN1));
      return segment.fromDeg + fraction * (segment.toDeg - segment.fromDeg);
    }
  }
  return TOGA_DEG;
}

/// Design choice: the thrust lever counts as moved once it is 1 degree away from its position at the reversion (the keyboard and
/// axis steps of the sim are smaller; a detent change is 10 degrees).
constexpr double LEVER_MOVED_DEG = 1.0;

struct ThrustFreezeInput {
  bool degraded;
  /// three or four engines are in DEGRADED mode
  bool autothrustLost;
  /// the thrust lever of the engine (the FADEC model input before the freeze)
  double leverDeg;
  /// the N1 command of the FADEC model on the previous frame
  double n1CommandLastFrame;
  /// the A/THR controlled this engine on the previous frame
  bool athrControlActiveLastFrame;
  RatingLimits limits;
};

/// A thrust equivalent to the current thrust after the reversion to DEGRADED mode, until the crew moves the thrust lever.
///
/// The freeze starts when the FADEC reverts with its lever in the forward range and the A/THR does not keep controlling the
/// engine (the A/THR keeps the engines of one or two degraded FADECs), or when the A/THR is lost while the FADEC is degraded.
/// While the A/THR still controls the engine (the frames before the PRIMs disconnect it) the frozen N1 follows the A/THR
/// command; then the FADEC model gets the thrust lever angle of the frozen N1.
class ThrustFreeze {
 public:
  /// @return the thrust lever angle the FADEC model uses
  double update(const ThrustFreezeInput& input) {
    const bool reversion = input.degraded && !wasDegraded;
    const bool autothrustLoss = input.degraded && input.autothrustLost && !wasAutothrustLost;
    wasDegraded = input.degraded;
    wasAutothrustLost = input.autothrustLost;

    const bool leverForward = input.leverDeg >= IDLE_DEG;
    const bool autothrustKeepsTheEngine = input.athrControlActiveLastFrame && !input.autothrustLost;
    // no N1 command yet: the FADEC model has not run (a flight loaded with the mode already DEGRADED)
    const bool thrustKnown = input.n1CommandLastFrame > 0.0;
    if ((reversion || autothrustLoss) && leverForward && thrustKnown && !autothrustKeepsTheEngine && !frozen) {
      frozen = true;
      frozenN1 = input.n1CommandLastFrame;
      leverAtFreezeDeg = input.leverDeg;
    }

    const bool leverMoved = std::fabs(input.leverDeg - leverAtFreezeDeg) > LEVER_MOVED_DEG;
    if (frozen && (!input.degraded || leverMoved || autothrustKeepsTheEngine)) {
      frozen = false;
    }
    if (!frozen) {
      return input.leverDeg;
    }
    if (input.athrControlActiveLastFrame) {
      frozenN1 = input.n1CommandLastFrame;
      return input.leverDeg;
    }
    return thrustLeverAngleOfN1(frozenN1, input.limits);
  }

  /// The thrust of the engine is frozen (L:A32NX_ENGINE_n_FADEC_THRUST_FROZEN, ENG THRUST LOCKED)
  bool isFrozen() const { return frozen; }

 private:
  bool wasDegraded = false;
  bool wasAutothrustLost = false;
  bool frozen = false;
  double frozenN1 = 0.0;
  double leverAtFreezeDeg = 0.0;
};

}  // namespace FadecDegradedMode
