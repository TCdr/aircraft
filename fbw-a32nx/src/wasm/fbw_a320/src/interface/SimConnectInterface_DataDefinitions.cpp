#include "SimConnectInterface.h"
#include <cmath>
#include <map>
#include <vector>

// SimConnect data-definition and client-event registration (one-time setup at connect()).

bool SimConnectInterface::prepareSimDataSimConnectDataDefinitions() {
  bool result = true;

  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "G FORCE", "GFORCE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "PLANE PITCH DEGREES", "DEGREE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "PLANE BANK DEGREES", "DEGREE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_XYZ, "STRUCT BODY ROTATION VELOCITY", "STRUCT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_XYZ, "STRUCT BODY ROTATION ACCELERATION", "STRUCT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "ACCELERATION BODY Z", "METER PER SECOND SQUARED");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "ACCELERATION BODY X", "METER PER SECOND SQUARED");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "ACCELERATION BODY Y", "METER PER SECOND SQUARED");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "PLANE HEADING DEGREES MAGNETIC", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "PLANE HEADING DEGREES TRUE", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GPS GROUND MAGNETIC TRACK", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "ELEVATOR POSITION", "POSITION");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "ELEVATOR TRIM POSITION", "DEGREE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AILERON POSITION", "POSITION");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "RUDDER POSITION", "POSITION");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "RUDDER TRIM PCT", "PERCENT OVER 100");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "INCIDENCE ALPHA", "DEGREE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "INCIDENCE BETA", "DEGREE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "BETA DOT", "DEGREE PER SECOND");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AIRSPEED INDICATED", "KNOTS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AIRSPEED TRUE", "KNOTS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AIRSPEED MACH", "MACH");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GROUND VELOCITY", "KNOTS");
  // workaround for altitude issues due to MSFS bug, needs to be changed to PRESSURE ALTITUDE again when solved
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "INDICATED ALTITUDE:4", "FEET");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "INDICATED ALTITUDE", "FEET");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "PLANE ALT ABOVE GROUND MINUS CG", "FEET");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "VELOCITY WORLD Y", "FEET PER MINUTE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "CG PERCENT", "PERCENT OVER 100");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TOTAL WEIGHT", "KILOGRAMS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GEAR ANIMATION POSITION:0", "NUMBER");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GEAR ANIMATION POSITION:1", "NUMBER");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GEAR ANIMATION POSITION:2", "NUMBER");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "SPOILERS HANDLE POSITION", "POSITION");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "SPOILERS LEFT POSITION", "PERCENT OVER 100");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "SPOILERS RIGHT POSITION", "PERCENT OVER 100");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "IS SLEW ACTIVE", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "AUTOPILOT MASTER", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "AUTOPILOT FLIGHT DIRECTOR ACTIVE:1", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "AUTOPILOT FLIGHT DIRECTOR ACTIVE:2", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AUTOPILOT AIRSPEED HOLD VAR", "KNOTS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AUTOPILOT ALTITUDE LOCK VAR:3", "FEET");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "SIMULATION TIME", "NUMBER");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "SIMULATION RATE", "NUMBER");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "STRUCTURAL ICE PCT", "PERCENT OVER 100");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "LINEAR CL ALPHA", "PER DEGREE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "STALL ALPHA", "DEGREE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "ZERO LIFT ALPHA", "DEGREE");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AMBIENT DENSITY", "KILOGRAM PER CUBIC METER");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AMBIENT PRESSURE", "MILLIBARS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AMBIENT TEMPERATURE", "CELSIUS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AMBIENT WIND X", "KNOTS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AMBIENT WIND Y", "KNOTS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AMBIENT WIND Z", "KNOTS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AMBIENT WIND VELOCITY", "KNOTS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "AMBIENT WIND DIRECTION", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TOTAL AIR TEMPERATURE", "CELSIUS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "PLANE LATITUDE", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "PLANE LONGITUDE", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG THROTTLE LEVER POSITION:1", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG THROTTLE LEVER POSITION:2", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG JET THRUST:1", "POUNDS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG JET THRUST:2", "POUNDS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "NAV HAS NAV:3", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "NAV LOCALIZER:3", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "NAV RAW GLIDE SLOPE:3", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "NAV HAS DME:3", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "NAV DME:3", "NAUTICAL MILES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "NAV HAS LOCALIZER:3", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "NAV RADIAL ERROR:3", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "NAV HAS GLIDE SLOPE:3", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "NAV GLIDE SLOPE ERROR:3", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "AUTOTHROTTLE ACTIVE", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG CORRECTED N1:1", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG CORRECTED N1:2", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "GPS IS ACTIVE FLIGHT PLAN", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GPS WP CROSS TRK", "NAUTICAL MILES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GPS WP TRACK ANGLE ERROR", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GPS COURSE TO STEER", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG COMMANDED N1:1", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG COMMANDED N1:2", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG N1:1", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG N1:2", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG CORRECTED N1:1", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "TURB ENG CORRECTED N1:2", "PERCENT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG OIL TEMPERATURE:1", "CELSIUS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG OIL TEMPERATURE:2", "CELSIUS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG OIL PRESSURE:1", "PSI");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG OIL PRESSURE:2", "PSI");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "ENG COMBUSTION:1", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "ENG COMBUSTION:2", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "AUTOPILOT MANAGED SPEED IN MACH", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "AUTOPILOT SPEED SLOT INDEX", "NUMBER");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "ENG ANTI ICE:1", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "ENG ANTI ICE:2", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "SIM ON GROUND", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "KOHLSMAN SETTING MB:1", "MBAR");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "KOHLSMAN SETTING MB:2", "MBAR");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "KOHLSMAN SETTING STD:4", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "CAMERA STATE", "NUMBER");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "PLANE ALTITUDE", "METERS");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "NAV MAGVAR:3", "DEGREES");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_LATLONALT, "NAV VOR LATLONALT:3", "STRUCT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_LATLONALT, "NAV GS LATLONALT:3", "STRUCT");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "BRAKE LEFT POSITION", "POSITION");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "BRAKE RIGHT POSITION", "POSITION");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "FLAPS HANDLE INDEX", "NUMBER");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "GEAR HANDLE POSITION", "POSITION");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "ASSISTANCE TAKEOFF ENABLED", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "ASSISTANCE LANDING ENABLED", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "AI AUTOTRIM ACTIVE", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_INT64, "AI CONTROLS", "BOOL");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "WHEEL RPM:1", "RPM");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "WHEEL RPM:2", "RPM");
  result &= addDataDefinition(hSimConnect, 0, SIMCONNECT_DATATYPE_FLOAT64, "SEA LEVEL PRESSURE", "MBAR");

  // FIXME use MMR2 (NAV4) as well

  return result;
}

