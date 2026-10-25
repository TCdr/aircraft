//! The fuel recirculation of the IDG cooling of the A320.
//!
//! Some of the fuel the HMU supplies to an engine goes through the heat exchanger of its IDG oil
//! and returns to the wing tank through the fuel return valve, which the FADEC controls. At low
//! thrust, when the oil that enters the IDG is too hot, the FADEC sends the cooling fuel back to
//! the tank at 300 kg/h. If the oil temperature keeps rising, the FADEC raises the minimum N2 of
//! the engine, and if it still keeps rising it increases the flow to the tank, from 300 up to
//! 600 kg/h depending on the temperature of the returning fuel (the valve mixes hot fuel with cold
//! fuel to keep the return below 100 °C). The return is inhibited (valve closed) by the conditions
//! of `idg_return_is_active`.
//!
//! The FADEC (fadec_a32nx) reads the flow and the minimum N2 raise written here: it moves the
//! returned mass from the inner cell to the outer cell of the wing, and sets the idle. The IDG
//! oil model reads the flow too (systems::electrical::ConstantSpeedDrive), as the fuel cools the
//! oil.
//!
//! The flyPad failure "IDG fuel cooling (fuel recirculation command)" (FUEL IDG 1(2) COOL FAULT)
//! takes away the command: the valve stays closed. The FADEC faults FUEL RETURN VALVE keep it
//! closed (VALVE NOT OPEN) or open (VALVE NOT CLOSED).
//!
//! Design choices (no published oil temperatures): the oil inlet temperature thresholds below, each
//! with a hysteresis of 10 °C (5 °C for the two upper ones) so that the stage does not chatter; a
//! flow of 600 kg/h below a return temperature of 60 °C, falling linearly to 300 kg/h at 100 °C;
//! "low thrust" is a corrected N2 below 85 %.

use systems::{
    engine::Engine,
    failures::{Failure, FailureType},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, VariableIdentifier, Write,
    },
};
use uom::si::ratio::percent;

/// How far the FADEC goes to cool the IDG oil, in the order of its escalation.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
pub enum RecirculationStage {
    /// The fuel return valve is closed.
    Closed,
    /// The cooling fuel returns to the tank at 300 kg/h.
    Return,
    /// The FADEC raises the minimum N2 as well.
    RaisedMinimumN2,
    /// The FADEC increases the flow to the tank as well, up to 600 kg/h.
    IncreasedReturn,
}
impl RecirculationStage {
    /// The IDG oil inlet temperatures that start a stage and, below, end it (°C).
    const RETURN: (f64, f64) = (80., 70.);
    const RAISED_MINIMUM_N2: (f64, f64) = (95., 90.);
    const INCREASED_RETURN: (f64, f64) = (105., 100.);

    const LOW_THRUST_MAX_CORRECTED_N2_PERCENT: f64 = 85.;
    const RETURN_FLOW_KG_PER_HOUR: f64 = 300.;
    const MAX_RETURN_FLOW_KG_PER_HOUR: f64 = 600.;
    /// The returning fuel at or below this temperature gets the maximum flow...
    const FULL_FLOW_RETURN_TEMPERATURE_CELSIUS: f64 = 60.;
    /// ...and at this temperature the minimum flow of the stage.
    const MAX_RETURN_TEMPERATURE_CELSIUS: f64 = 100.;

    /// The stage after the given oil inlet temperature, from the stage before: a stage ends only
    /// below its hysteresis temperature, and needs the stages below it.
    pub fn next(self, oil_inlet_celsius: f64) -> Self {
        let holds = |(start, stop): (f64, f64), stage: Self| {
            oil_inlet_celsius >= if self >= stage { stop } else { start }
        };
        if !holds(Self::RETURN, Self::Return) {
            Self::Closed
        } else if !holds(Self::RAISED_MINIMUM_N2, Self::RaisedMinimumN2) {
            Self::Return
        } else if !holds(Self::INCREASED_RETURN, Self::IncreasedReturn) {
            Self::RaisedMinimumN2
        } else {
            Self::IncreasedReturn
        }
    }

    pub fn raises_minimum_n2(self) -> bool {
        self >= Self::RaisedMinimumN2
    }

    /// The flow of the fuel return valve commanded open, in kg/h.
    pub fn flow_kg_per_hour(self, return_temperature_celsius: f64) -> f64 {
        match self {
            Self::Closed => 0.,
            Self::Return | Self::RaisedMinimumN2 => Self::RETURN_FLOW_KG_PER_HOUR,
            Self::IncreasedReturn => {
                let colder = (Self::MAX_RETURN_TEMPERATURE_CELSIUS - return_temperature_celsius)
                    / (Self::MAX_RETURN_TEMPERATURE_CELSIUS
                        - Self::FULL_FLOW_RETURN_TEMPERATURE_CELSIUS);
                Self::RETURN_FLOW_KG_PER_HOUR
                    + (Self::MAX_RETURN_FLOW_KG_PER_HOUR - Self::RETURN_FLOW_KG_PER_HOUR)
                        * colder.clamp(0., 1.)
            }
        }
    }

