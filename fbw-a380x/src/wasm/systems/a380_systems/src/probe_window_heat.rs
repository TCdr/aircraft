//! ATA 30 probe heat, cockpit window heat, ice detection and drain mast heating of the A380, for the A-ICE probe and
//! window cautions of the FWS.
//!
//! Probe heat: the pitot TAT AOA probe (multi-function probe), the left and right static probes and the sideslip probe of
//! each ADR, and the standby pitot and static probes of the ISIS, are heated automatically as soon as any engine runs,
//! or with the PROBE & WINDOW HEAT pb ON. Each ADIRU commands the heating of its probes: when that command is lost the
//! probes are no longer deiced automatically (A-ICE ALL PROBES n NOT DEICED) and the pb ON heats them directly.
//!
//! Window heat: channel B of AICU 1 (CAPT side) and of AICU 2 (F/O side) controls and monitors the windshield, the
//! sliding window and the fixed window of its side, with the same demand as the probes.
//!
//! Ice detection: one ice detector on each side of the fuselage. Drain masts: the heaters of the water/waste drain masts,
//! controlled by the Ice Protection Control Units.
//!
//! Design choices (nothing more is published): a heater fault is seen while its heater is commanded, as on the A320,
//! and on the ADR probes only while the ADIRU still commands them; the supply backups of the ADR 3 probes (AIR DATA
//! selector on CAPT 3) are not modelled; the drain mast heaters are always armed and their supply is not published;
//! the heat has no effect on the air data (no probe icing model).

use systems::{
    failures::{Failure, FailureType},
    shared::{ElectricalBusType, ElectricalBuses},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, VariableIdentifier, Write,
    },
};

/// The A380 AC ESS busbar (400XP), named after the A320 AC ESS SHED bus in the electrical model
const AC_ESS: ElectricalBusType = ElectricalBusType::AlternatingCurrentEssentialShed;
/// The A380 AC EMER busbar (491XP), named after the A320 AC ESS bus in the electrical model
const AC_EMER: ElectricalBusType = ElectricalBusType::AlternatingCurrentEssential;

/// The probe index of FailureType::ProbeHeater for the A380 probes
const MULTI_FUNCTION_PROBE: usize = 1;
const LEFT_STATIC_PROBE: usize = 2;
const RIGHT_STATIC_PROBE: usize = 3;
const SIDESLIP_PROBE: usize = 6;
/// The ADR number of FailureType::ProbeHeater for the standby probes
const STANDBY_PROBES: usize = 4;

/// When the probes and windows are heated
#[derive(Clone, Copy, Default)]
struct HeatingDemand {
    push_button_on: bool,
    engine_running: bool,
}
impl HeatingDemand {
    fn heats(&self) -> bool {
        self.push_button_on || self.engine_running
    }
}

struct Heater {
    powered_by: ElectricalBusType,
    is_powered: bool,
    failure: Failure,
    commanded: bool,
}
impl Heater {
    fn new(powered_by: ElectricalBusType, failure_type: FailureType) -> Self {
        Self {
            powered_by,
            is_powered: false,
            failure: Failure::new(failure_type),
            commanded: false,
        }
    }

    fn is_heating(&self) -> bool {
        self.commanded && self.is_powered && !self.failure.is_active()
    }

    fn is_failed_while_commanded(&self) -> bool {
        self.commanded && self.failure.is_active()
    }
}
impl SimulationElement for Heater {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);
        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }
}

/// The heated probes of one ADR: pitot TAT AOA probe, left and right static probes, sideslip probe
struct AdrProbes {
    automatic_heating_lost_id: VariableIdentifier,
    heated_id: VariableIdentifier,
    multi_function_probe_fault_id: VariableIdentifier,
    static_probe_fault_id: VariableIdentifier,
    sideslip_probe_fault_id: VariableIdentifier,

