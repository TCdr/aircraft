// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Kilograms per pound */
const KG_PER_LB = 0.453_592_37;

/**
 * Rounds a computed fuel quantity up to the 0.1 t resolution of the FUEL&LOAD fuel fields (FCOM DSC-22-FMS-20-100 FINAL
 * FUEL / ALTN FUEL entry format: resolution 0.1), so that the displayed figure never falls short of the computed one.
 * Used for the default ALTN and FINAL fuels. A computation noise of 1e-9 t above a tenth is not rounded up.
 * @param tonnes the fuel in tonnes
 */
export function roundFuelUpToTenthTonne(tonnes: number): number {
  // + 0 turns the -0 of Math.ceil(-1e-9) (zero fuel) into 0
  return Math.ceil(tonnes * 10 - 1e-9) / 10 + 0;
}

/**
 * The holding fuel of the FUEL&LOAD page: the FINAL fuel and time (A380 FCOM DSC-22-FMS-20-30), and the time the EXTRA
 * fuel lasts at the same holding fuel flow.
 *
 * A380 FCOM PER-IFT-FPL-MRF HOLDING FUEL: "Holding Fuel is the minimum fuel required to fly for 30 min at 1 500 ft above
 * the alternate airport, at holding speed in ISA conditions. Holding Fuel is calculated with the landing weight at the
 * alternate airport." The holding speed is green dot + 25 kt in CONF CLEAN (PER-IFT-HLD-HLS GD SPEED: "In CONF CLEAN,
 * the standard holding speed is the green dot speed + 25 kt"), the maximum endurance speed.
 *
 * The A380 FCOM has no holding table (holdings are computed by the IN-FLT PERF HLD module of the EFB). The fuel flow is
 * taken from the one A380 holding computation that the FCOM shows (PER-IFT-HLD-HMI figure, IN-FLT PERF HLD module):
 * race track holding, GREEN DOT SPEED + 25 kt IN CONF CLEAN, ALT 1500 ft, ISA+10, A-ICE off, AIR COND NORM,
 * GROSS WGHT 940.0 klbs, 30 min: FUEL 13100 lb, Average FF 26200 lb/HR, FINAL WGHT 926.9 klbs.
 *
 * Design choice: the fuel flow is proportional to the weight. At maximum endurance the drag is the weight divided by
 * the best lift/drag ratio, so the thrust (and with it the fuel flow) grows with the weight. The A320neo FCOM holding
 * table (PER-HLD-HLD, CONF 0 - GREEN DOT SPEED, FL15) confirms it: 58 t 844 kg/h/eng to 90 t 1329 kg/h/eng, a fuel flow
 * growing as the weight to the power 1.03. Then the weight decreases exponentially during the holding, and the fuel of a
 * holding has an exact formula.
 *
 * Design choice: the holding altitude is not used. The A320neo table varies by less than 5 % from FL15 to FL140 at any
 * weight (mean +1.6 % at FL50, +1.6 % at FL100, +0.8 % at FL140), well within the 1 500 ft above any airport.
 *
 * Design choice: the FCOM figure (ISA+10) is brought back to ISA with the A320neo table correction "PER 1° ABOVE ISA
 * + 0.3 %" (FUEL), since the A380 FCOM gives no correction.
 *
 * Check: at the RJTT-RKSI ZFW of 342.6 t, the 30 min FINAL fuel is 4.70 t, shown 4.8 t once rounded up to 0.1 t; the
 * airline OFP (SimBrief) gives 4.8 t and the FCOM conservative quantity is 10 600 lb (4.81 t).
 */
export class FinalHoldingPredictor {
  /** FCOM PER-IFT-HLD-HMI figure: GROSS WGHT at the start of the holding, in klb */
  private static readonly FCOM_START_WEIGHT = 940.0;

  /** FCOM PER-IFT-HLD-HMI figure: FINAL WGHT at the end of the holding, in klb */
  private static readonly FCOM_FINAL_WEIGHT = 926.9;

  /** FCOM PER-IFT-HLD-HMI figure: holding time, in hours (30 min) */
  private static readonly FCOM_HOLDING_HOURS = 0.5;

  /** FCOM PER-IFT-HLD-HMI figure: ΔISA, in °C */
  private static readonly FCOM_ISA_DEVIATION = 10;

  /** Design choice: A320neo FCOM PER-HLD-HLD correction of the fuel flow per °C above ISA (+0.3 %) */
  private static readonly FUEL_FLOW_CORRECTION_PER_DEGREE_ABOVE_ISA = 0.003;

