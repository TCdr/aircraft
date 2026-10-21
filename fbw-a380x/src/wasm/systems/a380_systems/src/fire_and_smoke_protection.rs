use std::time::Duration;

use systems::{
    accept_iterable,
    fire_protection::{
        cargo_fire_extinguishing::CargoFireExtinguishing,
        smoke_detection::{SmokeDetection, SmokeDetectionFaultLogic, SmokeDetectionZoneConfig},
        FireDetectionUnit, FireDetectionZoneConfig, FireLoopPowerLoss, SetOnFireModule,
    },
    overhead::{FirePushButton, MomentaryPushButton},
    shared::{
        arinc429::{Arinc429Word, SignStatus},
        DelayedFalseLogicGate, DelayedTrueLogicGate, ElectricalBusType, ElectricalBuses,
        EngineFirePushButtons, FireDetectionLoopID, FireDetectionZone, LgciuWeightOnWheels,
        SmokeDetectionZone,
    },
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

use systems::failures::{Failure, FailureType};

/// The A380 fire zones: ENG 1 to 4, APU, MLG bay
const A380_FIRE_ZONES: [FireDetectionZone; 6] = [
    FireDetectionZone::Engine(1),
    FireDetectionZone::Engine(2),
    FireDetectionZone::Engine(3),
    FireDetectionZone::Engine(4),
    FireDetectionZone::Apu,
    FireDetectionZone::Mlg,
];

pub(super) struct A380FireAndSmokeProtection {
    a380_fire_protection_system: FireProtectionSystem,
    smoke_detection_function: SmokeDetectionFunction,
    set_zone_on_fire: SetOnFireModule<6, 9>,
}

impl A380FireAndSmokeProtection {
    pub(super) fn new(context: &mut InitContext) -> Self {
        Self {
            a380_fire_protection_system: FireProtectionSystem::new(context),
            smoke_detection_function: SmokeDetectionFunction::new(context),

            // The 9 bottles of the FireExtinguishingSystem: two for each engine and one for the APU (zone 4). The MLG
            // bay (zone 5) does not have a fire extinguishing system.
            // L:A32NX_ENG_<n>_ON_FIRE / L:A32NX_APU_ON_FIRE is the one "zone burning" signal of the fire detection loops
            // and of the fire visual effects (A380_WINGS.xml ENGINE_FIRE_FX, A380_Fuselage_Behavior.xml APU_FIRE_FX).
            // No simulator fire source here (unlike the A32NX): systems.wasm writes the sim's ENG ON FIRE:n from these
            // L:vars (a380_systems_wasm fire.rs), so reading it back, here or in the fire detection, would keep a zone
            // burning (and its FIRE warning on) after its failure is removed or an AGENT put it out.
            set_zone_on_fire: SetOnFireModule::new(
                context,
                A380_FIRE_ZONES,
                [0, 0, 1, 1, 2, 2, 3, 3, 4],
            ),
        }
    }

    pub(super) fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        lgciu: [&impl LgciuWeightOnWheels; 2],
    ) {
        self.a380_fire_protection_system
            .update(context, engine_fire_push_buttons, lgciu);

        self.set_zone_on_fire
            .update(self.a380_fire_protection_system.bottle_discharge());

        self.smoke_detection_function.update(context);
    }

    pub fn apu_fire_on_ground(&self) -> bool {
        self.a380_fire_protection_system.apu_fire_on_ground()
    }
}

impl SimulationElement for A380FireAndSmokeProtection {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.a380_fire_protection_system.accept(visitor);
        self.smoke_detection_function.accept(visitor);
        self.set_zone_on_fire.accept(visitor);

        visitor.visit(self);
    }
}

/// The compartments of the Smoke Detection Function (SDF) of the CIDS with two smoke detectors: the cargo compartments,
/// the avionics bays, the IFE bay and the NSS. The cabin areas are in A380_CABIN_SMOKE_DETECTION_ZONES and
/// A380_LAVATORY_SMOKE_DETECTION_ZONES. Not modelled: the showers.
///
/// The NSS smoke has no ECAM alert: it lights the SMOKE light of the NSS MASTER sw while smoke is detected
/// (L:A32NX_SMOKE_NSS_DETECTED), with the SMOKE warning logic of the bays (both detectors, or one failed and the other
/// one detecting).
const A380_SMOKE_DETECTION_ZONES: [SmokeDetectionZone; 10] = [
    SmokeDetectionZone::ForwardCargo,
    SmokeDetectionZone::AftCargo,
    SmokeDetectionZone::BulkCargo,
    SmokeDetectionZone::LeftMainAvionics,
    SmokeDetectionZone::RightMainAvionics,
    SmokeDetectionZone::LeftUpperAvionics,
    SmokeDetectionZone::RightUpperAvionics,
    SmokeDetectionZone::AftAvionics,
    SmokeDetectionZone::InFlightEntertainmentBay,
    SmokeDetectionZone::NetworkServerSystem,
];

/// The cabin areas of the SDF with two smoke detectors: the flight crew rests, the aft lower deck cabin crew rest and
/// the IFE control centers (CWS / RCC). Design choice: two detectors as in the other compartments; the manuals give
/// several detectors per compartment for the crew rests only.
const A380_CABIN_SMOKE_DETECTION_ZONES: [SmokeDetectionZone; 6] = [
    SmokeDetectionZone::FlightCrewRest1,
    SmokeDetectionZone::FlightCrewRest2,
    SmokeDetectionZone::AftLowerDeckCabinCrewRest,
    SmokeDetectionZone::MainDeck1LCabinWorkStation,
    SmokeDetectionZone::UpperDeck1LCabinWorkStation,
    SmokeDetectionZone::UpperDeck3RRemoteControlCenter,
];

/// The lavatories of the SDF, one smoke detector in each lavatory. Design choice: the lavatories of a deck share one
/// zone and one detector: the alerts name the deck, not the lavatory. That detector is on the DC ESS bus, as detector 1
/// of the other compartments.
const A380_LAVATORY_SMOKE_DETECTION_ZONES: [SmokeDetectionZone; 3] = [
    SmokeDetectionZone::MainDeckLavatory,
    SmokeDetectionZone::UpperDeckLavatory,
    SmokeDetectionZone::LowerDeckLavatory,
];

/// Design choice (no published confirmation time): the smoke is confirmed at once.
fn sdf_smoke_detection<const D: usize>(
    context: &mut InitContext,
    zone: SmokeDetectionZone,
    detectors_powered_by: [ElectricalBusType; D],
) -> SmokeDetection<D> {
    SmokeDetection::new(
        context,
        SmokeDetectionZoneConfig {
            zone,
            detectors_powered_by,
            confirmation_time: Duration::ZERO,
            fault_logic: SmokeDetectionFaultLogic::AnyDetectorInoperativeOrDisagreeing,
        },
    )
}

/// Design choice (no published supply): detector 1 on the DC ESS bus and detector 2 on the DC 2 bus, as the fire
/// detection loops A and B here.
const SDF_DUAL_DETECTOR_SUPPLY: [ElectricalBusType; 2] = [
    ElectricalBusType::DirectCurrentEssential,
    ElectricalBusType::DirectCurrent(2),
];

/// A fire extinguishing bottle of the aft lower deck cabin crew rest compartment: its failure gives SMOKE AFT LWR CAB
/// REST BTL 1(2) FAULT (L:A32NX_SMOKE_AFT_LWR_CAB_REST_BTL_<n>_FAULT). The cabin crew discharges the bottles from the
/// compartment, which is not modelled.
struct CrewRestFireBottle {
    fault_id: VariableIdentifier,
    failure: Failure,
}

impl CrewRestFireBottle {
    fn new(context: &mut InitContext, number: usize) -> Self {
        Self {
            fault_id: context
                .get_identifier(format!("SMOKE_AFT_LWR_CAB_REST_BTL_{}_FAULT", number)),
            failure: Failure::new(FailureType::CrewRestFireBottle(number)),
        }
    }
}

impl SimulationElement for CrewRestFireBottle {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fault_id, self.failure.is_active());
    }
}

/// The routing of the two cargo fire bottles: the bottle control system and the diverter valve to the forward or the
/// aft/bulk compartment. A failed position of the valve (SMOKE FWD (AFT) CARGO BOTTLES FAULT) or a failed control
/// (SMOKE FWD+AFT CARGOS BOTTLES FAULT) leaves the bottles full when the AGENT TO pb of that compartment is pressed.
/// Writes L:A32NX_CARGOSMOKE_DIVERTER_VALVE_FWD(AFT)_FAULT and L:A32NX_CARGOSMOKE_BOTTLE_CONTROL_FAULT for the FWS.
struct CargoFireBottleRouting {
    diverter_valve_fault_ids: [VariableIdentifier; 2],
    control_fault_id: VariableIdentifier,

