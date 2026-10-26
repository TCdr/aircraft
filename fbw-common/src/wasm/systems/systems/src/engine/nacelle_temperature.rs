//! The nacelle temperature of the engines of an aircraft, for the ENG SD page, written as
//! `ENGINE_n_NACELLE_TEMPERATURE` in °C (the advisory limit is the display's: 240 °C on the A320,
//! 300 °C on the A380).
//!
//! Design choice, the source publishes no thermal model: the nacelle compartment heats up with the
//! engine core. Its temperature tends to the ambient temperature plus a share of the difference
//! between the EGT and the ambient temperature (the aircraft's `core_heat_share`), with a first
//! order lag that heats faster (90 s) than it cools (10 min). The EGT of a shut down engine falls
//! slowly, so the nacelle keeps its heat for a while after the shutdown.

use crate::simulation::{
    InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
    SimulatorWriter, UpdateContext, VariableIdentifier, Write,
};
use std::time::Duration;
use uom::si::thermodynamic_temperature::degree_celsius;

/// The nacelle temperature of one engine.
#[derive(Debug, Default)]
struct NacelleTemperature {
    /// None before the first update: the nacelle then starts at its settled temperature (a flight
    /// loaded with the engines running has a warm nacelle).
    celsius: Option<f64>,
}
impl NacelleTemperature {
    const HEATING_TIME_CONSTANT: Duration = Duration::from_secs(90);
    const COOLING_TIME_CONSTANT: Duration = Duration::from_secs(600);

    fn settled_celsius(core_heat_share: f64, egt_celsius: f64, ambient_celsius: f64) -> f64 {
        ambient_celsius + core_heat_share * (egt_celsius - ambient_celsius).max(0.)
    }

    fn update(
        &mut self,
        delta: Duration,
        core_heat_share: f64,
        egt_celsius: f64,
        ambient_celsius: f64,
    ) -> f64 {
        let target = Self::settled_celsius(core_heat_share, egt_celsius, ambient_celsius);
        let celsius = match self.celsius {
            None => target,
            Some(current) => {
                let time_constant = if target > current {
                    Self::HEATING_TIME_CONSTANT
                } else {
                    Self::COOLING_TIME_CONSTANT
                };
                let response = 1. - (-delta.as_secs_f64() / time_constant.as_secs_f64()).exp();
                current + (target - current) * response
            }
        };
        self.celsius = Some(celsius);
        celsius
    }
}

struct EngineNacelle {
    core_heat_share: f64,
    egt_id: VariableIdentifier,
    nacelle_temperature_id: VariableIdentifier,
    egt_celsius: f64,
    temperature: NacelleTemperature,
}
impl EngineNacelle {
    fn new(context: &mut InitContext, engine_number: usize, core_heat_share: f64) -> Self {
        Self {
            core_heat_share,
            egt_id: context.get_identifier(format!("ENGINE_EGT:{engine_number}")),
            nacelle_temperature_id: context
                .get_identifier(format!("ENGINE_{engine_number}_NACELLE_TEMPERATURE")),
            egt_celsius: 0.,
            temperature: NacelleTemperature::default(),
        }
    }
}
impl SimulationElement for EngineNacelle {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.egt_celsius = reader.read(&self.egt_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.nacelle_temperature_id,
            self.temperature.celsius.unwrap_or_default(),
        );
    }
}

/// The nacelle temperatures of the `ENGINES` engines of an aircraft.
pub struct EngineNacelles<const ENGINES: usize> {
    nacelles: [EngineNacelle; ENGINES],
}
impl<const ENGINES: usize> EngineNacelles<ENGINES> {
    /// * `core_heat_share` - the share of the EGT above the ambient temperature that the nacelle
    ///   settles at (design choice of the aircraft)
    pub fn new(context: &mut InitContext, core_heat_share: f64) -> Self {
        Self {
            nacelles: std::array::from_fn(|index| {
                EngineNacelle::new(context, index + 1, core_heat_share)
            }),
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        let ambient_celsius = context.ambient_temperature().get::<degree_celsius>();
        for nacelle in &mut self.nacelles {
            nacelle.temperature.update(
                context.delta(),
                nacelle.core_heat_share,
                nacelle.egt_celsius,
                ambient_celsius,
            );
        }
    }
}
impl<const ENGINES: usize> SimulationElement for EngineNacelles<ENGINES> {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for nacelle in &mut self.nacelles {
            nacelle.accept(visitor);
        }
        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };
    use uom::si::f64::ThermodynamicTemperature;

    const SECOND: Duration = Duration::from_secs(1);
    const SHARE: f64 = 0.25;

    #[test]
    fn the_nacelle_starts_at_its_settled_temperature() {
        let mut nacelle = NacelleTemperature::default();
        assert_eq!(nacelle.update(SECOND, SHARE, 615., 15.), 165.);
        let mut cold = NacelleTemperature::default();
        assert_eq!(cold.update(SECOND, SHARE, 15., 15.), 15.);
    }

    #[test]
    fn the_nacelle_heats_up_with_the_engine_core_within_minutes() {
        let mut nacelle = NacelleTemperature::default();
        nacelle.update(SECOND, SHARE, 15., 15.);
        let mut celsius = 15.;
        for _ in 0..90 {
            celsius = nacelle.update(SECOND, SHARE, 615., 15.);
        }
        // one time constant: 63 % of the way to 165 °C
        assert!((celsius - (15. + 150. * 0.632)).abs() < 2., "{celsius}");
        for _ in 0..600 {
            celsius = nacelle.update(SECOND, SHARE, 615., 15.);
        }
        assert!((celsius - 165.).abs() < 1., "{celsius}");
    }

    #[test]
    fn the_nacelle_cools_down_slower_than_it_heats_up() {
        let mut nacelle = NacelleTemperature::default();
        nacelle.update(SECOND, SHARE, 615., 15.);
        let mut celsius = 0.;
        for _ in 0..90 {
            celsius = nacelle.update(SECOND, SHARE, 15., 15.);
        }
        assert!(celsius > 130., "{celsius}");
    }

    #[test]
    fn the_nacelle_reaches_the_advisory_only_with_an_egt_far_above_its_limits() {
        assert!(NacelleTemperature::settled_celsius(SHARE, 1_000., 45.) < 300.);
        assert!(NacelleTemperature::settled_celsius(SHARE, 1_250., 15.) > 300.);
    }

    struct TestAircraft {
        nacelles: EngineNacelles<4>,
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.nacelles.update(context);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.nacelles.accept(visitor);
            visitor.visit(self);
        }
    }

    #[test]
    fn each_engine_writes_its_nacelle_temperature_from_its_egt() {
        let mut test_bed = SimulationTestBed::new(|context| TestAircraft {
            nacelles: EngineNacelles::new(context, SHARE),
        });
        test_bed.set_ambient_temperature(ThermodynamicTemperature::new::<degree_celsius>(15.));
        test_bed.write_by_name("ENGINE_EGT:2", 415.);
        test_bed.run_with_delta(SECOND);
        let engine_2: f64 = test_bed.read_by_name("ENGINE_2_NACELLE_TEMPERATURE");
        let engine_3: f64 = test_bed.read_by_name("ENGINE_3_NACELLE_TEMPERATURE");
        assert!((engine_2 - 115.).abs() < 0.01, "{engine_2}");
        // no EGT written (0 °C, below the ambient): the nacelle stays at the ambient temperature
        assert!((engine_3 - 15.).abs() < 0.01, "{engine_3}");
    }
}