  /**
   * The fuel flow in ISA per unit of weight (fuel flow / weight), in 1/hour. With the fuel flow proportional to the weight,
   * W(t) = W0 * exp(-k * t), so k = ln(W0 / W1) / t from the start and final weights of the FCOM figure.
   */
  public static readonly FUEL_FLOW_PER_WEIGHT_PER_HOUR =
    Math.log(FinalHoldingPredictor.FCOM_START_WEIGHT / FinalHoldingPredictor.FCOM_FINAL_WEIGHT) /
    FinalHoldingPredictor.FCOM_HOLDING_HOURS /
    (1 + FinalHoldingPredictor.FCOM_ISA_DEVIATION * FinalHoldingPredictor.FUEL_FLOW_CORRECTION_PER_DEGREE_ABOVE_ISA);

  /**
   * The fuel flow without a weight (no ZFW entered yet), in tonnes per minute: FCOM PER-IFT-FPL-MRF HOLDING FUEL "A
   * conservative quantity corresponding to 30 min holding at 1 500 ft above the alternate airport in ISA conditions, at
   * green dot speed + 25 kt in the clean configuration is 10 600 lb."
   */
  public static readonly CONSERVATIVE_FUEL_FLOW_T_PER_MIN = (10_600 * KG_PER_LB) / 1_000 / 30;

  /**
   * The fuel of a holding that ends at a weight, in tonnes (FINAL fuel from the FINAL time).
   * The holding starts at the end weight plus its own fuel: W0 = W1 * exp(k * t), fuel = W1 * (exp(k * t) - 1).
   * @param endWeight the weight at the end of the holding (for the FINAL fuel: the ZFW), in tonnes, or null if unknown
   * @param minutes the holding time
   * @returns the fuel in tonnes, or null without a valid time
   */
  public static fuelForTime(endWeight: number | null, minutes: number | null): number | null {
    if (minutes === null || !Number.isFinite(minutes) || minutes < 0) {
      return null;
    }
    if (!FinalHoldingPredictor.isValidWeight(endWeight)) {
      return minutes * FinalHoldingPredictor.CONSERVATIVE_FUEL_FLOW_T_PER_MIN;
    }
    return endWeight * (Math.exp((FinalHoldingPredictor.FUEL_FLOW_PER_WEIGHT_PER_HOUR * minutes) / 60) - 1);
  }

  /**
   * The time a holding fuel lasts, in minutes (FINAL time from a FINAL fuel entry, EXTRA time from the EXTRA fuel).
   * t = ln((W1 + fuel) / W1) / k.
   * @param endWeight the weight at the end of the holding (FINAL: the ZFW; EXTRA: ZFW + MIN FUEL AT DEST), in tonnes, or
   * null if unknown
   * @param fuel the holding fuel, in tonnes
   * @returns the time in minutes, or null without a valid fuel
   */
  public static timeForFuel(endWeight: number | null, fuel: number | null): number | null {
    if (fuel === null || !Number.isFinite(fuel) || fuel < 0) {
      return null;
    }
    if (!FinalHoldingPredictor.isValidWeight(endWeight)) {
      return fuel / FinalHoldingPredictor.CONSERVATIVE_FUEL_FLOW_T_PER_MIN;
    }
    return (Math.log((endWeight + fuel) / endWeight) / FinalHoldingPredictor.FUEL_FLOW_PER_WEIGHT_PER_HOUR) * 60;
  }

  /**
   * The calculated FINAL fuel of the FUEL&LOAD page, in tonnes: the fuel of a holding of the FINAL time that ends at the
   * ZFW, rounded up to 0.1 t like the ALTN fuel (a 4.70 t holding shows 4.8). The FINAL time stays the time it was
   * computed from (design choice, see FmcAircraftInterface.calculateFinalAndAlternateFuel).
   * @param zfw the ZFW in tonnes, or null if not entered yet
   * @param minutes the FINAL time (pilot entry or the company default)
   */
  public static calculatedFinalFuel(zfw: number | null, minutes: number | null): number | null {
    const fuel = FinalHoldingPredictor.fuelForTime(zfw, minutes);
    return fuel !== null ? roundFuelUpToTenthTonne(fuel) : null;
  }

  private static isValidWeight(weight: number | null): weight is number {
    return weight !== null && Number.isFinite(weight) && weight > 0;
  }
}