    heating_command_failure: Failure,
    multi_function_probe: Heater,
    static_probes: [Heater; 2],
    sideslip_probe: Heater,
    automatic_heating_lost: bool,
}
impl AdrProbes {
    /// * `buses` - the supplies of the pitot TAT AOA probe, the static probe heating and the sideslip probe
    fn new(context: &mut InitContext, adr: usize, buses: [ElectricalBusType; 3]) -> Self {
        let id = |context: &mut InitContext, name: &str| {
            context.get_identifier(format!("PROBE_HEAT_ADR_{}_{}", adr, name))
        };
        let heater = |bus: ElectricalBusType, probe: usize| {
            Heater::new(bus, FailureType::ProbeHeater(adr, probe))
        };
        Self {
            automatic_heating_lost_id: id(context, "AUTO_HEAT_FAULT"),
            heated_id: id(context, "PROBES_HEATED"),
            multi_function_probe_fault_id: id(context, "PITOT_TAT_AOA_FAULT"),
            static_probe_fault_id: id(context, "STATIC_FAULT"),
            sideslip_probe_fault_id: id(context, "SIDESLIP_FAULT"),

            heating_command_failure: Failure::new(FailureType::ProbeHeatComputer(adr)),
            multi_function_probe: heater(buses[0], MULTI_FUNCTION_PROBE),
            static_probes: [
                heater(buses[1], LEFT_STATIC_PROBE),
                heater(buses[1], RIGHT_STATIC_PROBE),
            ],
            sideslip_probe: heater(buses[2], SIDESLIP_PROBE),
            automatic_heating_lost: false,
        }
    }

    fn update(&mut self, demand: HeatingDemand) {
        let command_lost = self.heating_command_failure.is_active();
        let commanded = (demand.engine_running && !command_lost) || demand.push_button_on;
        for heater in self.heaters_mut() {
            heater.commanded = commanded;
        }
        self.automatic_heating_lost = command_lost && demand.heats();
    }

    fn heaters_mut(&mut self) -> [&mut Heater; 4] {
        let [left_static, right_static] = &mut self.static_probes;
        [
            &mut self.multi_function_probe,
            left_static,
            right_static,
            &mut self.sideslip_probe,
        ]
    }

    /// The ADIRU sees the heater faults of its probes only while it commands their heating
    fn heater_fault(&self, heaters: &[&Heater]) -> bool {
        !self.heating_command_failure.is_active()
            && heaters
                .iter()
                .any(|heater| heater.is_failed_while_commanded())
    }
}
impl SimulationElement for AdrProbes {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.heating_command_failure.accept(visitor);
        for heater in self.heaters_mut() {
            heater.accept(visitor);
        }
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.automatic_heating_lost_id, self.automatic_heating_lost);
        let heated = self.multi_function_probe.is_heating()
            && self.static_probes.iter().all(Heater::is_heating)
            && self.sideslip_probe.is_heating();
        writer.write(&self.heated_id, heated);
        writer.write(
            &self.multi_function_probe_fault_id,
            self.heater_fault(&[&self.multi_function_probe]),
        );
        writer.write(
            &self.static_probe_fault_id,
            self.heater_fault(&[&self.static_probes[0], &self.static_probes[1]]),
        );
        writer.write(
            &self.sideslip_probe_fault_id,
            self.heater_fault(&[&self.sideslip_probe]),
        );
    }
}

/// The windshield, sliding window and fixed window heating of one side, controlled by channel B of its AICU
struct SideWindows {
    fault_ids: [VariableIdentifier; 3],
    heaters: [Heater; 3],
}
impl SideWindows {
    /// * `side` - 1 CAPT (left), 2 F/O (right)
    fn new(
        context: &mut InitContext,
        side: usize,
        windshield_bus: ElectricalBusType,
        side_windows_bus: ElectricalBusType,
    ) -> Self {
        let side_name = if side == 1 { "L" } else { "R" };
        Self {
            fault_ids: ["WINDSHIELD", "SLIDING_WINDOW", "FIXED_WINDOW"].map(|window| {
                context.get_identifier(format!("WINDOW_HEAT_{}_{}_FAULT", side_name, window))
            }),
            heaters: [
                Heater::new(windshield_bus, FailureType::WindshieldHeat(side)),
                Heater::new(side_windows_bus, FailureType::WindowHeat(side)),
                Heater::new(side_windows_bus, FailureType::WindowHeat(side + 2)),
            ],
        }
    }

    fn update(&mut self, demand: HeatingDemand, controlled: bool) {
        for heater in self.heaters.iter_mut() {
            heater.commanded = demand.heats() && controlled;
        }
    }
}
impl SimulationElement for SideWindows {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for heater in self.heaters.iter_mut() {
            heater.accept(visitor);
        }
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        for (id, heater) in self.fault_ids.iter().zip(&self.heaters) {
            writer.write(id, heater.is_failed_while_commanded());
        }
    }
}

struct IceDetector {
    fault_id: VariableIdentifier,
    powered_by: ElectricalBusType,
    is_powered: bool,
    failure: Failure,
}
impl IceDetector {
    fn new(context: &mut InitContext, number: usize, powered_by: ElectricalBusType) -> Self {
        Self {
            fault_id: context.get_identifier(format!("ICE_DETECTOR_{}_FAULT", number)),
            powered_by,
            is_powered: false,
            failure: Failure::new(FailureType::IceDetector(number)),
        }
    }
}
impl SimulationElement for IceDetector {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.fault_id, self.failure.is_active() || !self.is_powered);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }
}

