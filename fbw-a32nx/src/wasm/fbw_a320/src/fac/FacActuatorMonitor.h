#pragma once

// The rudder actuators of a FAC under the flyPad failures 22006-22011, and the actuator faults it reports to the FWC
// (YAW DAMPER 1(2): one yaw damper actuator failed; RUD TRIM 1(2) FAULT: one rudder trim actuator failed; RUD TRV LIM
// 1(2): one rudder travel limitation actuator failed). Pure functions, no MSFS SDK: tested natively by test/run_tests.sh.
//
// Each FAC drives its own yaw damper actuator (FAC 1 the green one, FAC 2 the yellow one), its own motor of the rudder
// trim actuator and its own motor of the rudder travel limiter actuator. A FAC with a failed actuator cannot engage that
// function; the other FAC engages it (FacComputer yawDamperHasPriority, rudderTrimHasPriority, rudderTravelLimHasPriority).

namespace FacActuatorMonitor {

/// The failed actuators of one FAC (flyPad failures YawDamperActuator1/2, RudderTrimActuator1/2,
/// RudderTravelLimiterActuator1/2).
struct ActuatorFailures {
  bool yawDamper = false;
  bool rudderTrim = false;
  bool rudderTravelLimiter = false;
};

/// The FAC model inputs of its actuators.
struct ActuatorInputs {
  /// FacComputer discrete input yaw_damper_has_hyd_press: the model has one availability input for the yaw damper, the
  /// hydraulic pressure of its actuator, so a failed actuator counts as an actuator without pressure.
  bool yawDamperAvailable = false;
  /// FacComputer discrete input rudder_trim_actuator_healthy
  bool rudderTrimActuatorHealthy = false;
  /// FacComputer discrete input rudder_travel_lim_actuator_healthy
  bool rudderTravelLimActuatorHealthy = false;
};

/// The FAC model inputs of its actuators.
/// @param yawDamperHasHydraulicPressure the hydraulic system of the yaw damper actuator (FAC 1 green, FAC 2 yellow) is
///   pressurised
/// @param failed the failed actuators of this FAC
inline ActuatorInputs actuatorInputs(bool yawDamperHasHydraulicPressure, const ActuatorFailures& failed) {
  return ActuatorInputs{yawDamperHasHydraulicPressure && !failed.yawDamper, !failed.rudderTrim, !failed.rudderTravelLimiter};
}

/// The actuator faults the FAC reports to the FWC (L:A32NX_FAC_n_YAW_DAMPER_ACTUATOR_FAULT,
/// L:A32NX_FAC_n_RUDDER_TRIM_ACTUATOR_FAULT, L:A32NX_FAC_n_RUDDER_TRAVEL_LIM_ACTUATOR_FAULT). A failed or unpowered FAC
/// reports nothing: the FWC then shows FAC 1(2) FAULT.
/// @param facHealthy the FAC is healthy (FAC discrete output fac_healthy)
/// @param failed the failed actuators of this FAC
inline ActuatorFailures reportedActuatorFaults(bool facHealthy, const ActuatorFailures& failed) {
  return ActuatorFailures{facHealthy && failed.yawDamper, facHealthy && failed.rudderTrim, facHealthy && failed.rudderTravelLimiter};
}

}  // namespace FacActuatorMonitor
