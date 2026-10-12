// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the FAC rudder actuator failures (src/fac/FacActuatorMonitor.h) with the generated FacComputer: run
// test/run_tests.sh.
//
// A320 FCOM PRO-ABN-AUTO_FLT: YAW DAMPER 1(2) "one yaw damper actuator is failed" (a320_fcom.txt l.71990), RUD TRIM 1(2)
// FAULT "one rudder trim actuator is failed" (l.71751), RUD TRV LIM 1(2) "one rudder travel limitation actuator is
// failed" (l.71836); with both lost, the SYS alerts (l.71792, l.71875, l.72022). Each FAC drives its own actuator of each
// function: with a failed actuator, FAC 1 cannot engage the function and FAC 2 takes it over; the failed FAC reports
// the fault to the FWC, a failed FAC reports nothing.

#include <cstdio>

#include "../src/fac/Fac.h"
#include "../src/fac/FacActuatorMonitor.h"

using FacActuatorMonitor::ActuatorFailures;

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr double frameTime = 0.05;

/// The two FACs on ground, powered, pbs ON, both hydraulic systems pressurised, cross-wired as FlyByWireInterface does.
struct TwoFacs {
  Fac facs[2] = {Fac(true), Fac(false)};
  base_fac_discrete_outputs outputs[2] = {};
  ActuatorFailures failed[2] = {};

  void run(double seconds) {
    for (double t = 0; t < seconds; t += frameTime) {
      base_fac_discrete_outputs newOutputs[2];
      for (int i = 0; i < 2; i++) {
        const int opp = i == 0 ? 1 : 0;
        auto& in = facs[i].modelInputs.in;
        in.time.dt = frameTime;
        in.discrete_inputs.is_unit_1 = i == 0;
        in.discrete_inputs.fac_engaged_from_switch = true;
        in.discrete_inputs.nose_gear_pressed = true;
        in.discrete_inputs.engine_1_stopped = true;
        in.discrete_inputs.engine_2_stopped = true;
        in.discrete_inputs.fac_opp_healthy = outputs[opp].fac_healthy;
        in.discrete_inputs.yaw_damper_opp_engaged = outputs[opp].yaw_damper_engaged;
        in.discrete_inputs.rudder_trim_opp_engaged = outputs[opp].rudder_trim_engaged;
        in.discrete_inputs.rudder_travel_lim_opp_engaged = outputs[opp].rudder_travel_lim_engaged;
        const FacActuatorMonitor::ActuatorInputs actuators = FacActuatorMonitor::actuatorInputs(true, failed[i]);
        in.discrete_inputs.yaw_damper_has_hyd_press = actuators.yawDamperAvailable;
        in.discrete_inputs.rudder_trim_actuator_healthy = actuators.rudderTrimActuatorHealthy;
        in.discrete_inputs.rudder_travel_lim_actuator_healthy = actuators.rudderTravelLimActuatorHealthy;
        facs[i].update(frameTime, 0, false, true);
        newOutputs[i] = facs[i].getDiscreteOutputs();
      }
      outputs[0] = newOutputs[0];
      outputs[1] = newOutputs[1];
    }
  }
};

static void fac1HasEveryFunctionWithoutFailure() {
  TwoFacs facs;
  facs.run(1);
  expect(facs.outputs[0].yaw_damper_engaged && facs.outputs[0].rudder_trim_engaged && facs.outputs[0].rudder_travel_lim_engaged,
         "FAC 1 has the yaw damper, the rudder trim and the travel limiter engaged");
  expect(!facs.outputs[1].yaw_damper_engaged && !facs.outputs[1].rudder_trim_engaged && !facs.outputs[1].rudder_travel_lim_engaged,
         "FAC 2 is in standby");
}

static void fac2TakesTheRudderTrimOverAfterAFac1RudderTrimActuatorFailure() {
  TwoFacs facs;
  facs.run(1);
  facs.failed[0].rudderTrim = true;
  facs.run(0.5);
  expect(!facs.outputs[0].rudder_trim_engaged, "FAC 1 releases the rudder trim");
  expect(facs.outputs[1].rudder_trim_engaged, "FAC 2 engages the rudder trim");
  expect(facs.outputs[0].yaw_damper_engaged && facs.outputs[0].rudder_travel_lim_engaged, "FAC 1 keeps its other functions");
}

static void fac2TakesTheTravelLimiterOverAfterAFac1TravelLimiterActuatorFailure() {
  TwoFacs facs;
  facs.run(1);
  facs.failed[0].rudderTravelLimiter = true;
  facs.run(0.5);
  expect(!facs.outputs[0].rudder_travel_lim_engaged, "FAC 1 releases the travel limiter");
  expect(facs.outputs[1].rudder_travel_lim_engaged, "FAC 2 engages the travel limiter");
}

static void bothYawDamperActuatorsFailedLeaveNoYawDamper() {
  TwoFacs facs;
  facs.run(1);
  facs.failed[0].yawDamper = true;
  facs.run(0.5);
  expect(facs.outputs[1].yaw_damper_engaged, "FAC 2 engages its yaw damper after the FAC 1 yaw damper actuator failure");
  expect(!facs.outputs[0].yaw_damper_avail_for_norm_law, "the FAC 1 yaw damper is not available for the ELAC normal law");
  facs.failed[1].yawDamper = true;
  facs.run(0.5);
  expect(!facs.outputs[0].yaw_damper_engaged && !facs.outputs[1].yaw_damper_engaged, "no FAC has a yaw damper engaged");
  expect(!facs.outputs[0].yaw_damper_avail_for_norm_law && !facs.outputs[1].yaw_damper_avail_for_norm_law,
         "no yaw damper is available for the ELAC normal law (the ELACs go to alternate law)");
}

static void onlyAHealthyFacReportsItsActuatorFaults() {
  const ActuatorFailures failed{true, false, true};
  const ActuatorFailures reported = FacActuatorMonitor::reportedActuatorFaults(true, failed);
  expect(reported.yawDamper && !reported.rudderTrim && reported.rudderTravelLimiter, "a healthy FAC reports its failed actuators");
  const ActuatorFailures fromFailedFac = FacActuatorMonitor::reportedActuatorFaults(false, failed);
  expect(!fromFailedFac.yawDamper && !fromFailedFac.rudderTrim && !fromFailedFac.rudderTravelLimiter, "a failed FAC reports nothing");
}

static void theYawDamperNeedsItsHydraulicPressureAndItsActuator() {
  expect(FacActuatorMonitor::actuatorInputs(true, ActuatorFailures{}).yawDamperAvailable, "pressure and actuator: available");
  expect(!FacActuatorMonitor::actuatorInputs(false, ActuatorFailures{}).yawDamperAvailable, "no pressure: not available");
  expect(!FacActuatorMonitor::actuatorInputs(true, ActuatorFailures{true, false, false}).yawDamperAvailable,
         "failed actuator: not available");
}

int main() {
  fac1HasEveryFunctionWithoutFailure();
  fac2TakesTheRudderTrimOverAfterAFac1RudderTrimActuatorFailure();
  fac2TakesTheTravelLimiterOverAfterAFac1TravelLimiterActuatorFailure();
  bothYawDamperActuatorsFailedLeaveNoYawDamper();
  onlyAHealthyFacReportsItsActuatorFaults();
  theYawDamperNeedsItsHydraulicPressureAndItsActuator();
  if (failures > 0) {
    std::printf("fac_actuator_failure_test: %d failure(s)\n", failures);
    return 1;
  }
  std::printf("fac_actuator_failure_test: all passed\n");
  return 0;
}
