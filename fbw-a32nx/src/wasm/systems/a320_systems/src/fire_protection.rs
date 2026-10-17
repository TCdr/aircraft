//! A320 engine and APU fire protection: the fire detection of ENG 1, ENG 2 and the APU on the shared
//! [`FireDetectionUnit`], the flyPad fire and detection loop failures, and the chance of the AGENT discharges to put a
//! fire out.
//!
//! What is not modelled here (other parts of the aircraft do it):
//! - The FIRE TEST pbs: one per zone, they drive the FWC warnings and the FIRE panel lights directly (PseudoFWC and
//!   A32NX_Interior_Fire.xml, with the flyPad "extend fire test warnings" realism option). The FDU here only sees real
//!   fires, so a test never shuts the APU down.
//! - The AGENT pbs, squibs and DISCH lights: the cockpit behaviour XML sets L:A32NX_FIRE_<ZONE>_AGENT<n>_Discharge; this
//!   module only reads them (and sets the APU one for the automatic discharge on the ground).
//! - The FIRE DET FAULT caution itself: the FWC raises it from both loops failed or the FDU failed (flyPad FDU failure,
//!   written here as L:A32NX_FIRE_<ZONE>_FDU_FAULT).
//! - The APU FIRE light and the APU SHUT OFF pb of the external power panel: the exterior model has no such panel. The
//!   external warning horn of an APU fire on the ground is written here (L:A32NX_FIRE_APU_EXTERNAL_HORN) and played by
//!   the sound.xml at the nose landing gear.
//!
//! Also the smoke protection: the forward and aft cargo smoke detection of the SDCU and the cargo fire bottle, and the
//! smoke detector of the avionics ventilation duct, see [`systems::fire_protection::smoke_detection`]. The aft cargo
//! smoke closes the aft cargo ventilation (see `aft_cargo_smoke_detected`). Not modelled: the lavatory smoke detection.

use std::time::Duration;

use systems::{
    fire_protection::{
        cargo_fire_extinguishing::CargoFireExtinguishing,
        smoke_detection::{SmokeDetection, SmokeDetectionFaultLogic, SmokeDetectionZoneConfig},
        FireDetectionUnit, FireDetectionZoneConfig, FireLoopPowerLoss, SetOnFireModule,
    },
    shared::{
        ElectricalBusType, FireDetectionLoopID, FireDetectionZone, LgciuWeightOnWheels,
        SmokeDetectionZone,
    },
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
/// [`A320_FIRE_ZONES`]: two bottles per engine and one for the APU.
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
    /// For each zone: its FDU failed
    unit_fault_id: [VariableIdentifier; 3],
    external_horn_id: VariableIdentifier,

    forward_cargo_smoke_detection: SmokeDetection<2>,
    aft_cargo_smoke_detection: SmokeDetection<2>,
    avionics_smoke_detection: SmokeDetection<1>,
    cargo_fire_extinguishing: CargoFireExtinguishing<2, 1>,
}

impl A320FireProtection {
    /// On the ground the APU fire extinguisher discharges automatically 3 s after the fire warning.
    const DELAY_APU_FIRE_EXTINGUISHING: Duration = Duration::from_secs(3);

    /// Avionics smoke is confirmed after 5 s of detection.
    const AVIONICS_SMOKE_CONFIRMATION: Duration = Duration::from_secs(5);

    /// The amber DISCH light comes on within 60 s of pressing the discharge pb, once the bottle is fully discharged.
    /// Design choice: the upper bound, 60 s.
    const CARGO_BOTTLE_DISCHARGE_DURATION: Duration = Duration::from_secs(60);

