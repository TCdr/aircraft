use std::time::Duration;
use systems::navigation::adirs::{
    AdiruElectricalSupply, AirDataInertialReferenceSystem, AirDataInertialReferenceUnitProgramming,
    InertialReferenceBackupSupply, LowSpeedWarningThreshold,
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
    /// ELEC EMER CONFIG remaining systems: IR 1 only (IR 2 and IR 3 are lost 5 min after the failure of the main
    /// generators) and ADR 1 only with the emergency generator, no ADR on batteries only. With AC, the ELEC busbar
    /// faults give the AC supplies (FWC/Logic/ElecBusAlerts): AC ESS BUS FAULT loses ADR 1, AC BUS 2 FAULT ADR 2, AC
    /// BUS 1 FAULT ADR 3. So the ADRs need their AC bus, and the IRs run on the batteries without it, IR 2 and IR 3 for
    /// 5 min. Design choices (no published bus names for the battery supply): IR 1 on the hot bus 1, IR 2 and IR 3 on
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
        );
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
