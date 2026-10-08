//! Engine compressor stall, EGT overtemperature, overspeed and high vibration failures of the
//! A320 (flyPad ATA 72 / 77).
//!
//! The failure logic is the aircraft-independent `systems::engine::engine_malfunction`; this
//! module gives it the A320 values and reads the A320 variables. The FADEC (fadec_a32nx) adds the
//! EGT, N1 and N2 offsets to its indications, the flight controls computer (fbw_a320) lowers the
//! N1 of a stalled engine, the FWC raises ENG 1(2) STALL and ENG 1(2) N1/N2/EGT OVER LIMIT, and the
//! ENGINE SD page shows the vibrations.
//!
//! Every value below is a design choice: the FCOM gives the symptoms and the limits, not how a
//! failed engine behaves. The values are chosen against the FCOM limits (A320 FCOM PRO-ABN-ENG,
//! a320_fcom.txt):
//! - ENG 1(2) N1/N2/EGT OVER LIMIT (l.80420-80423): N1 104 %, N2 105 %. The EGT limits are those
//!   of the EWD (CFM56-5B TCDS, 905 degC at CLB/MCT, 940 degC at TOGA/FLX, red above 975 degC;
//!   systems/shared/src/EngineLimits.ts). The EGT overtemperature (120 degC at 100 % N1) takes
//!   a climb EGT above its limit, which the crew brings back below the limit by reducing the
//!   thrust; the overspeed (+7 % N1, +6 % N2) takes the N1 above 104 % at takeoff thrust only.
//! - [QRH] HIGH ENGINE VIBRATION (l.78936): the VIB advisory is N1 6 units, N2 4.3 units. The
//!   high vibration failure (N1 8 units at 100 % N1, N2 5 units at 100 % N2) is above the advisory
//!   at climb and cruise thrust and below it once the thrust is reduced.
//! - ENG 1(2) STALL (l.81322-81326): fluctuating parameters, sluggish thrust lever response, high
//!   EGT. The engine stalls when the N1 command is at or above 60 % (above the approach thrust) and
//!   recovers below 57 %: the QRH ENG STALL procedure (l.78834-78867) sets the thrust lever to IDLE,
//!   then slowly forward until the stall recurs.

use systems::{
    engine::engine_malfunction::{
        EngineMalfunction, EngineMalfunctionInputs, EngineMalfunctionParameters,
    },
    pneumatic::EngineState,
    simulation::{
        InitContext, Read, Reader, SimulationElement, SimulationElementVisitor, SimulatorReader,
        UpdateContext, VariableIdentifier,
    },
};
use uom::si::{f64::Ratio, ratio::percent};

pub const A320_ENGINE_MALFUNCTION_PARAMETERS: EngineMalfunctionParameters =
    EngineMalfunctionParameters {
        core_speed_name: "N2",
        stall_threshold_n1_percent: 60.,
        stall_threshold_hysteresis_percent: 3.,
        stall_n1_loss_percent: 15.,
        stall_egt_rise_degrees_celsius: 150.,
        stall_n1_fluctuation_percent: 3.,
        stall_core_fluctuation_percent: 1.5,
        stall_n1_vibration_units: 2.,
        overtemperature_egt_rise_at_full_n1_degrees_celsius: 120.,
        overspeed_n1_fraction: 0.07,
        overspeed_core_fraction: 0.06,
        high_vibration_n1_units_at_full_speed: 8.,
        high_vibration_core_units_at_full_speed: 5.,
        // MSFS gives one vibration per engine; the HP rotor is shown at 60 % of it.
        normal_core_to_n1_vibration_ratio: 0.6,
    };

/// The malfunctions of one A320 engine and the variables they read.
struct A320EngineMalfunction {
    malfunction: EngineMalfunction,

    engine_state_id: VariableIdentifier,
    n1_id: VariableIdentifier,
    n2_id: VariableIdentifier,
    commanded_n1_id: VariableIdentifier,
    vibration_id: VariableIdentifier,

    inputs: EngineMalfunctionInputs,
}
impl A320EngineMalfunction {
    fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            malfunction: EngineMalfunction::new(
                context,
                engine_number,
                A320_ENGINE_MALFUNCTION_PARAMETERS,
            ),
            engine_state_id: context.get_identifier(format!("ENGINE_STATE:{}", engine_number)),
            // The MSFS engine, without the offsets that the FADEC adds to its indications.
            n1_id: context.get_identifier(format!("TURB ENG N1:{}", engine_number)),
            n2_id: context.get_identifier(format!("TURB ENG N2:{}", engine_number)),
            commanded_n1_id: context
                .get_identifier(format!("AUTOTHRUST_N1_COMMANDED:{}", engine_number)),
            vibration_id: context.get_identifier(format!("TURB ENG VIBRATION:{}", engine_number)),
            inputs: EngineMalfunctionInputs::default(),
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        self.malfunction.update(context, self.inputs);
    }
}
impl SimulationElement for A320EngineMalfunction {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.malfunction.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        let engine_state: EngineState = reader.read_discrete_or_fallback(
            &self.engine_state_id,
            "EngineState",
            EngineState::Off,
        );
        self.inputs = EngineMalfunctionInputs {
            engine_is_running: engine_state == EngineState::On,
            n1: Ratio::new::<percent>(reader.read(&self.n1_id)),
            core_speed: Ratio::new::<percent>(reader.read(&self.n2_id)),
            commanded_n1: Ratio::new::<percent>(reader.read(&self.commanded_n1_id)),
            msfs_vibration: reader.read(&self.vibration_id),
        };
    }
}

/// The stall, EGT overtemperature, overspeed and high vibration failures of both engines.
pub struct A320EngineMalfunctions {
    engines: [A320EngineMalfunction; 2],
}
impl A320EngineMalfunctions {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            engines: [1, 2].map(|number| A320EngineMalfunction::new(context, number)),
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        for engine in &mut self.engines {
            engine.update(context);
        }
    }
}
impl SimulationElement for A320EngineMalfunctions {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for engine in &mut self.engines {
            engine.accept(visitor);
        }

        visitor.visit(self);
    }
}
