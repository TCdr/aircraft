#pragma once

// The alpha floor signal of a FAC (discrete word 5 bit 29, which sets the A.FLOOR mode of the FMGC A/THR), with the two
// cases the generated FacComputer does not compute. Pure logic, no MSFS SDK: tested natively by test/run_tests.sh.
//
// The floor is activated through the A/THR when alpha is above the floor threshold, or when the sidestick is deflected
// more than 14 deg nose up with either the pitch attitude or the angle-of-attack protection active. It is available
// from lift-off to 100 ft RA before landing, inhibited above M 0.6, and lost in engine-out when the slats/flaps are
// extended.
//
// The ELACs send the angle-of-attack protection (discrete status word 2 bit 23) but no pitch attitude protection
// flag: the sidestick case uses the angle-of-attack protection only. The TCAS inhibition is in the FMGC.
class AlphaFloorConditions {
 public:
  struct Inputs {
    /// The alpha floor signal computed by the FacComputer (angle of attack above the floor threshold)
    bool facAlphaFloor = false;
    /// The sum of both sidestick pitch deflections, nose up positive, in degrees
    double sidestickNoseUpDeg = 0;
    /// One ELAC has its angle-of-attack protection active
    bool angleOfAttackProtectionActive = false;
    /// The aircraft is on the ground (LGCIU)
    bool onGround = true;
    /// The radio height of the FMGC bus, and whether it is valid
    double radioHeightFt = 0;
    bool radioHeightValid = false;
    double mach = 0;
    /// One engine is not running
    bool engineOut = false;
    /// The slats or the flaps are not retracted (SFCC)
    bool slatsOrFlapsExtended = false;
  };

  /// Sidestick nose-up deflection above which the sidestick case applies
  static constexpr double SIDESTICK_NOSE_UP_THRESHOLD_DEG = 14;
  /// The sidestick case is available until 100 ft RA before landing
  static constexpr double LANDING_INHIBITION_HEIGHT_FT = 100;
  /// The alpha floor is inhibited above this Mach number
  static constexpr double MAX_MACH = 0.6;
  /// The radio height the FacComputer uses when its FMGC radio height is not valid
  static constexpr double INVALID_RADIO_HEIGHT_FT = 200;

  /// @return the alpha floor signal the FAC sends
  bool update(const Inputs& in) {
    updateAvailability(in);

    const bool sidestickCondition = available && in.mach < MAX_MACH && in.angleOfAttackProtectionActive &&
                                    in.sidestickNoseUpDeg > SIDESTICK_NOSE_UP_THRESHOLD_DEG;
    const bool lostInEngineOut = in.engineOut && in.slatsOrFlapsExtended;

    return (in.facAlphaFloor || sidestickCondition) && !lostInEngineOut;
  }

 private:
  enum class Phase { Landed, Takeoff, Flying, Landing };

  /// The flight phases of the FacComputer alpha floor inhibition: available from lift-off (also below 100 ft at
  /// takeoff), inhibited below 100 ft RA once the aircraft has flown above it, and on the ground. Without a valid radio
  /// height (no computed data above 2500 ft) the FacComputer uses 200 ft (its parameter Constant_Value): so does this.
  void updateAvailability(const Inputs& in) {
    const double radioHeightFt = in.radioHeightValid ? in.radioHeightFt : INVALID_RADIO_HEIGHT_FT;
    const bool above100Ft = radioHeightFt > LANDING_INHIBITION_HEIGHT_FT;
    const bool below100Ft = radioHeightFt < LANDING_INHIBITION_HEIGHT_FT;
    if (in.onGround) {
      phase = Phase::Landed;
    } else {
      switch (phase) {
        case Phase::Landed:
          phase = Phase::Takeoff;
          break;
        case Phase::Takeoff:
        case Phase::Landing:
          if (above100Ft) {
            phase = Phase::Flying;
          }
          break;
        case Phase::Flying:
          if (below100Ft) {
            phase = Phase::Landing;
          }
          break;
      }
    }
    available = phase == Phase::Takeoff || phase == Phase::Flying;
  }

  Phase phase = Phase::Landed;
  bool available = false;
};