    diverter_valve_position_failures: [Failure; 2],
    control_failure: Failure,
}

impl CargoFireBottleRouting {
    fn new(context: &mut InitContext) -> Self {
        Self {
            diverter_valve_fault_ids: ["FWD", "AFT"].map(|compartment| {
                context.get_identifier(format!("CARGOSMOKE_DIVERTER_VALVE_{}_FAULT", compartment))
            }),
            control_fault_id: context.get_identifier("CARGOSMOKE_BOTTLE_CONTROL_FAULT".to_owned()),

            diverter_valve_position_failures: [1, 2].map(|position| {
                Failure::new(FailureType::CargoFireDiverterValvePosition(position))
            }),
            control_failure: Failure::new(FailureType::CargoFireBottleControl),
        }
    }

    /// The forward and the aft/bulk compartments the agent can reach
    fn reachable_compartments(&self) -> [bool; 2] {
        let control_works = !self.control_failure.is_active();
        [0, 1]
            .map(|index| control_works && !self.diverter_valve_position_failures[index].is_active())
    }
}

impl SimulationElement for CargoFireBottleRouting {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.diverter_valve_position_failures, visitor);
        self.control_failure.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        for (id, failure) in self
            .diverter_valve_fault_ids
            .iter()
            .zip(&self.diverter_valve_position_failures)
        {
            writer.write(id, failure.is_active());
        }
        writer.write(&self.control_fault_id, self.control_failure.is_active());
    }
}

/// The A380 Smoke Detection Function (SDF) of the CIDS: smoke detection in the avionics bays, the cargo compartments and
/// the cabin areas, and the cargo fire extinguishing.
struct SmokeDetectionFunction {
    zones: [SmokeDetection<2>; 10],
    cabin_zones: [SmokeDetection<2>; 6],
    lavatories: [SmokeDetection<1>; 3],
    cargo_fire_extinguishing: CargoFireExtinguishing<2, 2>,
    cargo_bottle_routing: CargoFireBottleRouting,
    crew_rest_bottles: [CrewRestFireBottle; 2],

    /// The SDF itself is failed: SMOKE DET FAULT, L:A32NX_SMOKE_DETECTION_FUNCTION_FAULT for the FWS (SmokeAlerts.ts).
    /// Smoke detection is lost in the avionics compartments (IFE center and NSS included), the cargo compartments and
    /// the cabin areas: no compartment reports smoke or a detector fault. The cargo fire extinguishing is not lost and
    /// keeps working.
    failure: Failure,
    fault_id: VariableIdentifier,

    /// The SDF does not detect the cabin configuration and the cabin smoke detectors: SMOKE FACILITIES DET FAULT,
    /// L:A32NX_SMOKE_FACILITIES_DET_FAULT. Design choice: the cabin areas (lavatories, crew rests, CWS / RCC) then report
    /// neither smoke nor a detector fault, as with a failed SDF; INOP SYS FACILITIES SMK DET.
    facilities_failure: Failure,
    facilities_fault_id: VariableIdentifier,

    /// SMOKE SAFETY TEST REQUIRED, L:A32NX_SMOKE_SAFETY_TEST_REQUIRED: the SDF did not perform its automatic safety
    /// test (on ground, every 10 h) in the last 50 h. Design choice: this test history is not simulated, a failure
    /// stands for the missed tests.
    safety_test_overdue: Failure,
    safety_test_required_id: VariableIdentifier,
}

impl SmokeDetectionFunction {
    /// Cargo fire extinguishing: bottle 1 discharges into the affected compartment in about one minute
    const CARGO_BOTTLE_1_DISCHARGE_DURATION: Duration = Duration::from_secs(60);
    /// then bottle 2 discharges slowly, to keep enough agent in the compartment for about four hours
    const CARGO_BOTTLE_2_DISCHARGE_DURATION: Duration = Duration::from_secs(4 * 3600);

    fn new(context: &mut InitContext) -> Self {
        Self {
            zones: A380_SMOKE_DETECTION_ZONES
                .map(|zone| sdf_smoke_detection(context, zone, SDF_DUAL_DETECTOR_SUPPLY)),
            cabin_zones: A380_CABIN_SMOKE_DETECTION_ZONES
                .map(|zone| sdf_smoke_detection(context, zone, SDF_DUAL_DETECTOR_SUPPLY)),
            lavatories: A380_LAVATORY_SMOKE_DETECTION_ZONES.map(|zone| {
                sdf_smoke_detection(context, zone, [ElectricalBusType::DirectCurrentEssential])
            }),
            // The AGENT TO FWD / AGENT TO AFT pbs write L:A32NX_CARGOSMOKE_FWD(AFT)_DISCHARGED; the AFT agent goes to
            // the aft/bulk compartment
            cargo_fire_extinguishing: CargoFireExtinguishing::new(
                context,
                ["FWD", "AFT"],
                [
                    Self::CARGO_BOTTLE_1_DISCHARGE_DURATION,
                    Self::CARGO_BOTTLE_2_DISCHARGE_DURATION,
                ],
            ),
            cargo_bottle_routing: CargoFireBottleRouting::new(context),
            crew_rest_bottles: [1, 2].map(|number| CrewRestFireBottle::new(context, number)),

            failure: Failure::new(FailureType::SmokeDetectionFunction),
            fault_id: context.get_identifier("SMOKE_DETECTION_FUNCTION_FAULT".to_owned()),

            facilities_failure: Failure::new(FailureType::SmokeDetectionFacilities),
            facilities_fault_id: context.get_identifier("SMOKE_FACILITIES_DET_FAULT".to_owned()),

            safety_test_overdue: Failure::new(FailureType::SmokeDetectionSafetyTestOverdue),
            safety_test_required_id: context
                .get_identifier("SMOKE_SAFETY_TEST_REQUIRED".to_owned()),
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        let available = self.is_available();
        for zone in self.zones.iter_mut() {
            zone.update_with_detection_unit(context, available);
        }
        let cabin_available = available && !self.facilities_failure.is_active();
        for zone in self.cabin_zones.iter_mut() {
            zone.update_with_detection_unit(context, cabin_available);
        }
        for lavatory in self.lavatories.iter_mut() {
            lavatory.update_with_detection_unit(context, cabin_available);
        }
        self.cargo_fire_extinguishing
            .update_with_reachable_compartments(
                context,
                self.cargo_bottle_routing.reachable_compartments(),
            );
    }

    fn is_available(&self) -> bool {
        !self.failure.is_active()
    }
}

impl SimulationElement for SmokeDetectionFunction {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.zones, visitor);
        accept_iterable!(self.cabin_zones, visitor);
        accept_iterable!(self.lavatories, visitor);
        self.cargo_fire_extinguishing.accept(visitor);
        self.cargo_bottle_routing.accept(visitor);
        accept_iterable!(self.crew_rest_bottles, visitor);
        self.failure.accept(visitor);
        self.facilities_failure.accept(visitor);
        self.safety_test_overdue.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fault_id, self.failure.is_active());
        // A failed SDF reports neither of its own faults
        let available = self.is_available();
        writer.write(
            &self.facilities_fault_id,
            available && self.facilities_failure.is_active(),
        );
        writer.write(
            &self.safety_test_required_id,
            available && self.safety_test_overdue.is_active(),
        );
    }
}

struct FireProtectionSystem {
    fire_detection_unit: FireDetectionUnit<6>,
    fire_extinguishing_system: FireExtinguishingSystem,

    // The FDU sends discrete signals to the overhead panel and arinc signals to the FWS
    // Fixme: We assume a discrete word is sent, validate with references
    discrete_word_id: VariableIdentifier,
    discrete_word: Arinc429Word<u32>,

    fire_test_pushbutton_id: VariableIdentifier,
    fire_test_pushbutton_is_pressed: bool,
    fire_test_pushbutton_signal: DelayedTrueLogicGate,

    // flyPad Realism setting (not aircraft behaviour): the test goes on for a few seconds after the pb is released, so
    // that the crew can check the warnings and lights without holding the pb
    fire_test_extend_id: VariableIdentifier,
    fire_test_extend: bool,
    fire_test_extension: DelayedFalseLogicGate,
    // The test pb, extended when the setting is on: for the FWS
    fire_test_active_id: VariableIdentifier,
    fire_test_active: bool,
}