bool SimConnectInterface::prepareSimInputSimConnectDataDefinitions() {
  bool result = true;

  result &= addInputDataDefinition(hSimConnect, 0, Events::AXIS_ELEVATOR_SET, "AXIS_ELEVATOR_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AXIS_AILERONS_SET, "AXIS_AILERONS_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AXIS_RUDDER_SET, "AXIS_RUDDER_SET", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_SET, "RUDDER_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_LEFT, "RUDDER_LEFT", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_AXIS_PLUS, "RUDDER_AXIS_PLUS", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_CENTER, "RUDDER_CENTER", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_RIGHT, "RUDDER_RIGHT", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_AXIS_MINUS, "RUDDER_AXIS_MINUS", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_TRIM_LEFT, "RUDDER_TRIM_LEFT", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_TRIM_RESET, "RUDDER_TRIM_RESET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_TRIM_RIGHT, "RUDDER_TRIM_RIGHT", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_TRIM_SET, "RUDDER_TRIM_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::RUDDER_TRIM_SET_EX1, "RUDDER_TRIM_SET_EX1", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::AILERON_SET, "AILERON_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AILERONS_LEFT, "AILERONS_LEFT", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AILERONS_RIGHT, "AILERONS_RIGHT", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::CENTER_AILER_RUDDER, "CENTER_AILER_RUDDER", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::ELEVATOR_SET, "ELEVATOR_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::ELEV_DOWN, "ELEV_DOWN", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::ELEV_UP, "ELEV_UP", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_MASTER, "AP_MASTER", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AUTOPILOT_OFF, "AUTOPILOT_OFF", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AUTOPILOT_ON, "AUTOPILOT_ON", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AUTOPILOT_DISENGAGE_SET, "AUTOPILOT_DISENGAGE_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AUTOPILOT_DISENGAGE_TOGGLE, "AUTOPILOT_DISENGAGE_TOGGLE", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::TOGGLE_FLIGHT_DIRECTOR, "TOGGLE_FLIGHT_DIRECTOR", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_AUTOPILOT_DISENGAGE, "A32NX.AUTOPILOT_DISENGAGE", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_AP_1_PUSH, "A32NX.FCU_AP_1_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_AP_2_PUSH, "A32NX.FCU_AP_2_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_AP_DISCONNECT_PUSH, "A32NX.FCU_AP_DISCONNECT_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_ATHR_PUSH, "A32NX.FCU_ATHR_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_ATHR_DISCONNECT_PUSH, "A32NX.FCU_ATHR_DISCONNECT_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_SPD_INC, "A32NX.FCU_SPD_INC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_SPD_DEC, "A32NX.FCU_SPD_DEC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_SPD_SET, "A32NX.FCU_SPD_SET", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_SPD_PUSH, "A32NX.FCU_SPD_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_SPD_PULL, "A32NX.FCU_SPD_PULL", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_SPD_MACH_TOGGLE_PUSH, "A32NX.FCU_SPD_MACH_TOGGLE_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_HDG_INC, "A32NX.FCU_HDG_INC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_HDG_DEC, "A32NX.FCU_HDG_DEC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_HDG_SET, "A32NX.FCU_HDG_SET", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_HDG_PUSH, "A32NX.FCU_HDG_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_HDG_PULL, "A32NX.FCU_HDG_PULL", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_TRK_FPA_TOGGLE_PUSH, "A32NX.FCU_TRK_FPA_TOGGLE_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_ALT_INC, "A32NX.FCU_ALT_INC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_ALT_DEC, "A32NX.FCU_ALT_DEC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_ALT_SET, "A32NX.FCU_ALT_SET", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_ALT_INCREMENT_TOGGLE, "A32NX.FCU_ALT_INCREMENT_TOGGLE", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_ALT_INCREMENT_SET, "A32NX.FCU_ALT_INCREMENT_SET", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_ALT_PUSH, "A32NX.FCU_ALT_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_ALT_PULL, "A32NX.FCU_ALT_PULL", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_METRIC_ALT_TOGGLE_PUSH, "A32NX.FCU_METRIC_ALT_TOGGLE_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_VS_INC, "A32NX.FCU_VS_INC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_VS_DEC, "A32NX.FCU_VS_DEC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_VS_SET, "A32NX.FCU_VS_SET", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_VS_PUSH, "A32NX.FCU_VS_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_VS_PULL, "A32NX.FCU_VS_PULL", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_LOC_PUSH, "A32NX.FCU_LOC_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_APPR_PUSH, "A32NX.FCU_APPR_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EXPED_PUSH, "A32NX.FCU_EXPED_PUSH", false);

  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_FD_PUSH, "A32NX.FCU_EFIS_L_FD_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_LS_PUSH, "A32NX.FCU_EFIS_L_LS_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_BARO_INC, "A32NX.FCU_EFIS_L_BARO_INC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_BARO_DEC, "A32NX.FCU_EFIS_L_BARO_DEC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_BARO_SET, "A32NX.FCU_EFIS_L_BARO_SET", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_BARO_PUSH, "A32NX.FCU_EFIS_L_BARO_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_BARO_PULL, "A32NX.FCU_EFIS_L_BARO_PULL", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_CSTR_PUSH, "A32NX.FCU_EFIS_L_CSTR_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_WPT_PUSH, "A32NX.FCU_EFIS_L_WPT_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_VORD_PUSH, "A32NX.FCU_EFIS_L_VORD_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_NDB_PUSH, "A32NX.FCU_EFIS_L_NDB_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_L_ARPT_PUSH, "A32NX.FCU_EFIS_L_ARPT_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_FD_PUSH, "A32NX.FCU_EFIS_R_FD_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_LS_PUSH, "A32NX.FCU_EFIS_R_LS_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_BARO_INC, "A32NX.FCU_EFIS_R_BARO_INC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_BARO_DEC, "A32NX.FCU_EFIS_R_BARO_DEC", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_BARO_SET, "A32NX.FCU_EFIS_R_BARO_SET", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_BARO_PUSH, "A32NX.FCU_EFIS_R_BARO_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_BARO_PULL, "A32NX.FCU_EFIS_R_BARO_PULL", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_CSTR_PUSH, "A32NX.FCU_EFIS_R_CSTR_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_WPT_PUSH, "A32NX.FCU_EFIS_R_WPT_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_VORD_PUSH, "A32NX.FCU_EFIS_R_VORD_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_NDB_PUSH, "A32NX.FCU_EFIS_R_NDB_PUSH", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FCU_EFIS_R_ARPT_PUSH, "A32NX.FCU_EFIS_R_ARPT_PUSH", false);

  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FMGC_DIR_TO_TRIGGER, "A32NX.FMGC_DIR_TO_TRIGGER", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FMGC_MACH_MODE_ACTIVATE, "AP_MANAGED_SPEED_IN_MACH_ON", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FMGC_SPD_MODE_ACTIVATE, "AP_MANAGED_SPEED_IN_MACH_OFF", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_FMGC_PRESET_SPD_ACTIVATE, "A32NX.FMS_PRESET_SPD_ACTIVATE", false);

  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_EFIS_L_CHRONO_PUSHED, "A32NX.EFIS_L_CHRONO_PUSHED", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_EFIS_R_CHRONO_PUSHED, "A32NX.EFIS_R_CHRONO_PUSHED", false);

  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_SPEED_SLOT_INDEX_SET, "SPEED_SLOT_INDEX_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_SPD_VAR_INC, "AP_SPD_VAR_INC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_SPD_VAR_DEC, "AP_SPD_VAR_DEC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_SPD_VAR_SET, "AP_SPD_VAR_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_MACH_VAR_INC, "AP_MACH_VAR_INC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_MACH_VAR_DEC, "AP_MACH_VAR_DEC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_HEADING_SLOT_INDEX_SET, "HEADING_SLOT_INDEX_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::HEADING_BUG_INC, "HEADING_BUG_INC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::HEADING_BUG_DEC, "HEADING_BUG_DEC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::HEADING_BUG_SET, "HEADING_BUG_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_ALTITUDE_SLOT_INDEX_SET, "ALTITUDE_SLOT_INDEX_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_ALT_VAR_INC, "AP_ALT_VAR_INC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_ALT_VAR_DEC, "AP_ALT_VAR_DEC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_ALT_VAR_SET, "AP_ALT_VAR_SET_ENGLISH", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_VS_SLOT_INDEX_SET, "VS_SLOT_INDEX_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_VS_VAR_INC, "AP_VS_VAR_INC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_VS_VAR_DEC, "AP_VS_VAR_DEC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_APR_HOLD, "AP_APR_HOLD", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_LOC_HOLD, "AP_LOC_HOLD", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_AIRSPEED_ON, "AP_AIRSPEED_ON", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_AIRSPEED_OFF, "AP_AIRSPEED_OFF", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_HDG_HOLD_ON, "AP_HDG_HOLD_ON", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_HDG_HOLD_OFF, "AP_HDG_HOLD_OFF", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_ALT_HOLD_ON, "AP_ALT_HOLD_ON", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_ALT_HOLD_OFF, "AP_ALT_HOLD_OFF", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_VS_ON, "AP_VS_ON", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_VS_OFF, "AP_VS_OFF", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_ALT_HOLD, "AP_ALT_HOLD", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_VS_HOLD, "AP_VS_HOLD", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_ATT_HOLD, "AP_ATT_HOLD", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AP_MACH_HOLD, "AP_MACH_HOLD", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::KOHLSMAN_SET, "KOHLSMAN_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::KOHLSMAN_INC, "KOHLSMAN_INC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::KOHLSMAN_DEC, "KOHLSMAN_DEC", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::BAROMETRIC_STD_PRESSURE, "BAROMETRIC_STD_PRESSURE", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::BAROMETRIC, "BAROMETRIC", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::AUTO_THROTTLE_ARM, "AUTO_THROTTLE_ARM", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AUTO_THROTTLE_DISCONNECT, "AUTO_THROTTLE_DISCONNECT", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_AUTO_THROTTLE_DISCONNECT, "A32NX.AUTO_THROTTLE_DISCONNECT", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AUTO_THROTTLE_TO_GA, "AUTO_THROTTLE_TO_GA", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_ATHR_RESET_DISABLE, "A32NX.ATHR_RESET_DISABLE", false);

  result &=
      addInputDataDefinition(hSimConnect, 0, Events::A32NX_THROTTLE_MAPPING_SET_DEFAULTS, "A32NX.THROTTLE_MAPPING_SET_DEFAULTS", false);
  result &=
      addInputDataDefinition(hSimConnect, 0, Events::A32NX_THROTTLE_MAPPING_LOAD_FROM_FILE, "A32NX.THROTTLE_MAPPING_LOAD_FROM_FILE", false);
  result &= addInputDataDefinition(hSimConnect, 0, Events::A32NX_THROTTLE_MAPPING_LOAD_FROM_LOCAL_VARIABLES,
                                   "A32NX.THROTTLE_MAPPING_LOAD_FROM_LOCAL_VARIABLES", false);
  result &=
      addInputDataDefinition(hSimConnect, 0, Events::A32NX_THROTTLE_MAPPING_SAVE_TO_FILE, "A32NX.THROTTLE_MAPPING_SAVE_TO_FILE", false);

  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_SET, "THROTTLE_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE1_SET, "THROTTLE1_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE2_SET, "THROTTLE2_SET", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_AXIS_SET_EX1, "THROTTLE_AXIS_SET_EX1", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE1_AXIS_SET_EX1, "THROTTLE1_AXIS_SET_EX1", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE2_AXIS_SET_EX1, "THROTTLE2_AXIS_SET_EX1", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_FULL, "THROTTLE_FULL", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_CUT, "THROTTLE_CUT", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_INCR, "THROTTLE_INCR", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_DECR, "THROTTLE_DECR", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_INCR_SMALL, "THROTTLE_INCR_SMALL", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_DECR_SMALL, "THROTTLE_DECR_SMALL", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_10, "THROTTLE_10", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_20, "THROTTLE_20", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_30, "THROTTLE_30", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_40, "THROTTLE_40", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_50, "THROTTLE_50", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_60, "THROTTLE_60", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_70, "THROTTLE_70", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_80, "THROTTLE_80", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_90, "THROTTLE_90", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE1_FULL, "THROTTLE1_FULL", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE1_CUT, "THROTTLE1_CUT", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE1_INCR, "THROTTLE1_INCR", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE1_DECR, "THROTTLE1_DECR", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE1_INCR_SMALL, "THROTTLE1_INCR_SMALL", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE1_DECR_SMALL, "THROTTLE1_DECR_SMALL", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE2_FULL, "THROTTLE2_FULL", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE2_CUT, "THROTTLE2_CUT", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE2_INCR, "THROTTLE2_INCR", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE2_DECR, "THROTTLE2_DECR", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE2_INCR_SMALL, "THROTTLE2_INCR_SMALL", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE2_DECR_SMALL, "THROTTLE2_DECR_SMALL", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_REVERSE_THRUST_TOGGLE, "THROTTLE_REVERSE_THRUST_TOGGLE", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::THROTTLE_REVERSE_THRUST_HOLD, "THROTTLE_REVERSE_THRUST_HOLD", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::SPOILERS_ON, "SPOILERS_ON", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::SPOILERS_OFF, "SPOILERS_OFF", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::SPOILERS_TOGGLE, "SPOILERS_TOGGLE", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::SPOILERS_SET, "SPOILERS_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::AXIS_SPOILER_SET, "AXIS_SPOILER_SET", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::SPOILERS_ARM_ON, "SPOILERS_ARM_ON", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::SPOILERS_ARM_OFF, "SPOILERS_ARM_OFF", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::SPOILERS_ARM_TOGGLE, "SPOILERS_ARM_TOGGLE", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::SPOILERS_ARM_SET, "SPOILERS_ARM_SET", true);

  result &= addInputDataDefinition(hSimConnect, 0, Events::SIM_RATE_INCR, "SIM_RATE_INCR", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::SIM_RATE_DECR, "SIM_RATE_DECR", true);
  result &= addInputDataDefinition(hSimConnect, 0, Events::SIM_RATE_SET, "SIM_RATE_SET", true);

  return result;
}

