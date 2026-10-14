use systems::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};
use uom::si::{f64::*, pressure::psi, ratio::ratio, thermodynamic_temperature::kelvin};

/// Models the crew oxygen bottle that feeds the pilots' masks and is displayed on the DOOR/OXY
/// ECAM page. There is no mask-donning interaction anywhere in this aircraft yet, so the only
/// modelled driver of a pressure change is the ideal gas law response to the bottle's
/// environment temperature (the bottle lives in the avionics compartment, so the cockpit duct
/// temperature - already computed by [`crate::air_conditioning::A320AirConditioning`] - is used
/// as a stand-in for that compartment), plus a very slow background leak.
///
/// No FCOM figure for *normal* background leakage could be sourced; maintenance documentation
/// only specifies an abnormal-fault threshold of roughly 48psi/day. [`Self::LEAK_RATIO_PER_SECOND`]
/// is a conservative placeholder intentionally far below that figure, so the bottle does not
/// noticeably deplete within a single flight - consistent with how these bottles behave in
/// service between scheduled recharges.
///
/// The flyPad crew oxygen bottle leak (FailureType::CockpitOxygenBottleLeak) takes 100 PSI/min more, the rate of the
/// A380X cockpit bottle leak: the DOOR/OXY page value pulses below 600 PSI and is amber below 300 PSI, CKPT OXY turns
/// amber below 300 PSI (FCOM DSC-35-20-20, a320_fcom.txt l.56814-56818, 56825-56831). The FCOM gives no leak rate.
pub struct A320Oxygen {
    crew_bottle_pressure_id: VariableIdentifier,
    cockpit_duct_temperature_id: VariableIdentifier,

    cockpit_duct_temperature: ThermodynamicTemperature,
    charge_remaining: Ratio,
    pressure: Pressure,

    bottle_leak: Failure,
}
impl A320Oxygen {
    /// Nominal full charge pressure at the reference temperature used when charging the bottle.
    const FULL_CHARGE_PRESSURE_PSI: f64 = 1850.;
    /// 70 degF / 21 degC, the standard reference temperature for the full charge pressure above.
    const REFERENCE_TEMPERATURE_KELVIN: f64 = 294.15;

    const LEAK_RATIO_PER_SECOND: f64 = 1e-8;
    /// The bottle leak failure, PSI/min of the full charge pressure
    const FAILURE_LEAK_PSI_PER_MINUTE: f64 = 100.;

    pub fn new(context: &mut InitContext) -> Self {
        Self {
            crew_bottle_pressure_id: context
                .get_identifier("OXYGEN_CREW_BOTTLE_PRESSURE".to_owned()),
            cockpit_duct_temperature_id: context.get_identifier("COND_CKPT_DUCT_TEMP".to_owned()),

            cockpit_duct_temperature: ThermodynamicTemperature::new::<kelvin>(
                Self::REFERENCE_TEMPERATURE_KELVIN,
            ),
            charge_remaining: Ratio::new::<ratio>(1.),
            pressure: Pressure::new::<psi>(Self::FULL_CHARGE_PRESSURE_PSI),

            bottle_leak: Failure::new(FailureType::CockpitOxygenBottleLeak),
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        let mut leak_ratio_per_second = Self::LEAK_RATIO_PER_SECOND;
        if self.bottle_leak.is_active() {
            leak_ratio_per_second +=
                Self::FAILURE_LEAK_PSI_PER_MINUTE / 60. / Self::FULL_CHARGE_PRESSURE_PSI;
        }
        self.charge_remaining -=
            Ratio::new::<ratio>(leak_ratio_per_second * context.delta_as_secs_f64());
        self.charge_remaining = self.charge_remaining.max(Ratio::new::<ratio>(0.));

        let temperature_ratio =
            self.cockpit_duct_temperature.get::<kelvin>() / Self::REFERENCE_TEMPERATURE_KELVIN;

        self.pressure = Pressure::new::<psi>(
            Self::FULL_CHARGE_PRESSURE_PSI
                * self.charge_remaining.get::<ratio>()
                * temperature_ratio,
        )
        .max(Pressure::new::<psi>(0.));
    }
}
impl SimulationElement for A320Oxygen {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.bottle_leak.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.cockpit_duct_temperature = reader.read(&self.cockpit_duct_temperature_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.crew_bottle_pressure_id, self.pressure.get::<psi>());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };

    struct TestAircraft {
        oxygen: A320Oxygen,
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.oxygen.update(context);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.oxygen.accept(visitor);
            visitor.visit(self);
        }
    }

    /// The bottle at its 21 degC charging reference temperature
    fn test_bed() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(|context| TestAircraft {
            oxygen: A320Oxygen::new(context),
        });
        test_bed.write_by_name("COND_CKPT_DUCT_TEMP", 21.);
        test_bed
    }

    fn run_minutes(test_bed: &mut SimulationTestBed<TestAircraft>, minutes: u32) {
        test_bed.run_iterations_with_delta(minutes * 60, Duration::from_secs(1));
    }

    fn crew_bottle_pressure(test_bed: &mut SimulationTestBed<TestAircraft>) -> f64 {
        test_bed.read_by_name("OXYGEN_CREW_BOTTLE_PRESSURE")
    }

    #[test]
    fn the_bottle_keeps_its_charge_without_failure() {
        let mut test_bed = test_bed();
        run_minutes(&mut test_bed, 60);

        assert!((crew_bottle_pressure(&mut test_bed) - 1850.).abs() < 1.);
    }

    /// The leak takes 100 PSI/min, the rate of the A380X cockpit bottle leak (a380_systems oxygen.rs): the DOOR/OXY
    /// page value pulses below 600 PSI and is amber below 300 PSI (FCOM DSC-35-20-20 l.56814-56818)
    #[test]
    fn a_crew_bottle_leak_brings_the_pressure_below_300_psi_after_16_min() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::CockpitOxygenBottleLeak);
        run_minutes(&mut test_bed, 15);
        assert!(crew_bottle_pressure(&mut test_bed) > 300.);

        run_minutes(&mut test_bed, 2);
        assert!(crew_bottle_pressure(&mut test_bed) < 300.);

        run_minutes(&mut test_bed, 5);
        assert!(crew_bottle_pressure(&mut test_bed) < 1.);
    }

    #[test]
    fn the_leak_stops_when_the_failure_is_cleared() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::CockpitOxygenBottleLeak);
        run_minutes(&mut test_bed, 5);
        test_bed.unfail(FailureType::CockpitOxygenBottleLeak);
        test_bed.run();
        let pressure_after_leak = crew_bottle_pressure(&mut test_bed);
        assert!(pressure_after_leak < 1400.);

        run_minutes(&mut test_bed, 10);
        assert!((crew_bottle_pressure(&mut test_bed) - pressure_after_leak).abs() < 1.);
    }
}