    /// The cargo smoke detection of one compartment: two detection loops (the two FWD detectors, the four AFT detectors
    /// two by two) on the two identical channels of the SDCU. The supply of the channels follows the INOP SYS of the
    /// electrical procedures: ELEC DC ESS BUS SHED loses SDCU 1 or CIDS 1 SMOKE, ELEC DC BUS 2 FAULT loses SDCU 2 or
    /// CIDS 2 SMOKE. No published confirmation time.
    fn cargo_smoke_detection(
        context: &mut InitContext,
        zone: SmokeDetectionZone,
    ) -> SmokeDetection<2> {
        SmokeDetection::new(
            context,
            SmokeDetectionZoneConfig {
                zone,
                detectors_powered_by: [
                    ElectricalBusType::DirectCurrentEssentialShed,
                    ElectricalBusType::DirectCurrent(2),
                ],
                confirmation_time: Duration::ZERO,
                fault_logic: SmokeDetectionFaultLogic::AllDetectorsInoperative,
            },
        )
    }

    pub(super) fn new(context: &mut InitContext) -> Self {
        // The electrical supply of the loops, from the INOP SYS of the electrical procedures:
        // DC BUS 2 FAULT: ENG 1 LOOP B + ENG 2 LOOP A; DC ESS BUS FAULT: ENG 1 LOOP A + ENG 2 LOOP B;
        // DC BAT BUS FAULT: APU FIRE DET (both APU loops).
        // The loops sense L:A32NX_ENG_<n>_ON_FIRE / L:A32NX_APU_ON_FIRE alone: set_zone_on_fire below sets it from the
        // flyPad fire failure or from the simulator's own fire ("ENG ON FIRE:<n>", "APU ON FIRE DETECTED", set from the
        // MSFS failures menu), and clears it when an AGENT puts the fire out. The simulator variables are not sensed
        // directly: MSFS keeps them on after the agent, which would keep the ENG/APU FIRE warning on.
        let zones = [
            FireDetectionZoneConfig {
                zone: FireDetectionZone::Engine(1),
                loop_a_powered_by: ElectricalBusType::DirectCurrentEssential,
                loop_b_powered_by: ElectricalBusType::DirectCurrent(2),
            },
            FireDetectionZoneConfig {
                zone: FireDetectionZone::Engine(2),
                loop_a_powered_by: ElectricalBusType::DirectCurrent(2),
                loop_b_powered_by: ElectricalBusType::DirectCurrentEssential,
            },
            FireDetectionZoneConfig {
                zone: FireDetectionZone::Apu,
                loop_a_powered_by: ElectricalBusType::DirectCurrentBattery,
                loop_b_powered_by: ElectricalBusType::DirectCurrentBattery,
            },
        ];

        Self {
            fire_detection_unit: FireDetectionUnit::new(
                context,
                zones,
                FireLoopPowerLoss::LoopFault,
                Self::DELAY_APU_FIRE_EXTINGUISHING,
            ),
            // The zone burns from the flyPad failure or from the simulator's own fire (only read here, the A32NX never
            // writes these sim variables), until the fire is out: all sources off, or put out by an AGENT discharge
            // even while the simulator variable stays on. L:A32NX_ENG_<n>_ON_FIRE / L:A32NX_APU_ON_FIRE is the one
            // "zone burning" signal of the fire visual effects (model/A320_NEO.xml ENGINE_FIRE_FX, APU_FIRE_FX).
            set_zone_on_fire: SetOnFireModule::new(
                context,
                A320_FIRE_ZONES,
                A320_FIRE_BOTTLES.map(|(_, zone)| zone),
            )
            .with_simulator_fire_sources(
                context,
                [
                    Some("ENG ON FIRE:1"),
                    Some("ENG ON FIRE:2"),
                    Some("APU ON FIRE DETECTED"),
                ],
            ),

            agent_discharged_id: A320_FIRE_BOTTLES
                .map(|(name, _)| context.get_identifier(name.to_owned())),
            agent_discharged: [false; 5],
            apu_agent_auto_discharge: false,
            apu_auto_extinguishing_was_commanded: false,

            loop_fault_id: A320_FIRE_ZONES.map(|zone| {
                ["A", "B"].map(|loop_name| {
                    context.get_identifier(format!(
                        "FIRE_{}_LOOP_{}_FAULT",
                        Self::zone_name(zone),
                        loop_name
                    ))
                })
            }),
            unit_fault_id: A320_FIRE_ZONES.map(|zone| {
                context.get_identifier(format!("FIRE_{}_FDU_FAULT", Self::zone_name(zone)))
            }),
            external_horn_id: context.get_identifier("FIRE_APU_EXTERNAL_HORN".to_owned()),

            forward_cargo_smoke_detection: Self::cargo_smoke_detection(
                context,
                SmokeDetectionZone::ForwardCargo,
            ),
            aft_cargo_smoke_detection: Self::cargo_smoke_detection(
                context,
                SmokeDetectionZone::AftCargo,
            ),
            // The air extraction duct of the avionics ventilation has one smoke detector. Design choice (no published
            // supply): the DC ESS BUS, so that it works in the electrical emergency configuration that the SMOKE /
            // FUMES / AVNCS SMOKE procedure may lead to.
            avionics_smoke_detection: SmokeDetection::new(
                context,
                SmokeDetectionZoneConfig {
                    zone: SmokeDetectionZone::Avionics,
                    detectors_powered_by: [ElectricalBusType::DirectCurrentEssential],
                    confirmation_time: Self::AVIONICS_SMOKE_CONFIRMATION,
                    fault_logic: SmokeDetectionFaultLogic::AllDetectorsInoperative,
                },
            ),
            // One cargo fire bottle with two discharge heads, one for each compartment. The FWD / AFT DISCH pbs write
            // L:A32NX_CARGOSMOKE_FWD(AFT)_DISCHARGED.
            cargo_fire_extinguishing: CargoFireExtinguishing::new(
                context,
                ["FWD", "AFT"],
                [Self::CARGO_BOTTLE_DISCHARGE_DURATION],
            ),
        }
    }

