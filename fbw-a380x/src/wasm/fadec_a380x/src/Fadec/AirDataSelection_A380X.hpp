// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_AIRDATASELECTION_A380X_HPP
#define FLYBYWIRE_AIRCRAFT_AIRDATASELECTION_A380X_HPP

#include <cmath>

/**
 * @class AirDataSelection_A380X
 *
 * The air data of the FADEC power management and its NORMAL / DEGRADED mode. No MSFS SDK dependency: tested natively
 * (test/run_tests.sh).
 *
 * The FADEC needs the static pressure P0, the total pressure PT and the TAT to compute the THR command (NORMAL mode). The three
 * ADIRUs and the engine sensors give them; in normal operation each FADEC uses the ADIRU data. The data is cross-validated:
 * - each ADIRU compares its data with the four FADECs: consistent with two or more of them, it sends a validity signal,
 * - each FADEC compares its own data with the ADIRUs (it needs at least two of them): consistent, it uses the ADIRU data; not
 *   consistent, it uses the ADIRU validity signals to choose between the engine and the ADIRU sources.
 * When one of P0, PT or TAT is totally lost, the FADEC reverts to the DEGRADED (N1) mode.
 *
 * Design choice: when a comparison is not possible (fewer than two ADIRUs for the FADEC, fewer than two engine sensors for the
 * ADIRU), nothing can disagree with the data: the FADEC goes straight to the validity signals and an ADIRU keeps its validity.
 * Among valid ADIRUs the FADEC takes the lowest-numbered one. The FADEC returns to NORMAL as soon as the three parameters are
 * available again.
 */
class AirDataSelection_A380X {
 public:
  static constexpr int ADIRUS = 3;
  static constexpr int FADECS = 4;

  enum Parameter { P0 = 0, PT = 1, TAT = 2, PARAMETERS = 3 };

  /// The source a FADEC uses for one parameter (the value of L:A32NX_ENGINE_n_FADEC_<parameter>_SOURCE)
  enum class Source { Lost = 0, Adiru1 = 1, Adiru2 = 2, Adiru3 = 3, Engine = 4 };

  struct Reading {
    double value = 0.0;
    bool   valid = false;
  };

  struct Inputs {
    Reading adiru[ADIRUS][PARAMETERS];
    Reading engine[FADECS][PARAMETERS];
  };

  struct FadecSelection {
    Source source[PARAMETERS] = {Source::Lost, Source::Lost, Source::Lost};
    bool   degraded           = true;
  };

  struct Result {
    bool           adiruValid[ADIRUS][PARAMETERS] = {};
    FadecSelection fadec[FADECS];
  };

  /// Design choice: the largest difference between two sources that still agree: P0 and PT in hPa, TAT in degrees C. The PT
  /// tolerance is below the 30 to 40 hPa an ADR with an erroneous pitot input (airspeed 40 kt low) is off by at 250 kt.
  static constexpr double TOLERANCE[PARAMETERS] = {5.0, 10.0, 5.0};

  static Result evaluate(const Inputs& inputs) {
    Result result;
    for (int adiru = 0; adiru < ADIRUS; ++adiru) {
      for (int parameter = 0; parameter < PARAMETERS; ++parameter) {
        result.adiruValid[adiru][parameter] = adiruValidity(inputs, adiru, static_cast<Parameter>(parameter));
      }
    }
    for (int fadec = 0; fadec < FADECS; ++fadec) {
      FadecSelection& selection = result.fadec[fadec];
      selection.degraded        = false;
      for (int parameter = 0; parameter < PARAMETERS; ++parameter) {
        selection.source[parameter] = select(inputs, result.adiruValid, fadec, static_cast<Parameter>(parameter));
        selection.degraded          = selection.degraded || selection.source[parameter] == Source::Lost;
      }
    }
    return result;
  }

  /// The total pressure (hPa) of a static pressure (hPa) and a subsonic Mach number
  static double totalPressure(double staticPressure, double mach) {
    return staticPressure * std::pow(1.0 + 0.2 * mach * mach, 3.5);
  }

 private:
  static bool agree(const Reading& a, const Reading& b, Parameter parameter) {
    return a.valid && b.valid && std::fabs(a.value - b.value) <= TOLERANCE[parameter];
  }

  static bool adiruValidity(const Inputs& inputs, int adiru, Parameter parameter) {
    const Reading& adiruReading = inputs.adiru[adiru][parameter];
    if (!adiruReading.valid) {
      return false;
    }
    int comparedFadecs   = 0;
    int consistentFadecs = 0;
    for (int fadec = 0; fadec < FADECS; ++fadec) {
      const Reading& engineReading = inputs.engine[fadec][parameter];
      if (engineReading.valid) {
        ++comparedFadecs;
        consistentFadecs += agree(adiruReading, engineReading, parameter) ? 1 : 0;
      }
    }
    return comparedFadecs < 2 || consistentFadecs >= 2;
  }

  static Source adiruSource(int adiru) { return static_cast<Source>(adiru + 1); }

  static Source select(const Inputs& inputs, const bool adiruValid[ADIRUS][PARAMETERS], int fadec, Parameter parameter) {
    const Reading& own = inputs.engine[fadec][parameter];

    int availableAdirus = 0;
    for (int adiru = 0; adiru < ADIRUS; ++adiru) {
      availableAdirus += inputs.adiru[adiru][parameter].valid ? 1 : 0;
    }

    if (availableAdirus >= 2 && own.valid) {
      bool consistent = true;
      int  firstAdiru = -1;
      for (int adiru = 0; adiru < ADIRUS; ++adiru) {
        const Reading& adiruReading = inputs.adiru[adiru][parameter];
        if (!adiruReading.valid) {
          continue;
        }
        consistent = consistent && agree(own, adiruReading, parameter);
        if (firstAdiru < 0) {
          firstAdiru = adiru;
        }
      }
      if (consistent) {
        return adiruSource(firstAdiru);
      }
    }

    for (int adiru = 0; adiru < ADIRUS; ++adiru) {
      if (inputs.adiru[adiru][parameter].valid && adiruValid[adiru][parameter]) {
        return adiruSource(adiru);
      }
    }
    return own.valid ? Source::Engine : Source::Lost;
  }
};

#endif  // FLYBYWIRE_AIRCRAFT_AIRDATASELECTION_A380X_HPP
