// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the PRIM outputs after the loss of an actuator control (src/failures/PrimActuatorControlFailures.h): run
// test/run_tests.sh. The SEC is the generated A380SecComputer model, used as it is: it reads the status words of the PRIM
// bus as FlyByWireInterface::updateSec feeds them, and engages the actuator it shares with the PRIM when the PRIM no longer
// does.
//
// Build with -DWITHOUT_THE_FIX to run the same checks with the PRIM outputs as the PRIM model gives them: the checks of the
// SEC taking over must fail.

#include <cstdio>
#include <memory>

#include "A380SecComputer.h"
#include "failures/PrimActuatorControlFailures.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr uint32_T SSM_NORMAL_OPERATION = 3U;

static base_arinc_429 wordWithBits(std::initializer_list<int> bits) {
  uint32_T data = 0;
  for (int bit : bits) {
    data |= 1U << (bit - 1);
  }
  return {SSM_NORMAL_OPERATION, static_cast<real32_T>(data)};
}

struct PrimOutputs {
  base_prim_discrete_outputs discrete = {};
  base_prim_analog_outputs analog = {};
  base_prim_out_bus bus = {};
};

/// PRIM 1 as the PRIM model gives it with all systems operative: the left outer elevator and the upper rudder engaged
static PrimOutputs prim1Engaged() {
  PrimOutputs prim;
  prim.discrete.elevator_1_active_mode = true;
  prim.discrete.rudder_1_hydraulic_active_mode = true;
  prim.analog.elevator_1_pos_order_deg = 2;
  prim.analog.rudder_1_pos_order_deg = 1;
  // elevator 1 available and engaged; rudder 1 hydraulic and electric modes available, hydraulic mode engaged
  prim.bus.fctl.elevator_status_word = wordWithBits({11, 12});
  prim.bus.fctl.rudder_status_word = wordWithBits({11, 12, 13});
  return prim;
}

static PrimOutputs afterElevatorControlLoss(PrimOutputs prim) {
#ifndef WITHOUT_THE_FIX
  PrimActuatorControlFailures::removeElevatorActuatorControl(prim.discrete, prim.analog, prim.bus);
#endif
  return prim;
}

static PrimOutputs afterRudderControlLoss(PrimOutputs prim) {
#ifndef WITHOUT_THE_FIX
  PrimActuatorControlFailures::removeRudderActuatorControl(prim.discrete, prim.analog, prim.bus);
#endif
  return prim;
}

/// SEC 1 after 5 s with both hydraulic systems pressurised, PRIM 1 as given, PRIM 2 and 3 running with nothing engaged
static base_sec_discrete_outputs sec1With(const PrimOutputs& prim1) {
  auto sec = std::make_unique<A380SecComputer>();
  sec->initialize();
  A380SecComputer::ExternalInputs_A380SecComputer_T inputs = {};
  inputs.in.time.dt = 0.05;
  inputs.in.sim_data.computer_running = true;
  inputs.in.discrete_inputs.sec_overhead_button_pressed = true;
  inputs.in.discrete_inputs.is_unit_1 = true;
  inputs.in.bus_inputs.prim_1_bus = prim1.bus;
  inputs.in.bus_inputs.prim_2_bus.fctl.elevator_status_word = wordWithBits({});
  inputs.in.bus_inputs.prim_2_bus.fctl.rudder_status_word = wordWithBits({});
  inputs.in.bus_inputs.prim_3_bus.fctl.elevator_status_word = wordWithBits({});
  inputs.in.bus_inputs.prim_3_bus.fctl.rudder_status_word = wordWithBits({});
  for (int step = 0; step < 100; ++step) {
    inputs.in.time.simulation_time = step * inputs.in.time.dt;
    inputs.in.time.monotonic_time = inputs.in.time.simulation_time;
    sec->setExternalInputs(&inputs);
    sec->step();
  }
  return sec->getExternalOutputs().out.discrete_outputs;
}

int main() {
  const PrimOutputs engaged = prim1Engaged();
  {
    const base_sec_discrete_outputs sec1 = sec1With(engaged);
    expect(!sec1.elevator_1_active_mode, "PRIM 1 controls the left outer elevator actuator: SEC 1 stays in stand-by");
    expect(!sec1.rudder_1_hydraulic_active_mode, "PRIM 1 controls the upper rudder actuator: SEC 1 stays in stand-by");
  }
  {
    const PrimOutputs prim1 = afterElevatorControlLoss(engaged);
    expect(!prim1.discrete.elevator_1_active_mode, "PRIM 1 no longer engages the left outer elevator actuator");
    expect(prim1.analog.elevator_1_pos_order_deg == 0, "PRIM 1 sends no elevator order");
    expect(prim1.discrete.rudder_1_hydraulic_active_mode, "PRIM 1 keeps the upper rudder actuator");
    const base_sec_discrete_outputs sec1 = sec1With(prim1);
    expect(sec1.elevator_1_active_mode, "SEC 1 takes over the left outer elevator actuator");
    expect(!sec1.rudder_1_hydraulic_active_mode, "SEC 1 leaves the upper rudder actuator to PRIM 1");
  }
  {
    const PrimOutputs prim1 = afterRudderControlLoss(engaged);
    expect(!prim1.discrete.rudder_1_hydraulic_active_mode && !prim1.discrete.rudder_1_electric_active_mode,
           "PRIM 1 no longer engages the upper rudder actuator");
    expect(prim1.analog.rudder_1_pos_order_deg == 0, "PRIM 1 sends no rudder order");
    const base_sec_discrete_outputs sec1 = sec1With(prim1);
    expect(sec1.rudder_1_hydraulic_active_mode, "SEC 1 takes over the upper rudder actuator");
    expect(!sec1.elevator_1_active_mode, "SEC 1 leaves the left outer elevator actuator to PRIM 1");
  }

  if (failures == 0) {
    std::printf("prim_actuator_control_test: all checks passed\n");
    return 0;
  }
  std::printf("prim_actuator_control_test: %d check(s) failed\n", failures);
  return 1;
}