impl FireProtectionSystem {
    /// The TEST pb tests the engine fire detection and extinguishing once held for at least three seconds, until
    /// released
    const FIRE_TEST_HOLD_TIME: Duration = Duration::from_secs(3);
    const FIRE_TEST_EXTENSION: Duration = Duration::from_secs(7);
    const DELAY_APU_FIRE_EXTINGUISHING: Duration = Duration::from_secs(10);

    fn new(context: &mut InitContext) -> Self {
        // Loop A is supplied by the DC ESS bus and loop B by the DC 2 bus, in every zone
        let zones = A380_FIRE_ZONES.map(|zone| FireDetectionZoneConfig {
            zone,
            loop_a_powered_by: ElectricalBusType::DirectCurrentEssential,
            loop_b_powered_by: ElectricalBusType::DirectCurrent(2),
        });

        Self {
            fire_detection_unit: FireDetectionUnit::new(
                context,
                zones,
                FireLoopPowerLoss::TransientBreak,
                Self::DELAY_APU_FIRE_EXTINGUISHING,
            ),
            fire_extinguishing_system: FireExtinguishingSystem::new(context),

            discrete_word_id: context.get_identifier("FIRE_FDU_DISCRETE_WORD".to_owned()),
            discrete_word: Arinc429Word::new(0, SignStatus::NoComputedData),

            fire_test_pushbutton_id: context
                .get_identifier("OVHD_FIRE_TEST_PB_IS_PRESSED".to_owned()),
            fire_test_pushbutton_is_pressed: false,
            fire_test_pushbutton_signal: DelayedTrueLogicGate::new(Self::FIRE_TEST_HOLD_TIME),

            fire_test_extend_id: context.get_identifier("FIRE_TEST_EXTEND".to_owned()),
            fire_test_extend: false,
            fire_test_extension: DelayedFalseLogicGate::new(Self::FIRE_TEST_EXTENSION),
            fire_test_active_id: context.get_identifier("FIRE_TEST_ACTIVE".to_owned()),
            fire_test_active: false,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        lgciu: [&impl LgciuWeightOnWheels; 2],
    ) {
        self.fire_test_extension
            .update(context, self.fire_test_pushbutton_is_pressed);
        self.fire_test_active = if self.fire_test_extend {
            self.fire_test_extension.output()
        } else {
            self.fire_test_pushbutton_is_pressed
        };

        // The test starts once the pb has been held for FIRE_TEST_HOLD_TIME
        self.fire_test_pushbutton_signal
            .update(context, self.fire_test_active);
        self.fire_detection_unit
            .update(context, self.fire_test_pushbutton_signal.output(), lgciu);
        self.update_discrete_word();
        self.fire_extinguishing_system.update(
            context,
            engine_fire_push_buttons,
            self.fire_test_pushbutton_signal.output(),
            self.fire_detection_unit.should_extinguish_apu_fire(),
        )
    }

    fn update_discrete_word(&mut self) {
        // TODO: Add electrical supply for FDU, when not powered it should return NCD
        self.discrete_word = Arinc429Word::new(0, SignStatus::NormalOperation);

        // Fixme: The bit order is assumed as no references
        // Bits 11 to 16: FIRE ENG 1, ENG 2, ENG 3, ENG 4, APU, MLG
        for (bit, &zone) in (11..).zip(&A380_FIRE_ZONES) {
            self.discrete_word
                .set_bit(bit, self.fire_detection_unit.fire_detected(zone));
        }
        // Bits 18 to 29: ENG 1 LOOP A has failed, ENG 1 LOOP B has failed, ENG 2 LOOP A, ..., MLG LOOP B
        for (loop_a_bit, &zone) in (18..).step_by(2).zip(&A380_FIRE_ZONES) {
            self.discrete_word.set_bit(
                loop_a_bit,
                self.fire_detection_unit
                    .loop_has_failed(FireDetectionLoopID::A, zone),
            );
            self.discrete_word.set_bit(
                loop_a_bit + 1,
                self.fire_detection_unit
                    .loop_has_failed(FireDetectionLoopID::B, zone),
            );
        }
    }

    fn apu_fire_on_ground(&self) -> bool {
        self.fire_detection_unit.apu_fire_on_ground()
    }

    fn bottle_discharge(&self) -> [bool; 9] {
        self.fire_extinguishing_system.bottle_discharge()
    }
}

impl SimulationElement for FireProtectionSystem {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.fire_test_pushbutton_is_pressed = reader.read(&self.fire_test_pushbutton_id);
        self.fire_test_extend = reader.read(&self.fire_test_extend_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fire_test_active_id, self.fire_test_active);
        writer.write(&self.discrete_word_id, self.discrete_word);
    }

    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fire_detection_unit.accept(visitor);
        self.fire_extinguishing_system.accept(visitor);

        visitor.visit(self);
    }
}

struct FireExtinguishingSystem {
    fire_extinguishing_bottles: [ExtinguishingAgentBottle; 9],

    apu_fire_push_button: FirePushButton,
}

impl FireExtinguishingSystem {
    fn new(context: &mut InitContext) -> Self {
        let powered_by = [
            ElectricalBusType::DirectCurrentHot(1),
            ElectricalBusType::DirectCurrentEssential,
        ];
        Self {
            fire_extinguishing_bottles: [
                ExtinguishingAgentBottle::new(context, "1_ENG_1", powered_by),
                ExtinguishingAgentBottle::new(context, "2_ENG_1", powered_by),
                ExtinguishingAgentBottle::new(context, "1_ENG_2", powered_by),
                ExtinguishingAgentBottle::new(context, "2_ENG_2", powered_by),
                ExtinguishingAgentBottle::new(context, "1_ENG_3", powered_by),
                ExtinguishingAgentBottle::new(context, "2_ENG_3", powered_by),
                ExtinguishingAgentBottle::new(context, "1_ENG_4", powered_by),
                ExtinguishingAgentBottle::new(context, "2_ENG_4", powered_by),
                ExtinguishingAgentBottle::new(context, "1_APU_1", powered_by),
            ],

            apu_fire_push_button: FirePushButton::new(context, "APU"),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        fire_test_pushbutton_is_pressed: bool,
        should_extinguish_apu_fire: bool,
    ) {
        self.fire_extinguishing_bottles[..2]
            .iter_mut()
            .for_each(|bottle| {
                bottle.update(
                    context,
                    engine_fire_push_buttons.is_released(1),
                    fire_test_pushbutton_is_pressed,
                    None,
                )
            });
        self.fire_extinguishing_bottles[2..4]
            .iter_mut()
            .for_each(|bottle| {
                bottle.update(
                    context,
                    engine_fire_push_buttons.is_released(2),
                    fire_test_pushbutton_is_pressed,
                    None,
                )
            });
        self.fire_extinguishing_bottles[4..6]
            .iter_mut()
            .for_each(|bottle| {
                bottle.update(
                    context,
                    engine_fire_push_buttons.is_released(3),
                    fire_test_pushbutton_is_pressed,
                    None,
                )
            });
        self.fire_extinguishing_bottles[6..8]
            .iter_mut()
            .for_each(|bottle| {
                bottle.update(
                    context,
                    engine_fire_push_buttons.is_released(4),
                    fire_test_pushbutton_is_pressed,
                    None,
                )
            });
        self.fire_extinguishing_bottles[8].update(
            context,
            self.apu_fire_push_button.is_released(),
            fire_test_pushbutton_is_pressed,
            Some(should_extinguish_apu_fire),
        );
    }

    /// The array of 9 bottles represents two bottles for ENG1-4 and one for the APU
    fn bottle_discharge(&self) -> [bool; 9] {
        self.fire_extinguishing_bottles
            .iter()
            .map(|bottle| bottle.bottle_discharge())
            .collect::<Vec<bool>>()
            .try_into()
            .unwrap_or_else(|v: Vec<bool>| {
                panic!("Expected a Vec of length {} but it was {}", 9, v.len())
            })
    }
}

impl SimulationElement for FireExtinguishingSystem {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.apu_fire_push_button.accept(visitor);
        accept_iterable!(self.fire_extinguishing_bottles, visitor);

        visitor.visit(self);
    }
}

