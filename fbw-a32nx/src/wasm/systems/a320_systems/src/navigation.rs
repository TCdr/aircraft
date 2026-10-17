use std::time::Duration;
use systems::navigation::adirs::{
    AdiruElectricalSupply, AirDataInertialReferenceSystem, AirDataInertialReferenceUnitProgramming,
    CompleteAlignmentTime, InertialReferenceBackupSupply, LowSpeedWarningThreshold,
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
    /// A normal IRS alignment takes 10 min and a fast alignment 30 s, with the memo
    /// IRS IN ALIGN X MN counting the minutes left, 1 < X < 10. Unlike the A380, the A320 alignment
    /// time has no latitude dependency (ground alignment only up to 73 deg).
    const COMPLETE_ALIGNMENT_TIME: Duration = Duration::from_secs(10 * 60);

    /// In ELEC EMER CONFIG, only IR 1 and ADR 1 remain with the emergency generator, and no ADR on
    /// batteries only; IR 2 and IR 3 are lost 5 min after the main generators fail. With AC, the
    /// ELEC busbar faults give the AC supplies (FWC/Logic/ElecBusAlerts): AC ESS BUS FAULT loses
    /// ADR 1, AC BUS 2 FAULT ADR 2, AC BUS 1 FAULT ADR 3.
    /// So the ADRs need their AC bus, and the IRs run on the batteries without it, IR 2 and IR 3
    /// for 5 min. Design choices (the aircraft documents give no battery bus names): IR 1 on the
    /// hot bus 1, IR 2 and IR 3 on
    /// the hot bus 2. Not modelled: ADIRU 3 on the AC ESS bus with the ATT HDG selector on CAPT 3, which also keeps
    /// IR 3 on the batteries beyond the 5 min.
    const IR_BATTERY_TIME_LIMIT: Duration = Duration::from_secs(5 * 60);

    fn electrical_supplies() -> [AdiruElectricalSupply; 3] {
        [
            AdiruElectricalSupply::new(ElectricalBusType::AlternatingCurrentEssential)
                .with_ir_backup(InertialReferenceBackupSupply::new(
                    ElectricalBusType::DirectCurrentHot(1),
                    true,
                    None,
                )),
            AdiruElectricalSupply::new(ElectricalBusType::AlternatingCurrent(2)).with_ir_backup(
                InertialReferenceBackupSupply::new(
                    ElectricalBusType::DirectCurrentHot(2),
                    true,
                    Some(Self::IR_BATTERY_TIME_LIMIT),
                ),
            ),
            AdiruElectricalSupply::new(ElectricalBusType::AlternatingCurrent(1)).with_ir_backup(
                InertialReferenceBackupSupply::new(
                    ElectricalBusType::DirectCurrentHot(2),
                    true,
                    Some(Self::IR_BATTERY_TIME_LIMIT),
                ),
            ),
        ]
    }

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
            Self::electrical_supplies(),
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
    use systems::electrical::{test::TestElectricitySource, ElectricalBus, Electricity};
    use systems::navigation::adirs::AirDataInertialReferenceSystemOverheadPanel;
    use systems::shared::PotentialOrigin;
    use systems::simulation::{
        test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
        Aircraft,
    };
    use uom::si::{angle::degree, electric_potential::volt};

    /// The buses of the A320 ADIRUs (A320AirDataInertialReferenceSystemBuilder), all powered
    const ADIRU_BUSES: [ElectricalBusType; 5] = [
        ElectricalBusType::AlternatingCurrentEssential,
        ElectricalBusType::AlternatingCurrent(1),
        ElectricalBusType::AlternatingCurrent(2),
        ElectricalBusType::DirectCurrentHot(1),
        ElectricalBusType::DirectCurrentHot(2),
    ];

    struct TestAircraft {
        electricity_source: TestElectricitySource,
        buses: [ElectricalBus; 5],
        adirs: AirDataInertialReferenceSystem,
        overhead: AirDataInertialReferenceSystemOverheadPanel,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                electricity_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                buses: ADIRU_BUSES.map(|bus| ElectricalBus::new(context, bus)),
                adirs: A320AirDataInertialReferenceSystemBuilder::build(context),
                overhead: AirDataInertialReferenceSystemOverheadPanel::new(context),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            self.electricity_source
                .power_with_potential(ElectricPotential::new::<volt>(115.));
            electricity.supplied_by(&self.electricity_source);
            for bus in self.buses.iter() {
                electricity.flow(&self.electricity_source, bus);
            }
        }

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
