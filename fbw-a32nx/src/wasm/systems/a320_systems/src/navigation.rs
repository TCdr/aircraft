use std::time::Duration;
use systems::navigation::adirs::{
    AirDataInertialReferenceSystem, AirDataInertialReferenceUnitProgramming, CompleteAlignmentTime,
    LowSpeedWarningThreshold,
};
use systems::navigation::ala52b::{
    Ala52BAircraftInstallationDelay, Ala52BRadioAltimeter, Ala52BTransceiverPair,
};
use systems::navigation::radio_altimeter::{AntennaInstallation, RadioAltimeter};
use systems::shared::{ElectricalBusType, MachNumber};
use systems::simulation::{
    InitContext, SimulationElement, SimulationElementVisitor, UpdateContext,
};
use uom::si::f64::*;
use uom::si::length::{foot, meter};
use uom::si::velocity::knot;

pub(crate) struct A320AirDataInertialReferenceSystemBuilder;
impl A320AirDataInertialReferenceSystemBuilder {
    /// A320 FCOM DSC-22_20-20-40 ALIGNMENT OF INERTIAL REFERENCE SYSTEM (a320_fcom.txt
    /// l.12797-12798): "A normal alignment takes 10 min and a fast alignment takes 30 s", with the
    /// memo "IRS IN ALIGN X MN" counting the minutes left, 1 < X < 10 (l.52686-52688). Unlike the
    /// A380 FCOM, the A320 FCOM gives no latitude dependency (ground alignment only up to 73 deg,
    /// l.116718).
    const COMPLETE_ALIGNMENT_TIME: Duration = Duration::from_secs(10 * 60);

    pub(crate) fn build(context: &mut InitContext) -> AirDataInertialReferenceSystem {
        let adirs_programming = AirDataInertialReferenceUnitProgramming::new(
            Velocity::new::<knot>(350.),
            MachNumber(0.82),
            [
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(100.),
                    Velocity::new::<knot>(104.),
                ),
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(50.),
                    Velocity::new::<knot>(54.),
                ),
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(155.),
                    Velocity::new::<knot>(159.),
                ),
                LowSpeedWarningThreshold::new(
                    Velocity::new::<knot>(260.),
                    Velocity::new::<knot>(264.),
                ),
            ],
        )
        .with_complete_alignment_time(CompleteAlignmentTime::Fixed(Self::COMPLETE_ALIGNMENT_TIME));
        AirDataInertialReferenceSystem::new(context, adirs_programming)
    }
}

pub struct A320RadioAltimeters {
    radio_altimeter_1: A320RadioAltimeter,
    radio_altimeter_2: A320RadioAltimeter,
}

impl A320RadioAltimeters {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            radio_altimeter_1: A320RadioAltimeter::new(
                context,
                1,
                ElectricalBusType::AlternatingCurrent(1),
                AntennaInstallation::new(
                    // Sim CG minus RA height over ground
                    Length::new::<foot>(8.617) - Length::new::<meter>(1.8),
                    // Aft distance from Sim CG
                    Length::new::<meter>(9.89),
                    // Electric length of the antennas and cable modeling some material variation
                    Length::new::<foot>(22.4),
                ),
                AntennaInstallation::new(
                    Length::new::<foot>(8.617) - Length::new::<meter>(1.8),
                    Length::new::<meter>(9.19),
                    Length::new::<foot>(22.4),
                ),
            ),
            radio_altimeter_2: A320RadioAltimeter::new(
                context,
                2,
                ElectricalBusType::AlternatingCurrent(2),
                AntennaInstallation::new(
                    Length::new::<foot>(8.617) - Length::new::<meter>(1.8),
                    Length::new::<meter>(11.27),
                    Length::new::<foot>(21.4),
                ),
                AntennaInstallation::new(
                    Length::new::<foot>(8.617) - Length::new::<meter>(1.8),
                    Length::new::<meter>(11.96),
                    Length::new::<foot>(21.4),
                ),
            ),
        }
    }

    pub fn update(&mut self, context: &UpdateContext) {
        self.radio_altimeter_1.update(context);
        self.radio_altimeter_2.update(context);
    }

    pub fn radio_altimeter_1(&self) -> &impl RadioAltimeter {
        &self.radio_altimeter_1.radio_altimeter
    }

    pub fn radio_altimeter_2(&self) -> &impl RadioAltimeter {
        &self.radio_altimeter_2.radio_altimeter
    }
}

impl SimulationElement for A320RadioAltimeters {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.radio_altimeter_1.accept(visitor);
        self.radio_altimeter_2.accept(visitor);

        visitor.visit(self);
    }
}

pub struct A320RadioAltimeter {
    radio_altimeter: Ala52BRadioAltimeter,
    transceivers: Ala52BTransceiverPair,
}

impl A320RadioAltimeter {
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
                Ala52BAircraftInstallationDelay::FiftySevenFeet,
                powered_by,
            ),
            transceivers: Ala52BTransceiverPair::new(context, number, transmitter, receiver),
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        self.radio_altimeter.update(context, &self.transceivers);
    }
}

impl SimulationElement for A320RadioAltimeter {
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
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };
    use uom::si::angle::degree;

    struct TestAircraft {
        adirs: AirDataInertialReferenceSystem,
        overhead: AirDataInertialReferenceSystemOverheadPanel,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                adirs: A320AirDataInertialReferenceSystemBuilder::build(context),
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
    }

    fn set_all_ir_mode_selectors(test_bed: &mut SimulationTestBed<TestAircraft>, mode: f64) {
        for number in 1..=3 {
            test_bed.write_by_name(
                &format!("OVHD_ADIRS_IR_{}_MODE_SELECTOR_KNOB", number),
                mode,
            );
        }
    }

    #[test]
    fn a_complete_ir_alignment_takes_10_minutes_at_the_equator() {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.set_on_ground(true);
        test_bed.write_by_name("PLANE LATITUDE", Angle::new::<degree>(0.));
        // OFF long enough to need a complete alignment, then NAV
        // (the first frame OFF arms the 5 s quick re-alignment, the next one lets it run out)
        set_all_ir_mode_selectors(&mut test_bed, 0.);
        test_bed.run_with_delta(Duration::from_secs(1));
        test_bed.run_with_delta(Duration::from_secs(30));
        set_all_ir_mode_selectors(&mut test_bed, 1.);
        test_bed.run_with_delta(Duration::ZERO);

        let remaining: Duration = test_bed.read_by_name("ADIRS_REMAINING_IR_ALIGNMENT_TIME");
        assert_eq!(remaining, Duration::from_secs(600));
    }
}