    /// The zone in the variable names: ENG1, ENG2, APU
    fn zone_name(zone: FireDetectionZone) -> String {
        match zone {
            FireDetectionZone::Engine(number) => format!("ENG{}", number),
            _ => zone.to_string(),
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

        self.forward_cargo_smoke_detection.update(context);
        self.aft_cargo_smoke_detection.update(context);
        self.avionics_smoke_detection.update(context);
        self.cargo_fire_extinguishing.update(context);
    }

    /// An APU fire is detected while on the ground: the ECB shuts the APU down
    pub(super) fn apu_fire_on_ground(&self) -> bool {
        self.fire_detection_unit.apu_fire_on_ground()
    }

    /// The aft cargo smoke detection unit detects smoke: the cargo ventilation controller closes the aft isolation
    /// valves
    pub(super) fn aft_cargo_smoke_detected(&self) -> bool {
        self.aft_cargo_smoke_detection.smoke_detected()
    }
}

impl SimulationElement for A320FireProtection {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fire_detection_unit.accept(visitor);
        self.set_zone_on_fire.accept(visitor);
        self.forward_cargo_smoke_detection.accept(visitor);
        self.aft_cargo_smoke_detection.accept(visitor);
        self.avionics_smoke_detection.accept(visitor);
        self.cargo_fire_extinguishing.accept(visitor);

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
        for (&zone, unit_fault_id) in A320_FIRE_ZONES.iter().zip(&self.unit_fault_id) {
            writer.write(
                unit_fault_id,
                self.fire_detection_unit.unit_has_failed(zone),
            );
        }

        // On an APU fire the red APU FIRE light of the external power panel comes on and an external warning horn
        // sounds (the horn in the nose gear bay that warns of a fire of an APU running unattended on the ground). On
        // the ground only (design choice from that unattended APU context), and not during the FIRE TEST (the FDU here
        // only sees real fires). The APU SHUT OFF pb of the external power panel, which silences it, is not modelled
        // (no panel in the model).
        writer.write(
            &self.external_horn_id,
            self.fire_detection_unit.apu_fire_on_ground(),
        );

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
        dc_ess_shed_bus: ElectricalBus,
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
                dc_ess_shed_bus: ElectricalBus::new(
                    context,
                    ElectricalBusType::DirectCurrentEssentialShed,
                ),
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
            electricity.flow(&self.dc_ess_source, &self.dc_ess_shed_bus);
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

        fn unit_failure(mut self, zone: FireDetectionZone) -> Self {
            self.fail(FailureType::FireDetectionUnit(zone));
            self
        }

