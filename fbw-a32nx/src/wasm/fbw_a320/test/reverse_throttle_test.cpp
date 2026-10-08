// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the MSFS throttle in reverse (run test/run_tests.sh): the generated FadecComputer thrust loop, used as it is,
// gives reverse thrust as a NEGATIVE MSFS throttle (its reverse integrator runs from 0 down to -100 %; MSFS clamps it to
// min_throttle_limit = -1 %, full reverse, engines.cfg). EngineStartThrottleHold::simThrottle must pass that negative throttle on.
//
// Sim test 2026-10-06 (s8_main1.log, integration build q-int-1006, A32NX on the runway): both levers at full reverse (TLA -20)
// for 5.7 s, reverser 2 fully deployed, yet GENERAL ENG THROTTLE LEVER POSITION:1/2 stayed exactly 0 % and both N1 at idle
// (19.6 %): simThrottle returned max(loopThrottle, 0).

#include <algorithm>
#include <cstdio>

#include "EngineStartThrottleHold.h"
#include "FadecComputer.h"

static int failures = 0;

static void expect(bool condition, const char* what, double value) {
  if (!condition) {
    std::printf("FAIL %s (value %.3f)\n", what, value);
    ++failures;
  }
}

/// The MSFS throttle written after `seconds` of the lever at `tlaDeg`, on the ground, engine running at idle (N1 19.6 %), through
/// the thrust loop and the start throttle hold as fbw_a320 FlyByWireInterface::updateFadec chains them.
static double msfsThrottleAfter(double tlaDeg, double seconds) {
  constexpr double dt = 1.0 / 30.0;
  FadecComputer    fadec;
  fadec.initialize();
  FadecComputer::ExternalInputs_FadecComputer_T inputs{};
  EngineStartThrottleHold                       hold;

  double throttle = 0.0;
  for (double t = 0.0; t < seconds; t += dt) {
    inputs.in.time.dt                          = dt;
    inputs.in.time.simulation_time             = t;
    inputs.in.data.on_ground                   = true;
    inputs.in.data.is_engine_operative         = true;
    inputs.in.data.engine_N1_percent           = 19.6;
    inputs.in.data.commanded_engine_N1_percent = 19.6;  // the MSFS engine does not answer in this test: the loop output alone
    inputs.in.input.TLA_deg                    = tlaDeg;
    inputs.in.input.thrust_limit_IDLE_percent  = 19.6;
    inputs.in.input.thrust_limit_CLB_percent   = 82.0;
    inputs.in.input.thrust_limit_MCT_percent   = 84.0;
    inputs.in.input.thrust_limit_FLEX_percent  = 84.0;
    inputs.in.input.thrust_limit_TOGA_percent  = 86.0;
    inputs.in.input.thrust_limit_REV_percent   = 86.0 * 0.813;

    const EngineStartThrottleHold::Output output =
        hold.update({true, EngineStartThrottleHold::ENGINE_STATE_ON, 19.6, 19.6, 19.6, dt, 68.0, 68.0});
    inputs.in.data.commanded_engine_N1_percent = output.loopCommandedN1;
    fadec.setExternalInputs(&inputs);
    fadec.step();
    const double loopThrottle = fadec.getExternalOutputs().out.output.sim_throttle_lever_pos;
    throttle                  = std::min(99.9999999999999, EngineStartThrottleHold::simThrottle(output, loopThrottle));
  }
  return throttle;
}

int main() {
  // Full reverse (TLA -20, reverser deployed): the loop asks for reverse thrust, the MSFS throttle must go negative.
  const double fullReverse = msfsThrottleAfter(-20.0, 1.0);
  expect(fullReverse < -1.0, "full reverse: negative MSFS throttle (MSFS full reverse at -1 %)", fullReverse);

  // Forward thrust is unchanged: TLA 25 (CL) gives a positive throttle.
  const double climb = msfsThrottleAfter(25.0, 1.0);
  expect(climb > 0.0, "CL: positive MSFS throttle", climb);

  // simThrottle itself: a negative loop throttle passes when no fallback throttle is set, the hold and the fallback still apply.
  using Hold = EngineStartThrottleHold;
  expect(Hold::simThrottle({false, 50.0, 0.0}, -0.8) == -0.8, "simThrottle: reverse throttle passes", Hold::simThrottle({false, 50.0, 0.0}, -0.8));
  expect(Hold::simThrottle({false, 50.0, 0.0}, 42.0) == 42.0, "simThrottle: forward throttle passes", 42.0);
  expect(Hold::simThrottle({false, 50.0, 6.0}, 2.0) == 6.0, "simThrottle: fallback throttle is a floor", 6.0);
  expect(Hold::simThrottle({true, 200.0, 0.0}, -5.0) == 0.0, "simThrottle: held at idle", Hold::simThrottle({true, 200.0, 0.0}, -5.0));

  if (failures == 0) {
    std::printf("reverse_throttle_test: all tests passed\n");
    return 0;
  }
  std::printf("reverse_throttle_test: %d failure(s)\n", failures);
  return 1;
}
