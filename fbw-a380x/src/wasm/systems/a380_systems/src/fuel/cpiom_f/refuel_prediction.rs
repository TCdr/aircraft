//! The refuel predictions of the FQMS, for the FWS:
//! - the gross weight and CG at the end of the refuel: the preselected fuel quantity distributed as
//!   the automatic refuel does, with the ZFW and ZFCG of the refuel (FUEL PREDICTED CG OUT OF T.O
//!   RANGE);
//! - the largest difference between a tank quantity and the standard distribution of the fuel on
//!   board (FUEL ABNORM AUTO REFUEL DISTRIBUTION).

use super::{
    fuel_measuring::gross_weight_center_of_gravity, IntegratedRefuelPanel, RefuelApplication,
};
use crate::fuel::A380FuelTankType;
use enum_map::Enum;
use systems::{
    fuel::FuelPayload,
    payload::LoadsheetInfo,
    shared::{arinc429::SignStatus, Resolution},
    simulation::{InitContext, SimulationElement, SimulatorWriter, VariableIdentifier, Write},
};
use uom::si::{
    f64::{Mass, Ratio},
    mass::kilogram,
    ratio::percent,
};

pub(super) struct RefuelPrediction {
    predicted_gross_weight_id: VariableIdentifier,
    predicted_center_of_gravity_id: VariableIdentifier,
    distribution_deviation_id: VariableIdentifier,

    predicted_gross_weight: Option<Mass>,
    predicted_center_of_gravity: Option<Ratio>,
    distribution_deviation: Option<Mass>,
}
impl RefuelPrediction {
    pub(super) fn new(context: &mut InitContext) -> Self {
        Self {
            predicted_gross_weight_id: context
                .get_identifier("FQMS_PREDICTED_GROSS_WEIGHT".to_owned()),
            predicted_center_of_gravity_id: context
                .get_identifier("FQMS_PREDICTED_CENTER_OF_GRAVITY_MAC".to_owned()),
            distribution_deviation_id: context
                .get_identifier("FQMS_REFUEL_DISTRIBUTION_DEVIATION".to_owned()),
            predicted_gross_weight: None,
            predicted_center_of_gravity: None,
            distribution_deviation: None,
        }
    }

    pub(super) fn update(
        &mut self,
        refuel_application: &mut RefuelApplication,
        refuel_panel: &IntegratedRefuelPanel,
        fuel_system: &impl FuelPayload,
        loadsheet: &LoadsheetInfo,
    ) {
        let zero_fuel_weight = refuel_panel.target_zero_fuel_weight();
        let zero_fuel_weight_cg_percent = refuel_panel.target_zero_fuel_weight_cg_mac();
        // Without the ZFW of the refuel there is no prediction and no standard distribution
        if zero_fuel_weight <= Mass::default() {
            self.reset();
            return;
        }

        let predicted_quantities = refuel_application.calculate_auto_refuel(
            refuel_panel.total_desired_fuel(),
            zero_fuel_weight,
            zero_fuel_weight_cg_percent,
        );
        self.predicted_gross_weight = Some(
            zero_fuel_weight
                + predicted_quantities
                    .values()
                    .fold(Mass::default(), |total, quantity| total + *quantity),
        );
        self.predicted_center_of_gravity = Some(gross_weight_center_of_gravity(
            loadsheet,
            zero_fuel_weight,
            Ratio::new::<percent>(zero_fuel_weight_cg_percent),
            predicted_quantities.into_iter(),
        ));

        let standard_quantities = refuel_application.calculate_auto_refuel(
            fuel_system.total_load(),
            zero_fuel_weight,
            zero_fuel_weight_cg_percent,
        );
        self.distribution_deviation = A380FuelTankType::iterator()
            .map(|tank| {
                let standard = standard_quantities.get(&tank).copied().unwrap_or_default();
                (fuel_system.tank_mass(tank.into_usize()) - standard).abs()
            })
            .reduce(|largest, deviation| {
                if deviation > largest {
                    deviation
                } else {
                    largest
                }
            });
    }

    pub(super) fn reset(&mut self) {
        self.predicted_gross_weight = None;
        self.predicted_center_of_gravity = None;
        self.distribution_deviation = None;
    }

    #[cfg(test)]
    pub(super) fn predicted_center_of_gravity(&self) -> Option<Ratio> {
        self.predicted_center_of_gravity
    }

    #[cfg(test)]
    pub(super) fn distribution_deviation(&self) -> Option<Mass> {
        self.distribution_deviation
    }

