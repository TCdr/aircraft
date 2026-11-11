#pragma once

#include "ReceiverGeometry.h"

/// What decides whether one multi-mode receiver can give its ILS, FLS or GLS: its power supply and the failures of its functions.
struct MmrHealth {
  /// The systems module publishes the supply of the MMR; a box without power is dead for all its functions
  bool powered = true;
  /// The ILS receiver of this MMR fails, or the whole MMR does
  bool ilsReceiverFailed = false;
  /// The GLS function of this MMR fails, or the whole MMR does
  bool glsFailed = false;
  /// The whole MMR fails. The failure of the FLS function alone only raises its alert and leaves the beam.
  bool flsFailed = false;

  bool ilsOperative() const { return powered && !ilsReceiverFailed; }
  bool glsOperative() const { return powered && !glsFailed; }
  bool flsOperative() const { return powered && !flsFailed; }

  /// The L:vars of the MMR hold 0 and 1: a missing systems module reads as a box without power. An aircraft that does not
  /// publish the failure of the FLS leaves it out.
  static MmrHealth fromSimVars(double poweredVar, double ilsFailedVar, double glsFailedVar, double flsFailedVar = 0) {
    MmrHealth health;
    health.powered = poweredVar != 0;
    health.ilsReceiverFailed = ilsFailedVar != 0;
    health.glsFailed = glsFailedVar != 0;
    health.flsFailed = flsFailedVar != 0;
    return health;
  }
};

/// The function of an MMR that gives the words of its ILS bus
enum class MmrFunction {
  Ils,
  /// An FLS beam gives the glide slope words, the real localizer the lateral ones
  FlsGlideSlopeOverIls,
  /// An FLS beam gives the lateral and the glide slope words
  Fls,
  Gls,
};

/// A dead function sends failure warning on its ILS bus, where a working one that only has no signal sends no computed data. The
/// flight guidance computers read failure warning as invalid and fly the other MMR then; they read no computed data as a valid
/// word with a deviation of zero.
class MultiModeReceiverHealth {
 public:
  /// A GLS channel on the MMR wins over an FLS beam, which wins over the ILS
  static MmrFunction activeFunction(int glsChannel, bool flsBeamValid, bool flsBeamLateral) {
    if (glsChannel > 0) {
      return MmrFunction::Gls;
    }
    if (!flsBeamValid) {
      return MmrFunction::Ils;
    }
    return flsBeamLateral ? MmrFunction::Fls : MmrFunction::FlsGlideSlopeOverIls;
  }

  /// Applied after every other word has been put on the bus (ILS, FLS, GLS), so that a dead function cannot show any of them.
  /// A failed ILS receiver leaves the words that an FLS or GLS function gives, and the other way round.
  template <typename IlsBus>
  static void applyToIlsBus(IlsBus& bus, const MmrHealth& health, MmrFunction function) {
    bool lateralOperative = false;
    bool glideSlopeOperative = false;
    switch (function) {
      case MmrFunction::Ils:
        lateralOperative = glideSlopeOperative = health.ilsOperative();
        break;
      case MmrFunction::FlsGlideSlopeOverIls:
        lateralOperative = health.ilsOperative();
        glideSlopeOperative = health.flsOperative();
        break;
      case MmrFunction::Fls:
        lateralOperative = glideSlopeOperative = health.flsOperative();
        break;
      case MmrFunction::Gls:
        lateralOperative = glideSlopeOperative = health.glsOperative();
        break;
    }

    if (!lateralOperative) {
      bus.runway_heading_deg.SSM = ReceiverGeometry::SSM_FAILURE_WARNING;
      bus.runway_heading_deg.Data = 0.0F;
      bus.ils_frequency_mhz.SSM = ReceiverGeometry::SSM_FAILURE_WARNING;
      bus.ils_frequency_mhz.Data = 0.0F;
      bus.localizer_deviation_deg.SSM = ReceiverGeometry::SSM_FAILURE_WARNING;
      bus.localizer_deviation_deg.Data = 0.0F;
    }
    if (!glideSlopeOperative) {
      bus.glideslope_deviation_deg.SSM = ReceiverGeometry::SSM_FAILURE_WARNING;
      bus.glideslope_deviation_deg.Data = 0.0F;
    }
  }
};