pub struct A380ProbeWindowHeat {
    push_button_id: VariableIdentifier,
    standby_pitot_fault_id: VariableIdentifier,
    standby_static_fault_id: VariableIdentifier,
    drain_mast_fault_id: VariableIdentifier,

    push_button_on: bool,
    adr_probes: [AdrProbes; 3],
    standby_pitot_probe: Heater,
    standby_static_probes: Heater,
    windows: [SideWindows; 2],
    ice_detectors: [IceDetector; 2],
    drain_mast_failure: Failure,
}
impl A380ProbeWindowHeat {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            push_button_id: context.get_identifier("MAN_PITOT_HEAT".to_owned()),
            standby_pitot_fault_id: context
                .get_identifier("PROBE_HEAT_STBY_PITOT_FAULT".to_owned()),
            standby_static_fault_id: context
                .get_identifier("PROBE_HEAT_STBY_STATIC_FAULT".to_owned()),
            drain_mast_fault_id: context.get_identifier("DRAIN_MAST_HEAT_FAULT".to_owned()),

            push_button_on: false,
            adr_probes: [
                AdrProbes::new(context, 1, [AC_EMER, AC_ESS, AC_ESS]),
                AdrProbes::new(context, 2, [ElectricalBusType::AlternatingCurrent(4); 3]),
                AdrProbes::new(context, 3, [ElectricalBusType::AlternatingCurrent(2); 3]),
            ],
            standby_pitot_probe: Heater::new(
                AC_ESS,
                FailureType::ProbeHeater(STANDBY_PROBES, MULTI_FUNCTION_PROBE),
            ),
            standby_static_probes: Heater::new(
                ElectricalBusType::AlternatingCurrent(2),
                FailureType::ProbeHeater(STANDBY_PROBES, LEFT_STATIC_PROBE),
            ),
            windows: [
                SideWindows::new(context, 1, AC_ESS, ElectricalBusType::AlternatingCurrent(2)),
                SideWindows::new(
                    context,
                    2,
                    ElectricalBusType::AlternatingCurrent(3),
                    ElectricalBusType::AlternatingCurrent(4),
                ),
            ],
            ice_detectors: [
                IceDetector::new(context, 1, ElectricalBusType::AlternatingCurrent(1)),
                IceDetector::new(context, 2, ElectricalBusType::AlternatingCurrent(4)),
            ],
            drain_mast_failure: Failure::new(FailureType::DrainMastHeat),
        }
    }

    /// * `engine_running` - at least one engine runs
    /// * `window_heating_controlled` - channel B of AICU 1 (CAPT side) and AICU 2 (F/O side) works
    pub fn update(&mut self, engine_running: bool, window_heating_controlled: [bool; 2]) {
        let demand = HeatingDemand {
            push_button_on: self.push_button_on,
            engine_running,
        };
        for probes in self.adr_probes.iter_mut() {
            probes.update(demand);
        }
        self.standby_pitot_probe.commanded = demand.heats();
        self.standby_static_probes.commanded = demand.heats();
        for (windows, controlled) in self.windows.iter_mut().zip(window_heating_controlled) {
            windows.update(demand, controlled);
        }
    }
}
impl SimulationElement for A380ProbeWindowHeat {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for probes in self.adr_probes.iter_mut() {
            probes.accept(visitor);
        }
        self.standby_pitot_probe.accept(visitor);
        self.standby_static_probes.accept(visitor);
        for windows in self.windows.iter_mut() {
            windows.accept(visitor);
        }
        for detector in self.ice_detectors.iter_mut() {
            detector.accept(visitor);
        }
        self.drain_mast_failure.accept(visitor);
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.push_button_on = reader.read(&self.push_button_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.standby_pitot_fault_id,
            self.standby_pitot_probe.is_failed_while_commanded(),
        );
        writer.write(
            &self.standby_static_fault_id,
            self.standby_static_probes.is_failed_while_commanded(),
        );
        writer.write(
            &self.drain_mast_fault_id,
            self.drain_mast_failure.is_active(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use systems::{
        electrical::{test::TestElectricitySource, ElectricalBus, Electricity},
        shared::PotentialOrigin,
        simulation::{
            test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
            Aircraft, UpdateContext,
        },
    };

    struct TestAircraft {
        heat: A380ProbeWindowHeat,
        ac_source: TestElectricitySource,
        buses: Vec<(ElectricalBusType, ElectricalBus)>,
        unpowered_bus: Option<ElectricalBusType>,
        engine_running: bool,
        window_heating_controlled: [bool; 2],
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                heat: A380ProbeWindowHeat::new(context),
                ac_source: TestElectricitySource::powered(
                    context,
                    PotentialOrigin::EngineGenerator(1),
                ),
                buses: [
                    AC_ESS,
                    AC_EMER,
                    ElectricalBusType::AlternatingCurrent(1),
                    ElectricalBusType::AlternatingCurrent(2),
                    ElectricalBusType::AlternatingCurrent(3),
                    ElectricalBusType::AlternatingCurrent(4),
                ]
                .into_iter()
                .map(|bus| (bus, ElectricalBus::new(context, bus)))
                .collect(),
                unpowered_bus: None,
                engine_running: false,
                window_heating_controlled: [true; 2],
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.ac_source);
            for (bus_type, bus) in self.buses.iter() {
                if Some(*bus_type) != self.unpowered_bus {
                    electricity.flow(&self.ac_source, bus);
                }
            }
        }

        fn update_after_power_distribution(&mut self, _: &UpdateContext) {
            self.heat
                .update(self.engine_running, self.window_heating_controlled);
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.heat.accept(visitor);
            for (_, bus) in self.buses.iter_mut() {
                bus.accept(visitor);
            }
            visitor.visit(self);
        }
    }

