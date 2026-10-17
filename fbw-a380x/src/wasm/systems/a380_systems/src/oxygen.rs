//! ATA 35 oxygen of the A380: the pressure of the cockpit and cabin oxygen bottles and the cabin oxygen valves, for
//! the DOOR/OXY SD page and the FWS alerts OXY CKPT BOTTLE PRESS LO, OXY CABIN BOTTLE PRESS LO and OXY CABIN VLV CLOSED.
//!
//! Design choices (no published values): the bottles hold their full charge, 1 850 PSI, as long as nothing draws on
//! them (the crew masks and the cabin masks are not modelled); a leak failure empties a bottle at 100 PSI/min, so that
//! OXY CKPT BOTTLE PRESS LO (below 350 PSI) comes after 15 min. The cabin valve failure holds one regulator supply
//! valve failed closed.

use uom::si::{f64::*, pressure::psi};

use systems::{
    failures::{Failure, FailureType},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};

struct OxygenBottle {
    pressure_id: VariableIdentifier,
    pressure: Pressure,
    leak: Failure,
}
impl OxygenBottle {
    const FULL_CHARGE_PRESSURE_PSI: f64 = 1850.;
    const LEAK_RATE_PSI_PER_SECOND: f64 = 100. / 60.;

    fn new(context: &mut InitContext, pressure_name: &str, leak: FailureType) -> Self {
        Self {
            pressure_id: context.get_identifier(pressure_name.to_owned()),
            pressure: Pressure::new::<psi>(Self::FULL_CHARGE_PRESSURE_PSI),
            leak: Failure::new(leak),
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        if self.leak.is_active() {
            let pressure_psi = self.pressure.get::<psi>()
                - Self::LEAK_RATE_PSI_PER_SECOND * context.delta_as_secs_f64();
            self.pressure = Pressure::new::<psi>(pressure_psi.max(0.));
        }
    }
}
impl SimulationElement for OxygenBottle {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.leak.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.pressure_id, self.pressure.get::<psi>());
    }
}

pub struct A380Oxygen {
    cockpit_bottle: OxygenBottle,
    cabin_bottles: OxygenBottle,
    cabin_valve_closed_id: VariableIdentifier,
    cabin_valve_stuck_closed: Failure,
}
impl A380Oxygen {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            cockpit_bottle: OxygenBottle::new(
                context,
                "OXYGEN_CREW_BOTTLE_PRESSURE",
                FailureType::CockpitOxygenBottleLeak,
            ),
            cabin_bottles: OxygenBottle::new(
                context,
                "OXYGEN_CABIN_BOTTLE_PRESSURE",
                FailureType::CabinOxygenBottleLeak,
            ),
            cabin_valve_closed_id: context.get_identifier("OXYGEN_CABIN_VALVE_CLOSED".to_owned()),
            cabin_valve_stuck_closed: Failure::new(FailureType::CabinOxygenValveStuckClosed),
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        self.cockpit_bottle.update(context);
        self.cabin_bottles.update(context);
    }
}
impl SimulationElement for A380Oxygen {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.cockpit_bottle.accept(visitor);
        self.cabin_bottles.accept(visitor);
        self.cabin_valve_stuck_closed.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.cabin_valve_closed_id,
            self.cabin_valve_stuck_closed.is_active(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed},
        Aircraft,
    };

    struct TestAircraft {
        oxygen: A380Oxygen,
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

    fn test_bed() -> SimulationTestBed<TestAircraft> {
        SimulationTestBed::new(|context| TestAircraft {
            oxygen: A380Oxygen::new(context),
        })
    }

    fn run_minutes(test_bed: &mut SimulationTestBed<TestAircraft>, minutes: u32) {
        test_bed.run_iterations_with_delta(minutes * 60, Duration::from_secs(1));
    }

    #[test]
    fn the_bottles_keep_their_full_charge_without_failure() {
        let mut test_bed = test_bed();
        run_minutes(&mut test_bed, 60);

        let crew: f64 = test_bed.read_by_name("OXYGEN_CREW_BOTTLE_PRESSURE");
        let cabin: f64 = test_bed.read_by_name("OXYGEN_CABIN_BOTTLE_PRESSURE");
        assert!((crew - 1850.).abs() < 1.);
        assert!((cabin - 1850.).abs() < 1.);
        let cabin_valve_closed: bool = test_bed.read_by_name("OXYGEN_CABIN_VALVE_CLOSED");
        assert!(!cabin_valve_closed);
    }

    #[test]
    fn a_cockpit_bottle_leak_brings_the_pressure_below_350_psi_after_15_min() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::CockpitOxygenBottleLeak);
        run_minutes(&mut test_bed, 14);
        let crew: f64 = test_bed.read_by_name("OXYGEN_CREW_BOTTLE_PRESSURE");
        assert!(crew > 350.);

        run_minutes(&mut test_bed, 2);
        let crew: f64 = test_bed.read_by_name("OXYGEN_CREW_BOTTLE_PRESSURE");
        let cabin: f64 = test_bed.read_by_name("OXYGEN_CABIN_BOTTLE_PRESSURE");
        assert!(crew < 350.);
        assert!((cabin - 1850.).abs() < 1.);
    }

    #[test]
    fn a_cabin_bottle_leak_empties_the_cabin_bottles() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::CabinOxygenBottleLeak);
        run_minutes(&mut test_bed, 30);

        let cabin: f64 = test_bed.read_by_name("OXYGEN_CABIN_BOTTLE_PRESSURE");
        assert!(cabin < 1.);
    }

    #[test]
    fn the_cabin_valve_failure_closes_a_regulator_supply_valve() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::CabinOxygenValveStuckClosed);
        test_bed.run();

        let cabin_valve_closed: bool = test_bed.read_by_name("OXYGEN_CABIN_VALVE_CLOSED");
        assert!(cabin_valve_closed);
    }
}
