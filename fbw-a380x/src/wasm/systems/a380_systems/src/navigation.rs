use systems::navigation::adirs::{
    AirDataInertialReferenceSystem, AirDataInertialReferenceUnitProgramming,
    LowSpeedWarningThreshold,
};
use systems::navigation::ala52b::{
    Ala52BAircraftInstallationDelay, Ala52BRadioAltimeter, Ala52BTransceiverPair,
};
use systems::navigation::radio_altimeter::AntennaInstallation;
use systems::shared::{ElectricalBusType, MachNumber};
use systems::simulation::{
    InitContext, SimulationElement, SimulationElementVisitor, UpdateContext,
};
use uom::si::f64::*;
use uom::si::length::{foot, meter};
use uom::si::velocity::knot;

pub(crate) struct A380AirDataInertialReferenceSystemBuilder;
impl A380AirDataInertialReferenceSystemBuilder {
    pub(crate) fn build(context: &mut InitContext) -> AirDataInertialReferenceSystem {
        let adirs_programming = AirDataInertialReferenceUnitProgramming::new(
            Velocity::new::<knot>(340.),
            MachNumber(0.89),
            [
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(50.),
                    Velocity::new::<knot>(54.),
                ),
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(260.),
                    Velocity::new::<knot>(264.),
                ),
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(100.),
                    Velocity::new::<knot>(104.),
                ),
                // Landing gear extension inhibit (hydraulic gear safety valve): A380 FCOM DSC-32-10-20
                // (a380_fcom.txt l.78663-78664) "The LGCIS receives airspeed data from the ADIRS to inhibit the
                // extension of the landing gear above 280 kt." (the A320 uses 260 kt here)
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(280.),
                    Velocity::new::<knot>(284.),
                ),
            ],
        );
        AirDataInertialReferenceSystem::new(context, adirs_programming)
    }
}

pub struct A380RadioAltimeters {
    radio_altimeter_1: A380RadioAltimeter,
    radio_altimeter_2: A380RadioAltimeter,
    radio_altimeter_3: A380RadioAltimeter,
}

impl A380RadioAltimeters {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            radio_altimeter_1: A380RadioAltimeter::new(
                context,
                1,
                ElectricalBusType::AlternatingCurrent(1),
                AntennaInstallation::new(
                    // Sim alt over ground minus RA height over ground
                    Length::new::<foot>(14.75) - Length::new::<meter>(3.78),
                    // Aft distance from Sim CG
                    Length::new::<meter>(12.50),
                    // Electric length of the antennas and cable modeling some material variation
                    Length::new::<foot>(27.0),
                ),
                AntennaInstallation::new(
                    Length::new::<foot>(14.75) - Length::new::<meter>(3.69),
                    Length::new::<meter>(11.69),
                    Length::new::<foot>(27.0),
                ),
            ),
            radio_altimeter_2: A380RadioAltimeter::new(
                context,
                2,
                ElectricalBusType::AlternatingCurrent(2),
                AntennaInstallation::new(
                    Length::new::<foot>(14.75) - Length::new::<meter>(3.89),
                    Length::new::<meter>(13.35),
                    Length::new::<foot>(26.2),
                ),
                AntennaInstallation::new(
                    Length::new::<foot>(14.75) - Length::new::<meter>(4.01),
                    Length::new::<meter>(14.20),
                    Length::new::<foot>(26.2),
                ),
            ),
            // RA SYS C = AC ESS (A380 FCOM DSC-34-10-100, a380_fcom.txt:87595-87601; ELEC AC ESS BUS FAULT:
            // RA SYS C redundancy loss, 139284). AC ESS (400XP) is AlternatingCurrentEssentialShed.
            radio_altimeter_3: A380RadioAltimeter::new(
                context,
                3,
                ElectricalBusType::AlternatingCurrentEssentialShed,
                AntennaInstallation::new(
                    Length::new::<foot>(14.75) - Length::new::<meter>(4.27),
                    Length::new::<meter>(15.90),
                    Length::new::<foot>(25.4),
                ),
                AntennaInstallation::new(
                    Length::new::<foot>(14.75) - Length::new::<meter>(4.14),
                    Length::new::<meter>(15.05),
                    Length::new::<foot>(25.4),
                ),
            ),
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        self.radio_altimeter_1.update(context);
        self.radio_altimeter_2.update(context);
        self.radio_altimeter_3.update(context);
    }
}

impl SimulationElement for A380RadioAltimeters {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.radio_altimeter_1.accept(visitor);
        self.radio_altimeter_2.accept(visitor);
        self.radio_altimeter_3.accept(visitor);

        visitor.visit(self);
    }
}

pub struct A380RadioAltimeter {
    radio_altimeter: Ala52BRadioAltimeter,
    transceivers: Ala52BTransceiverPair,
}

impl A380RadioAltimeter {
    fn new(
        context: &mut InitContext,
        number: usize,
        powered_by: ElectricalBusType,
        transmitter: AntennaInstallation,
        receiver: AntennaInstallation,
    ) -> Self {
        Self {
            radio_altimeter: Ala52BRadioAltimeter::new(
                context,
                number,
                Ala52BAircraftInstallationDelay::EightyFeet,
                powered_by,
            ),
            transceivers: Ala52BTransceiverPair::new(context, number, transmitter, receiver),
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        self.radio_altimeter.update(context, &self.transceivers);
    }
}

impl SimulationElement for A380RadioAltimeter {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.transceivers.accept(visitor);
        self.radio_altimeter.accept(visitor);

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::navigation::adirs::AirDataInertialReferenceSystemOverheadPanel;
    use systems::shared::AdirsDiscreteOutputs;
    use systems::simulation::test::{SimulationTestBed, TestBed, WriteByName};
    use systems::simulation::{Aircraft, SimulatorReader, SimulatorWriter};

    struct TestAircraft {
        adirs: AirDataInertialReferenceSystem,
        overhead: AirDataInertialReferenceSystemOverheadPanel,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                adirs: A380AirDataInertialReferenceSystemBuilder::build(context),
                overhead: AirDataInertialReferenceSystemOverheadPanel::new(context),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.adirs.update(context, &self.overhead);
            self.overhead.update(context, &self.adirs);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.adirs.accept(visitor);
            self.overhead.accept(visitor);

            visitor.visit(self);
        }

        fn read(&mut self, _reader: &mut SimulatorReader) {}

        fn write(&self, _writer: &mut SimulatorWriter) {}
    }

    fn test_bed_with_all_adirus_in_nav() -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        for number in 1..=3 {
            // InertialReferenceMode::Navigation
            test_bed.write_by_name(&format!("OVHD_ADIRS_IR_{}_MODE_SELECTOR_KNOB", number), 1.);
        }
        test_bed
    }

    #[test]
    // A380 FCOM DSC-32-10-20 (a380_fcom.txt l.78663-78664): the landing gear extension is inhibited above 280 kt.
    // The hydraulic gear safety valve opens below the threshold of the ADIRU low speed discrete 4.
    fn gear_extension_speed_discrete_allows_extension_up_to_280_knots() {
        let mut test_bed = test_bed_with_all_adirus_in_nav();

        test_bed.set_indicated_airspeed(Velocity::new::<knot>(270.));
        test_bed.run();
        for adiru_number in 1..=3 {
            assert!(test_bed.query(|a| a.adirs.low_speed_warning_4(adiru_number)));
        }

        test_bed.set_indicated_airspeed(Velocity::new::<knot>(290.));
        test_bed.run();
        for adiru_number in 1..=3 {
            assert!(!test_bed.query(|a| a.adirs.low_speed_warning_4(adiru_number)));
        }
    }
}