    pub fn is_low_thrust(corrected_n2_percent: f64) -> bool {
        corrected_n2_percent < Self::LOW_THRUST_MAX_CORRECTED_N2_PERCENT
    }
}

/// What the recirculation control of an engine depends on, on one update.
#[derive(Clone, Copy, Debug)]
pub struct RecirculationConditions {
    pub engine_running: bool,
    /// The IDG oil temperature at the drive inlet, in °C.
    pub oil_inlet_celsius: f64,
    pub corrected_n2_percent: f64,
    /// The fuel return valve may open (`idg_return_is_active`).
    pub return_allowed: bool,
    pub return_temperature_celsius: f64,
    /// The flyPad failure of the recirculation command.
    pub command_failed: bool,
    pub valve_failed_closed: bool,
    pub valve_failed_open: bool,
}

struct EngineRecirculation {
    flow_id: VariableIdentifier,
    raises_minimum_n2_id: VariableIdentifier,
    oil_inlet_temperature_id: VariableIdentifier,
    valve_failed_closed_id: VariableIdentifier,
    valve_failed_open_id: VariableIdentifier,

    command_failure: Failure,

    oil_inlet_celsius: f64,
    valve_failed_closed: bool,
    valve_failed_open: bool,
    control: RecirculationControl,
}

/// The stage and the flow of the fuel return valve of an engine.
#[derive(Debug)]
struct RecirculationControl {
    stage: RecirculationStage,
    flow_kg_per_hour: f64,
}
impl RecirculationControl {
    fn new() -> Self {
        Self {
            stage: RecirculationStage::Closed,
            flow_kg_per_hour: 0.,
        }
    }

    fn update(&mut self, conditions: RecirculationConditions) {
        let command_possible = conditions.engine_running
            && conditions.return_allowed
            && RecirculationStage::is_low_thrust(conditions.corrected_n2_percent)
            && !conditions.command_failed;
        self.stage = if command_possible {
            self.stage.next(conditions.oil_inlet_celsius)
        } else {
            RecirculationStage::Closed
        };

        let commanded_flow = self
            .stage
            .flow_kg_per_hour(conditions.return_temperature_celsius);
        self.flow_kg_per_hour = if !conditions.engine_running || conditions.valve_failed_closed {
            0.
        } else if conditions.valve_failed_open {
            commanded_flow.max(RecirculationStage::RETURN_FLOW_KG_PER_HOUR)
        } else {
            commanded_flow
        };
    }
}
impl EngineRecirculation {
    fn new(context: &mut InitContext, engine_number: usize) -> Self {
        Self {
            flow_id: context
                .get_identifier(format!("FUEL_ENG_{}_RECIRCULATION_FLOW", engine_number)),
            raises_minimum_n2_id: context.get_identifier(format!(
                "FUEL_ENG_{}_RECIRCULATION_RAISES_MINIMUM_N2",
                engine_number
            )),
            oil_inlet_temperature_id: context.get_identifier(format!(
                "ELEC_ENG_GEN_{}_IDG_OIL_INLET_TEMPERATURE",
                engine_number
            )),
            valve_failed_closed_id: context.get_identifier(format!(
                "ENGINE_{}_FUEL_RETURN_VALVE_FAILED_CLOSED",
                engine_number
            )),
            valve_failed_open_id: context.get_identifier(format!(
                "ENGINE_{}_FUEL_RETURN_VALVE_FAILED_OPEN",
                engine_number
            )),
            command_failure: Failure::new(FailureType::FuelRecirculationCommand(engine_number)),
            oil_inlet_celsius: 0.,
            valve_failed_closed: false,
            valve_failed_open: false,
            control: RecirculationControl::new(),
        }
    }

    fn conditions(
        &self,
        engine: &impl Engine,
        return_allowed: bool,
        return_temperature_celsius: f64,
    ) -> RecirculationConditions {
        RecirculationConditions {
            engine_running: engine.is_above_minimum_idle(),
            oil_inlet_celsius: self.oil_inlet_celsius,
            corrected_n2_percent: engine.corrected_n2().get::<percent>(),
            return_allowed,
            return_temperature_celsius,
            command_failed: self.command_failure.is_active(),
            valve_failed_closed: self.valve_failed_closed,
            valve_failed_open: self.valve_failed_open,
        }
    }
}
impl SimulationElement for EngineRecirculation {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.command_failure.accept(visitor);
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.oil_inlet_celsius = reader.read(&self.oil_inlet_temperature_id);
        self.valve_failed_closed = reader.read(&self.valve_failed_closed_id);
        self.valve_failed_open = reader.read(&self.valve_failed_open_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.flow_id, self.control.flow_kg_per_hour);
        writer.write(
            &self.raises_minimum_n2_id,
            self.control.stage.raises_minimum_n2(),
        );
    }
}

