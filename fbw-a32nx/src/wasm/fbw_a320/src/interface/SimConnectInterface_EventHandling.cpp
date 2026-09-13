#include "SimConnectInterface.h"
#include <cmath>
#include <cstdio>
#include <map>
#include <vector>

// Dispatch of incoming SimConnect client events (the processEvent() switch).

void SimConnectInterface::simConnectProcessEvent(const SIMCONNECT_RECV_EVENT* event) {
  const DWORD eventId = event->uEventID;
  const DWORD data0 = event->dwData;
  processEvent(eventId, data0);
}

void SimConnectInterface::simConnectProcessEvent_EX1(const SIMCONNECT_RECV_EVENT_EX1* event) {
  const DWORD eventId = event->uEventID;
  const DWORD data0 = event->dwData0;
  const DWORD data1 = event->dwData1;
  processEvent(eventId, data0, data1);
}

void SimConnectInterface::processEvent(const DWORD eventId, const DWORD data0, const DWORD data1) {
  // process depending on event id
  switch (eventId) {
    case Events::SYSTEM_EVENT_PAUSE: {
      pauseState = static_cast<long>(data0);
      std::printf("WASM: SYSTEM_EVENT_PAUSE: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::AXIS_ELEVATOR_SET: {
      simInput.inputs[AXIS_ELEVATOR_SET] = static_cast<long>(data0) / 16384.0;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: AXIS_ELEVATOR_SET: %ld -> %g\n", static_cast<long>(data0), simInput.inputs[AXIS_ELEVATOR_SET]);
      }
      break;
    }

    case Events::AXIS_AILERONS_SET: {
      simInput.inputs[AXIS_AILERONS_SET] = static_cast<long>(data0) / 16384.0;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: AXIS_AILERONS_SET: %ld -> %g\n", static_cast<long>(data0), simInput.inputs[AXIS_AILERONS_SET]);
      }
      break;
    }

    case Events::AXIS_RUDDER_SET: {
      simInput.inputs[AXIS_RUDDER_SET] = static_cast<long>(data0) / 16384.0;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: AXIS_RUDDER_SET: %ld -> %g\n", static_cast<long>(data0), simInput.inputs[AXIS_RUDDER_SET]);
      }
      break;
    }

    case Events::RUDDER_SET: {
      simInput.inputs[AXIS_RUDDER_SET] = static_cast<long>(data0) / 16384.0;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_SET: %ld -> %g\n", static_cast<long>(data0), simInput.inputs[AXIS_RUDDER_SET]);
      }
      break;
    }

    case Events::RUDDER_LEFT: {
      simInput.inputs[AXIS_RUDDER_SET] = fmin(1.0, simInput.inputs[AXIS_RUDDER_SET] + flightControlsKeyChangeRudder);
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_LEFT: (no data) -> %g\n", simInput.inputs[AXIS_RUDDER_SET]);
      }
      break;
    }

    case Events::RUDDER_CENTER: {
      simInput.inputs[AXIS_RUDDER_SET] = 0.0;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_CENTER: (no data) -> %g\n", simInput.inputs[AXIS_RUDDER_SET]);
      }
      break;
    }

    case Events::RUDDER_RIGHT: {
      simInput.inputs[AXIS_RUDDER_SET] = fmax(-1.0, simInput.inputs[AXIS_RUDDER_SET] - flightControlsKeyChangeRudder);
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_RIGHT: (no data) -> %g\n", simInput.inputs[AXIS_RUDDER_SET]);
      }
      break;
    }

    case Events::RUDDER_AXIS_MINUS: {
      double tmpValue = 0;
      if (disableXboxCompatibilityRudderPlusMinus) {
        // normal axis
        tmpValue = +1.0 * ((static_cast<long>(data0) + 16384.0) / 32768.0);
      } else {
        // xbox controller
        tmpValue = +1.0 * (static_cast<long>(data0) / 16384.0);
      }

      // This allows using two independent axis for rudder which are mapped to RUDDER AXIS LEFT and RUDDER AXIS RIGHT
      // As it might be incompatible with some controllers, it is configurable
      if (enableRudder2AxisMode) {
        rudderLeftAxis = tmpValue;
        tmpValue = -1 * ((rudderRightAxis - rudderLeftAxis) / 2.0);
      }

      simInput.inputs[AXIS_RUDDER_SET] = tmpValue;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_AXIS_MINUS: %ld -> %g", static_cast<long>(data0), simInput.inputs[AXIS_RUDDER_SET]);
        if (enableRudder2AxisMode) {
          std::printf(" (left: %g, right: %g)", rudderLeftAxis, rudderRightAxis);
        }
        std::printf("\n");
      }
      break;
    }

    case Events::RUDDER_AXIS_PLUS: {
      double tmpValue = 0;
      if (disableXboxCompatibilityRudderPlusMinus) {
        // normal axis
        tmpValue = -1.0 * ((static_cast<long>(data0) + 16384.0) / 32768.0);
      } else {
        // xbox controller
        tmpValue = -1.0 * (static_cast<long>(data0) / 16384.0);
      }

      // This allows using two independent axis for rudder which are mapped to RUDDER AXIS LEFT and RUDDER AXIS RIGHT
      // As it might be incompatible with some controllers, it is configurable
      if (enableRudder2AxisMode) {
        rudderRightAxis = -tmpValue;
        tmpValue = -1 * ((rudderRightAxis - rudderLeftAxis) / 2.0);
      }

      simInput.inputs[AXIS_RUDDER_SET] = tmpValue;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_AXIS_PLUS: %ld -> %g", static_cast<long>(data0), simInput.inputs[AXIS_RUDDER_SET]);
        if (enableRudder2AxisMode) {
          std::printf(" (left: %g, right: %g)", rudderLeftAxis, rudderRightAxis);
        }
        std::printf("\n");
      }
      break;
    }

    case Events::RUDDER_TRIM_LEFT: {
      simInputRudderTrim.rudderTrimSwitchLeft = true;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_TRIM_LEFT: (no data)\n");
      }
      break;
    }

    case Events::RUDDER_TRIM_RESET: {
      simInputRudderTrim.rudderTrimReset = true;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_TRIM_RESET: (no data)\n");
      }
      break;
    }

    case Events::RUDDER_TRIM_RIGHT: {
      simInputRudderTrim.rudderTrimSwitchRight = true;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_TRIM_RIGHT: (no data)\n");
      }
      break;
    }

    case Events::RUDDER_TRIM_SET: {
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_TRIM_SET: %ld\n", static_cast<long>(data0));
      }
      break;
    }

    case Events::RUDDER_TRIM_SET_EX1: {
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: RUDDER_TRIM_SET_EX1: %ld\n", static_cast<long>(data0));
      }
      break;
    }

    case Events::AILERON_SET: {
      simInput.inputs[AXIS_AILERONS_SET] = static_cast<long>(data0) / 16384.0;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: AILERON_SET: %ld -> %g\n", static_cast<long>(data0), simInput.inputs[AXIS_AILERONS_SET]);
      }
      break;
    }

    case Events::AILERONS_LEFT: {
      simInput.inputs[AXIS_AILERONS_SET] = fmin(1.0, simInput.inputs[AXIS_AILERONS_SET] + flightControlsKeyChangeAileron);
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: AILERONS_LEFT: (no data) -> %g\n", simInput.inputs[AXIS_AILERONS_SET]);
      }
      break;
    }

    case Events::AILERONS_RIGHT: {
      simInput.inputs[AXIS_AILERONS_SET] = fmax(-1.0, simInput.inputs[AXIS_AILERONS_SET] - flightControlsKeyChangeAileron);
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: AILERONS_RIGHT: (no data) -> %g\n", simInput.inputs[AXIS_AILERONS_SET]);
      }
      break;
    }

    case Events::CENTER_AILER_RUDDER: {
      simInput.inputs[AXIS_RUDDER_SET] = 0.0;
      simInput.inputs[AXIS_AILERONS_SET] = 0.0;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: CENTER_AILER_RUDDER: (no data) -> %g / %g\n", simInput.inputs[AXIS_AILERONS_SET],
                    simInput.inputs[AXIS_RUDDER_SET]);
      }
      break;
    }

    case Events::ELEVATOR_SET: {
      simInput.inputs[AXIS_ELEVATOR_SET] = static_cast<long>(data0) / 16384.0;
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: ELEVATOR_SET: %ld -> %g\n", static_cast<long>(data0), simInput.inputs[AXIS_ELEVATOR_SET]);
      }
      break;
    }

    case Events::ELEV_DOWN: {
      simInput.inputs[AXIS_ELEVATOR_SET] = fmin(1.0, simInput.inputs[AXIS_ELEVATOR_SET] + flightControlsKeyChangeElevator);
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: ELEV_DOWN: (no data) -> %g\n", simInput.inputs[AXIS_ELEVATOR_SET]);
      }
      break;
    }

    case Events::ELEV_UP: {
      simInput.inputs[AXIS_ELEVATOR_SET] = fmax(-1.0, simInput.inputs[AXIS_ELEVATOR_SET] - flightControlsKeyChangeElevator);
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: ELEV_UP: (no data) -> %g\n", simInput.inputs[AXIS_ELEVATOR_SET]);
      }
      break;
    }

    case Events::AUTOPILOT_OFF: {
      simInputAutopilot.AP_disconnect = 1;
      std::printf("WASM: event triggered: AUTOPILOT_OFF\n");
      break;
    }

    case Events::AUTOPILOT_ON: {
      simInputAutopilot.AP_engage = 1;
      std::printf("WASM: event triggered: AUTOPILOT_ON\n");
      break;
    }

    case Events::AP_MASTER: {
      simInputAutopilot.AP_1_push = 1;
      std::printf("WASM: event triggered: AP_MASTER\n");
      break;
    }

    case Events::AUTOPILOT_DISENGAGE_SET: {
      if (static_cast<long>(data0) == 1) {
        simInputAutopilot.AP_disconnect = 1;
        std::printf("WASM: event triggered: AUTOPILOT_DISENGAGE_SET\n");

        // Re emitting masked event for autopilot disconnection
        sendEvent(SimConnectInterface::Events::A32NX_AUTOPILOT_DISENGAGE, 0, SIMCONNECT_GROUP_PRIORITY_STANDARD);
      }
      break;
    }

    case Events::AUTOPILOT_DISENGAGE_TOGGLE: {
      simInputAutopilot.AP_1_push = 1;
      std::printf("WASM: event triggered: AUTOPILOT_DISENGAGE_TOGGLE\n");
      break;
    }

    case Events::TOGGLE_FLIGHT_DIRECTOR: {
      fcuEfisPanelInputs[0].fd_button_pushed = 1;
      fcuEfisPanelInputs[1].fd_button_pushed = 1;
      std::printf("WASM: event triggered: TOGGLE_FLIGHT_DIRECTOR:%ld\n", static_cast<long>(data0));
      break;
    }

    case Events::A32NX_FCU_AP_1_PUSH: {
      simInputAutopilot.AP_1_push = 1;
      std::printf("WASM: event triggered: A32NX_FCU_AP_1_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_AP_2_PUSH: {
      simInputAutopilot.AP_2_push = 1;
      std::printf("WASM: event triggered: A32NX_FCU_AP_2_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_AP_DISCONNECT_PUSH: {
      simInputAutopilot.AP_disconnect = 1;
      std::printf("WASM: event triggered: A32NX_FCU_AP_DISCONNECT_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_ATHR_PUSH: {
      simInputThrottles.ATHR_push = 1;
      std::printf("WASM: event triggered: A32NX_FCU_ATHR_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_ATHR_DISCONNECT_PUSH: {
      simInputThrottles.ATHR_disconnect = 1;
      std::printf("WASM: event triggered: A32NX_FCU_ATHR_DISCONNECT_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_SPD_INC: {
      fcuAfsPanelInputs.spd_knob.turns = 1;
      std::printf("WASM: event triggered: A32NX_FCU_SPD_INC\n");
      break;
    }

    case Events::A32NX_FCU_SPD_DEC: {
      fcuAfsPanelInputs.spd_knob.turns = -1;
      std::printf("WASM: event triggered: A32NX_FCU_SPD_DEC\n");
      break;
    }

    case Events::A32NX_FCU_SPD_SET: {
      simInputAutopilot.SPD_MACH_set = static_cast<long>(data0);
      std::printf("WASM: event triggered: A32NX_FCU_SPD_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::A32NX_FCU_SPD_PUSH:
    case Events::AP_AIRSPEED_ON: {
      fcuAfsPanelInputs.spd_knob.pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_SPD_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_SPD_PULL:
    case Events::AP_AIRSPEED_OFF: {
      fcuAfsPanelInputs.spd_knob.pulled = true;
      std::printf("WASM: event triggered: A32NX_FCU_SPD_PULL\n");
      break;
    }

    case Events::A32NX_FCU_SPD_MACH_TOGGLE_PUSH:
    case Events::AP_MACH_HOLD: {
      fcuAfsPanelInputs.spd_mach_button_pressed = true;
      std::printf("WASM: event triggered: A32NX_FCU_SPD_MACH_TOGGLE_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_HDG_INC: {
      fcuAfsPanelInputs.hdg_trk_knob.turns = 1;
      std::printf("WASM: event triggered: A32NX_FCU_HDG_INC\n");
      break;
    }

    case Events::A32NX_FCU_HDG_DEC: {
      fcuAfsPanelInputs.hdg_trk_knob.turns = -1;
      std::printf("WASM: event triggered: A32NX_FCU_HDG_DEC\n");
      break;
    }

    case Events::A32NX_FCU_HDG_SET: {
      simInputAutopilot.HDG_TRK_set = static_cast<long>(data0);
      std::printf("WASM: event triggered: A32NX_FCU_HDG_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::A32NX_FCU_HDG_PUSH:
    case Events::AP_HDG_HOLD_ON: {
      fcuAfsPanelInputs.hdg_trk_knob.pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_HDG_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_HDG_PULL:
    case Events::AP_HDG_HOLD_OFF: {
      fcuAfsPanelInputs.hdg_trk_knob.pulled = true;
      std::printf("WASM: event triggered: A32NX_FCU_HDG_PULL\n");
      break;
    }

    case Events::A32NX_FCU_TRK_FPA_TOGGLE_PUSH:
    case Events::AP_VS_HOLD: {
      fcuAfsPanelInputs.trk_fpa_button_pressed = true;
      std::printf("WASM: event triggered: A32NX_FCU_TRK_FPA_TOGGLE_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_ALT_INC: {
      fcuAfsPanelInputs.alt_knob.turns = 1;

      std::printf("WASM: event triggered: A32NX_FCU_ALT_INC\n");
      break;
    }

    case Events::A32NX_FCU_ALT_DEC: {
      fcuAfsPanelInputs.alt_knob.turns = -1;

      std::printf("WASM: event triggered: A32NX_FCU_ALT_DEC\n");
      break;
    }

    case Events::A32NX_FCU_ALT_SET: {
      simInputAutopilot.ALT_set = static_cast<long>(data0);
      std::printf("WASM: event triggered: A32NX_FCU_ALT_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::A32NX_FCU_ALT_INCREMENT_TOGGLE: {
      execute_calculator_code("(L:A32NX_FCU_ALT_INCREMENT_1000, bool) ! (>L:A32NX_FCU_ALT_INCREMENT_1000)", nullptr, nullptr, nullptr);
      std::printf("WASM: event triggered: A32NX_FCU_ALT_INCREMENT_TOGGLE\n");
      break;
    }

    case Events::A32NX_FCU_ALT_INCREMENT_SET: {
      long value = static_cast<long>(data0);
      if (value == 100 || value == 1000) {
        std::ostringstream stringStream;
        stringStream << (value == 1000 ? 1 : 0);
        stringStream << " (>L:A32NX_FCU_ALT_INCREMENT_1000)";
        execute_calculator_code(stringStream.str().c_str(), nullptr, nullptr, nullptr);
        std::printf("WASM: event triggered: A32NX_FCU_ALT_INCREMENT_SET: %ld\n", value);
      } else {
        std::printf("WASM: event triggered: A32NX_FCU_ALT_INCREMENT_SET with invalid value: %ld\n", value);
      }
      break;
    }

    case Events::A32NX_FCU_ALT_PUSH:
    case Events::AP_ALT_HOLD_ON: {
      fcuAfsPanelInputs.alt_knob.pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_ALT_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_ALT_PULL:
    case Events::AP_ALT_HOLD_OFF: {
      fcuAfsPanelInputs.alt_knob.pulled = true;
      std::printf("WASM: event triggered: A32NX_FCU_ALT_PULL\n");
      break;
    }

    case Events::A32NX_FCU_METRIC_ALT_TOGGLE_PUSH: {
      fcuAfsPanelInputs.metric_alt_button_pressed = true;
      std::printf("WASM: event triggered: A32NX_FCU_METRIC_ALT_TOGGLE_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_VS_INC: {
      fcuAfsPanelInputs.vs_fpa_knob.turns = 1;
      std::printf("WASM: event triggered: A32NX_FCU_VS_INC\n");
      break;
    }

    case Events::A32NX_FCU_VS_DEC: {
      fcuAfsPanelInputs.vs_fpa_knob.turns = -1;
      std::printf("WASM: event triggered: A32NX_FCU_VS_DEC\n");
      break;
    }

    case Events::A32NX_FCU_VS_SET: {
      simInputAutopilot.VS_FPA_set = static_cast<long>(data0);
      std::printf("WASM: event triggered: A32NX_FCU_VS_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::A32NX_FCU_VS_PUSH:
    case Events::AP_VS_ON: {
      fcuAfsPanelInputs.vs_fpa_knob.pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_VS_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_VS_PULL:
    case Events::AP_VS_OFF: {
      fcuAfsPanelInputs.vs_fpa_knob.pulled = true;
      std::printf("WASM: event triggered: A32NX_FCU_VS_PULL\n");
      break;
    }

    case Events::A32NX_FCU_LOC_PUSH: {
      fcuAfsPanelInputs.loc_button_pressed = true;
      std::printf("WASM: event triggered: A32NX_FCU_LOC_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_APPR_PUSH: {
      fcuAfsPanelInputs.appr_button_pressed = true;
      std::printf("WASM: event triggered: A32NX_FCU_APPR_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EXPED_PUSH:
    case Events::AP_ATT_HOLD: {
      fcuAfsPanelInputs.exped_button_pressed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EXPED_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_L_FD_PUSH: {
      fcuEfisPanelInputs[0].fd_button_pushed = true;
      if (idSyncFoEfisEnabled->get()) {
        fcuEfisPanelInputs[1].fd_button_pushed = true;
      }
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_FD_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_L_LS_PUSH: {
      fcuEfisPanelInputs[0].ls_button_pushed = true;
      if (idSyncFoEfisEnabled->get()) {
        fcuEfisPanelInputs[1].ls_button_pushed = true;
      }
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_LS_PUSH\n");
      break;
    }

    case Events::KOHLSMAN_INC: {
      // Match the MSFS behaviour here; 0 only sets altimeter 1
      const DWORD altimeterIndex = data0 == 0 ? 1 : data0;
      if (altimeterIndex == 1) {
        processEvent(A32NX_FCU_EFIS_L_BARO_INC, 0, 0);
      } else if (altimeterIndex == 2) {
        processEvent(A32NX_FCU_EFIS_R_BARO_INC, 0, 0);
      } else {
        sendEventEx1(KOHLSMAN_INC, SIMCONNECT_GROUP_PRIORITY_STANDARD, data0, data1);
      }
      std::printf("WASM: event triggered: KOHLSMAN_INC, index %ld\n", altimeterIndex);
      break;
    }
    case Events::A32NX_FCU_EFIS_L_BARO_INC: {
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_BARO_INC\n");
      fcuEfisPanelInputs[0].baro_knob.turns = 1;
      lastBaroInputWasRightSide = false;
      break;
    }

    case Events::KOHLSMAN_DEC: {
      // Match the MSFS behaviour here; 0 only sets altimeter 1
      const DWORD altimeterIndex = data0 == 0 ? 1 : data0;
      if (altimeterIndex == 1) {
        processEvent(A32NX_FCU_EFIS_L_BARO_DEC, 0, 0);
      } else if (altimeterIndex == 2) {
        processEvent(A32NX_FCU_EFIS_R_BARO_DEC, 0, 0);
      } else {
        sendEventEx1(KOHLSMAN_DEC, SIMCONNECT_GROUP_PRIORITY_STANDARD, data0, data1);
      }
      std::printf("WASM: event triggered: KOHLSMAN_DEC, index %ld\n", altimeterIndex);
      break;
    }
    case Events::A32NX_FCU_EFIS_L_BARO_DEC: {
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_BARO_DEC\n");
      fcuEfisPanelInputs[0].baro_knob.turns = -1;
      lastBaroInputWasRightSide = false;
      break;
    }

    case Events::KOHLSMAN_SET: {
      const DWORD kohlsmanValue = data0;
      const DWORD altimeterIndex = data1;
      if (altimeterIndex == 0 || altimeterIndex == 2) {
        processEvent(A32NX_FCU_EFIS_R_BARO_SET, kohlsmanValue, 0);
      }
      if (altimeterIndex == 0 || altimeterIndex == 1) {
        processEvent(A32NX_FCU_EFIS_L_BARO_SET, kohlsmanValue, 0);
      }
      if (altimeterIndex != 1 && altimeterIndex != 2) {
        sendEventEx1(KOHLSMAN_SET, SIMCONNECT_GROUP_PRIORITY_STANDARD, data0, data1);
      }
      std::printf("WASM: event triggered: KOHLSMAN_SET, index %ld value %ld\n", altimeterIndex, kohlsmanValue);
      break;
    }

    case Events::A32NX_FCU_EFIS_L_BARO_SET: {
      simInputAutopilot.baro_left_set = static_cast<long>(data0) / 16.;
      lastBaroInputWasRightSide = false;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_BARO_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::BAROMETRIC_STD_PRESSURE: {
      const DWORD altimeterIndex = data0;
      if (altimeterIndex == 0 || altimeterIndex == 1) {
        processEvent(A32NX_FCU_EFIS_L_BARO_PULL, 0, 0);
      }
      if (altimeterIndex == 0 || altimeterIndex == 2) {
        processEvent(A32NX_FCU_EFIS_R_BARO_PULL, 0, 0);
      }
      if (altimeterIndex != 1 && altimeterIndex != 2) {
        sendEvent(BAROMETRIC_STD_PRESSURE, 0, SIMCONNECT_GROUP_PRIORITY_STANDARD);
      }
      std::printf("WASM: event triggered: BAROMETRIC_STD_PRESSURE, index %ld\n", altimeterIndex);
      break;
    }

    case Events::A32NX_FCU_EFIS_L_BARO_PUSH: {
      fcuEfisPanelInputs[0].baro_knob.pushed = true;
      lastBaroInputWasRightSide = false;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_BARO_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_L_BARO_PULL: {
      fcuEfisPanelInputs[0].baro_knob.pulled = true;
      lastBaroInputWasRightSide = false;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_BARO_PULL\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_L_CSTR_PUSH: {
      fcuEfisPanelInputs[0].cstr_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_CSTR_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_L_WPT_PUSH: {
      fcuEfisPanelInputs[0].wpt_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_WPT_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_L_VORD_PUSH: {
      fcuEfisPanelInputs[0].vord_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_VORD_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_L_NDB_PUSH: {
      fcuEfisPanelInputs[0].ndb_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_NDB_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_L_ARPT_PUSH: {
      fcuEfisPanelInputs[0].arpt_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_L_ARPT_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_R_FD_PUSH: {
      fcuEfisPanelInputs[1].fd_button_pushed = true;
      if (idSyncFoEfisEnabled->get()) {
        fcuEfisPanelInputs[0].fd_button_pushed = true;
      }
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_FD_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_R_LS_PUSH: {
      fcuEfisPanelInputs[1].ls_button_pushed = true;
      if (idSyncFoEfisEnabled->get()) {
        fcuEfisPanelInputs[0].ls_button_pushed = true;
      }
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_LS_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_R_BARO_INC: {
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_BARO_INC\n");
      fcuEfisPanelInputs[1].baro_knob.turns = 1;
      lastBaroInputWasRightSide = true;
      break;
    }

    case Events::A32NX_FCU_EFIS_R_BARO_DEC: {
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_BARO_DEC\n");
      fcuEfisPanelInputs[1].baro_knob.turns = -1;
      lastBaroInputWasRightSide = true;
      break;
    }

    case Events::A32NX_FCU_EFIS_R_BARO_SET: {
      simInputAutopilot.baro_right_set = static_cast<long>(data0) / 16.;
      lastBaroInputWasRightSide = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_BARO_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::A32NX_FCU_EFIS_R_BARO_PUSH: {
      fcuEfisPanelInputs[1].baro_knob.pushed = true;
      lastBaroInputWasRightSide = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_BARO_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_R_BARO_PULL: {
      fcuEfisPanelInputs[1].baro_knob.pulled = true;
      lastBaroInputWasRightSide = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_BARO_PULL\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_R_CSTR_PUSH: {
      fcuEfisPanelInputs[1].cstr_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_CSTR_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_R_WPT_PUSH: {
      fcuEfisPanelInputs[1].wpt_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_WPT_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_R_VORD_PUSH: {
      fcuEfisPanelInputs[1].vord_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_VORD_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_R_NDB_PUSH: {
      fcuEfisPanelInputs[1].ndb_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_NDB_PUSH\n");
      break;
    }

    case Events::A32NX_FCU_EFIS_R_ARPT_PUSH: {
      fcuEfisPanelInputs[1].arpt_button_pushed = true;
      std::printf("WASM: event triggered: A32NX_FCU_EFIS_R_ARPT_PUSH\n");
      break;
    }

    case Events::A32NX_FMGC_DIR_TO_TRIGGER: {
      simInputAutopilot.DIR_TO_trigger = 1;
      std::printf("WASM: event triggered: A32NX_FMGC_DIR_TO_TRIGGER\n");
      break;
    }

    case Events::A32NX_FMGC_MACH_MODE_ACTIVATE: {
      simInputAutopilot.mach_mode_activate = 1;
      std::printf("WASM: event triggered: A32NX_FMGC_MACH_MODE_ACTIVATE\n");
      break;
    }

    case Events::A32NX_FMGC_SPD_MODE_ACTIVATE: {
      simInputAutopilot.spd_mode_activate = 1;
      std::printf("WASM: event triggered: A32NX_FMGC_SPD_MODE_ACTIVATE\n");
      break;
    }

    case Events::A32NX_FMGC_PRESET_SPD_ACTIVATE: {
      simInputAutopilot.preset_spd_activate = 1;
      std::printf("WASM: event triggered: A32NX_FMGC_PRESET_SPD_ACTIVATE\n");
      break;
    }

    case Events::A32NX_EFIS_L_CHRONO_PUSHED: {
      execute_calculator_code("(>H:A32NX_EFIS_L_CHRONO_PUSHED)", nullptr, nullptr, nullptr);
      std::printf("WASM: event triggered: A32NX_EFIS_L_CHRONO_PUSHED\n");
      break;
    }

    case Events::A32NX_EFIS_R_CHRONO_PUSHED: {
      execute_calculator_code("(>H:A32NX_EFIS_R_CHRONO_PUSHED)", nullptr, nullptr, nullptr);
      std::printf("WASM: event triggered: A32NX_EFIS_R_CHRONO_PUSHED\n");
      break;
    }

    case Events::AP_SPEED_SLOT_INDEX_SET: {
      // for the time being do not activate, it ends in a loop. more work has to be done to support this
      // if (static_cast<long>(event->data0) == 2) {
      //   execute_calculator_code("(>H:A320_Neo_FCU_SPEED_PUSH)", nullptr, nullptr, nullptr);
      // } else {
      //   execute_calculator_code("(>H:A320_Neo_FCU_SPEED_PULL)", nullptr, nullptr, nullptr);
      // }
      std::printf("WASM: event triggered: SPEED_SLOT_INDEX_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::AP_SPD_VAR_INC: {
      fcuAfsPanelInputs.spd_knob.turns = 1;
      std::printf("WASM: event triggered: AP_SPD_VAR_INC\n");
      break;
    }

    case Events::AP_SPD_VAR_DEC: {
      fcuAfsPanelInputs.spd_knob.turns = -1;
      std::printf("WASM: event triggered: AP_SPD_VAR_DEC\n");
      break;
    }

    case Events::AP_MACH_VAR_INC: {
      fcuAfsPanelInputs.spd_knob.turns = 1;
      std::printf("WASM: event triggered: AP_MACH_VAR_INC\n");
      break;
    }

    case Events::AP_MACH_VAR_DEC: {
      fcuAfsPanelInputs.spd_knob.turns = -1;
      std::printf("WASM: event triggered: AP_MACH_VAR_DEC\n");
      break;
    }

    case Events::AP_HEADING_SLOT_INDEX_SET: {
      // for the time being do not activate, it ends in a loop. more work has to be done to support this
      // if (static_cast<long>(event->data0) == 2) {
      //   execute_calculator_code("(>H:A320_Neo_FCU_VS_PUSH)", nullptr, nullptr, nullptr);
      // } else {
      //   execute_calculator_code("(>H:A320_Neo_FCU_VS_PULL)", nullptr, nullptr, nullptr);
      // }
      std::printf("WASM: event triggered: HEADING_SLOT_INDEX_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::HEADING_BUG_INC: {
      fcuAfsPanelInputs.hdg_trk_knob.turns = 1;
      std::printf("WASM: event triggered: HEADING_BUG_INC\n");
      break;
    }

    case Events::HEADING_BUG_DEC: {
      fcuAfsPanelInputs.hdg_trk_knob.turns = -1;
      std::printf("WASM: event triggered: HEADING_BUG_DEC\n");
      break;
    }

    case Events::AP_ALTITUDE_SLOT_INDEX_SET: {
      // for the time being do not activate, it ends in a loop. more work has to be done to support this
      // if (static_cast<long>(event->data0) == 2) {
      //   execute_calculator_code("(>H:A320_Neo_FCU_ALT_PUSH) (>H:A320_Neo_CDU_MODE_MANAGED_ALTITUDE)", nullptr, nullptr, nullptr);
      // } else {
      //   execute_calculator_code("(>H:A320_Neo_FCU_ALT_PULL) (>H:A320_Neo_CDU_MODE_SELECTED_ALTITUDE)", nullptr, nullptr, nullptr);
      // }
      std::printf("WASM: event triggered: ALTITUDE_SLOT_INDEX_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::AP_ALT_VAR_INC: {
      fcuAfsPanelInputs.alt_knob.turns = 1;
      std::printf("WASM: event triggered: AP_ALT_VAR_INC\n");
      break;
    }

    case Events::AP_ALT_VAR_DEC: {
      fcuAfsPanelInputs.alt_knob.turns = -1;
      std::printf("WASM: event triggered: AP_ALT_VAR_DEC\n");
      break;
    }

    case Events::AP_ALT_VAR_SET: {
      simInputAutopilot.ALT_set = static_cast<long>(data0);
      std::printf("WASM: event triggered: AP_ALT_VAR_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::AP_VS_SLOT_INDEX_SET: {
      // for the time being do not activate, it ends in a loop. more work has to be done to support this
      // if (static_cast<long>(event->data0) == 2) {
      //   execute_calculator_code("(>H:A320_Neo_FCU_VS_PUSH)", nullptr, nullptr, nullptr);
      // } else {
      //   execute_calculator_code("(>H:A320_Neo_FCU_VS_PULL)", nullptr, nullptr, nullptr);
      // }
      std::printf("WASM: event triggered: VS_SLOT_INDEX_SET: %ld\n", static_cast<long>(data0));
      break;
    }

    case Events::AP_VS_VAR_INC: {
      fcuAfsPanelInputs.vs_fpa_knob.turns = 1;
      std::printf("WASM: event triggered: AP_VS_VAR_INC\n");
      break;
    }

    case Events::AP_VS_VAR_DEC: {
      fcuAfsPanelInputs.vs_fpa_knob.turns = -1;
      std::printf("WASM: event triggered: AP_VS_VAR_DEC\n");
      break;
    }

    case Events::AP_APR_HOLD: {
      fcuAfsPanelInputs.appr_button_pressed = true;
      std::printf("WASM: event triggered: AP_APR_HOLD\n");
      break;
    }

    case Events::AP_LOC_HOLD: {
      fcuAfsPanelInputs.loc_button_pressed = true;
      std::printf("WASM: event triggered: AP_LOC_HOLD\n");
      break;
    }

    case Events::BAROMETRIC: {
      simInputAutopilot.baro_left_set = simData.seaLevelPressure;
      simInputAutopilot.baro_right_set = simData.seaLevelPressure;
      sendEvent(Events::BAROMETRIC, 0, SIMCONNECT_GROUP_PRIORITY_STANDARD);

      std::printf("WASM: event triggered: BAROMETRIC\n");
      break;
    }

    case Events::AUTO_THROTTLE_ARM: {
      simInputThrottles.ATHR_push = 1;
      std::printf("WASM: event triggered: AUTO_THROTTLE_ARM\n");
      break;
    }

    case Events::AUTO_THROTTLE_DISCONNECT: {
      simInputThrottles.ATHR_disconnect = 1;
      std::printf("WASM: event triggered: AUTO_THROTTLE_DISCONNECT\n");

      // Re emitting masked event
      sendEvent(Events::A32NX_AUTO_THROTTLE_DISCONNECT, 0, SIMCONNECT_GROUP_PRIORITY_STANDARD);
      break;
    }

    case Events::A32NX_ATHR_RESET_DISABLE: {
      simInputThrottles.ATHR_reset_disable = 1;
      std::printf("WASM: event triggered: ATHR_RESET_DISABLE\n");
      break;
    }

    case Events::AUTO_THROTTLE_TO_GA: {
      throttleAxis[0]->onEventThrottleFull();
      throttleAxis[1]->onEventThrottleFull();
      std::printf("WASM: event triggered: AUTO_THROTTLE_TO_GA (treated like THROTTLE_FULL)\n");
      break;
    }

    case Events::A32NX_THROTTLE_MAPPING_SET_DEFAULTS: {
      std::printf("WASM: event triggered: THROTTLE_MAPPING_SET_DEFAULTS\n");
      throttleAxis[0]->applyDefaults();
      throttleAxis[1]->applyDefaults();
      break;
    }

    case Events::A32NX_THROTTLE_MAPPING_LOAD_FROM_FILE: {
      std::printf("WASM: event triggered: THROTTLE_MAPPING_LOAD_FROM_FILE\n");
      throttleAxis[0]->loadFromFile();
      throttleAxis[1]->loadFromFile();
      break;
    }

    case Events::A32NX_THROTTLE_MAPPING_LOAD_FROM_LOCAL_VARIABLES: {
      std::printf("WASM: event triggered: THROTTLE_MAPPING_LOAD_FROM_LOCAL_VARIABLES\n");
      throttleAxis[0]->loadFromLocalVariables();
      throttleAxis[1]->loadFromLocalVariables();
      break;
    }

    case Events::A32NX_THROTTLE_MAPPING_SAVE_TO_FILE: {
      std::printf("WASM: event triggered: THROTTLE_MAPPING_SAVE_TO_FILE\n");
      throttleAxis[0]->saveToFile();
      throttleAxis[1]->saveToFile();
      break;
    }

    case Events::THROTTLE_SET: {
      throttleAxis[0]->onEventThrottleSet(static_cast<long>(data0));
      throttleAxis[1]->onEventThrottleSet(static_cast<long>(data0));
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_SET: %ld\n", static_cast<long>(data0));
      }
      break;
    }

    case Events::THROTTLE1_SET: {
      throttleAxis[0]->onEventThrottleSet(static_cast<long>(data0));
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE1_SET: %ld\n", static_cast<long>(data0));
      }
      break;
    }

    case Events::THROTTLE2_SET: {
      throttleAxis[1]->onEventThrottleSet(static_cast<long>(data0));
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE2_SET: %ld\n", static_cast<long>(data0));
      }
      break;
    }

    case Events::THROTTLE_AXIS_SET_EX1: {
      throttleAxis[0]->onEventThrottleSet(static_cast<long>(data0));
      throttleAxis[1]->onEventThrottleSet(static_cast<long>(data0));
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_AXIS_SET_EX1: %ld\n", static_cast<long>(data0));
      }
      break;
    }

    case Events::THROTTLE1_AXIS_SET_EX1: {
      throttleAxis[0]->onEventThrottleSet(static_cast<long>(data0));
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE1_AXIS_SET_EX1: %ld\n", static_cast<long>(data0));
      }
      break;
    }

    case Events::THROTTLE2_AXIS_SET_EX1: {
      throttleAxis[1]->onEventThrottleSet(static_cast<long>(data0));
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE2_AXIS_SET_EX1: %ld\n", static_cast<long>(data0));
      }
      break;
    }

    case Events::THROTTLE_FULL: {
      throttleAxis[0]->onEventThrottleFull();
      throttleAxis[1]->onEventThrottleFull();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_FULL\n");
      }
      break;
    }

    case Events::THROTTLE_CUT: {
      throttleAxis[0]->onEventThrottleCut();
      throttleAxis[1]->onEventThrottleCut();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_CUT\n");
      }
      break;
    }

    case Events::THROTTLE_INCR: {
      throttleAxis[0]->onEventThrottleIncrease();
      throttleAxis[1]->onEventThrottleIncrease();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_INCR\n");
      }
      break;
    }

    case Events::THROTTLE_DECR: {
      throttleAxis[0]->onEventThrottleDecrease();
      throttleAxis[1]->onEventThrottleDecrease();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_DECR\n");
      }
      break;
    }

    case Events::THROTTLE_INCR_SMALL: {
      throttleAxis[0]->onEventThrottleIncreaseSmall();
      throttleAxis[1]->onEventThrottleIncreaseSmall();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_INCR_SMALL\n");
      }
      break;
    }

    case Events::THROTTLE_DECR_SMALL: {
      throttleAxis[0]->onEventThrottleDecreaseSmall();
      throttleAxis[1]->onEventThrottleDecreaseSmall();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_DECR_SMALL\n");
      }
      break;
    }

    case Events::THROTTLE_10: {
      throttleAxis[0]->onEventThrottleSet_10();
      throttleAxis[1]->onEventThrottleSet_10();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_10\n");
      }
      break;
    }

    case Events::THROTTLE_20: {
      throttleAxis[0]->onEventThrottleSet_20();
      throttleAxis[1]->onEventThrottleSet_20();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_20\n");
      }
      break;
    }

    case Events::THROTTLE_30: {
      throttleAxis[0]->onEventThrottleSet_30();
      throttleAxis[1]->onEventThrottleSet_30();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_30\n");
      }
      break;
    }

    case Events::THROTTLE_40: {
      throttleAxis[0]->onEventThrottleSet_40();
      throttleAxis[1]->onEventThrottleSet_40();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_40\n");
      }
      break;
    }

    case Events::THROTTLE_50: {
      throttleAxis[0]->onEventThrottleSet_50();
      throttleAxis[1]->onEventThrottleSet_50();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_50\n");
      }
      break;
    }

    case Events::THROTTLE_60: {
      throttleAxis[0]->onEventThrottleSet_60();
      throttleAxis[1]->onEventThrottleSet_60();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_60\n");
      }
      break;
    }

    case Events::THROTTLE_70: {
      throttleAxis[0]->onEventThrottleSet_70();
      throttleAxis[1]->onEventThrottleSet_70();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_70\n");
      }
      break;
    }

    case Events::THROTTLE_80: {
      throttleAxis[0]->onEventThrottleSet_80();
      throttleAxis[1]->onEventThrottleSet_80();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_80\n");
      }
      break;
    }

    case Events::THROTTLE_90: {
      throttleAxis[0]->onEventThrottleSet_90();
      throttleAxis[1]->onEventThrottleSet_90();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_90\n");
      }
      break;
    }

    case Events::THROTTLE1_FULL: {
      throttleAxis[0]->onEventThrottleFull();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE1_FULL\n");
      }
      break;
    }

    case Events::THROTTLE1_CUT: {
      throttleAxis[0]->onEventThrottleCut();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE1_CUT\n");
      }
      break;
    }

    case Events::THROTTLE1_INCR: {
      throttleAxis[0]->onEventThrottleIncrease();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE1_INCR\n");
      }
      break;
    }

    case Events::THROTTLE1_DECR: {
      throttleAxis[0]->onEventThrottleDecrease();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE1_DECR\n");
      }
      break;
    }

    case Events::THROTTLE1_INCR_SMALL: {
      throttleAxis[0]->onEventThrottleIncreaseSmall();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE1_INCR_SMALL\n");
      }
      break;
    }

    case Events::THROTTLE1_DECR_SMALL: {
      throttleAxis[0]->onEventThrottleDecreaseSmall();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE1_DECR_SMALL\n");
      }
      break;
    }

    case Events::THROTTLE2_FULL: {
      throttleAxis[1]->onEventThrottleFull();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE2_FULL\n");
      }
      break;
    }

    case Events::THROTTLE2_CUT: {
      throttleAxis[1]->onEventThrottleCut();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE2_CUT\n");
      }
      break;
    }

    case Events::THROTTLE2_INCR: {
      throttleAxis[1]->onEventThrottleIncrease();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE2_INCR\n");
      }
      break;
    }

    case Events::THROTTLE2_DECR: {
      throttleAxis[1]->onEventThrottleDecrease();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE2_DECR\n");
      }
      break;
    }

    case Events::THROTTLE2_INCR_SMALL: {
      throttleAxis[1]->onEventThrottleIncreaseSmall();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE2_INCR_SMALL\n");
      }
      break;
    }

    case Events::THROTTLE2_DECR_SMALL: {
      throttleAxis[1]->onEventThrottleDecreaseSmall();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE2_DECR_SMALL\n");
      }
      break;
    }

    case Events::THROTTLE_REVERSE_THRUST_TOGGLE: {
      throttleAxis[0]->onEventReverseToggle();
      throttleAxis[1]->onEventReverseToggle();
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_REVERSE_THRUST_TOGGLE\n");
      }
      break;
    }
    case Events::THROTTLE_REVERSE_THRUST_HOLD: {
      throttleAxis[0]->onEventReverseHold(static_cast<bool>(data0));
      throttleAxis[1]->onEventReverseHold(static_cast<bool>(data0));
      if (loggingThrottlesEnabled) {
        std::printf("WASM: THROTTLE_REVERSE_THRUST_HOLD: %ld\n", static_cast<long>(data0));
      }
      break;
    }

    case Events::SPOILERS_ON: {
      spoilersHandler->onEventSpoilersOn();
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: SPOILERS_ON: (no data) -> %g / %d\n", spoilersHandler->getHandlePosition(), spoilersHandler->getIsArmed());
      }
      break;
    }

    case Events::SPOILERS_OFF: {
      spoilersHandler->onEventSpoilersOff();
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: SPOILERS_OFF: (no data) -> %g / %d\n", spoilersHandler->getHandlePosition(), spoilersHandler->getIsArmed());
      }
      break;
    }

    case Events::SPOILERS_TOGGLE: {
      spoilersHandler->onEventSpoilersToggle();
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: SPOILERS_TOGGLE: (no data) -> %g / %d\n", spoilersHandler->getHandlePosition(), spoilersHandler->getIsArmed());
      }
      break;
    }

    case Events::SPOILERS_SET: {
      spoilersHandler->onEventSpoilersSet(static_cast<long>(data0));
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: SPOILERS_SET: %ld -> %g / %d\n", static_cast<long>(data0), spoilersHandler->getHandlePosition(),
                    spoilersHandler->getIsArmed());
      }
      break;
    }

    case Events::AXIS_SPOILER_SET: {
      spoilersHandler->onEventSpoilersAxisSet(static_cast<long>(data0));
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: AXIS_SPOILER_SET: %ld -> %g / %d\n", static_cast<long>(data0), spoilersHandler->getHandlePosition(),
                    spoilersHandler->getIsArmed());
      }
      break;
    }

    case Events::SPOILERS_ARM_ON: {
      spoilersHandler->onEventSpoilersArmOn();
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: SPOILERS_ARM_ON: (no data) -> %g / %d\n", spoilersHandler->getHandlePosition(), spoilersHandler->getIsArmed());
      }
      break;
    }

    case Events::SPOILERS_ARM_OFF: {
      spoilersHandler->onEventSpoilersArmOff();
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: SPOILERS_ARM_OFF: (no data) -> %g / %d\n", spoilersHandler->getHandlePosition(), spoilersHandler->getIsArmed());
      }
      break;
    }

    case Events::SPOILERS_ARM_TOGGLE: {
      spoilersHandler->onEventSpoilersArmToggle();
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: SPOILERS_ARM_TOGGLE: (no data) -> %g / %d\n", spoilersHandler->getHandlePosition(),
                    spoilersHandler->getIsArmed());
      }
      break;
    }

    case Events::SPOILERS_ARM_SET: {
      spoilersHandler->onEventSpoilersArmSet(static_cast<long>(data0) == 1);
      if (loggingFlightControlsEnabled) {
        std::printf("WASM: SPOILERS_ARM_SET: %ld -> %g / %d\n", static_cast<long>(data0), spoilersHandler->getHandlePosition(),
                    spoilersHandler->getIsArmed());
      }
      break;
    }

    case Events::SIM_RATE_INCR: {
      // calculate frame rate that will be seen by FBW / AP
      double theoreticalFrameRate = (1 / sampleTime) / (simData.simulation_rate * 2);
      // determine if an increase of simulation rate can be allowed
      if ((simData.simulation_rate < maxSimulationRate && theoreticalFrameRate >= 5) || simData.simulation_rate < 1 ||
          !limitSimulationRateByPerformance) {
        sendEvent(SIM_RATE_INCR, 0, SIMCONNECT_GROUP_PRIORITY_DEFAULT);
        std::printf("WASM: Simulation rate %g -> %g (theoretical fps %g)\n", simData.simulation_rate, simData.simulation_rate * 2,
                    theoreticalFrameRate);
      } else {
        std::printf("WASM: Simulation rate %g -> %g (limited by max sim rate or theoretical fps %g)\n", simData.simulation_rate,
                    simData.simulation_rate, theoreticalFrameRate);
      }
      break;
    }

    case Events::SIM_RATE_DECR: {
      if (simData.simulation_rate > minSimulationRate) {
        sendEvent(SIM_RATE_DECR, 0, SIMCONNECT_GROUP_PRIORITY_DEFAULT);
        std::printf("WASM: Simulation rate %g -> %g\n", simData.simulation_rate, simData.simulation_rate / 2);
      } else {
        std::printf("WASM: Simulation rate %g -> %g (limited by min sim rate)\n", simData.simulation_rate, simData.simulation_rate);
      }
      break;
    }

    case Events::SIM_RATE_SET: {
      long targetSimulationRate = std::min(static_cast<long>(maxSimulationRate), std::max(1l, static_cast<long>(data0)));
      sendEvent(SIM_RATE_SET, targetSimulationRate, SIMCONNECT_GROUP_PRIORITY_DEFAULT);
      std::printf("WASM: Simulation Rate set to %ld\n", targetSimulationRate);
      break;
    }

    default:
      break;
  }
}