/// This struct represents the physical bottle of Halon 1301, and its possible states of armed, disarmed, full and empty
/// There are two squibs per bottle, but for simplicity we simulate a "single" squib with two possible power sources
struct ExtinguishingAgentBottle {
    squib_armed_id: VariableIdentifier,
    bottle_discharged_id: VariableIdentifier,
    agent_pb: MomentaryPushButton,

    squib_is_armed: bool,
    bottle_is_discharged: bool,
    system_test: bool,

    timer: Duration,
    powered_by: [ElectricalBusType; 2],
    is_powered: bool,
}

impl ExtinguishingAgentBottle {
    fn new(context: &mut InitContext, id: &str, powered_by: [ElectricalBusType; 2]) -> Self {
        Self {
            squib_armed_id: context.get_identifier(format!("FIRE_SQUIB_{}_IS_ARMED", id)),
            bottle_discharged_id: context
                .get_identifier(format!("FIRE_SQUIB_{}_IS_DISCHARGED", id)),
            agent_pb: MomentaryPushButton::new(context, &format!("FIRE_AGENT_{}", id)),

            squib_is_armed: false,
            bottle_is_discharged: false,
            system_test: false,

            timer: Duration::ZERO,
            powered_by,
            is_powered: false,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_button_is_pressed: bool,
        fire_test_pushbutton_is_pressed: bool,
        should_extinguish_fire: Option<bool>,
    ) {
        self.system_test = fire_test_pushbutton_is_pressed && self.is_powered;
        self.squib_is_armed = self.is_powered && engine_fire_push_button_is_pressed;
        if self.is_powered
            && ((self.squib_is_armed || should_extinguish_fire.unwrap_or(false))
                && self.timer >= Duration::from_secs(1))
        {
            // Once the bottle is discharged, it can't be recharged
            self.bottle_is_discharged = true
        } else if self.is_powered
            && (((self.squib_is_armed)
                && (self.agent_pb.is_pressed() || self.timer > Duration::ZERO))
                || should_extinguish_fire.unwrap_or(false))
            && self.timer <= Duration::from_secs(1)
        {
            self.timer += context.delta()
        } else {
            self.timer = Duration::ZERO
        };
    }

    fn bottle_discharge(&self) -> bool {
        self.bottle_is_discharged
    }
}

impl SimulationElement for ExtinguishingAgentBottle {
    fn write(&self, writer: &mut SimulatorWriter) {
        // The SQUIB light of the AGENT pb: on while the squibs are armed, off once the bottle is discharged; the fire
        // test lights it.
        writer.write(
            &self.squib_armed_id,
            (self.squib_is_armed && !self.bottle_is_discharged) || self.system_test,
        );
        writer.write(
            &self.bottle_discharged_id,
            self.bottle_is_discharged || self.system_test,
        );
    }

    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.agent_pb.accept(visitor);

        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = self.powered_by.iter().any(|&p| buses.is_powered(p));
    }
}