    fn write_value(writer: &mut SimulatorWriter, id: &VariableIdentifier, value: Option<f64>) {
        let (value, ssm) = value.map_or((0., SignStatus::NoComputedData), |v| {
            (v, SignStatus::NormalOperation)
        });
        writer.write_arinc429(id, value, ssm);
    }
}
impl SimulationElement for RefuelPrediction {
    fn write(&self, writer: &mut SimulatorWriter) {
        Self::write_value(
            writer,
            &self.predicted_gross_weight_id,
            self.predicted_gross_weight
                .map(|weight| weight.get::<kilogram>().resolution(1.)),
        );
        Self::write_value(
            writer,
            &self.predicted_center_of_gravity_id,
            self.predicted_center_of_gravity
                .map(|cg| cg.get::<percent>().resolution(0.1)),
        );
        Self::write_value(
            writer,
            &self.distribution_deviation_id,
            self.distribution_deviation
                .map(|deviation| deviation.get::<kilogram>().resolution(1.)),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::airframe::A380Airframe;
    use std::collections::HashMap;
    use systems::{
        shared::{arinc429::Arinc429Word, ElectricalBusType},
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, SimulationElementVisitor, UpdateContext,
        },
    };

    struct TestFuel {
        quantities: HashMap<A380FuelTankType, Mass>,
    }
    impl FuelPayload for TestFuel {
        fn total_load(&self) -> Mass {
            self.quantities
                .values()
                .fold(Mass::default(), |total, quantity| total + *quantity)
        }
        fn fore_aft_center_of_gravity(&self) -> f64 {
            0.
        }
        fn tank_mass(&self, t: usize) -> Mass {
            self.quantities
                .get(&A380FuelTankType::from_usize(t))
                .copied()
                .unwrap_or_default()
        }
    }

    struct TestAircraft {
        refuel_panel: IntegratedRefuelPanel,
        refuel_application: RefuelApplication,
        prediction: RefuelPrediction,
        fuel: TestFuel,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                refuel_panel: IntegratedRefuelPanel::new(
                    context,
                    ElectricalBusType::DirectCurrentNamed("502PP"),
                ),
                refuel_application: RefuelApplication::new(context),
                prediction: RefuelPrediction::new(context),
                fuel: TestFuel {
                    quantities: HashMap::new(),
                },
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_after_power_distribution(&mut self, _context: &UpdateContext) {
            self.prediction.update(
                &mut self.refuel_application,
                &self.refuel_panel,
                &self.fuel,
                A380Airframe::get_loadsheet(),
            );
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.refuel_panel.accept(visitor);
            self.prediction.accept(visitor);
            visitor.visit(self);
        }
    }

    /// A test bed with a preselected fuel quantity and the ZFW and ZFCG of the refuel
    fn test_bed(pfq_kg: f64, zfw_kg: f64, zfcg_percent: f64) -> SimulationTestBed<TestAircraft> {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.write_by_name("FUEL_DESIRED", pfq_kg);
        test_bed.write_by_name("AIRFRAME_ZFW_DESIRED", zfw_kg);
        test_bed.write_by_name("AIRFRAME_ZFW_CG_PERCENT_MAC_DESIRED", zfcg_percent);
        test_bed
    }

    /// The tanks hold the standard distribution of a fuel quantity, then `moved_kg` moves from the
    /// left inner tank to the trim tank
    fn load_standard_distribution(
        test_bed: &mut SimulationTestBed<TestAircraft>,
        fuel_kg: f64,
        moved_kg: f64,
    ) {
        test_bed.command(|a| {
            let mut quantities = a.refuel_application.calculate_auto_refuel(
                Mass::new::<kilogram>(fuel_kg),
                Mass::new::<kilogram>(300_000.),
                36.5,
            );
            let moved = Mass::new::<kilogram>(moved_kg);
            *quantities.get_mut(&A380FuelTankType::LeftInner).unwrap() -= moved;
            *quantities.get_mut(&A380FuelTankType::Trim).unwrap() += moved;
            a.fuel.quantities = quantities;
        });
    }

    #[test]
    fn predicts_the_gross_weight_at_the_end_of_the_refuel() {
        let mut test_bed = test_bed(100_000., 300_000., 36.5);
        test_bed.run();
        let gross_weight: Arinc429Word<f64> =
            test_bed.read_arinc429_by_name("FQMS_PREDICTED_GROSS_WEIGHT");
        assert!((gross_weight.normal_value().unwrap() - 400_000.).abs() < 1.);
        assert!(test_bed
            .query(|a| a.prediction.predicted_center_of_gravity())
            .is_some());
    }

    #[test]
    fn predicts_the_cg_of_a_small_refuel_on_an_aft_zero_fuel_cg() {
        // 20 000 kg: 4 500 kg in each feed tank, 1 000 kg in each outer tank, no trim tank fuel.
        // ZFW 300 t at 43 % MAC: 320 t at 42.6 % MAC, aft of the 41.9 % takeoff limit
        let mut test_bed = test_bed(20_000., 300_000., 43.);
        test_bed.run();
        let cg = test_bed
            .query(|a| a.prediction.predicted_center_of_gravity())
            .unwrap();
        assert!((cg.get::<percent>() - 42.58).abs() < 0.01);
    }

    #[test]
    fn no_prediction_without_the_zero_fuel_weight_of_the_refuel() {
        let mut test_bed = test_bed(20_000., 0., 36.5);
        test_bed.run();
        let gross_weight: Arinc429Word<f64> =
            test_bed.read_arinc429_by_name("FQMS_PREDICTED_GROSS_WEIGHT");
        assert!(gross_weight.is_no_computed_data());
        assert!(test_bed
            .query(|a| a.prediction.predicted_center_of_gravity())
            .is_none());
    }

    #[test]
    fn the_standard_distribution_has_no_deviation() {
        let mut test_bed = test_bed(100_000., 300_000., 36.5);
        load_standard_distribution(&mut test_bed, 100_000., 0.);
        test_bed.run();
        let deviation = test_bed
            .query(|a| a.prediction.distribution_deviation())
            .unwrap();
        assert!(deviation.get::<kilogram>() < 1.);
    }

    #[test]
    fn fuel_moved_out_of_the_standard_distribution_is_the_deviation() {
        let mut test_bed = test_bed(100_000., 300_000., 36.5);
        load_standard_distribution(&mut test_bed, 100_000., 1_000.);
        test_bed.run();
        let deviation = test_bed
            .query(|a| a.prediction.distribution_deviation())
            .unwrap();
        assert!((deviation.get::<kilogram>() - 1_000.).abs() < 1.);
    }
}
