//! A320 engine and APU fire protection: the fire detection of ENG 1, ENG 2 and the APU on the shared
//! [`FireDetectionUnit`] (A320 FCOM DSC-26-20-10), the flyPad fire and detection loop failures, and the chance of the
//! AGENT discharges to put a fire out.
//!
//! What is not modelled here (it stays where it was):
//! - The FIRE TEST pbs: one per zone, they drive the FWC warnings and the FIRE panel lights directly (PseudoFWC and
//!   A32NX_Interior_Fire.xml, with the flyPad "extend fire test warnings" realism option). The FDU here only sees real
//!   fires, so a test never shuts the APU down (FCOM DSC-26-20-20 APU FIRE TEST PB note).
//! - The AGENT pbs, squibs and DISCH lights: the cockpit behaviour XML sets L:A32NX_FIRE_<ZONE>_AGENT<n>_Discharge; this
//!   module only reads them (and sets the APU one for the automatic discharge on the ground).
//! - The fire detection units themselves cannot fail (no FDU failure), so FIRE DET FAULT comes from both loops failed.

use std::time::Duration;

use systems::{
    fire_protection::{
        FireDetectionUnit, FireDetectionZoneConfig, FireLoopPowerLoss, SetOnFireModule,
    },
    shared::{ElectricalBusType, FireDetectionLoopID, FireDetectionZone, LgciuWeightOnWheels},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

/// The A320 fire zones protected by fire detection loops
const A320_FIRE_ZONES: [FireDetectionZone; 3] = [
    FireDetectionZone::Engine(1),
    FireDetectionZone::Engine(2),
    FireDetectionZone::Apu,
];

/// The fire extinguisher bottles, by the name of their AGENT pb discharge variable, and the index of their zone in
/// [`A320_FIRE_ZONES`]: two bottles per engine and one for the APU (FCOM DSC-26-20-10 EXTINGUISHING).
const A320_FIRE_BOTTLES: [(&str, usize); 5] = [
    ("FIRE_ENG1_AGENT1_Discharge", 0),
    ("FIRE_ENG1_AGENT2_Discharge", 0),
    ("FIRE_ENG2_AGENT1_Discharge", 1),
    ("FIRE_ENG2_AGENT2_Discharge", 1),
    ("FIRE_APU_AGENT1_Discharge", 2),
];
const APU_BOTTLE: usize = 4;

pub(super) struct A320FireProtection {
    fire_detection_unit: FireDetectionUnit<3>,
    set_zone_on_fire: SetOnFireModule<3, 5>,

    agent_discharged_id: [VariableIdentifier; 5],
    agent_discharged: [bool; 5],
    /// The update in which the APU bottle is discharged automatically
    apu_agent_auto_discharge: bool,
    apu_auto_extinguishing_was_commanded: bool,

    /// For each zone: loop A, loop B failed
    loop_fault_id: [[VariableIdentifier; 2]; 3],
}

impl A320FireProtection {
    /// FCOM DSC-26-20-20 APU FIRE LIGHT (external power panel): "The APU fire extinguisher discharges automatically
    /// 3 s after the appearance of the fire warning" (on the ground, FCOM DSC-26-20-10 EXTINGUISHING).
    const DELAY_APU_FIRE_EXTINGUISHING: Duration = Duration::from_secs(3);

    pub(super) fn new(context: &mut InitContext) -> Self {
        // The electrical supply of the loops, from the INOP SYS of the A320 FCOM PRO-ABN-ELEC procedures:
        // DC BUS 2 FAULT: ENG 1 LOOP B + ENG 2 LOOP A; DC ESS BUS FAULT: ENG 1 LOOP A + ENG 2 LOOP B;
        // DC BAT BUS FAULT: APU FIRE DET (both APU loops).
        // The flyPad fire failures set L:A32NX_ENG_<n>_ON_FIRE / L:A32NX_APU_ON_FIRE; the simulator's own fire
        // ("ENG ON FIRE:<n>", "APU ON FIRE DETECTED", set from the MSFS failures menu) also heats the loops.
        let zones = [
            FireDetectionZoneConfig {
                zone: FireDetectionZone::Engine(1),
                loop_a_powered_by: ElectricalBusType::DirectCurrentEssential,
                loop_b_powered_by: ElectricalBusType::DirectCurrent(2),
                additional_fire_source: Some("ENG_1_ON_FIRE"),
            },
            FireDetectionZoneConfig {
                zone: FireDetectionZone::Engine(2),
                loop_a_powered_by: ElectricalBusType::DirectCurrent(2),
                loop_b_powered_by: ElectricalBusType::DirectCurrentEssential,
                additional_fire_source: Some("ENG_2_ON_FIRE"),
            },
            FireDetectionZoneConfig {
                zone: FireDetectionZone::Apu,
                loop_a_powered_by: ElectricalBusType::DirectCurrentBattery,
                loop_b_powered_by: ElectricalBusType::DirectCurrentBattery,
                additional_fire_source: Some("APU ON FIRE DETECTED"),
            },
        ];

        Self {
            fire_detection_unit: FireDetectionUnit::new(
                context,
                zones,
                FireLoopPowerLoss::LoopFault,
                Self::DELAY_APU_FIRE_EXTINGUISHING,
            ),
            set_zone_on_fire: SetOnFireModule::new(
                context,
                A320_FIRE_ZONES,
                A320_FIRE_BOTTLES.map(|(_, zone)| zone),
            ),

            agent_discharged_id: A320_FIRE_BOTTLES
                .map(|(name, _)| context.get_identifier(name.to_owned())),
            agent_discharged: [false; 5],
            apu_agent_auto_discharge: false,
            apu_auto_extinguishing_was_commanded: false,

            loop_fault_id: A320_FIRE_ZONES.map(|zone| {
                let zone_name = match zone {
                    FireDetectionZone::Engine(number) => format!("ENG{}", number),
                    _ => zone.to_string(),
                };
                ["A", "B"].map(|loop_name| {
                    context.get_identifier(format!("FIRE_{}_LOOP_{}_FAULT", zone_name, loop_name))
                })
            }),
        }
    }

    pub(super) fn update(
        &mut self,
        context: &UpdateContext,
        lgciu: [&impl LgciuWeightOnWheels; 2],
    ) {
        self.fire_detection_unit.update(context, false, lgciu);

        let should_extinguish_apu_fire = self.fire_detection_unit.should_extinguish_apu_fire();
        self.apu_agent_auto_discharge = should_extinguish_apu_fire
            && !self.apu_auto_extinguishing_was_commanded
            && !self.agent_discharged[APU_BOTTLE];
        self.apu_auto_extinguishing_was_commanded = should_extinguish_apu_fire;

        self.set_zone_on_fire.update(self.agent_discharged);
    }

    /// An APU fire is detected while on the ground: the ECB shuts the APU down (FCOM DSC-26-20-10 EXTINGUISHING)
    pub(super) fn apu_fire_on_ground(&self) -> bool {
        self.fire_detection_unit.apu_fire_on_ground()
    }
}

impl SimulationElement for A320FireProtection {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fire_detection_unit.accept(visitor);
        self.set_zone_on_fire.accept(visitor);

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        for (discharged, id) in self
            .agent_discharged
            .iter_mut()
            .zip(&self.agent_discharged_id)
        {
            *discharged = reader.read(id);
        }
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        for (&zone, [loop_a_id, loop_b_id]) in A320_FIRE_ZONES.iter().zip(&self.loop_fault_id) {
            writer.write(
                loop_a_id,
                self.fire_detection_unit
                    .loop_has_failed(FireDetectionLoopID::A, zone),
            );
            writer.write(
                loop_b_id,
                self.fire_detection_unit
                    .loop_has_failed(FireDetectionLoopID::B, zone),
            );
        }

        // Only written when discharging: the AGENT pb (cockpit behaviour XML) writes this variable too
        if self.apu_agent_auto_discharge {
            writer.write(&self.agent_discharged_id[APU_BOTTLE], true);
        }
    }
}