#[cfg(test)]
mod a380_fire_and_smoke_protection_tests {
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        engine::EngineFireOverheadPanel,
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, SimulationElement, SimulationElementVisitor, UpdateContext,
        },
    };

    use super::*;

    struct TestLgciu {
        compressed: bool,
    }
    impl TestLgciu {
        fn new(compressed: bool) -> Self {
            Self { compressed }
        }

        fn set_on_ground(&mut self, on_ground: bool) {
            self.compressed = on_ground;
        }
    }
    impl LgciuWeightOnWheels for TestLgciu {
        fn left_and_right_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            self.compressed
        }
        fn right_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            true
        }
        fn right_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            false
        }
        fn left_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            true
        }
        fn left_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            false
        }
        fn left_and_right_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            false
        }
        fn nose_gear_compressed(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            true
        }
        fn nose_gear_extended(&self, _treat_ext_pwr_as_ground: bool) -> bool {
            false
        }
    }

    struct TestAircraft {
        a380_fire_and_smoke_protection: A380FireAndSmokeProtection,
        engine_fire_overhead_panel: EngineFireOverheadPanel<4>,
        lgciu1: TestLgciu,
        lgciu2: TestLgciu,

        powered_dc_source_ess: TestElectricitySource,
        powered_dc_source_2: TestElectricitySource,
        powered_dc_hot: TestElectricitySource,
        dc_ess_bus: ElectricalBus,
        dc_2_bus: ElectricalBus,
        dc_hot_bus: ElectricalBus,
    }

    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                a380_fire_and_smoke_protection: A380FireAndSmokeProtection::new(context),
                engine_fire_overhead_panel: EngineFireOverheadPanel::new(context),
                lgciu1: TestLgciu::new(false),
                lgciu2: TestLgciu::new(false),

                powered_dc_source_ess: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EmergencyGenerator,
                ),
                powered_dc_source_2: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::Battery(2),
                ),
                powered_dc_hot: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::Battery(1),
                ),
                dc_ess_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentEssential),
                dc_2_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),
                dc_hot_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentHot(1)),
            }
        }

        fn set_on_ground(&mut self, on_ground: bool) {
            self.lgciu1.set_on_ground(on_ground);
            self.lgciu2.set_on_ground(on_ground);
        }

        fn power_dc_ess_bus(&mut self) {
            self.powered_dc_source_ess.power();
        }

        fn unpower_dc_ess_bus(&mut self) {
            self.powered_dc_source_ess.unpower();
        }

        fn power_dc_2_bus(&mut self) {
            self.powered_dc_source_2.power();
        }

        fn unpower_dc_2_bus(&mut self) {
            self.powered_dc_source_2.unpower();
        }

        fn unpower_dc_hot_bus(&mut self) {
            self.powered_dc_hot.unpower();
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _context: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.powered_dc_source_2);
            electricity.supplied_by(&self.powered_dc_source_ess);
            electricity.supplied_by(&self.powered_dc_hot);
            electricity.flow(&self.powered_dc_source_2, &self.dc_2_bus);
            electricity.flow(&self.powered_dc_source_ess, &self.dc_ess_bus);
            electricity.flow(&self.powered_dc_hot, &self.dc_hot_bus);
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            self.a380_fire_and_smoke_protection.update(
                context,
                &self.engine_fire_overhead_panel,
                [&self.lgciu1, &self.lgciu2],
            )
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<V: SimulationElementVisitor>(&mut self, visitor: &mut V) {
            self.a380_fire_and_smoke_protection.accept(visitor);
            self.engine_fire_overhead_panel.accept(visitor);

            visitor.visit(self);
        }
    }

    struct FireProtectionTestBed {
        test_bed: SimulationTestBed<TestAircraft>,
    }
    impl FireProtectionTestBed {
        fn new() -> Self {
            Self {
                test_bed: SimulationTestBed::new(TestAircraft::new),
            }
        }

        fn with(self) -> Self {
            self
        }

        fn and(self) -> Self {
            self
        }

        fn then(self) -> Self {
            self
        }

        fn and_run(mut self) -> Self {
            self.run();
            self
        }

        fn and_double_run(mut self) -> Self {
            self.run();
            self.run();
            self
        }

        fn run_with_delta_of(mut self, delta: Duration) -> Self {
            self.run_with_delta(delta);
            self
        }

        fn run_with_no_delta(mut self) -> Self {
            self.run_with_delta(Duration::ZERO);
            self
        }

        fn set_on_ground(mut self, on_ground: bool) -> Self {
            self.command(|a| a.set_on_ground(on_ground));
            self
        }

        /// The AGENT TO FWD (AFT) pb of the CARGO SMOKE panel
        fn agent_into_cargo_compartment(mut self, compartment: &str) -> Self {
            self.write_by_name(&format!("CARGOSMOKE_{}_DISCHARGED", compartment), true);
            self
        }

        /// The engine zone burns: its "zone burning" variable, as a tool would write it (no failure)
        fn set_engine_on_fire(mut self, engine_number: usize) -> Self {
            self.write_by_name(&format!("ENG_{}_ON_FIRE", engine_number), true);
            self
        }

        fn set_engine_on_fire_through_failure(mut self, engine_number: usize) -> Self {
            self.fail(FailureType::SetOnFire(FireDetectionZone::Engine(
                engine_number,
            )));
            // systems.wasm copies the fire into the sim's ENG ON FIRE:n (a380_systems_wasm fire.rs). The tests have no
            // wasm: the copy is written here, and stays on until the failure is resolved, even when an agent put the
            // fire out (the fire detection must not read it)
            self.write_by_name(&format!("ENG ON FIRE:{}", engine_number), true);
            self
        }

        fn resolve_engine_on_fire_through_failure(mut self, engine_number: usize) -> Self {
            self.unfail(FailureType::SetOnFire(FireDetectionZone::Engine(
                engine_number,
            )));
            // The copy of the fire in the sim variable, see set_engine_on_fire_through_failure
            self.write_by_name(&format!("ENG ON FIRE:{}", engine_number), false);
            self
        }

        /// The failure is removed, but the sim's ENG ON FIRE:n copy of the fire stays on (as if the sim kept it)
        fn resolve_engine_fire_failure_with_sim_variable_stuck(
            mut self,
            engine_number: usize,
        ) -> Self {
            self.unfail(FailureType::SetOnFire(FireDetectionZone::Engine(
                engine_number,
            )));
            self.write_by_name(&format!("ENG ON FIRE:{}", engine_number), true);
            self
        }

        fn set_apu_on_fire_through_failure(mut self, on_fire: bool) -> Self {
            if on_fire {
                self.fail(FailureType::SetOnFire(FireDetectionZone::Apu));
            } else {
                self.unfail(FailureType::SetOnFire(FireDetectionZone::Apu));
            }
            self
        }

        /// The "zone burning" signal, e.g. ENG_1_ON_FIRE (the fire visual effects read it)
        fn zone_burning(&mut self, name: &str) -> bool {
            self.read_by_name(name)
        }

        fn set_engine_fire_extinguished(mut self, engine_number: usize) -> Self {
            self.write_by_name(&format!("ENG_{}_ON_FIRE", engine_number), false);
            self
        }

        fn set_engine_fire_pb_released(mut self, engine_number: usize, released: bool) -> Self {
            self.write_by_name(&format!("FIRE_BUTTON_ENG{}", engine_number), released);
            self
        }

        fn set_apu_on_fire(mut self) -> Self {
            self.write_by_name("APU_ON_FIRE", true);
            self
        }

        fn set_mlg_on_fire(mut self) -> Self {
            self.write_by_name("MLG_ON_FIRE", true);
            self
        }

        fn set_test_pushbutton(mut self, test_pb: bool) -> Self {
            self.write_by_name("OVHD_FIRE_TEST_PB_IS_PRESSED", test_pb);
            self
        }

        fn set_fire_test_extend(mut self, extend: bool) -> Self {
            self.write_by_name("FIRE_TEST_EXTEND", extend);
            self
        }

        fn fire_test_active(&mut self) -> bool {
            self.read_by_name("FIRE_TEST_ACTIVE")
        }

        fn set_agent_pb(mut self, engine_number: usize, released: bool) -> Self {
            self.write_by_name(
                &format!("OVHD_FIRE_AGENT_1_ENG_{}_IS_PRESSED", engine_number),
                released,
            );
            self
        }

        fn set_loop_failure(mut self, engine_number: usize, loop_id: FireDetectionLoopID) -> Self {
            self.fail(FailureType::FireDetectionLoop(
                loop_id,
                FireDetectionZone::Engine(engine_number),
            ));
            self
        }

        fn powered_dc_ess_bus(mut self) -> Self {
            self.command(|a| a.power_dc_ess_bus());
            self
        }

        fn unpowered_dc_ess_bus(mut self) -> Self {
            self.command(|a| a.unpower_dc_ess_bus());
            self
        }

        fn powered_dc_2_bus(mut self) -> Self {
            self.command(|a| a.power_dc_2_bus());
            self
        }

        fn unpowered_dc_2_bus(mut self) -> Self {
            self.command(|a| a.unpower_dc_2_bus());
            self
        }

        fn unpowered_dc_hot_bus(mut self) -> Self {
            self.command(|a| a.unpower_dc_hot_bus());
            self
        }

        fn engine_on_fire_detected(&mut self, engine_number: usize) -> bool {
            self.read_by_name(&format!("FIRE_DETECTED_ENG{}", engine_number))
        }

        fn apu_on_fire_detected(&mut self) -> bool {
            self.read_by_name("FIRE_DETECTED_APU")
        }

        fn mlg_on_fire_detected(&mut self) -> bool {
            self.read_by_name("FIRE_DETECTED_MLG")
        }

        fn squib_engine_is_armed(&mut self, engine_number: usize) -> bool {
            self.read_by_name(&format!("FIRE_SQUIB_1_ENG_{}_IS_ARMED", engine_number))
        }

        fn squib_apu_is_armed(&mut self) -> bool {
            self.read_by_name("FIRE_SQUIB_1_APU_1_IS_ARMED")
        }

        fn squib_engine_is_discharged(&mut self, engine_number: usize) -> bool {
            self.read_by_name(&format!("FIRE_SQUIB_1_ENG_{}_IS_DISCHARGED", engine_number))
        }

        fn squib_apu_is_discharged(&mut self) -> bool {
            self.read_by_name("FIRE_SQUIB_1_APU_1_IS_DISCHARGED")
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

    mod a380_fire_protection_tests {
        use super::*;

        #[test]
        fn when_an_engine_is_on_fire_the_detection_system_works() {
            let mut test_bed = test_bed().with().set_engine_on_fire(1).and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn when_an_engine_is_on_fire_the_detection_works_if_only_one_loop_unpowered() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .set_engine_on_fire(1)
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn when_an_engine_is_on_fire_the_detection_system_does_not_work_if_unpowered() {
            // If both loops are unpowered at the same time the fire warning will trigger
            // We need to add a delay between the two unpowering systems
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .run_with_delta_of(Duration::from_secs(6))
                .unpowered_dc_2_bus()
                .set_engine_on_fire(1)
                .and_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn returning_power_to_loop_makes_it_operational() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .run_with_delta_of(Duration::from_secs(6))
                .unpowered_dc_2_bus()
                .set_engine_on_fire(1)
                .and_run();

            assert!(!test_bed.engine_on_fire_detected(1));

            test_bed = test_bed.powered_dc_ess_bus().powered_dc_2_bus().and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn unpowering_both_loops_simultaneously_triggers_fire_detection() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .unpowered_dc_2_bus()
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn after_power_triggering_returning_power_clears_fire_detection() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .unpowered_dc_ess_bus()
                .unpowered_dc_2_bus()
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));

            test_bed = test_bed.powered_dc_ess_bus().powered_dc_2_bus().and_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn fire_detection_works_for_apu_and_mlg() {
            let mut test_bed = test_bed()
                .with()
                .set_apu_on_fire()
                .and()
                .set_mlg_on_fire()
                .and_run();

            assert!(test_bed.apu_on_fire_detected());
            assert!(test_bed.mlg_on_fire_detected());
        }

        #[test]
        fn all_zones_detect_fire_when_test_pressed() {
            let mut test_bed = test_bed()
                .with()
                .set_test_pushbutton(true)
                .run_with_delta_of(Duration::from_secs(3));

            assert!(test_bed.engine_on_fire_detected(1));
            assert!(test_bed.apu_on_fire_detected());
            assert!(test_bed.mlg_on_fire_detected());
        }

        /// The TEST pb must be held for at least three seconds
        #[test]
        fn fire_test_starts_only_after_the_pushbutton_is_held_three_seconds() {
            let mut test_bed = test_bed()
                .with()
                .set_test_pushbutton(true)
                .run_with_delta_of(Duration::from_millis(2900));

            assert!(!test_bed.engine_on_fire_detected(1));
            assert!(!test_bed.apu_on_fire_detected());
            assert!(!test_bed.mlg_on_fire_detected());
            assert!(!test_bed.squib_engine_is_armed(1));

            test_bed = test_bed.run_with_delta_of(Duration::from_millis(100));

            assert!(test_bed.engine_on_fire_detected(1));
            assert!(test_bed.apu_on_fire_detected());
            assert!(test_bed.mlg_on_fire_detected());
            assert!(test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn test_stops_when_pushbutton_released_without_extension() {
            let mut test_bed = test_bed()
                .with()
                .set_test_pushbutton(true)
                .and_run()
                .then()
                .set_test_pushbutton(false)
                .run_with_delta_of(Duration::from_secs(1));

            assert!(!test_bed.fire_test_active());
            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn extended_test_goes_on_after_pushbutton_released() {
            let mut test_bed = test_bed()
                .with()
                .set_fire_test_extend(true)
                .set_test_pushbutton(true)
                .and_run()
                .then()
                .set_test_pushbutton(false)
                .run_with_delta_of(Duration::from_secs(5));

            assert!(test_bed.fire_test_active());
            assert!(test_bed.engine_on_fire_detected(1));
            assert!(test_bed.apu_on_fire_detected());

            test_bed = test_bed.run_with_delta_of(Duration::from_secs(3));

            assert!(!test_bed.fire_test_active());
            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn test_does_not_trigger_immidatelly() {
            let mut test_bed = test_bed()
                .with()
                .set_test_pushbutton(true)
                .and()
                .run_with_no_delta();

            assert!(!test_bed.engine_on_fire_detected(1));
            assert!(!test_bed.apu_on_fire_detected());
            assert!(!test_bed.mlg_on_fire_detected());
        }

        #[test]
        fn fire_detection_disappears_when_fire_extinguished() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire(1)
                .and_run()
                .set_engine_fire_extinguished(1)
                .and_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn fire_is_detected_when_triggered_through_failures() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire_through_failure(1)
                .and_double_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn fire_is_not_detected_when_failure_resolved() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire_through_failure(1)
                .and_double_run();

            assert!(test_bed.engine_on_fire_detected(1));

            test_bed = test_bed
                .resolve_engine_on_fire_through_failure(1)
                .and_double_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn when_an_engine_is_on_fire_the_detection_works_if_only_one_loop_has_failed() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .set_loop_failure(1, FireDetectionLoopID::A)
                .set_engine_on_fire(1)
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn when_an_engine_is_on_fire_the_detection_system_does_not_work_if_both_loops_failed() {
            // If both loops fail at the same time the fire warning will trigger
            // We need to add a delay between the two failing systems
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .set_loop_failure(1, FireDetectionLoopID::A)
                .run_with_delta_of(Duration::from_secs(6))
                .set_loop_failure(1, FireDetectionLoopID::B)
                .set_engine_on_fire(1)
                .and_run();

            assert!(!test_bed.engine_on_fire_detected(1));
        }

        #[test]
        fn failing_both_loops_simultaneously_triggers_fire_detection() {
            let mut test_bed = test_bed()
                .and_run()
                .with()
                .set_loop_failure(1, FireDetectionLoopID::A)
                .set_loop_failure(1, FireDetectionLoopID::B)
                .and_run();

            assert!(test_bed.engine_on_fire_detected(1));
        }
    }

    mod a380_fire_extinguishing_tests {
        use super::*;

        #[test]
        fn squibs_start_disarmed() {
            let mut test_bed = test_bed().and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn releasing_the_fire_pb_arms_the_squibs() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run();

            assert!(test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn unreleasing_the_fire_pb_disarms_the_squibs() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_engine_fire_pb_released(1, false)
                .and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn pressing_the_agent_button_does_not_do_anything_if_unarmed() {
            let mut test_bed = test_bed().with().set_agent_pb(1, true).and_run().and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
            assert!(!test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn pressing_the_agent_button_when_armed_does_not_discharge_immediately() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_run();

            assert!(test_bed.squib_engine_is_armed(1));
            assert!(!test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn pressing_the_agent_button_when_armed_discharges_bottle_after_delay() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_double_run();

            assert!(test_bed.squib_engine_is_discharged(1));
        }

        /// Pressing the AGENT pb discharges the bottle and the SQUIB light goes off
        #[test]
        fn squib_light_goes_off_when_the_bottle_is_discharged() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_double_run();

            assert!(test_bed.squib_engine_is_discharged(1));
            assert!(!test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn depressing_the_agent_button_does_not_stop_discharge() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_run()
                .set_agent_pb(1, false)
                .and_run();

            assert!(test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn bottle_stays_discharged_after_fire_pb_is_reset() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_run()
                .set_agent_pb(1, false)
                .and_run()
                .then()
                .set_engine_fire_pb_released(1, false)
                .and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
            assert!(test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn when_on_ground_apu_bottle_automatically_discharges() {
            let mut test_bed = test_bed()
                .set_on_ground(true)
                .with()
                .set_apu_on_fire()
                .run_with_delta_of(Duration::from_secs(10))
                .and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn apu_bottle_does_not_discharge_on_ground_when_testing() {
            let mut test_bed = test_bed()
                .set_on_ground(true)
                .set_test_pushbutton(true)
                .run_with_delta_of(Duration::from_secs(10))
                .and_double_run()
                .then()
                .set_test_pushbutton(false)
                .and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(!test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn apu_bottle_starts_charged_on_ground() {
            let mut test_bed = test_bed().set_on_ground(true).and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(!test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn apu_bottle_starts_charged_in_flight() {
            let mut test_bed = test_bed().set_on_ground(false).and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(!test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn when_in_flight_apu_bottle_does_not_automatically_discharge() {
            let mut test_bed = test_bed()
                .set_on_ground(false)
                .with()
                .set_apu_on_fire()
                .run_with_delta_of(Duration::from_secs(10))
                .and_double_run();

            assert!(!test_bed.squib_apu_is_armed());
            assert!(!test_bed.squib_apu_is_discharged());
        }

        #[test]
        fn squibs_arm_even_if_one_squib_unpowered() {
            let mut test_bed = test_bed()
                .with()
                .unpowered_dc_hot_bus()
                .set_engine_fire_pb_released(1, true)
                .and_run();

            assert!(test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn squibs_dont_arm_if_both_unpowered() {
            let mut test_bed = test_bed()
                .with()
                .unpowered_dc_hot_bus()
                .unpowered_dc_ess_bus()
                .set_engine_fire_pb_released(1, true)
                .and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
        }

        #[test]
        fn squibs_show_armed_and_discharged_when_test() {
            let mut test_bed = test_bed()
                .with()
                .set_test_pushbutton(true)
                .run_with_delta_of(Duration::from_secs(3));

            assert!(test_bed.squib_engine_is_armed(1));
            assert!(test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn squibs_dont_show_armed_and_discharged_when_test_if_unpowered() {
            let mut test_bed = test_bed()
                .with()
                .unpowered_dc_hot_bus()
                .unpowered_dc_ess_bus()
                .set_test_pushbutton(true)
                .and_run();

            assert!(!test_bed.squib_engine_is_armed(1));
            assert!(!test_bed.squib_engine_is_discharged(1));
        }

        #[test]
        fn discharging_bottle_when_fire_active_has_the_chance_to_put_it_out() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire(1)
                .and_double_run()
                .set_engine_fire_pb_released(1, true)
                .and_run()
                .then()
                .set_agent_pb(1, true)
                .and_double_run()
                .and_double_run();

            // the SQUIB light goes off once the bottle is discharged
            assert!(!test_bed.squib_engine_is_armed(1));
            assert!(test_bed.squib_engine_is_discharged(1));
            print!(
                "Engine fire was put out: {}",
                !test_bed.engine_on_fire_detected(1)
            );
        }
    }

    // The "zone burning" signal L:A32NX_ENG_<n>_ON_FIRE / L:A32NX_APU_ON_FIRE, which the fire visual effects read
    // alone. systems.wasm copies the engine one into the sim's ENG ON FIRE:n (a380_systems_wasm fire.rs): that copy is
    // an output, it must never keep the zone burning.
    mod a380_zone_burning_tests {
        use super::*;

        #[test]
        fn the_engine_fire_failure_burns_until_it_is_removed_even_if_the_sim_variable_stays_on() {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire_through_failure(3)
                .and_double_run();

            assert!(test_bed.zone_burning("ENG_3_ON_FIRE"));
            assert!(!test_bed.zone_burning("ENG_1_ON_FIRE"));

            test_bed = test_bed
                .resolve_engine_fire_failure_with_sim_variable_stuck(3)
                .and_double_run();

            assert!(!test_bed.zone_burning("ENG_3_ON_FIRE"));
        }

        #[test]
        fn an_agent_that_puts_the_engine_fire_out_stops_the_burning_even_if_the_sim_variable_stays_on(
        ) {
            let mut put_out = 0;
            for _ in 0..64 {
                // The failure stays active and ENG ON FIRE:1 stays on for the rest of the test
                let mut test_bed = test_bed()
                    .with()
                    .set_engine_on_fire_through_failure(1)
                    .and_double_run();
                assert!(test_bed.zone_burning("ENG_1_ON_FIRE"));

                test_bed = test_bed
                    .set_engine_fire_pb_released(1, true)
                    .and_run()
                    .then()
                    .set_agent_pb(1, true)
                    .and_double_run()
                    .and_double_run();
                assert!(test_bed.squib_engine_is_discharged(1));

                if !test_bed.zone_burning("ENG_1_ON_FIRE") {
                    put_out += 1;
                    test_bed = test_bed.and_double_run();
                    assert!(!test_bed.zone_burning("ENG_1_ON_FIRE"));
                }
            }

            assert!(put_out > 0 && put_out < 64);
        }

        #[test]
        fn the_apu_fire_failure_burns_until_it_is_removed() {
            let mut test_bed = test_bed()
                .with()
                .set_apu_on_fire_through_failure(true)
                .and_double_run();

            assert!(test_bed.zone_burning("APU_ON_FIRE"));
            assert!(!test_bed.zone_burning("ENG_1_ON_FIRE"));

            test_bed = test_bed
                .set_apu_on_fire_through_failure(false)
                .and_double_run();

            assert!(!test_bed.zone_burning("APU_ON_FIRE"));
        }

        // The fire detection senses the zone burning signal alone: the ENG MASTER FIRE light stays on until the fire
        // is extinguished

        #[test]
        fn the_fire_warning_ends_when_the_engine_fire_failure_is_removed_even_if_the_sim_variable_stays_on(
        ) {
            let mut test_bed = test_bed()
                .with()
                .set_engine_on_fire_through_failure(2)
                .and_double_run();
            assert!(test_bed.engine_on_fire_detected(2));

            test_bed = test_bed
                .resolve_engine_fire_failure_with_sim_variable_stuck(2)
                .and_double_run();

            assert!(!test_bed.engine_on_fire_detected(2));
        }

        #[test]
        fn the_fire_warning_ends_when_an_agent_puts_the_engine_fire_out_even_if_the_sim_variable_stays_on(
        ) {
            let mut put_out = 0;
            for _ in 0..64 {
                // The failure stays active and ENG ON FIRE:1 stays on for the rest of the test
                let mut test_bed = test_bed()
                    .with()
                    .set_engine_on_fire_through_failure(1)
                    .and_double_run();
                assert!(test_bed.engine_on_fire_detected(1));

                test_bed = test_bed
                    .set_engine_fire_pb_released(1, true)
                    .and_run()
                    .then()
                    .set_agent_pb(1, true)
                    .and_double_run()
                    .and_double_run();

                if !test_bed.zone_burning("ENG_1_ON_FIRE") {
                    put_out += 1;
                    test_bed = test_bed.and_double_run();
                    assert!(!test_bed.engine_on_fire_detected(1));
                } else {
                    // Not put out (1/2 chance): the warning stays
                    assert!(test_bed.engine_on_fire_detected(1));
                }
            }

            assert!(put_out > 0);
        }
    }

    mod a380_smoke_detection_function_tests {
        use super::*;

        fn read_bool(test_bed: &mut FireProtectionTestBed, name: &str) -> bool {
            test_bed.read_by_name(name)
        }

        fn smoke_detected(test_bed: &mut FireProtectionTestBed, zone: &str) -> bool {
            test_bed.read_by_name(&format!("SMOKE_{}_DETECTED", zone))
        }

        fn smoke_detection_fault(test_bed: &mut FireProtectionTestBed, zone: &str) -> bool {
            test_bed.read_by_name(&format!("SMOKE_{}_DET_FAULT", zone))
        }

        const ZONES: [&str; 10] = [
            "FWD_CARGO",
            "AFT_CARGO",
            "BULK_CARGO",
            "L_MAIN_AVNCS",
            "R_MAIN_AVNCS",
            "L_UPPER_AVNCS",
            "R_UPPER_AVNCS",
            "AFT_AVNCS",
            "IFE_BAY",
            "NSS",
        ];

        #[test]
        fn no_smoke_warning_and_no_detector_fault_when_healthy() {
            let mut test_bed = test_bed().and_double_run();

            for zone in ZONES {
                assert!(!smoke_detected(&mut test_bed, zone));
                assert!(!smoke_detection_fault(&mut test_bed, zone));
            }
        }

        #[test]
        fn smoke_in_each_compartment_gives_its_own_smoke_warning_only() {
            for (index, &zone) in A380_SMOKE_DETECTION_ZONES.iter().enumerate() {
                let mut test_bed = test_bed();
                test_bed.fail(FailureType::Smoke(zone));
                test_bed = test_bed.and_double_run();

                for (other_index, other_zone) in ZONES.iter().enumerate() {
                    assert_eq!(
                        smoke_detected(&mut test_bed, other_zone),
                        index == other_index
                    );
                }
            }
        }

        #[test]
        fn one_failed_detector_gives_the_smoke_det_fault_of_its_compartment() {
            // Cargo compartment detection logic
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::SmokeDetector(SmokeDetectionZone::BulkCargo, 2));
            test_bed = test_bed.and_double_run();

            assert!(smoke_detection_fault(&mut test_bed, "BULK_CARGO"));
            assert!(!smoke_detection_fault(&mut test_bed, "AFT_CARGO"));
        }

        #[test]
        fn smoke_with_one_failed_detector_gives_the_smoke_warning() {
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::SmokeDetector(
                SmokeDetectionZone::LeftMainAvionics,
                1,
            ));
            test_bed.fail(FailureType::Smoke(SmokeDetectionZone::LeftMainAvionics));
            test_bed = test_bed.and_double_run();

            assert!(smoke_detected(&mut test_bed, "L_MAIN_AVNCS"));
        }

        #[test]
        fn smoke_in_the_nss_lights_the_smoke_light_of_the_nss_master_sw() {
            // The NSS SMOKE light stays on as long as smoke is detected
            let mut test_bed = test_bed().and_double_run();
            assert!(!smoke_detected(&mut test_bed, "NSS"));

            test_bed.fail(FailureType::Smoke(SmokeDetectionZone::NetworkServerSystem));
            test_bed = test_bed.and_double_run();
            assert!(smoke_detected(&mut test_bed, "NSS"));

            test_bed.unfail(FailureType::Smoke(SmokeDetectionZone::NetworkServerSystem));
            test_bed = test_bed.and_double_run();
            assert!(!smoke_detected(&mut test_bed, "NSS"));
        }

        #[test]
        fn one_failed_nss_detector_gives_a_detector_fault_and_keeps_the_smoke_detection() {
            // Detection logic of the bays
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::SmokeDetector(
                SmokeDetectionZone::NetworkServerSystem,
                2,
            ));
            test_bed = test_bed.and_double_run();
            assert!(smoke_detection_fault(&mut test_bed, "NSS"));
            assert!(!smoke_detected(&mut test_bed, "NSS"));

            test_bed.fail(FailureType::Smoke(SmokeDetectionZone::NetworkServerSystem));
            test_bed = test_bed.and_double_run();
            assert!(smoke_detected(&mut test_bed, "NSS"));
        }

        #[test]
        fn a_failed_sdf_gives_smoke_det_fault_and_loses_the_smoke_detection() {
            // SMOKE DET FAULT
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
            test_bed.fail(FailureType::SmokeDetector(SmokeDetectionZone::BulkCargo, 2));
            test_bed = test_bed.and_double_run();
            assert!(!read_bool(&mut test_bed, "SMOKE_DETECTION_FUNCTION_FAULT"));
            assert!(smoke_detected(&mut test_bed, "FWD_CARGO"));
            assert!(smoke_detection_fault(&mut test_bed, "BULK_CARGO"));

            test_bed.fail(FailureType::SmokeDetectionFunction);
            test_bed = test_bed.and_double_run();

            assert!(read_bool(&mut test_bed, "SMOKE_DETECTION_FUNCTION_FAULT"));
            for zone in ZONES {
                assert!(!smoke_detected(&mut test_bed, zone));
                assert!(!smoke_detection_fault(&mut test_bed, zone));
            }
        }

        #[test]
        fn the_aft_agent_discharges_bottle_1_in_about_one_minute_then_bottle_2() {
            // Cargo fire extinguishing: bottle 1, then bottle 2
            let mut test_bed = test_bed()
                .and_double_run()
                .then()
                .agent_into_cargo_compartment("AFT")
                .run_with_delta_of(Duration::from_secs(30));

            assert!(read_bool(&mut test_bed, "CARGOSMOKE_AFT_AGENT_RELEASED"));
            assert!(!read_bool(&mut test_bed, "CARGOSMOKE_FWD_AGENT_RELEASED"));
            assert!(!read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_1_DISCHARGED"));

            test_bed = test_bed.run_with_delta_of(Duration::from_secs(31));

            assert!(read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_1_DISCHARGED"));
            assert!(!read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_2_DISCHARGED"));

            test_bed = test_bed.run_with_delta_of(Duration::from_secs(4 * 3600 + 1));

            assert!(read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_2_DISCHARGED"));
        }

        #[test]
        fn a_cargo_bottle_that_lost_its_agent_has_low_pressure() {
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::CargoFireBottleLowPressure(2));
            test_bed = test_bed.and_double_run();

            assert!(read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_2_LOW_PRESSURE"));
            assert!(!read_bool(
                &mut test_bed,
                "CARGOSMOKE_BOTTLE_1_LOW_PRESSURE"
            ));
        }

        const CABIN_ZONES: [&str; 9] = [
            "FLT_REST_1",
            "FLT_REST_2",
            "AFT_LWR_CAB_REST",
            "MAIN_1L_CWS",
            "UPPER_1L_CWS",
            "UPPER_3R_RCC",
            "MAIN_DECK_LAV",
            "UPPER_DECK_LAV",
            "LOWER_DECK_LAV",
        ];

        fn cabin_zone_types() -> Vec<SmokeDetectionZone> {
            A380_CABIN_SMOKE_DETECTION_ZONES
                .iter()
                .chain(A380_LAVATORY_SMOKE_DETECTION_ZONES.iter())
                .copied()
                .collect()
        }

        #[test]
        fn smoke_in_each_cabin_area_gives_its_own_smoke_warning_only() {
            for (index, zone) in cabin_zone_types().into_iter().enumerate() {
                let mut test_bed = test_bed();
                test_bed.fail(FailureType::Smoke(zone));
                test_bed = test_bed.and_double_run();

                for (other_index, other_zone) in CABIN_ZONES.iter().enumerate() {
                    assert_eq!(
                        smoke_detected(&mut test_bed, other_zone),
                        index == other_index
                    );
                    assert!(!smoke_detection_fault(&mut test_bed, other_zone));
                }
                for other_zone in ZONES {
                    assert!(!smoke_detected(&mut test_bed, other_zone));
                }
            }
        }

        #[test]
        fn a_failed_lavatory_detector_gives_the_det_fault_and_loses_the_smoke_detection() {
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::SmokeDetector(
                SmokeDetectionZone::UpperDeckLavatory,
                1,
            ));
            test_bed.fail(FailureType::Smoke(SmokeDetectionZone::UpperDeckLavatory));
            test_bed = test_bed.and_double_run();

            assert!(smoke_detection_fault(&mut test_bed, "UPPER_DECK_LAV"));
            assert!(!smoke_detected(&mut test_bed, "UPPER_DECK_LAV"));
            assert!(!smoke_detection_fault(&mut test_bed, "MAIN_DECK_LAV"));
        }

        #[test]
        fn one_failed_crew_rest_detector_gives_the_det_fault_and_keeps_the_smoke_detection() {
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::SmokeDetector(
                SmokeDetectionZone::AftLowerDeckCabinCrewRest,
                2,
            ));
            test_bed = test_bed.and_double_run();
            assert!(smoke_detection_fault(&mut test_bed, "AFT_LWR_CAB_REST"));

            test_bed.fail(FailureType::Smoke(
                SmokeDetectionZone::AftLowerDeckCabinCrewRest,
            ));
            test_bed = test_bed.and_double_run();
            assert!(smoke_detected(&mut test_bed, "AFT_LWR_CAB_REST"));
        }

        #[test]
        fn the_facilities_fault_loses_the_cabin_smoke_detection_only() {
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::Smoke(SmokeDetectionZone::MainDeckLavatory));
            test_bed.fail(FailureType::SmokeDetector(
                SmokeDetectionZone::FlightCrewRest2,
                1,
            ));
            test_bed.fail(FailureType::Smoke(SmokeDetectionZone::ForwardCargo));
            test_bed = test_bed.and_double_run();
            assert!(!read_bool(&mut test_bed, "SMOKE_FACILITIES_DET_FAULT"));
            assert!(smoke_detected(&mut test_bed, "MAIN_DECK_LAV"));
            assert!(smoke_detection_fault(&mut test_bed, "FLT_REST_2"));

            test_bed.fail(FailureType::SmokeDetectionFacilities);
            test_bed = test_bed.and_double_run();

            assert!(read_bool(&mut test_bed, "SMOKE_FACILITIES_DET_FAULT"));
            for zone in CABIN_ZONES {
                assert!(!smoke_detected(&mut test_bed, zone));
                assert!(!smoke_detection_fault(&mut test_bed, zone));
            }
            assert!(smoke_detected(&mut test_bed, "FWD_CARGO"));
        }

        #[test]
        fn the_sdf_reports_a_missed_safety_test() {
            let mut test_bed = test_bed().and_double_run();
            assert!(!read_bool(&mut test_bed, "SMOKE_SAFETY_TEST_REQUIRED"));

            test_bed.fail(FailureType::SmokeDetectionSafetyTestOverdue);
            test_bed = test_bed.and_double_run();
            assert!(read_bool(&mut test_bed, "SMOKE_SAFETY_TEST_REQUIRED"));
        }

        #[test]
        fn a_failed_sdf_reports_neither_the_facilities_fault_nor_the_safety_test() {
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::SmokeDetectionFacilities);
            test_bed.fail(FailureType::SmokeDetectionSafetyTestOverdue);
            test_bed.fail(FailureType::SmokeDetectionFunction);
            test_bed = test_bed.and_double_run();

            assert!(read_bool(&mut test_bed, "SMOKE_DETECTION_FUNCTION_FAULT"));
            assert!(!read_bool(&mut test_bed, "SMOKE_FACILITIES_DET_FAULT"));
            assert!(!read_bool(&mut test_bed, "SMOKE_SAFETY_TEST_REQUIRED"));
        }

        #[test]
        fn a_failed_fwd_diverter_valve_position_keeps_the_agent_out_of_the_fwd_compartment() {
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::CargoFireDiverterValvePosition(1));
            test_bed = test_bed
                .and_double_run()
                .then()
                .agent_into_cargo_compartment("FWD")
                .run_with_delta_of(Duration::from_secs(61));

            assert!(read_bool(
                &mut test_bed,
                "CARGOSMOKE_DIVERTER_VALVE_FWD_FAULT"
            ));
            assert!(!read_bool(
                &mut test_bed,
                "CARGOSMOKE_DIVERTER_VALVE_AFT_FAULT"
            ));
            assert!(!read_bool(&mut test_bed, "CARGOSMOKE_FWD_AGENT_RELEASED"));
            assert!(!read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_1_DISCHARGED"));

            test_bed = test_bed
                .agent_into_cargo_compartment("AFT")
                .run_with_delta_of(Duration::from_secs(61));
            assert!(read_bool(&mut test_bed, "CARGOSMOKE_AFT_AGENT_RELEASED"));
            assert!(read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_1_DISCHARGED"));
        }

        #[test]
        fn a_failed_bottle_control_keeps_the_agent_out_of_both_compartments() {
            let mut test_bed = test_bed();
            test_bed.fail(FailureType::CargoFireBottleControl);
            test_bed = test_bed
                .and_double_run()
                .then()
                .agent_into_cargo_compartment("FWD")
                .agent_into_cargo_compartment("AFT")
                .run_with_delta_of(Duration::from_secs(61));

            assert!(read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_CONTROL_FAULT"));
            assert!(!read_bool(&mut test_bed, "CARGOSMOKE_FWD_AGENT_RELEASED"));
            assert!(!read_bool(&mut test_bed, "CARGOSMOKE_AFT_AGENT_RELEASED"));
            assert!(!read_bool(&mut test_bed, "CARGOSMOKE_BOTTLE_1_DISCHARGED"));
        }

        #[test]
        fn a_failed_crew_rest_bottle_gives_its_bottle_fault() {
            let mut test_bed = test_bed().and_double_run();
            assert!(!read_bool(
                &mut test_bed,
                "SMOKE_AFT_LWR_CAB_REST_BTL_1_FAULT"
            ));

            test_bed.fail(FailureType::CrewRestFireBottle(2));
            test_bed = test_bed.and_double_run();

            assert!(read_bool(
                &mut test_bed,
                "SMOKE_AFT_LWR_CAB_REST_BTL_2_FAULT"
            ));
            assert!(!read_bool(
                &mut test_bed,
                "SMOKE_AFT_LWR_CAB_REST_BTL_1_FAULT"
            ));
        }
    }
}
