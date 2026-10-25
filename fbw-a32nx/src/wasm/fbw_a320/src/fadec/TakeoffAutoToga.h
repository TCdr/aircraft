#pragma once

// The automatic TOGA of the FADEC at takeoff. Pure logic, no MSFS SDK: tested natively by test/run_tests.sh.
//
// On the ground, without a flex temperature above the OAT, the flex mode is not armed and setting the lever above CL engages
// the TOGA takeoff thrust mode. The generated FADEC model still sets the thrust of the lever position, MCT in the FLX/MCT
// detent, and ENG THR LEVERS NOT SET asks the crew for TOGA. If the crew does not set the lever to TOGA, the FADEC selects
// TOGA thrust after 8 s.
//
// From then on the FADEC model gets the TOGA lever angle, also after lift-off, until the crew moves the lever to CL or below
// or to TOGA. The FWC reads the real lever, so the warning stays until the crew sets the levers.
class TakeoffAutoToga {
 public:
  struct Inputs {
    double leverAngleDeg = 0;
    bool onGround = false;
    /// The FADEC engaged the TOGA thrust limit (its thrust limit type of the previous frame)
    bool togaLimitEngaged = false;
  };

  static constexpr double CL_TLA_DEG = 25;
  static constexpr double TOGA_TLA_DEG = 45;
  static constexpr double SELECTION_DELAY_S = 8;

  /// @return the thrust lever angle for the FADEC model
  double update(const Inputs& in, double deltaTimeS) {
    const bool leverBetweenClAndToga = in.leverAngleDeg > CL_TLA_DEG && in.leverAngleDeg < TOGA_TLA_DEG;
    if (!leverBetweenClAndToga) {
      togaSelected = false;
      timeLeverNotSetS = 0;
    } else if (!togaSelected) {
      timeLeverNotSetS = in.onGround && in.togaLimitEngaged ? timeLeverNotSetS + deltaTimeS : 0;
      togaSelected = timeLeverNotSetS >= SELECTION_DELAY_S;
    }

    return togaSelected ? TOGA_TLA_DEG : in.leverAngleDeg;
  }

 private:
  bool togaSelected = false;
  double timeLeverNotSetS = 0;
};
