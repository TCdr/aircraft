#pragma once

// The spoilers the flight control computers report as failed on the F/CTL system display. Pure functions, no MSFS SDK:
// tested natively by test/spoiler_failure_indication_test.cpp (test/run_tests.sh).

#include <array>

#include "FlightControlInputFailures.h"

namespace SpoilerFailureIndication {

/// The flight control computer of a spoiler, PRIM or SEC 1 to 3 at index 0 to 2
struct SpoilerComputer {
  bool isPrim;
  int index;
};

/// Each spoiler has one flight control computer and no other computer takes it over. Spoiler 1 at index 0, the same on both
/// wings; the spoiler orders of FlyByWireInterface come from the same computers.
constexpr std::array<SpoilerComputer, 8> SPOILER_COMPUTERS = {{
    {false, 2},
    {false, 1},
    {false, 0},
    {true, 2},
    {true, 1},
    {true, 0},
    {false, 1},
    {false, 2},
}};

/// The healthy discrete of PRIM or SEC 1 to 3
using ComputerHealth = std::array<bool, 3>;

inline bool spoilerComputerHealthy(int spoilerIndex, const ComputerHealth& primHealthy, const ComputerHealth& secHealthy) {
  const SpoilerComputer computer = SPOILER_COMPUTERS[spoilerIndex];
  return computer.isPrim ? primHealthy[computer.index] : secHealthy[computer.index];
}

/// A spoiler is shown failed when it no longer responds to its orders: its actuator failed, the symmetric one failed (the
/// spoiler is then inhibited and retracted), or its flight control computer is lost.
/// Design choice: the inhibited symmetric spoiler is shown failed too, as it is counted among the lost spoilers of the
/// PART (MOST) SPLRs FAULT alerts.
inline bool spoilerFailed(int spoilerIndex,
                          const FlightControlInputFailures::SpoilerFailures& ownWing,
                          const FlightControlInputFailures::SpoilerFailures& otherWing,
                          const ComputerHealth& primHealthy,
                          const ComputerHealth& secHealthy) {
  return FlightControlInputFailures::spoilerLost(spoilerIndex, ownWing[spoilerIndex], otherWing[spoilerIndex]) ||
         !spoilerComputerHealthy(spoilerIndex, primHealthy, secHealthy);
}

}  // namespace SpoilerFailureIndication