    type A380TestBed = SimulationTestBed<TestAircraft>;

    fn test_bed(engine_running: bool) -> A380TestBed {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.command(|a| a.engine_running = engine_running);
        test_bed
    }

    fn flag(test_bed: &mut A380TestBed, name: &str) -> bool {
        test_bed.read_by_name(name)
    }

    #[test]
    fn the_probes_are_heated_with_an_engine_running() {
        let mut test_bed = test_bed(true);
        test_bed.run();

        for adr in 1..=3 {
            assert!(flag(
                &mut test_bed,
                &format!("PROBE_HEAT_ADR_{}_PROBES_HEATED", adr)
            ));
            assert!(!flag(
                &mut test_bed,
                &format!("PROBE_HEAT_ADR_{}_AUTO_HEAT_FAULT", adr)
            ));
        }
    }

    #[test]
    fn the_probes_are_not_heated_on_ground_before_the_engine_start_unless_the_push_button_is_on() {
        let mut test_bed = test_bed(false);
        test_bed.run();
        assert!(!flag(&mut test_bed, "PROBE_HEAT_ADR_1_PROBES_HEATED"));

        test_bed.write_by_name("MAN_PITOT_HEAT", true);
        test_bed.run();
        assert!(flag(&mut test_bed, "PROBE_HEAT_ADR_1_PROBES_HEATED"));
    }

    #[test]
    fn a_failed_heater_is_reported_on_its_probe_only() {
        let mut test_bed = test_bed(true);
        test_bed.fail(FailureType::ProbeHeater(2, MULTI_FUNCTION_PROBE));
        test_bed.fail(FailureType::ProbeHeater(3, RIGHT_STATIC_PROBE));
        test_bed.fail(FailureType::ProbeHeater(1, SIDESLIP_PROBE));
        test_bed.run();

        assert!(flag(&mut test_bed, "PROBE_HEAT_ADR_2_PITOT_TAT_AOA_FAULT"));
        assert!(!flag(&mut test_bed, "PROBE_HEAT_ADR_2_STATIC_FAULT"));
        assert!(!flag(&mut test_bed, "PROBE_HEAT_ADR_2_PROBES_HEATED"));
        assert!(flag(&mut test_bed, "PROBE_HEAT_ADR_3_STATIC_FAULT"));
        assert!(flag(&mut test_bed, "PROBE_HEAT_ADR_1_SIDESLIP_FAULT"));
        assert!(!flag(&mut test_bed, "PROBE_HEAT_ADR_1_PITOT_TAT_AOA_FAULT"));
    }

    #[test]
    fn heater_failures_are_not_seen_while_the_heaters_are_off() {
        let mut test_bed = test_bed(false);
        test_bed.fail(FailureType::ProbeHeater(
            STANDBY_PROBES,
            MULTI_FUNCTION_PROBE,
        ));
        test_bed.fail(FailureType::WindshieldHeat(1));
        test_bed.run();
        assert!(!flag(&mut test_bed, "PROBE_HEAT_STBY_PITOT_FAULT"));
        assert!(!flag(&mut test_bed, "WINDOW_HEAT_L_WINDSHIELD_FAULT"));

        test_bed.write_by_name("MAN_PITOT_HEAT", true);
        test_bed.run();
        assert!(flag(&mut test_bed, "PROBE_HEAT_STBY_PITOT_FAULT"));
        assert!(flag(&mut test_bed, "WINDOW_HEAT_L_WINDSHIELD_FAULT"));
        assert!(!flag(&mut test_bed, "PROBE_HEAT_STBY_STATIC_FAULT"));
    }

