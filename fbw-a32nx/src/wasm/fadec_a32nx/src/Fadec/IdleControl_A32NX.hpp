// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_IDLECONTROL_A32NX_HPP
#define FLYBYWIRE_AIRCRAFT_IDLECONTROL_A32NX_HPP

#include <algorithm>

/**
 * The idle setting of the FADEC: the corrected N2 it holds with the thrust lever at idle (no MSFS SDK dependency, tested
 * natively by test/idle_control_test.cpp).
 *
 * - Modulated idle, in flight with the FLAPS lever at 0 and on ground: the minimum idle of the ambient conditions, raised by the
 *   bleed system demand; on ground without the bleed valve status, the demand of every valve open (HI GND IDLE).
 * - Approach idle, in flight with the FLAPS lever not at 0: a fixed margin above the minimum idle of the altitude, whatever the
 *   bleed demand, so that the engine accelerates quickly from idle to go-around thrust.
 * - The fuel recirculation of the IDG cooling raises the minimum N2 when the IDG oil keeps heating (the modulated idle is then at
 *   least that raised minimum, with the bleed demand it already holds).
 * - Approach idle also, on ground and in flight, when a FADEC no longer receives the data of its Engine Interface Unit (FLAPS
 *   lever, ground / flight): the minimum idle is lost (ENG 1(2) EIU FAULT, STATUS "APPR IDLE ONLY").
 *
 * The minimum idle itself (Tables1502_A32NX::iCN2) stays the idle of the start sequence: a start ends there, then the thrust loop
 * takes the engine to the idle setting.
 */
namespace IdleControl_A32NX {

enum class IdleMode { MODULATED, APPROACH };

/// The bleed air the engines supply for the aircraft systems.
struct BleedDemand {
  bool packsFromEngineBleed;        // a pack flow control valve is open and an engine bleed supplies the pneumatic system
  bool engineAntiIce;               // an engine nacelle anti-ice valve is open (always supplied by its own engine)
  bool wingAntiIceFromEngineBleed;  // the wing anti-ice is on and an engine bleed supplies the pneumatic system
};

// Design choice (no published value): the corrected N2 the bleed demand adds to the minimum idle, so that the HP bleed pressure
// stays enough for the consumers at idle. The wing anti-ice takes the most air, then the nacelle anti-ice, then the packs.
constexpr double PACKS_IDLE_CN2_INCREASE_PERCENT           = 1.0;
constexpr double ENGINE_ANTI_ICE_IDLE_CN2_INCREASE_PERCENT = 1.5;
constexpr double WING_ANTI_ICE_IDLE_CN2_INCREASE_PERCENT   = 2.5;
// Design choice (no published value): the corrected N2 the FADEC adds to the minimum idle when it raises the minimum N2 for the IDG
// cooling (fuel recirculation), between the packs and the nacelle anti-ice demand.
constexpr double RECIRCULATION_IDLE_CN2_INCREASE_PERCENT = 2.0;
// Design choice (no published value): above the modulated idle with every bleed consumer on (5 % CN2), about 4.5 % N1 at sea
// level, so that approach idle is always the higher idle.
constexpr double APPROACH_IDLE_CN2_INCREASE_PERCENT = 6.0;

inline IdleMode idleMode(bool onGround, double flapsHandleIndex, bool eiuDataLost) {
  if (eiuDataLost) {
    return IdleMode::APPROACH;
  }
  const bool flapsLeverAtZero = flapsHandleIndex < 0.5;
  return (onGround || flapsLeverAtZero) ? IdleMode::MODULATED : IdleMode::APPROACH;
}

/// The bleed demand the FADEC sets the idle for. A FADEC that no longer receives the position of the bleed, pack, anti-ice
/// and cross-bleed valves (ENG 1(2) BLEED STATUS FAULT) raises the idle on ground as if they were all open: HI GND IDLE.
inline BleedDemand fadecBleedDemand(const BleedDemand& measured, bool onGround, bool bleedValveStatusLost) {
  if (onGround && bleedValveStatusLost) {
    return {true, true, true};
  }
  return measured;
}

/// The corrected N2 the idle setting adds to the minimum idle, percent.
inline double idleCN2Increase(IdleMode mode, const BleedDemand& bleed, bool recirculationRaisesMinimumN2 = false) {
  if (mode == IdleMode::APPROACH) {
    return APPROACH_IDLE_CN2_INCREASE_PERCENT;
  }
  const double bleedIncrease = (bleed.packsFromEngineBleed ? PACKS_IDLE_CN2_INCREASE_PERCENT : 0.0) +
                               (bleed.engineAntiIce ? ENGINE_ANTI_ICE_IDLE_CN2_INCREASE_PERCENT : 0.0) +
                               (bleed.wingAntiIceFromEngineBleed ? WING_ANTI_ICE_IDLE_CN2_INCREASE_PERCENT : 0.0);
  return recirculationRaisesMinimumN2 ? std::max(bleedIncrease, RECIRCULATION_IDLE_CN2_INCREASE_PERCENT) : bleedIncrease;
}

}  // namespace IdleControl_A32NX

#endif  // FLYBYWIRE_AIRCRAFT_IDLECONTROL_A32NX_HPP
