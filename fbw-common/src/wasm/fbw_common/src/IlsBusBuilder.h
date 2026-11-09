#pragma once

#include <array>
#include <cmath>

#include "FlsReceiver.h"
#include "GlsReceiver.h"
#include "MultiModeReceiverHealth.h"
#include "ReceiverGeometry.h"

/// The localizer and glide slope of the NAV 3 radio, before the health of any MMR is applied: both ILS buses are built from them
struct IlsRadioData {
  bool localizerValid = false;
  /// Already corrected for the back beam
  double localizerDeviationDeg = 0;
  bool glideSlopeValid = false;
  double glideSlopeDeviationDeg = 0;
};

/// Everything that goes onto the two ILS buses. The MMR of a bus is the one with its index, so the health and the GLS channel are
/// looked up here and a host cannot hand one bus the state of the other MMR.
struct IlsBusSources {
  IlsRadioData radio;
  /// The course the FMS tuned the ILS with; negative when it has none
  double fmsCourseDeg = -1;
  double localizerMagvarDeg = 0;
  FlsBeamDefinition flsBeam;
  FlsDeviations flsDeviations;
  GlsApproachDefinition glsUplink;
  GlsDeviations glsDeviations;
  bool glsGroundStationFailed = false;
  std::array<int, 2> glsChannel = {};
  std::array<MmrHealth, 2> mmrHealth = {};
};

class IlsBusBuilder {
 public:
  /// The words of the ILS bus of MMR mmrIndex (0 or 1): the radio, then an FLS beam over it, then a GLS channel of the MMR over
  /// both, and last the health of the MMR, which takes away the words of a dead function.
  template <typename IlsBus>
  static void build(IlsBus& bus, int mmrIndex, const IlsBusSources& sources) {
    const IlsRadioData& radio = sources.radio;
    const unsigned int localizerSsm = radio.localizerValid ? SSM_NORMAL_OPERATION : SSM_NO_COMPUTED_DATA;
    const unsigned int glideSlopeSsm = radio.glideSlopeValid ? SSM_NORMAL_OPERATION : SSM_NO_COMPUTED_DATA;
    // Without a course there is no runway heading to send, whatever the radio receives
    const bool hasCourse = sources.fmsCourseDeg >= 0;

    bus.runway_heading_deg.SSM = radio.localizerValid && hasCourse ? SSM_NORMAL_OPERATION : SSM_NO_COMPUTED_DATA;
    bus.runway_heading_deg.Data =
        hasCourse ? static_cast<float>(std::fmod(std::fmod(sources.fmsCourseDeg - sources.localizerMagvarDeg, 360) + 360, 360)) : 0.0F;
    bus.ils_frequency_mhz.SSM = SSM_NORMAL_OPERATION;
    bus.ils_frequency_mhz.Data = 0;
    bus.localizer_deviation_deg.SSM = localizerSsm;
    bus.localizer_deviation_deg.Data = static_cast<float>(radio.localizerDeviationDeg);
    bus.glideslope_deviation_deg.SSM = glideSlopeSsm;
    bus.glideslope_deviation_deg.Data = static_cast<float>(radio.glideSlopeDeviationDeg);

    FlsReceiver::applyToIlsBus(bus, sources.flsBeam, sources.flsDeviations);
    // Last of the receivers, so that a GLS set on the MMR wins over an FLS beam
    const MmrHealth& health = sources.mmrHealth[mmrIndex];
    GlsReceiver::applyToIlsBus(bus, sources.glsUplink, sources.glsChannel[mmrIndex], !health.glsOperative(), sources.glsGroundStationFailed,
                               sources.glsDeviations);
    MultiModeReceiverHealth::applyToIlsBus(
        bus, health,
        MultiModeReceiverHealth::activeFunction(sources.glsChannel[mmrIndex], sources.flsBeam.valid, sources.flsBeam.lateral));
  }

  /// The NAV 3 radio is the receiver of MMR 1: the consumers of the radio variables (PFD 1, ISIS, ND, GPWS) see no ILS signal when
  /// MMR 1 has no power or its ILS receiver fails. The ILS buses do not use this; they keep the radio data and mark their own
  /// MMR dead themselves.
  static bool radioConsumersSeeIlsSignal(const std::array<MmrHealth, 2>& mmrHealth) { return mmrHealth[0].ilsOperative(); }

 private:
  static constexpr unsigned int SSM_NO_COMPUTED_DATA = ReceiverGeometry::SSM_NO_COMPUTED_DATA;
  static constexpr unsigned int SSM_NORMAL_OPERATION = ReceiverGeometry::SSM_NORMAL_OPERATION;
};