#[cfg(test)]
mod tests {
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        failures::FailureType,
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft,
        },
    };

    use super::*;

    struct TestLgciu {
        compressed: bool,
    }
    impl LgciuWeightOnWheels for TestLgciu {
        fn left_and_right_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            self.compressed
        }
        fn right_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            self.compressed
        }
        fn right_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            !self.compressed
        }
        fn left_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            self.compressed
        }
        fn left_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            !self.compressed
        }
        fn left_and_right_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            !self.compressed
        }
        fn nose_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            self.compressed
        }
        fn nose_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            !self.compressed
        }
    }

    struct TestAircraft {
        fire_protection: A320FireProtection,
        lgciu: TestLgciu,

        dc_ess_source: TestElectricitySource,
        dc_2_source: TestElectricitySource,
        dc_bat_source: TestElectricitySource,
        dc_ess_bus: ElectricalBus,
        dc_2_bus: ElectricalBus,
        dc_bat_bus: ElectricalBus,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                fire_protection: A320FireProtection::new(context),
                lgciu: TestLgciu { compressed: false },

                dc_ess_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::TransformerRectifier(3),
                ),
                dc_2_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::TransformerRectifier(2),
                ),
                dc_bat_source: TestElectricitySource::powered(context, PotentialOrigin::Battery(1)),
                dc_ess_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentEssential),
                dc_2_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),
                dc_bat_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentBattery),
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _context: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.dc_ess_source);
            electricity.supplied_by(&self.dc_2_source);
            electricity.supplied_by(&self.dc_bat_source);
            electricity.flow(&self.dc_ess_source, &self.dc_ess_bus);
            electricity.flow(&self.dc_2_source, &self.dc_2_bus);
            electricity.flow(&self.dc_bat_source, &self.dc_bat_bus);
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.fire_protection
                .update(context, [&self.lgciu, &self.lgciu]);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<V: SimulationElementVisitor>(&mut self, visitor: &mut V) {
            self.fire_protection.accept(visitor);

            visitor.visit(self);
        }
    }

    struct FireProtectionTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl FireProtectionTestBed {
        fn new() -> Self {
            let mut test_bed = Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            };
            // The loops are powered from the first update on
            test_bed.run();
            test_bed
        }

        fn and_run(mut self) -> Self {
            self.run();
            self
        }

        fn and_run_without_delta(mut self) -> Self {
            self.run_without_delta();
            self
        }

        fn run_for(mut self, duration: Duration) -> Self {
            self.run_with_delta(duration);
            self
        }

        fn on_ground(mut self) -> Self {
            self.command(|a| a.lgciu.compressed = true);
            self
        }

        fn fire_failure(mut self, zone: FireDetectionZone) -> Self {
            self.fail(FailureType::SetOnFire(zone));
            self
        }

        fn resolve_fire_failure(mut self, zone: FireDetectionZone) -> Self {
            self.unfail(FailureType::SetOnFire(zone));
            self
        }

        fn loop_failure(mut self, loop_id: FireDetectionLoopID, zone: FireDetectionZone) -> Self {
            self.fail(FailureType::FireDetectionLoop(loop_id, zone));
            self
        }

        fn simulator_fire(mut self, name: &str) -> Self {
            self.write_by_name(name, true);
            self
        }

        fn agent_discharged(mut self, name: &str) -> Self {
            self.write_by_name(name, true);
            self
        }

        fn dc_ess_lost(mut self) -> Self {
            self.command(|a| a.dc_ess_source.unpower());
            self
        }

        fn dc_2_lost(mut self) -> Self {
            self.command(|a| a.dc_2_source.unpower());
            self
        }

        fn dc_bat_lost(mut self) -> Self {
            self.command(|a| a.dc_bat_source.unpower());
            self
        }

        fn fire_detected(&mut self, zone_name: &str) -> bool {
            self.read_by_name(&format!("FIRE_DETECTED_{}", zone_name))
        }

        fn loop_fault(&mut self, zone_name: &str, loop_name: &str) -> bool {
            self.read_by_name(&format!("FIRE_{}_LOOP_{}_FAULT", zone_name, loop_name))
        }

        fn apu_agent_discharged(&mut self) -> bool {
            self.read_by_name("FIRE_APU_AGENT1_Discharge")
        }

        fn apu_fire_on_ground(&self) -> bool {
            self.query(|a| a.fire_protection.apu_fire_on_ground())
        }
    }
    impl TestBed for FireProtectionTestBed {
        type Aircraft = TestAircraft;

        fn test_bed(&self) -> &SimulationTestBed<TestAircraft> {
            &self.test_bed
        }

        fn test_bed_mut(&mut self) -> &mut SimulationTestBed<TestAircraft> {
            &mut self.test_bed
        }
    }

    fn test_bed() -> FireProtectionTestBed {
        FireProtectionTestBed::new()
    }

    #[test]
    fn no_fire_and_no_loop_fault_when_powered() {
        let mut test_bed = test_bed().and_run();

        for zone_name in ["ENG1", "ENG2", "APU"] {
            assert!(!test_bed.fire_detected(zone_name));
            assert!(!test_bed.loop_fault(zone_name, "A"));
            assert!(!test_bed.loop_fault(zone_name, "B"));
        }
    }

    #[test]
    fn flypad_fire_failures_are_detected_in_their_zone_only() {
        let mut test_bed = test_bed()
            .fire_failure(FireDetectionZone::Engine(2))
            .and_run()
            .and_run();

        assert!(test_bed.fire_detected("ENG2"));
        assert!(!test_bed.fire_detected("ENG1"));
        assert!(!test_bed.fire_detected("APU"));

        test_bed = test_bed
            .fire_failure(FireDetectionZone::Apu)
            .and_run()
            .and_run();

        assert!(test_bed.fire_detected("APU"));
    }

    #[test]
    fn resolving_the_fire_failure_puts_the_fire_out() {
        let mut test_bed = test_bed()
            .fire_failure(FireDetectionZone::Engine(1))
            .and_run()
            .and_run();
        assert!(test_bed.fire_detected("ENG1"));

        test_bed = test_bed
            .resolve_fire_failure(FireDetectionZone::Engine(1))
            .and_run()
            .and_run();

        assert!(!test_bed.fire_detected("ENG1"));
    }

    #[test]
    fn simulator_engine_and_apu_fires_are_detected_too() {
        let mut test_bed = test_bed()
            .simulator_fire("ENG ON FIRE:1")
            .simulator_fire("APU ON FIRE DETECTED")
            .and_run();

        assert!(test_bed.fire_detected("ENG1"));
        assert!(!test_bed.fire_detected("ENG2"));
        assert!(test_bed.fire_detected("APU"));
    }

    #[test]
    fn a_failed_loop_gives_a_loop_fault_and_the_other_loop_still_detects_a_fire() {
        let mut test_bed = test_bed()
            .loop_failure(FireDetectionLoopID::A, FireDetectionZone::Engine(1))
            .and_run();

        assert!(test_bed.loop_fault("ENG1", "A"));
        assert!(!test_bed.loop_fault("ENG1", "B"));
        assert!(!test_bed.loop_fault("ENG2", "A"));
        assert!(!test_bed.fire_detected("ENG1"));

        test_bed = test_bed.simulator_fire("ENG ON FIRE:1").and_run();

        assert!(test_bed.fire_detected("ENG1"));
    }

    #[test]
    fn both_loops_failed_more_than_5_s_apart_detect_no_fire() {
        let mut test_bed = test_bed()
            .loop_failure(FireDetectionLoopID::A, FireDetectionZone::Apu)
            .run_for(Duration::from_secs(6))
            .loop_failure(FireDetectionLoopID::B, FireDetectionZone::Apu)
            .and_run();

        assert!(test_bed.loop_fault("APU", "A"));
        assert!(test_bed.loop_fault("APU", "B"));
        assert!(!test_bed.fire_detected("APU"));

        test_bed = test_bed.simulator_fire("APU ON FIRE DETECTED").and_run();

        assert!(!test_bed.fire_detected("APU"));
    }

    #[test]
    fn both_loops_breaking_within_5_s_give_a_fire_warning() {
        let mut test_bed = test_bed()
            .loop_failure(FireDetectionLoopID::A, FireDetectionZone::Engine(2))
            .run_for(Duration::from_secs(3))
            .loop_failure(FireDetectionLoopID::B, FireDetectionZone::Engine(2))
            .and_run();

        assert!(test_bed.fire_detected("ENG2"));
    }

    #[test]
    fn dc_2_loss_fails_eng_1_loop_b_and_eng_2_loop_a_for_as_long_as_it_lasts() {
        let mut test_bed = test_bed()
            .dc_2_lost()
            .and_run()
            .run_for(Duration::from_secs(10));

        assert!(!test_bed.loop_fault("ENG1", "A"));
        assert!(test_bed.loop_fault("ENG1", "B"));
        assert!(test_bed.loop_fault("ENG2", "A"));
        assert!(!test_bed.loop_fault("ENG2", "B"));
        assert!(!test_bed.loop_fault("APU", "A"));

        // The powered loop still protects the engine
        test_bed = test_bed.simulator_fire("ENG ON FIRE:1").and_run();

        assert!(test_bed.fire_detected("ENG1"));
    }

    #[test]
    fn dc_ess_loss_fails_eng_1_loop_a_and_eng_2_loop_b() {
        let mut test_bed = test_bed().dc_ess_lost().and_run();

        assert!(test_bed.loop_fault("ENG1", "A"));
        assert!(!test_bed.loop_fault("ENG1", "B"));
        assert!(!test_bed.loop_fault("ENG2", "A"));
        assert!(test_bed.loop_fault("ENG2", "B"));
    }

    #[test]
    fn losing_the_supply_of_both_loops_is_not_a_flame_effect() {
        let mut test_bed = test_bed().dc_ess_lost().dc_2_lost().dc_bat_lost().and_run();

        for zone_name in ["ENG1", "ENG2", "APU"] {
            assert!(test_bed.loop_fault(zone_name, "A"));
            assert!(test_bed.loop_fault(zone_name, "B"));
            assert!(!test_bed.fire_detected(zone_name));
        }
    }

    #[test]
    fn apu_fire_on_ground_discharges_the_apu_bottle_after_3_s() {
        let mut test_bed = test_bed()
            .on_ground()
            .fire_failure(FireDetectionZone::Apu)
            .and_run_without_delta()
            .and_run_without_delta();

        assert!(test_bed.fire_detected("APU"));
        assert!(test_bed.apu_fire_on_ground());

        test_bed = test_bed.run_for(Duration::from_millis(2_500));
        assert!(!test_bed.apu_agent_discharged());

        test_bed = test_bed.run_for(Duration::from_millis(600));
        assert!(test_bed.apu_agent_discharged());
    }

    #[test]
    fn apu_fire_in_flight_does_not_discharge_the_apu_bottle() {
        let mut test_bed = test_bed()
            .fire_failure(FireDetectionZone::Apu)
            .and_run()
            .and_run()
            .run_for(Duration::from_secs(10));

        assert!(test_bed.fire_detected("APU"));
        assert!(!test_bed.apu_fire_on_ground());
        assert!(!test_bed.apu_agent_discharged());
    }

    #[test]
    fn an_agent_discharge_has_a_chance_to_put_the_engine_fire_out() {
        // Each new discharge of a bottle of the zone puts the fire out with a probability of 1/2
        let mut put_out = 0;
        for _ in 0..64 {
            let mut test_bed = test_bed()
                .fire_failure(FireDetectionZone::Engine(1))
                .and_run()
                .and_run()
                .agent_discharged("FIRE_ENG1_AGENT1_Discharge")
                .and_run()
                .and_run();
            if !test_bed.fire_detected("ENG1") {
                put_out += 1;
            }
        }

        assert!(put_out > 0 && put_out < 64);
    }

    #[test]
    fn an_agent_discharge_of_the_other_engine_does_not_put_the_fire_out() {
        for _ in 0..16 {
            let mut test_bed = test_bed()
                .fire_failure(FireDetectionZone::Engine(1))
                .and_run()
                .and_run()
                .agent_discharged("FIRE_ENG2_AGENT1_Discharge")
                .agent_discharged("FIRE_ENG2_AGENT2_Discharge")
                .and_run()
                .and_run();

            assert!(test_bed.fire_detected("ENG1"));
        }
    }
}