    #[test]
    fn a_lost_heating_command_stops_the_automatic_heating_until_the_push_button_is_on() {
        let mut test_bed = test_bed(true);
        test_bed.fail(FailureType::ProbeHeatComputer(1));
        // The ADIRU no longer talks to the probes: their heater faults are not seen
        test_bed.fail(FailureType::ProbeHeater(1, MULTI_FUNCTION_PROBE));
        test_bed.run();

        assert!(flag(&mut test_bed, "PROBE_HEAT_ADR_1_AUTO_HEAT_FAULT"));
        assert!(!flag(&mut test_bed, "PROBE_HEAT_ADR_1_PROBES_HEATED"));
        assert!(!flag(&mut test_bed, "PROBE_HEAT_ADR_1_PITOT_TAT_AOA_FAULT"));
        assert!(!flag(&mut test_bed, "PROBE_HEAT_ADR_2_AUTO_HEAT_FAULT"));

        test_bed.unfail(FailureType::ProbeHeater(1, MULTI_FUNCTION_PROBE));
        test_bed.write_by_name("MAN_PITOT_HEAT", true);
        test_bed.run();
        assert!(flag(&mut test_bed, "PROBE_HEAT_ADR_1_PROBES_HEATED"));
        assert!(flag(&mut test_bed, "PROBE_HEAT_ADR_1_AUTO_HEAT_FAULT"));
    }

    #[test]
    fn an_unpowered_heater_does_not_heat_but_is_not_a_fault() {
        let mut test_bed = test_bed(true);
        test_bed.command(|a| a.unpowered_bus = Some(AC_EMER));
        test_bed.run();

        assert!(!flag(&mut test_bed, "PROBE_HEAT_ADR_1_PROBES_HEATED"));
        assert!(!flag(&mut test_bed, "PROBE_HEAT_ADR_1_PITOT_TAT_AOA_FAULT"));
        assert!(flag(&mut test_bed, "PROBE_HEAT_ADR_2_PROBES_HEATED"));
    }

    #[test]
    fn the_window_heating_faults_are_seen_by_the_aicu_channel_of_their_side() {
        let mut test_bed = test_bed(true);
        test_bed.fail(FailureType::WindowHeat(2));
        test_bed.fail(FailureType::WindowHeat(3));
        test_bed.run();

        assert!(flag(&mut test_bed, "WINDOW_HEAT_R_SLIDING_WINDOW_FAULT"));
        assert!(flag(&mut test_bed, "WINDOW_HEAT_L_FIXED_WINDOW_FAULT"));
        assert!(!flag(&mut test_bed, "WINDOW_HEAT_L_SLIDING_WINDOW_FAULT"));
        assert!(!flag(&mut test_bed, "WINDOW_HEAT_R_FIXED_WINDOW_FAULT"));

        // Without channel B of AICU 2 the F/O side windows are neither heated nor monitored
        test_bed.command(|a| a.window_heating_controlled = [true, false]);
        test_bed.run();
        assert!(!flag(&mut test_bed, "WINDOW_HEAT_R_SLIDING_WINDOW_FAULT"));
        assert!(flag(&mut test_bed, "WINDOW_HEAT_L_FIXED_WINDOW_FAULT"));
    }

    #[test]
    fn an_ice_detector_is_failed_when_failed_or_unpowered() {
        let mut test_bed = test_bed(false);
        test_bed.run();
        assert!(!flag(&mut test_bed, "ICE_DETECTOR_1_FAULT"));
        assert!(!flag(&mut test_bed, "ICE_DETECTOR_2_FAULT"));

        test_bed.fail(FailureType::IceDetector(1));
        test_bed.command(|a| a.unpowered_bus = Some(ElectricalBusType::AlternatingCurrent(4)));
        test_bed.run();
        assert!(flag(&mut test_bed, "ICE_DETECTOR_1_FAULT"));
        assert!(flag(&mut test_bed, "ICE_DETECTOR_2_FAULT"));
    }

    #[test]
    fn the_drain_mast_heater_failure_is_reported() {
        let mut test_bed = test_bed(false);
        test_bed.fail(FailureType::DrainMastHeat);
        test_bed.run();

        assert!(flag(&mut test_bed, "DRAIN_MAST_HEAT_FAULT"));
    }
}