/// The fuel recirculation control of the two engines.
pub struct FuelRecirculation {
    engines: [EngineRecirculation; 2],
}
impl FuelRecirculation {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            engines: [1, 2].map(|number| EngineRecirculation::new(context, number)),
        }
    }

    /// * `return_allowed` - the fuel return valve of each engine may open (`idg_return_is_active`)
    /// * `return_temperature_celsius` - the temperature of the fuel returning to each wing tank
    ///
    /// Returns the flow of each engine, in kg/h.
    pub fn update(
        &mut self,
        engines: [&impl Engine; 2],
        return_allowed: [bool; 2],
        return_temperature_celsius: [f64; 2],
    ) -> [f64; 2] {
        for (side, recirculation) in self.engines.iter_mut().enumerate() {
            let conditions = recirculation.conditions(
                engines[side],
                return_allowed[side],
                return_temperature_celsius[side],
            );
            recirculation.control.update(conditions);
        }
        self.engines
            .each_ref()
            .map(|engine| engine.control.flow_kg_per_hour)
    }
}
impl SimulationElement for FuelRecirculation {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for engine in &mut self.engines {
            engine.accept(visitor);
        }
        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conditions(oil_inlet_celsius: f64) -> RecirculationConditions {
        RecirculationConditions {
            engine_running: true,
            oil_inlet_celsius,
            corrected_n2_percent: 62.,
            return_allowed: true,
            return_temperature_celsius: 75.,
            command_failed: false,
            valve_failed_closed: false,
            valve_failed_open: false,
        }
    }

    /// The stage and the flow after the engine ran 100 updates with the conditions.
    fn settle(
        control: &mut RecirculationControl,
        conditions: RecirculationConditions,
    ) -> (RecirculationStage, f64) {
        for _ in 0..100 {
            control.update(conditions);
        }
        (control.stage, control.flow_kg_per_hour)
    }

    fn with_recirculation(test: impl FnOnce(&mut RecirculationControl)) {
        test(&mut RecirculationControl::new());
    }

    #[test]
    fn the_fuel_return_valve_stays_closed_while_the_oil_is_cool() {
        with_recirculation(|recirculation| {
            assert_eq!(
                settle(recirculation, conditions(75.)),
                (RecirculationStage::Closed, 0.)
            );
        });
    }

    #[test]
    fn a_hot_oil_at_low_thrust_returns_300_kg_per_hour_to_the_tank() {
        with_recirculation(|recirculation| {
            assert_eq!(
                settle(recirculation, conditions(85.)),
                (RecirculationStage::Return, 300.)
            );
        });
    }

    #[test]
    fn a_rising_oil_temperature_raises_the_minimum_n2_then_increases_the_return() {
        with_recirculation(|recirculation| {
            let (stage, flow) = settle(recirculation, conditions(97.));
            assert_eq!(stage, RecirculationStage::RaisedMinimumN2);
            assert_eq!(flow, 300.);
            assert!(stage.raises_minimum_n2());

            let (stage, flow) = settle(recirculation, conditions(110.));
            assert_eq!(stage, RecirculationStage::IncreasedReturn);
            // The returning fuel at 75 °C: 300 + 300 * (100 - 75) / 40
            assert!((flow - 487.5).abs() < 0.01, "{}", flow);
        });
    }

    #[test]
    fn a_stage_ends_only_below_its_hysteresis_temperature() {
        with_recirculation(|recirculation| {
            settle(recirculation, conditions(85.));
            assert_eq!(
                settle(recirculation, conditions(72.)).0,
                RecirculationStage::Return
            );
            assert_eq!(
                settle(recirculation, conditions(69.)).0,
                RecirculationStage::Closed
            );
        });
    }

    #[test]
    fn the_return_is_inhibited_at_high_thrust_and_by_the_valve_conditions() {
        with_recirculation(|recirculation| {
            let high_thrust = RecirculationConditions {
                corrected_n2_percent: 90.,
                ..conditions(110.)
            };
            assert_eq!(settle(recirculation, high_thrust).1, 0.);
            let inhibited = RecirculationConditions {
                return_allowed: false,
                ..conditions(110.)
            };
            assert_eq!(settle(recirculation, inhibited).1, 0.);
            let shut_down = RecirculationConditions {
                engine_running: false,
                ..conditions(110.)
            };
            assert_eq!(settle(recirculation, shut_down).1, 0.);
        });
    }

    #[test]
    fn the_failed_command_and_the_valve_failures_override_the_control() {
        with_recirculation(|recirculation| {
            let command_failed = RecirculationConditions {
                command_failed: true,
                ..conditions(110.)
            };
            assert_eq!(
                settle(recirculation, command_failed),
                (RecirculationStage::Closed, 0.)
            );
            let valve_failed_closed = RecirculationConditions {
                valve_failed_closed: true,
                ..conditions(110.)
            };
            let (stage, flow) = settle(recirculation, valve_failed_closed);
            assert!(stage.raises_minimum_n2(), "the FADEC still raises the N2");
            assert_eq!(flow, 0.);
            let valve_failed_open = RecirculationConditions {
                valve_failed_open: true,
                return_allowed: false,
                ..conditions(60.)
            };
            assert_eq!(settle(recirculation, valve_failed_open).1, 300.);
        });
    }
}
