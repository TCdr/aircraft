#pragma once

// A PRIM that has lost the capacity to control one of its actuators (F/CTL PRIM 1(2)(3) ELEVATOR (RUDDER) ACTUATOR FAULT).
// No MSFS SDK here, so the native tests can run it with the generated A380SecComputer model.
//
// The PRIM model does not know this failure, so its outputs are changed after each step: the PRIM no longer engages the
// actuator, sends it no order and no longer reports it engaged in its status word. The other flight control computers read
// that word, as when the PRIM is failed, and the computer that shares the actuator engages it instead.
//
// Design choice: the actuator is the first elevator (rudder) actuator of the PRIM, the one it controls when all systems are
// operative: PRIM 1 the left outer elevator and the upper rudder, PRIM 2 the right outer elevator, PRIM 3 the left inner
// elevator. PRIM 2 and 3 control a rudder actuator only after a reconfiguration.

#include "A380PrimComputerFctl_types.h"
#include "../Arinc429Utils.h"

namespace PrimActuatorControlFailures {

// Bits of the status words of the PRIM bus (bit 11 is the first one)
constexpr int ELEVATOR_1_ENGAGED_BIT = 12;
constexpr int RUDDER_1_HYDRAULIC_MODE_ENGAGED_BIT = 13;
constexpr int RUDDER_1_ELECTRIC_MODE_ENGAGED_BIT = 14;

/// The PRIM outputs after the loss of its elevator actuator control
inline void removeElevatorActuatorControl(base_prim_discrete_outputs& discrete,
                                          base_prim_analog_outputs& analog,
                                          base_prim_out_bus& bus) {
  discrete.elevator_1_active_mode = false;
  analog.elevator_1_pos_order_deg = 0;
  Arinc429Utils::setBit(bus.fctl.elevator_status_word, ELEVATOR_1_ENGAGED_BIT, false);
}

/// The PRIM outputs after the loss of its rudder actuator control
inline void removeRudderActuatorControl(base_prim_discrete_outputs& discrete,
                                        base_prim_analog_outputs& analog,
                                        base_prim_out_bus& bus) {
  discrete.rudder_1_hydraulic_active_mode = false;
  discrete.rudder_1_electric_active_mode = false;
  analog.rudder_1_pos_order_deg = 0;
  Arinc429Utils::setBit(bus.fctl.rudder_status_word, RUDDER_1_HYDRAULIC_MODE_ENGAGED_BIT, false);
  Arinc429Utils::setBit(bus.fctl.rudder_status_word, RUDDER_1_ELECTRIC_MODE_ENGAGED_BIT, false);
}

}  // namespace PrimActuatorControlFailures
