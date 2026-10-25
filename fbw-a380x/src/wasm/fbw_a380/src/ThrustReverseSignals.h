#pragma once

// The thrust lever reverse signals the thrust reverser control reads, besides the FADEC lever position.
//
// Each line of defense of the thrust reverser has its own source of the "lever in reverse" information:
//  - the reverse switch of the throttle assembly (second line), independent of every computer;
//  - the PRIM, from its own analog lever input (third line). PRIMs 2 and 3 control the third line of engine 2, PRIMs 1 and 2
//    that of engine 3. A PRIM that is off or failed gives no signal.
// The lever angle read here is the raw one, not the lever position the FADEC model gets (which a thrust lever fault replaces).
//
// Design choice (the manual gives no angles): the switch closes slightly before the PRIM sees reverse, and both after the FADEC
// reverse position, so that the lines clear one after the other as the lever moves into reverse.

namespace ThrustReverseSignals {

constexpr double REVERSE_SWITCH_TLA_DEG = -3.5;
constexpr double PRIM_REVERSE_SELECTED_TLA_DEG = -4.0;

/// The reverse switch of the throttle assembly of an engine is closed.
inline bool reverseSwitchClosed(double leverAngleDeg) {
  return leverAngleDeg <= REVERSE_SWITCH_TLA_DEG;
}

/// A PRIM gives the reverse signal of an engine from its own lever input.
inline bool primReverseSelected(bool primHealthy, double leverAngleDeg) {
#ifdef WITHOUT_THE_FIX
  primHealthy = true;
#endif
  return primHealthy && leverAngleDeg <= PRIM_REVERSE_SELECTED_TLA_DEG;
}

/// The PRIMs (index 0 to 2) that control the third line of defense of an engine (2 or 3).
constexpr bool primControlsThirdLine(int primIndex, int engineNumber) {
  return engineNumber == 2 ? primIndex != 0 : primIndex != 2;
}

}  // namespace ThrustReverseSignals