bool SimConnectInterface::prepareSimOutputSimConnectDataDefinitions() {
  bool result = true;

  result &= addDataDefinition(hSimConnect, 2, SIMCONNECT_DATATYPE_FLOAT64, "ELEVATOR TRIM POSITION", "DEGREE");

  result &= addDataDefinition(hSimConnect, 3, SIMCONNECT_DATATYPE_FLOAT64, "RUDDER TRIM PCT", "PERCENT OVER 100");

  result &= addDataDefinition(hSimConnect, 4, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG THROTTLE LEVER POSITION:1", "PERCENT");
  result &= addDataDefinition(hSimConnect, 4, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG THROTTLE LEVER POSITION:2", "PERCENT");
  result &= addDataDefinition(hSimConnect, 4, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG THROTTLE MANAGED MODE:1", "NUMBER");
  result &= addDataDefinition(hSimConnect, 4, SIMCONNECT_DATATYPE_FLOAT64, "GENERAL ENG THROTTLE MANAGED MODE:2", "NUMBER");

  result &= addDataDefinition(hSimConnect, 6, SIMCONNECT_DATATYPE_FLOAT64, "SPOILERS HANDLE POSITION", "POSITION");

  result &= addDataDefinition(hSimConnect, 7, SIMCONNECT_DATATYPE_INT64, "KOHLSMAN SETTING STD:4", "BOOL");

  result &= addDataDefinition(hSimConnect, 8, SIMCONNECT_DATATYPE_INT64, "KOHLSMAN SETTING STD:1", "BOOL");
  result &= addDataDefinition(hSimConnect, 9, SIMCONNECT_DATATYPE_INT64, "KOHLSMAN SETTING STD:2", "BOOL");

  return result;
}

bool SimConnectInterface::addDataDefinition(const HANDLE connectionHandle,
                                            const SIMCONNECT_DATA_DEFINITION_ID id,
                                            const SIMCONNECT_DATATYPE dataType,
                                            const std::string& dataName,
                                            const std::string& dataUnit) {
  HRESULT result =
      SimConnect_AddToDataDefinition(connectionHandle, id, dataName.c_str(),
                                     SimConnectInterface::isSimConnectDataTypeStruct(dataType) ? nullptr : dataUnit.c_str(), dataType);

  return (result == S_OK);
}

bool SimConnectInterface::addInputDataDefinition(const HANDLE connectionHandle,
                                                 const SIMCONNECT_DATA_DEFINITION_ID groupId,
                                                 const SIMCONNECT_CLIENT_EVENT_ID eventId,
                                                 const std::string& eventName,
                                                 const bool maskEvent) {
  HRESULT result = SimConnect_MapClientEventToSimEvent(connectionHandle, eventId, eventName.c_str());

  if (result != S_OK) {
    // failed -> abort
    return false;
  }

  result = SimConnect_AddClientEventToNotificationGroup(connectionHandle, groupId, eventId, maskEvent ? TRUE : FALSE);
  if (result != S_OK) {
    // failed -> abort
    return false;
  }

  result = SimConnect_SetNotificationGroupPriority(connectionHandle, groupId, SIMCONNECT_GROUP_PRIORITY_HIGHEST_MASKABLE);

  if (result != S_OK) {
    // failed -> abort
    return false;
  }

  // success
  return true;
}

bool SimConnectInterface::isSimConnectDataTypeStruct(SIMCONNECT_DATATYPE type) {
  switch (type) {
    case SIMCONNECT_DATATYPE_INITPOSITION:
    case SIMCONNECT_DATATYPE_MARKERSTATE:
    case SIMCONNECT_DATATYPE_WAYPOINT:
    case SIMCONNECT_DATATYPE_LATLONALT:
    case SIMCONNECT_DATATYPE_XYZ:
      return true;

    default:
      return false;
  }
  return false;
}

std::string SimConnectInterface::getSimConnectExceptionString(SIMCONNECT_EXCEPTION exception) {
  switch (exception) {
    case SIMCONNECT_EXCEPTION_NONE:
      return "NONE";

    case SIMCONNECT_EXCEPTION_ERROR:
      return "ERROR";

    case SIMCONNECT_EXCEPTION_SIZE_MISMATCH:
      return "SIZE_MISMATCH";

    case SIMCONNECT_EXCEPTION_UNRECOGNIZED_ID:
      return "UNRECOGNIZED_ID";

    case SIMCONNECT_EXCEPTION_UNOPENED:
      return "UNOPENED";

    case SIMCONNECT_EXCEPTION_VERSION_MISMATCH:
      return "VERSION_MISMATCH";

    case SIMCONNECT_EXCEPTION_TOO_MANY_GROUPS:
      return "TOO_MANY_GROUPS";

    case SIMCONNECT_EXCEPTION_NAME_UNRECOGNIZED:
      return "NAME_UNRECOGNIZED";

    case SIMCONNECT_EXCEPTION_TOO_MANY_EVENT_NAMES:
      return "TOO_MANY_EVENT_NAMES";

    case SIMCONNECT_EXCEPTION_EVENT_ID_DUPLICATE:
      return "EVENT_ID_DUPLICATE";

    case SIMCONNECT_EXCEPTION_TOO_MANY_MAPS:
      return "TOO_MANY_MAPS";

    case SIMCONNECT_EXCEPTION_TOO_MANY_OBJECTS:
      return "TOO_MANY_OBJECTS";

    case SIMCONNECT_EXCEPTION_TOO_MANY_REQUESTS:
      return "TOO_MANY_REQUESTS";

    case SIMCONNECT_EXCEPTION_WEATHER_INVALID_PORT:
      return "WEATHER_INVALID_PORT";

    case SIMCONNECT_EXCEPTION_WEATHER_INVALID_METAR:
      return "WEATHER_INVALID_METAR";

    case SIMCONNECT_EXCEPTION_WEATHER_UNABLE_TO_GET_OBSERVATION:
      return "WEATHER_UNABLE_TO_GET_OBSERVATION";

    case SIMCONNECT_EXCEPTION_WEATHER_UNABLE_TO_CREATE_STATION:
      return "WEATHER_UNABLE_TO_CREATE_STATION";

    case SIMCONNECT_EXCEPTION_WEATHER_UNABLE_TO_REMOVE_STATION:
      return "WEATHER_UNABLE_TO_REMOVE_STATION";

    case SIMCONNECT_EXCEPTION_INVALID_DATA_TYPE:
      return "INVALID_DATA_TYPE";

    case SIMCONNECT_EXCEPTION_INVALID_DATA_SIZE:
      return "INVALID_DATA_SIZE";

    case SIMCONNECT_EXCEPTION_DATA_ERROR:
      return "DATA_ERROR";

    case SIMCONNECT_EXCEPTION_INVALID_ARRAY:
      return "INVALID_ARRAY";

    case SIMCONNECT_EXCEPTION_CREATE_OBJECT_FAILED:
      return "CREATE_OBJECT_FAILED";

    case SIMCONNECT_EXCEPTION_LOAD_FLIGHTPLAN_FAILED:
      return "LOAD_FLIGHTPLAN_FAILED";

    case SIMCONNECT_EXCEPTION_OPERATION_INVALID_FOR_OBJECT_TYPE:
      return "OPERATION_INVALID_FOR_OBJECT_TYPE";

    case SIMCONNECT_EXCEPTION_ILLEGAL_OPERATION:
      return "ILLEGAL_OPERATION";

    case SIMCONNECT_EXCEPTION_ALREADY_SUBSCRIBED:
      return "ALREADY_SUBSCRIBED";

    case SIMCONNECT_EXCEPTION_INVALID_ENUM:
      return "INVALID_ENUM";

    case SIMCONNECT_EXCEPTION_DEFINITION_ERROR:
      return "DEFINITION_ERROR";

    case SIMCONNECT_EXCEPTION_DUPLICATE_ID:
      return "DUPLICATE_ID";

    case SIMCONNECT_EXCEPTION_DATUM_ID:
      return "DATUM_ID";

    case SIMCONNECT_EXCEPTION_OUT_OF_BOUNDS:
      return "OUT_OF_BOUNDS";

    case SIMCONNECT_EXCEPTION_ALREADY_CREATED:
      return "ALREADY_CREATED";

    case SIMCONNECT_EXCEPTION_OBJECT_OUTSIDE_REALITY_BUBBLE:
      return "OBJECT_OUTSIDE_REALITY_BUBBLE";

    case SIMCONNECT_EXCEPTION_OBJECT_CONTAINER:
      return "OBJECT_CONTAINER";

    case SIMCONNECT_EXCEPTION_OBJECT_AI:
      return "OBJECT_AI";

    case SIMCONNECT_EXCEPTION_OBJECT_ATC:
      return "OBJECT_ATC";

    case SIMCONNECT_EXCEPTION_OBJECT_SCHEDULE:
      return "OBJECT_SCHEDULE";

    default:
      return "UNKNOWN";
  }
}