        fn resolve_unit_failure(mut self, zone: FireDetectionZone) -> Self {
            self.unfail(FailureType::FireDetectionUnit(zone));
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

        fn simulator_fire_cleared(mut self, name: &str) -> Self {
            self.write_by_name(name, false);
            self
        }

        /// The "zone burning" signal, e.g. ENG_1_ON_FIRE (the fire visual effects read it)
        fn zone_burning(&mut self, name: &str) -> bool {
            self.read_by_name(name)
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

        fn unit_fault(&mut self, zone_name: &str) -> bool {
            self.read_by_name(&format!("FIRE_{}_FDU_FAULT", zone_name))
        }

        fn external_horn(&mut self) -> bool {
            self.read_by_name("FIRE_APU_EXTERNAL_HORN")
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
        // The simulator fire sets the zone burning, which the loops sense one update later
        let mut test_bed = test_bed()
            .simulator_fire("ENG ON FIRE:1")
            .simulator_fire("APU ON FIRE DETECTED")
            .and_run()
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

        test_bed = test_bed.simulator_fire("ENG ON FIRE:1").and_run().and_run();

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

        test_bed = test_bed
            .simulator_fire("APU ON FIRE DETECTED")
            .and_run()
            .and_run();

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
        test_bed = test_bed.simulator_fire("ENG ON FIRE:1").and_run().and_run();

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
    fn no_fdu_fault_when_healthy() {
        let mut test_bed = test_bed().and_run();

        for zone_name in ["ENG1", "ENG2", "APU"] {
            assert!(!test_bed.unit_fault(zone_name));
        }
    }

    #[test]
    fn a_failed_fdu_gives_an_fdu_fault_and_no_fire_warning_with_healthy_loops() {
        let mut test_bed = test_bed()
            .unit_failure(FireDetectionZone::Engine(1))
            .simulator_fire("ENG ON FIRE:1")
            .simulator_fire("ENG ON FIRE:2")
            .and_run()
            .and_run();

        assert!(test_bed.unit_fault("ENG1"));
        assert!(!test_bed.loop_fault("ENG1", "A"));
        assert!(!test_bed.loop_fault("ENG1", "B"));
        assert!(!test_bed.fire_detected("ENG1"));

        // The other zones keep their own FDU
        assert!(!test_bed.unit_fault("ENG2"));
        assert!(!test_bed.unit_fault("APU"));
        assert!(test_bed.fire_detected("ENG2"));
    }

    #[test]
    fn a_failed_fdu_gives_no_fire_warning_on_a_flame_effect_either() {
        let mut test_bed = test_bed()
            .unit_failure(FireDetectionZone::Engine(2))
            .loop_failure(FireDetectionLoopID::A, FireDetectionZone::Engine(2))
            .run_for(Duration::from_secs(1))
            .loop_failure(FireDetectionLoopID::B, FireDetectionZone::Engine(2))
            .and_run();

        assert!(!test_bed.fire_detected("ENG2"));
    }

    #[test]
    fn a_fire_already_burning_is_detected_again_when_the_fdu_failure_is_resolved() {
        let mut test_bed = test_bed()
            .unit_failure(FireDetectionZone::Engine(2))
            .fire_failure(FireDetectionZone::Engine(2))
            .and_run()
            .and_run();
        assert!(!test_bed.fire_detected("ENG2"));

        test_bed = test_bed
            .resolve_unit_failure(FireDetectionZone::Engine(2))
            .and_run();

        assert!(!test_bed.unit_fault("ENG2"));
        assert!(test_bed.fire_detected("ENG2"));
    }

    #[test]
    fn a_failed_apu_fdu_neither_shuts_the_apu_down_nor_discharges_the_bottle_on_ground() {
        let mut test_bed = test_bed()
            .on_ground()
            .unit_failure(FireDetectionZone::Apu)
            .fire_failure(FireDetectionZone::Apu)
            .and_run()
            .and_run()
            .run_for(Duration::from_secs(10));

        assert!(test_bed.unit_fault("APU"));
        assert!(!test_bed.fire_detected("APU"));
        assert!(!test_bed.apu_fire_on_ground());
        assert!(!test_bed.apu_agent_discharged());
        assert!(!test_bed.external_horn());
    }

    #[test]
    fn apu_fire_on_ground_sounds_the_external_horn_until_the_fire_is_out() {
        let mut test_bed = test_bed()
            .on_ground()
            .fire_failure(FireDetectionZone::Apu)
            .and_run()
            .and_run();

        assert!(test_bed.external_horn());

        test_bed = test_bed
            .resolve_fire_failure(FireDetectionZone::Apu)
            .and_run()
            .and_run();

        assert!(!test_bed.external_horn());
    }

    #[test]
    fn apu_fire_in_flight_does_not_sound_the_external_horn() {
        let mut test_bed = test_bed()
            .fire_failure(FireDetectionZone::Apu)
            .and_run()
            .and_run();

        assert!(test_bed.fire_detected("APU"));
        assert!(!test_bed.external_horn());
    }

    #[test]
    fn engine_fire_on_ground_does_not_sound_the_external_horn() {
        let mut test_bed = test_bed()
            .on_ground()
            .fire_failure(FireDetectionZone::Engine(1))
            .and_run()
            .and_run();

        assert!(test_bed.fire_detected("ENG1"));
        assert!(!test_bed.external_horn());
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

    // The "zone burning" signal L:A32NX_ENG_<n>_ON_FIRE / L:A32NX_APU_ON_FIRE, which the fire visual effects read alone

    #[test]
    fn the_fire_failure_burns_until_it_is_removed() {
        let mut test_bed = test_bed()
            .fire_failure(FireDetectionZone::Engine(1))
            .and_run()
            .and_run();

        assert!(test_bed.zone_burning("ENG_1_ON_FIRE"));
        assert!(!test_bed.zone_burning("ENG_2_ON_FIRE"));
        assert!(!test_bed.zone_burning("APU_ON_FIRE"));

        test_bed = test_bed
            .resolve_fire_failure(FireDetectionZone::Engine(1))
            .and_run()
            .and_run();

        assert!(!test_bed.zone_burning("ENG_1_ON_FIRE"));
    }

    #[test]
    fn an_agent_that_puts_the_failure_fire_out_stops_the_burning_while_the_failure_stays() {
        let mut put_out = 0;
        for _ in 0..64 {
            let mut test_bed = test_bed()
                .fire_failure(FireDetectionZone::Engine(2))
                .and_run()
                .and_run();
            assert!(test_bed.zone_burning("ENG_2_ON_FIRE"));

            test_bed = test_bed
                .agent_discharged("FIRE_ENG2_AGENT1_Discharge")
                .and_run()
                .and_run();
            if !test_bed.zone_burning("ENG_2_ON_FIRE") {
                put_out += 1;
                // The failure is still active: the fire stays out
                test_bed = test_bed.and_run().and_run();
                assert!(!test_bed.zone_burning("ENG_2_ON_FIRE"));
                assert!(!test_bed.fire_detected("ENG2"));
            }
        }

        assert!(put_out > 0 && put_out < 64);
    }

    #[test]
    fn a_simulator_fire_burns_until_it_is_cleared() {
        let mut test_bed = test_bed()
            .simulator_fire("ENG ON FIRE:1")
            .simulator_fire("APU ON FIRE DETECTED")
            .and_run()
            .and_run();

        assert!(test_bed.zone_burning("ENG_1_ON_FIRE"));
        assert!(!test_bed.zone_burning("ENG_2_ON_FIRE"));
        assert!(test_bed.zone_burning("APU_ON_FIRE"));

        test_bed = test_bed
            .simulator_fire_cleared("ENG ON FIRE:1")
            .simulator_fire_cleared("APU ON FIRE DETECTED")
            .and_run()
            .and_run();

        assert!(!test_bed.zone_burning("ENG_1_ON_FIRE"));
        assert!(!test_bed.zone_burning("APU_ON_FIRE"));
    }

    #[test]
    fn an_agent_that_puts_a_simulator_fire_out_stops_the_burning_although_the_sim_variable_stays_on(
    ) {
        let mut put_out = 0;
        for _ in 0..64 {
            let mut test_bed = test_bed()
                .simulator_fire("ENG ON FIRE:1")
                .and_run()
                .and_run();
            assert!(test_bed.zone_burning("ENG_1_ON_FIRE"));

            // ENG ON FIRE:1 stays on for the rest of the test
            test_bed = test_bed
                .agent_discharged("FIRE_ENG1_AGENT1_Discharge")
                .and_run()
                .and_run();
            if !test_bed.zone_burning("ENG_1_ON_FIRE") {
                put_out += 1;
                test_bed = test_bed.and_run().and_run();
                assert!(!test_bed.zone_burning("ENG_1_ON_FIRE"));
            }
        }

        assert!(put_out > 0 && put_out < 64);
    }

    #[test]
    fn the_apu_auto_discharge_can_put_a_simulator_apu_fire_out_although_the_sim_variable_stays_on()
    {
        let mut put_out = 0;
        for _ in 0..64 {
            let mut test_bed = test_bed()
                .on_ground()
                .simulator_fire("APU ON FIRE DETECTED")
                .and_run()
                .and_run();
            assert!(test_bed.zone_burning("APU_ON_FIRE"));

            // Automatic discharge 3 s after the detection, on the ground
            test_bed = test_bed.run_for(Duration::from_secs(4)).and_run().and_run();
            assert!(test_bed.apu_agent_discharged());
            if !test_bed.zone_burning("APU_ON_FIRE") {
                put_out += 1;
            }
        }

        assert!(put_out > 0 && put_out < 64);
    }

    // The fire warning follows the zone burning signal: the APU FIRE light goes out once the fire is extinguished, and
    // the ENG FIRE pb lights follow the engine fire warning. MSFS keeps ENG ON FIRE:n / APU ON FIRE DETECTED on after
    // the agent.

    #[test]
    fn the_eng_fire_warning_ends_when_an_agent_puts_a_simulator_fire_out_although_the_sim_variable_stays_on(
    ) {
        let mut put_out = 0;
        for _ in 0..64 {
            let mut test_bed = test_bed()
                .simulator_fire("ENG ON FIRE:1")
                .and_run()
                .and_run();
            assert!(test_bed.fire_detected("ENG1"));

            // ENG ON FIRE:1 stays on for the rest of the test
            test_bed = test_bed
                .agent_discharged("FIRE_ENG1_AGENT1_Discharge")
                .and_run()
                .and_run();
            if !test_bed.zone_burning("ENG_1_ON_FIRE") {
                put_out += 1;
                test_bed = test_bed.and_run();
                assert!(!test_bed.fire_detected("ENG1"));
            } else {
                // Not put out (1/2 chance): the warning stays
                assert!(test_bed.fire_detected("ENG1"));
            }
        }

        assert!(put_out > 0);
    }

    #[test]
    fn the_apu_fire_warning_ends_when_the_auto_discharge_puts_a_simulator_fire_out_although_the_sim_variable_stays_on(
    ) {
        let mut put_out = 0;
        for _ in 0..64 {
            let mut test_bed = test_bed()
                .on_ground()
                .simulator_fire("APU ON FIRE DETECTED")
                .and_run()
                .and_run();
            assert!(test_bed.fire_detected("APU"));

            // Automatic discharge 3 s after the detection, on the ground; APU ON FIRE DETECTED stays on
            test_bed = test_bed.run_for(Duration::from_secs(4)).and_run().and_run();
            if !test_bed.zone_burning("APU_ON_FIRE") {
                put_out += 1;
                test_bed = test_bed.and_run();
                assert!(!test_bed.fire_detected("APU"));
            }
        }

        assert!(put_out > 0);
    }

    fn read_bool(test_bed: &mut FireProtectionTestBed, name: &str) -> bool {
        test_bed.read_by_name(name)
    }

    fn smoke_detected(test_bed: &mut FireProtectionTestBed, zone: &str) -> bool {
        test_bed.read_by_name(&format!("SMOKE_{}_DETECTED", zone))
    }

    fn smoke_detection_fault(test_bed: &mut FireProtectionTestBed, zone: &str) -> bool {
        test_bed.read_by_name(&format!("SMOKE_{}_DET_FAULT", zone))
    }

    #[test]
    fn no_smoke_warning_and_no_detection_fault_when_healthy() {
        let mut test_bed = test_bed().run_for(Duration::from_secs(10));

        for zone in ["FWD_CARGO", "AFT_CARGO", "AVIONICS"] {
            assert!(!smoke_detected(&mut test_bed, zone));
            assert!(!smoke_detection_fault(&mut test_bed, zone));
        }
    }

    #[test]
    fn forward_cargo_smoke_gives_the_forward_cargo_smoke_warning_only() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed = test_bed.and_run();

        assert!(smoke_detected(&mut test_bed, "FWD_CARGO"));
        assert!(!smoke_detected(&mut test_bed, "AFT_CARGO"));
    }

    #[test]
    fn aft_cargo_smoke_gives_the_aft_cargo_smoke_warning() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::AftCargo));
        test_bed = test_bed.and_run();

        assert!(smoke_detected(&mut test_bed, "AFT_CARGO"));
        assert!(!smoke_detected(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn one_failed_cargo_detection_loop_gives_no_fault_and_the_other_still_detects_smoke() {
        // Dual loop principle
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::SmokeDetector(
            SmokeDetectionZone::ForwardCargo,
            1,
        ));
        test_bed = test_bed.and_run();

        assert!(!smoke_detection_fault(&mut test_bed, "FWD_CARGO"));

        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
        test_bed = test_bed.and_run();

        assert!(smoke_detected(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn both_failed_cargo_detection_loops_give_the_crg_det_fault() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::SmokeDetector(SmokeDetectionZone::AftCargo, 1));
        test_bed.fail(FailureType::SmokeDetector(SmokeDetectionZone::AftCargo, 2));
        test_bed = test_bed.and_run();

        assert!(smoke_detection_fault(&mut test_bed, "AFT_CARGO"));
        assert!(!smoke_detection_fault(&mut test_bed, "FWD_CARGO"));
    }

    #[test]
    fn losing_dc_ess_shed_and_dc_2_loses_the_cargo_smoke_detection() {
        // SDCU 1 on the DC ESS SHED BUS, SDCU 2 on the DC BUS 2
        let mut test_bed = test_bed().dc_2_lost().and_run();

        assert!(!smoke_detection_fault(&mut test_bed, "FWD_CARGO"));

        test_bed = test_bed.dc_ess_lost().and_run();

        assert!(smoke_detection_fault(&mut test_bed, "FWD_CARGO"));
        assert!(smoke_detection_fault(&mut test_bed, "AFT_CARGO"));
    }

    #[test]
    fn avionics_smoke_gives_the_warning_after_5_s() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::Smoke(SmokeDetectionZone::Avionics));
        test_bed = test_bed.run_for(Duration::from_millis(4_900));

        assert!(!smoke_detected(&mut test_bed, "AVIONICS"));

        test_bed = test_bed.run_for(Duration::from_millis(200));

        assert!(smoke_detected(&mut test_bed, "AVIONICS"));
    }

    #[test]
    fn the_cargo_bottle_is_discharged_60_s_after_a_disch_pb_press_into_that_compartment() {
        let mut test_bed = test_bed()
            .agent_discharged("CARGOSMOKE_AFT_DISCHARGED")
            .run_for(Duration::from_secs(59));

        assert!(read_bool(&mut test_bed, "CARGOSMOKE_AFT_AGENT_RELEASED"));
        assert!(!read_bool(&mut test_bed, "CARGOSMOKE_FWD_AGENT_RELEASED"));
        assert!(!read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_1_DISCHARGED"));

        test_bed = test_bed.run_for(Duration::from_secs(2));

        assert!(read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_1_DISCHARGED"));
    }

    #[test]
    fn a_cargo_bottle_that_lost_its_agent_has_low_pressure() {
        let mut test_bed = test_bed();
        test_bed.fail(FailureType::CargoFireBottleLowPressure(1));
        test_bed = test_bed.and_run();

        assert!(read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_1_LOW_PRESSURE"));
    }
}
