//! ATA 30 ice protection of the A380: the wing anti-ice of slat 4 (two Anti-Ice Control Units, two valves per wing) and
//! the engine anti-ice valves.
//!
//! A380 FCOM DSC-30-10-10 (a380_fcom.txt l.61869-61893):
//! - "Hot air from the pneumatic system can be used to prevent ice accretion on slat 4."
//! - "There are two redundant wing anti-ice valves per wing: AICU 1 controls the outer wing anti-ice valves, AICU 2
//!   controls the inner wing anti-ice valves."
//! - "When the crew sets the WING ANTI ICE pb to ON, both wing anti-ice valves in both wings will open."
//! - "On ground, if the WING ANTI ICE pb is set to ON, the wing anti-ice valves will open for 30 s. Wing anti-ice will
//!   then be inhibited for 10 min, provided the aircraft is not in flight. Wing anti-ice is also inhibited during
//!   takeoff, until takeoff thrust reduction."
//! - "Each valve is electrically-controlled and pneumatically-actuated. The valve closes, if it loses its power
//!   supply."
//!
//! A380 FCOM DSC-30-10-20 (l.62004-62028), WING ANTI ICE pb FAULT: "The anti-ice valve position disagrees with the
//! requested position" (A-ICE L(R) WING VLV CLOSED / OPEN), "Or, the anti-ice valve is open, but a low pressure is
//! detected" (A-ICE L(R) WING VLV PRESS LO).
//!
//! Electrical supply (DSC-30-10-40, FCOM PDF p.2103): AICU 1 DC ESS, AICU 2 DC 2, outer valves DC 1, inner valves DC 2;
//! engine anti-ice ENG 1 DC 2, ENG 2 DC 1, ENG 3 DC 2, ENG 4 DC 1.
//!
//! Design choice: the wing anti-ice air is not taken out of the pneumatic model; the valves open on the bleed duct
//! pressure of their wing and the pressure sensors downstream of them read the pressure the valve lets through.

use std::time::Duration;

use uom::si::{f64::*, pressure::psi, ratio::ratio};

use systems::{
    failures::{Failure, FailureType},
    ice_rain_protection::engine_anti_ice::EngineAntiIceValve,
    pneumatic::WingAntiIcePushButton,
    shared::{ElectricalBusType, ElectricalBuses, LgciuWeightOnWheels},
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, UpdateContext, VariableIdentifier, Write,
    },
};

/// The ice protection of the A380: wing anti-ice and the four engine anti-ice valves
pub struct A380IceRainProtection {
    wing_anti_ice: A380WingAntiIce,
    engine_anti_ice_valves: [EngineAntiIceValve; 4],
}
impl A380IceRainProtection {
    pub fn new(context: &mut InitContext) -> Self {
        Self {
            wing_anti_ice: A380WingAntiIce::new(context),
            // "The valve opens, if it loses its power supply" (DSC-30-10-10 l.61857), as the A320 valve
            engine_anti_ice_valves: [
                EngineAntiIceValve::new(context, 1, ElectricalBusType::DirectCurrent(2)),
                EngineAntiIceValve::new(context, 2, ElectricalBusType::DirectCurrent(1)),
                EngineAntiIceValve::new(context, 3, ElectricalBusType::DirectCurrent(2)),
                EngineAntiIceValve::new(context, 4, ElectricalBusType::DirectCurrent(1)),
            ],
        }
    }

    /// * `bleed_duct_pressures` - the bleed duct pressure of each engine, downstream of its precooler
    /// * `high_pressure_compressor_pressures` - the HP compressor air of each engine: "Each engine has its own anti-ice
    ///   system, with an independent hot bleed air source" (DSC-30-10-10 l.61846)
    pub fn update(
        &mut self,
        context: &UpdateContext,
        bleed_duct_pressures: [Pressure; 4],
        high_pressure_compressor_pressures: [Pressure; 4],
        lgciu: [&impl LgciuWeightOnWheels; 2],
    ) {
        self.wing_anti_ice
            .update(context, bleed_duct_pressures, lgciu);
        for (valve, pressure) in self
            .engine_anti_ice_valves
            .iter_mut()
            .zip(high_pressure_compressor_pressures)
        {
            valve.update(context, pressure);
        }
    }
}
impl SimulationElement for A380IceRainProtection {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.wing_anti_ice.accept(visitor);
        for valve in self.engine_anti_ice_valves.iter_mut() {
            valve.accept(visitor);
        }

        visitor.visit(self);
    }
}

/// One wing anti-ice valve: opened by its AICU, closed without power or without air to actuate it.
struct WingAntiIceValve {
    powered_by: ElectricalBusType,
    is_powered: bool,
    /// 0 (closed) to 1 (open)
    open_amount: Ratio,
    /// The pressure the sensor downstream of the valve reads, over the ambient pressure
    downstream_pressure_psig: f64,
}
impl WingAntiIceValve {
    /// Design choice (no FCOM value): the valve travel time, as the engine anti-ice valve
    const TRAVEL_TIME: Duration = Duration::from_secs(2);

    /// Design choice (no FCOM value): the duct pressure that opens the valve and the pressure the valve regulates to,
    /// the values of the A320 wing anti-ice valves (a320_systems pneumatic/wing_anti_ice.rs)
    const MIN_SUPPLY_PRESSURE_PSIG: f64 = 10.;
    const REGULATED_PRESSURE_PSIG: f64 = 22.5;

    fn new(powered_by: ElectricalBusType) -> Self {
        Self {
            powered_by,
            is_powered: false,
            open_amount: Ratio::default(),
            downstream_pressure_psig: 0.,
        }
    }

    /// * `commanded_open` - the AICU of the valve commands it open
    /// * `supply_pressure_psig` - the bleed duct pressure of its wing
    /// * `stuck` - Some(open) when a failure holds the valve
    fn update(
        &mut self,
        context: &UpdateContext,
        commanded_open: bool,
        supply_pressure_psig: f64,
        stuck: Option<bool>,
    ) {
        let should_be_open = stuck.unwrap_or(
            commanded_open
                && self.is_powered
                && supply_pressure_psig > Self::MIN_SUPPLY_PRESSURE_PSIG,
        );

        let travel = context.delta_as_secs_f64() / Self::TRAVEL_TIME.as_secs_f64();
        let open_amount =
            self.open_amount.get::<ratio>() + if should_be_open { travel } else { -travel };
        self.open_amount = Ratio::new::<ratio>(open_amount.clamp(0., 1.));

        // A valve held open by a failure no longer regulates: the duct pressure reaches the slat
        let let_through_psig = if stuck == Some(true) {
            supply_pressure_psig
        } else {
            supply_pressure_psig.min(Self::REGULATED_PRESSURE_PSIG)
        };
        self.downstream_pressure_psig = if self.is_open() {
            let_through_psig.max(0.)
        } else {
            0.
        };
    }

    fn is_open(&self) -> bool {
        self.open_amount.get::<ratio>() > 0.
    }

    fn is_closed(&self) -> bool {
        !self.is_open()
    }
}
impl SimulationElement for WingAntiIceValve {
    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }
}

/// The AICU wing anti-ice control and monitoring of one wing
#[derive(Clone, Copy, Default, PartialEq, Debug)]
struct WingAntiIceMonitoring {
    /// A-ICE L(R) WING VLV CLOSED: "Both left (right) wing anti-ice valves are abnormally closed" (l.156751)
    abnormally_closed: bool,
    /// A-ICE L(R) WING VLV OPEN: "The left(right) inner and(or) outer wing anti-ice valve is abnormally open" (l.156843)
    abnormally_open: bool,
    /// A-ICE L(R) WING VLV PRESS LO: "Both left (right) wing anti-ice valves are set to ON, however both pressure
    /// sensors (downstream of the valves) indicate that the pressure is low" (l.156955-156956)
    low_pressure: bool,
    /// A-ICE L(R) WING VLV PRESS HI: "The WING A-ICE pb is set to ON and the pressure sensor (downstream of the valve)
    /// indicates there is high pressure in the duct" (l.156928-156929)
    high_pressure: bool,
}

const LEFT: usize = 0;
const RIGHT: usize = 1;
const INNER: usize = 0;
const OUTER: usize = 1;

struct A380WingAntiIce {
    push_button: WingAntiIcePushButton,

    system_selected_id: VariableIdentifier,
    system_on_id: VariableIdentifier,
    fault_light_id: VariableIdentifier,
    /// Per wing (1 left, 2 right)
    valves_closed_ids: [VariableIdentifier; 2],
    abnormally_closed_ids: [VariableIdentifier; 2],
    abnormally_open_ids: [VariableIdentifier; 2],
    low_pressure_ids: [VariableIdentifier; 2],
    high_pressure_ids: [VariableIdentifier; 2],
    thrust_lever_angle_ids: [VariableIdentifier; 4],

    /// AICU 1 (outer valves) and AICU 2 (inner valves)
    aicu_powered_by: [ElectricalBusType; 2],
    aicu_powered: [bool; 2],
    /// [wing][INNER, OUTER]
    valves: [[WingAntiIceValve; 2]; 2],
    /// Per wing: both valves stay closed, the outer valve stays open
    valves_stuck_closed: [Failure; 2],
    outer_valve_stuck_open: [Failure; 2],

    thrust_lever_angles_deg: [f64; 4],
    push_button_was_on: bool,
    ground_test_remaining: Duration,
    ground_inhibition_remaining: Duration,
    takeoff_inhibited: bool,
    commanded_open: bool,
    monitoring: [WingAntiIceMonitoring; 2],
}
impl A380WingAntiIce {
    /// "the wing anti-ice valves will open for 30 s" on ground (l.61888)
    const GROUND_TEST_TIME: Duration = Duration::from_secs(30);
    /// "Wing anti-ice will then be inhibited for 10 min, provided the aircraft is not in flight" (l.61889)
    const GROUND_INHIBITION_TIME: Duration = Duration::from_secs(600);
    /// The lower bound of the FLX/MCT detent band (FWS FwsTakeoffPower): a thrust lever above it is at takeoff thrust,
    /// all levers below it after the takeoff is the takeoff thrust reduction
    const TAKEOFF_THRUST_MIN_TLA_DEG: f64 = 33.3;
    /// Design choice (no FCOM value): the pressure sensor thresholds over the ambient pressure, those of the A320 wing
    /// anti-ice (1 bar low, 2.1 bar high, a320_systems pneumatic/wing_anti_ice.rs)
    const LOW_PRESSURE_PSIG: f64 = 14.5;
    const HIGH_PRESSURE_PSIG: f64 = 30.5;

    fn new(context: &mut InitContext) -> Self {
        let per_wing = |context: &mut InitContext, name: &str| {
            [1, 2]
                .map(|wing| context.get_identifier(format!("PNEU_WING_ANTI_ICE_{}_{}", wing, name)))
        };
        Self {
            push_button: WingAntiIcePushButton::new_off(context),

            system_selected_id: context
                .get_identifier("PNEU_WING_ANTI_ICE_SYSTEM_SELECTED".to_owned()),
            system_on_id: context.get_identifier("PNEU_WING_ANTI_ICE_SYSTEM_ON".to_owned()),
            fault_light_id: context.get_identifier("PNEU_WING_ANTI_ICE_FAULT".to_owned()),
            valves_closed_ids: per_wing(context, "VALVE_CLOSED"),
            abnormally_closed_ids: per_wing(context, "ABNORMALLY_CLOSED"),
            abnormally_open_ids: per_wing(context, "ABNORMALLY_OPEN"),
            low_pressure_ids: per_wing(context, "LOW_PRESSURE"),
            high_pressure_ids: per_wing(context, "HIGH_PRESSURE"),
            thrust_lever_angle_ids: [1, 2, 3, 4]
                .map(|engine| context.get_identifier(format!("AUTOTHRUST_TLA:{}", engine))),

            aicu_powered_by: [
                ElectricalBusType::DirectCurrentEssential,
                ElectricalBusType::DirectCurrent(2),
            ],
            aicu_powered: [false; 2],
            valves: [0, 1].map(|_| {
                [
                    WingAntiIceValve::new(ElectricalBusType::DirectCurrent(2)),
                    WingAntiIceValve::new(ElectricalBusType::DirectCurrent(1)),
                ]
            }),
            valves_stuck_closed: [1, 2]
                .map(|wing| Failure::new(FailureType::WingAntiIceValvesStuckClosed(wing))),
            outer_valve_stuck_open: [1, 2]
                .map(|wing| Failure::new(FailureType::WingAntiIceOuterValveStuckOpen(wing))),

            thrust_lever_angles_deg: [0.; 4],
            push_button_was_on: false,
            ground_test_remaining: Duration::ZERO,
            ground_inhibition_remaining: Duration::ZERO,
            takeoff_inhibited: false,
            commanded_open: false,
            monitoring: [WingAntiIceMonitoring::default(); 2],
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        bleed_duct_pressures: [Pressure; 4],
        lgciu: [&impl LgciuWeightOnWheels; 2],
    ) {
        let on_ground =
            !(lgciu[0].left_gear_extended(false) || lgciu[1].right_gear_extended(false));
        self.update_control(context, on_ground);

        // The left wing is supplied by the bleed ducts of engines 1 and 2, the right wing by those of engines 3 and 4
        let supply_psig = |first: usize| {
            (bleed_duct_pressures[first].max(bleed_duct_pressures[first + 1])
                - context.ambient_pressure())
            .get::<psi>()
        };
        let wing_supply_psig = [supply_psig(0), supply_psig(2)];
        for wing in [LEFT, RIGHT] {
            let stuck_closed = self.valves_stuck_closed[wing].is_active();
            let stuck_open = self.outer_valve_stuck_open[wing].is_active();
            for position in [INNER, OUTER] {
                let stuck = if stuck_closed {
                    Some(false)
                } else if stuck_open && position == OUTER {
                    Some(true)
                } else {
                    None
                };
                let commanded = self.valve_commanded_open(position);
                self.valves[wing][position].update(
                    context,
                    commanded,
                    wing_supply_psig[wing],
                    stuck,
                );
            }
            self.monitoring[wing] = self.monitor_wing(wing, wing_supply_psig[wing]);
        }
    }

    /// The AICU control: the 30 s ground test, the 10 min ground inhibition and the takeoff inhibition.
    ///
    /// Design choices (the FCOM does not say more): a ground test runs once per selection of the pb ON (the FCOM: "If
    /// the flight crew does not switch off wing anti-ice, the ON light will remain on, even though wing anti-ice is
    /// off. The wing anti-ice valves will then reopen after takeoff thrust reduction", l.62009-62011); the takeoff
    /// inhibition starts with a thrust lever at takeoff thrust on ground and ends in flight when all thrust levers are
    /// below the FLX/MCT detent.
    fn update_control(&mut self, context: &UpdateContext, on_ground: bool) {
        let push_button_on = self.push_button.is_on();
        let selected_on = push_button_on && !self.push_button_was_on;
        self.push_button_was_on = push_button_on;

        let takeoff_thrust = self
            .thrust_lever_angles_deg
            .iter()
            .any(|&tla| tla > Self::TAKEOFF_THRUST_MIN_TLA_DEG);
        if on_ground {
            self.takeoff_inhibited = takeoff_thrust;
        } else if !takeoff_thrust {
            self.takeoff_inhibited = false;
        }

        if on_ground {
            let test_was_running = !self.ground_test_remaining.is_zero();
            self.ground_inhibition_remaining = self
                .ground_inhibition_remaining
                .saturating_sub(context.delta());
            if selected_on && self.ground_inhibition_remaining.is_zero() {
                self.ground_test_remaining = Self::GROUND_TEST_TIME;
            } else if !push_button_on {
                self.ground_test_remaining = Duration::ZERO;
            } else {
                self.ground_test_remaining =
                    self.ground_test_remaining.saturating_sub(context.delta());
                if test_was_running && self.ground_test_remaining.is_zero() {
                    self.ground_inhibition_remaining = Self::GROUND_INHIBITION_TIME;
                }
            }
            self.commanded_open =
                push_button_on && !self.ground_test_remaining.is_zero() && !self.takeoff_inhibited;
        } else {
            self.ground_test_remaining = Duration::ZERO;
            self.ground_inhibition_remaining = Duration::ZERO;
            self.commanded_open = push_button_on && !self.takeoff_inhibited;
        }
    }

    /// AICU 1 commands the outer valves, AICU 2 the inner valves (l.61876-61877)
    fn valve_commanded_open(&self, position: usize) -> bool {
        let aicu = if position == OUTER { 0 } else { 1 };
        self.commanded_open && self.aicu_powered[aicu]
    }

    fn monitor_wing(&self, wing: usize, supply_pressure_psig: f64) -> WingAntiIceMonitoring {
        let valves = &self.valves[wing];
        let commanded = [INNER, OUTER].map(|position| self.valve_commanded_open(position));
        // A valve that stays closed while the duct supplies air is abnormally closed; with too little air it is a low
        // pressure: "An increase in thrust increases the bleed pressure. This may help to open the wing anti-ice valves"
        // (l.156990-156991)
        let air_available = supply_pressure_psig > WingAntiIceValve::MIN_SUPPLY_PRESSURE_PSIG;
        let abnormally_closed = [INNER, OUTER]
            .iter()
            .all(|&position| commanded[position] && valves[position].is_closed() && air_available);
        let abnormally_open = [INNER, OUTER]
            .iter()
            .any(|&position| !commanded[position] && valves[position].is_open());
        let low_pressure = commanded.iter().all(|&valve_commanded| valve_commanded)
            && valves
                .iter()
                .all(|valve| valve.downstream_pressure_psig < Self::LOW_PRESSURE_PSIG)
            && !abnormally_closed;
        let high_pressure = self.push_button.is_on()
            && valves
                .iter()
                .any(|valve| valve.downstream_pressure_psig > Self::HIGH_PRESSURE_PSIG);
        WingAntiIceMonitoring {
            abnormally_closed,
            abnormally_open,
            low_pressure,
            high_pressure,
        }
    }

    /// Hot air flows to slat 4 of at least one wing
    fn is_on(&self) -> bool {
        self.valves
            .iter()
            .any(|wing| wing.iter().any(|valve| valve.is_open()))
    }

    /// The FAULT light of the WING ANTI ICE pb: valve position disagreement or low pressure (DSC-30-10-20
    /// l.62014-62024). High pressure is a crew awareness without FAULT light.
    fn fault_light(&self) -> bool {
        self.monitoring
            .iter()
            .any(|wing| wing.abnormally_closed || wing.abnormally_open || wing.low_pressure)
    }
}
impl SimulationElement for A380WingAntiIce {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.push_button.accept(visitor);
        for wing in self.valves.iter_mut() {
            for valve in wing.iter_mut() {
                valve.accept(visitor);
            }
        }
        for failure in self
            .valves_stuck_closed
            .iter_mut()
            .chain(self.outer_valve_stuck_open.iter_mut())
        {
            failure.accept(visitor);
        }

        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        for (tla, id) in self
            .thrust_lever_angles_deg
            .iter_mut()
            .zip(self.thrust_lever_angle_ids.iter())
        {
            *tla = reader.read(id);
        }
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.system_selected_id, self.push_button.is_on());
        writer.write(&self.system_on_id, self.is_on());
        writer.write(&self.fault_light_id, self.fault_light());
        for wing in [LEFT, RIGHT] {
            writer.write(
                &self.valves_closed_ids[wing],
                self.valves[wing].iter().all(|valve| valve.is_closed()),
            );
            let monitoring = &self.monitoring[wing];
            writer.write(
                &self.abnormally_closed_ids[wing],
                monitoring.abnormally_closed,
            );
            writer.write(&self.abnormally_open_ids[wing], monitoring.abnormally_open);
            writer.write(&self.low_pressure_ids[wing], monitoring.low_pressure);
            writer.write(&self.high_pressure_ids[wing], monitoring.high_pressure);
        }
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        for (powered, bus) in self.aicu_powered.iter_mut().zip(self.aicu_powered_by) {
            *powered = buses.is_powered(bus);
        }
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
            Aircraft,
        },
    };

    struct TestLgciu {
        on_ground: bool,
    }
    impl LgciuWeightOnWheels for TestLgciu {
        fn left_and_right_gear_compressed(&self, _: bool) -> bool {
            self.on_ground
        }
        fn right_gear_compressed(&self, _: bool) -> bool {
            self.on_ground
        }
        fn right_gear_extended(&self, _: bool) -> bool {
            !self.on_ground
        }
        fn left_gear_compressed(&self, _: bool) -> bool {
            self.on_ground
        }
        fn left_gear_extended(&self, _: bool) -> bool {
            !self.on_ground
        }
        fn left_and_right_gear_extended(&self, _: bool) -> bool {
            !self.on_ground
        }
        fn nose_gear_compressed(&self, _: bool) -> bool {
            self.on_ground
        }
        fn nose_gear_extended(&self, _: bool) -> bool {
            !self.on_ground
        }
    }

    struct TestAircraft {
        ice_rain_protection: A380IceRainProtection,
        lgciu: TestLgciu,
        dc_source: TestElectricitySource,
        dc_ess_bus: ElectricalBus,
        dc_1_bus: ElectricalBus,
        dc_2_bus: ElectricalBus,
        dc_1_powered: bool,
        /// The bleed duct and HP compressor pressure of every engine, over the ambient pressure
        bleed_duct_psig: f64,
        high_pressure_compressor_psig: f64,
    }
    impl TestAircraft {
        fn new(context: &mut InitContext) -> Self {
            Self {
                ice_rain_protection: A380IceRainProtection::new(context),
                lgciu: TestLgciu { on_ground: false },
                dc_source: TestElectricitySource::powered(context, PotentialOrigin::Battery(1)),
                dc_ess_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrentEssential),
                dc_1_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                dc_2_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),
                dc_1_powered: true,
                bleed_duct_psig: 40.,
                high_pressure_compressor_psig: 40.,
            }
        }
    }
    impl Aircraft for TestAircraft {
        fn update_before_power_distribution(
            &mut self,
            _: &UpdateContext,
            electricity: &mut Electricity,
        ) {
            electricity.supplied_by(&self.dc_source);
            electricity.flow(&self.dc_source, &self.dc_ess_bus);
            electricity.flow(&self.dc_source, &self.dc_2_bus);
            if self.dc_1_powered {
                electricity.flow(&self.dc_source, &self.dc_1_bus);
            }
        }

        fn update_after_power_distribution(&mut self, context: &UpdateContext) {
            let ambient = context.ambient_pressure();
            self.ice_rain_protection.update(
                context,
                [ambient + Pressure::new::<psi>(self.bleed_duct_psig); 4],
                [ambient + Pressure::new::<psi>(self.high_pressure_compressor_psig); 4],
                [&self.lgciu, &self.lgciu],
            );
        }
    }
    impl SimulationElement for TestAircraft {
        fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
            self.ice_rain_protection.accept(visitor);
            self.dc_ess_bus.accept(visitor);
            self.dc_1_bus.accept(visitor);
            self.dc_2_bus.accept(visitor);
            visitor.visit(self);
        }
    }

    type A380TestBed = SimulationTestBed<TestAircraft>;

    /// In flight at climb thrust (thrust levers in the CL detent)
    fn in_flight() -> A380TestBed {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        set_thrust_levers(&mut test_bed, 25.);
        test_bed
    }

    fn on_ground() -> A380TestBed {
        let mut test_bed = SimulationTestBed::new(TestAircraft::new);
        test_bed.command(|a| a.lgciu.on_ground = true);
        set_thrust_levers(&mut test_bed, 0.);
        test_bed
    }

    fn set_thrust_levers(test_bed: &mut A380TestBed, tla_deg: f64) {
        for engine in 1..=4 {
            test_bed.write_by_name(&format!("AUTOTHRUST_TLA:{}", engine), tla_deg);
        }
    }

    fn wing_anti_ice_push_button(test_bed: &mut A380TestBed, on: bool) {
        test_bed.write_by_name("BUTTON_OVHD_ANTI_ICE_WING_POSITION", on);
    }

    fn run_seconds(test_bed: &mut A380TestBed, seconds: u32) {
        test_bed.run_iterations_with_delta(seconds * 10, Duration::from_millis(100));
    }

    fn flag(test_bed: &mut A380TestBed, name: &str) -> bool {
        test_bed.read_by_name(name)
    }

    fn wing_anti_ice_on(test_bed: &mut A380TestBed) -> bool {
        flag(test_bed, "PNEU_WING_ANTI_ICE_SYSTEM_ON")
    }

    /// The flags of one wing (1 left, 2 right) for the FWS: abnormally closed, abnormally open, low and high pressure
    fn wing_flags(test_bed: &mut A380TestBed, wing: usize) -> [bool; 4] {
        [
            "ABNORMALLY_CLOSED",
            "ABNORMALLY_OPEN",
            "LOW_PRESSURE",
            "HIGH_PRESSURE",
        ]
        .map(|name| flag(test_bed, &format!("PNEU_WING_ANTI_ICE_{}_{}", wing, name)))
    }

    const NO_FLAG: [bool; 4] = [false; 4];

    #[test]
    fn in_flight_the_push_button_opens_the_valves_of_both_wings() {
        let mut test_bed = in_flight();
        wing_anti_ice_push_button(&mut test_bed, true);
        run_seconds(&mut test_bed, 3);

        assert!(wing_anti_ice_on(&mut test_bed));
        assert!(!flag(&mut test_bed, "PNEU_WING_ANTI_ICE_1_VALVE_CLOSED"));
        assert!(!flag(&mut test_bed, "PNEU_WING_ANTI_ICE_2_VALVE_CLOSED"));
        assert_eq!(wing_flags(&mut test_bed, 1), NO_FLAG);
        assert_eq!(wing_flags(&mut test_bed, 2), NO_FLAG);
        assert!(!flag(&mut test_bed, "PNEU_WING_ANTI_ICE_FAULT"));
        assert!(flag(&mut test_bed, "PNEU_WING_ANTI_ICE_SYSTEM_SELECTED"));

        wing_anti_ice_push_button(&mut test_bed, false);
        run_seconds(&mut test_bed, 3);
        assert!(!wing_anti_ice_on(&mut test_bed));
        assert!(flag(&mut test_bed, "PNEU_WING_ANTI_ICE_1_VALVE_CLOSED"));
    }

    #[test]
    fn on_ground_the_valves_open_for_30_s_then_wing_anti_ice_is_inhibited_for_10_min() {
        let mut test_bed = on_ground();
        wing_anti_ice_push_button(&mut test_bed, true);
        run_seconds(&mut test_bed, 3);
        assert!(wing_anti_ice_on(&mut test_bed));

        run_seconds(&mut test_bed, 30);
        assert!(!wing_anti_ice_on(&mut test_bed));
        // The valves are closed as commanded: no FAULT light, the ON light (pb) stays on
        assert!(!flag(&mut test_bed, "PNEU_WING_ANTI_ICE_FAULT"));
        assert_eq!(wing_flags(&mut test_bed, 1), NO_FLAG);

        // Selected again within the 10 min: no new test
        wing_anti_ice_push_button(&mut test_bed, false);
        run_seconds(&mut test_bed, 1);
        wing_anti_ice_push_button(&mut test_bed, true);
        run_seconds(&mut test_bed, 3);
        assert!(!wing_anti_ice_on(&mut test_bed));

        // After the 10 min, a new selection opens the valves again for a test
        run_seconds(&mut test_bed, 600);
        wing_anti_ice_push_button(&mut test_bed, false);
        run_seconds(&mut test_bed, 1);
        wing_anti_ice_push_button(&mut test_bed, true);
        run_seconds(&mut test_bed, 3);
        assert!(wing_anti_ice_on(&mut test_bed));
    }

    #[test]
    fn wing_anti_ice_is_inhibited_during_takeoff_until_takeoff_thrust_reduction() {
        let mut test_bed = on_ground();
        wing_anti_ice_push_button(&mut test_bed, true);
        run_seconds(&mut test_bed, 3);
        assert!(wing_anti_ice_on(&mut test_bed));

        // Takeoff thrust during the ground test: the valves close
        set_thrust_levers(&mut test_bed, 35.);
        run_seconds(&mut test_bed, 3);
        assert!(!wing_anti_ice_on(&mut test_bed));

        // Liftoff, the thrust levers still in the FLX/MCT detent
        test_bed.command(|a| a.lgciu.on_ground = false);
        run_seconds(&mut test_bed, 10);
        assert!(!wing_anti_ice_on(&mut test_bed));
        assert!(!flag(&mut test_bed, "PNEU_WING_ANTI_ICE_FAULT"));

        // Thrust reduction: the thrust levers in the CL detent
        set_thrust_levers(&mut test_bed, 25.);
        run_seconds(&mut test_bed, 3);
        assert!(wing_anti_ice_on(&mut test_bed));
    }

    #[test]
    fn a_valve_closes_when_it_loses_its_power_supply() {
        let mut test_bed = in_flight();
        wing_anti_ice_push_button(&mut test_bed, true);
        // DC 1 supplies the outer valves: the inner valves (DC 2) still anti-ice slat 4
        test_bed.command(|a| a.dc_1_powered = false);
        run_seconds(&mut test_bed, 3);

        assert!(wing_anti_ice_on(&mut test_bed));
        // One closed valve per wing is not a fault of the wing: "Both ... valves are abnormally closed"
        assert_eq!(wing_flags(&mut test_bed, 1), NO_FLAG);
    }

    #[test]
    fn valves_stuck_closed_give_the_wing_valve_closed_alert_and_the_fault_light() {
        let mut test_bed = in_flight();
        test_bed.fail(FailureType::WingAntiIceValvesStuckClosed(1));
        wing_anti_ice_push_button(&mut test_bed, true);
        run_seconds(&mut test_bed, 3);

        assert_eq!(wing_flags(&mut test_bed, 1), [true, false, false, false]);
        assert_eq!(wing_flags(&mut test_bed, 2), NO_FLAG);
        assert!(flag(&mut test_bed, "PNEU_WING_ANTI_ICE_FAULT"));
        // The right wing is still anti-iced
        assert!(wing_anti_ice_on(&mut test_bed));
    }

    #[test]
    fn an_outer_valve_stuck_open_gives_the_valve_open_alert_then_the_high_pressure_alert() {
        let mut test_bed = in_flight();
        test_bed.fail(FailureType::WingAntiIceOuterValveStuckOpen(2));
        run_seconds(&mut test_bed, 3);

        // pb OFF: the open valve disagrees with its command
        assert_eq!(wing_flags(&mut test_bed, 2), [false, true, false, false]);
        assert!(flag(&mut test_bed, "PNEU_WING_ANTI_ICE_FAULT"));

        // pb ON: no disagreement, but the valve no longer regulates the duct pressure
        wing_anti_ice_push_button(&mut test_bed, true);
        run_seconds(&mut test_bed, 3);
        assert_eq!(wing_flags(&mut test_bed, 2), [false, false, false, true]);
        assert!(!flag(&mut test_bed, "PNEU_WING_ANTI_ICE_FAULT"));
    }

    #[test]
    fn a_low_bleed_pressure_gives_the_low_pressure_alert_and_the_fault_light() {
        let mut test_bed = in_flight();
        test_bed.command(|a| a.bleed_duct_psig = 5.);
        wing_anti_ice_push_button(&mut test_bed, true);
        run_seconds(&mut test_bed, 3);

        assert_eq!(wing_flags(&mut test_bed, 1), [false, false, true, false]);
        assert_eq!(wing_flags(&mut test_bed, 2), [false, false, true, false]);
        assert!(flag(&mut test_bed, "PNEU_WING_ANTI_ICE_FAULT"));

        // "An increase in thrust increases the bleed pressure. This may help to open the wing anti-ice valves"
        test_bed.command(|a| a.bleed_duct_psig = 40.);
        run_seconds(&mut test_bed, 3);
        assert_eq!(wing_flags(&mut test_bed, 1), NO_FLAG);
        assert!(wing_anti_ice_on(&mut test_bed));
    }

    #[test]
    fn the_engine_anti_ice_valves_open_with_their_push_button_on_hp_compressor_air() {
        let mut test_bed = in_flight();
        test_bed.write_by_name("BUTTON_OVHD_ANTI_ICE_ENG_3_POSITION", true);
        run_seconds(&mut test_bed, 3);

        assert!(flag(&mut test_bed, "PNEU_ENG_3_ANTI_ICE_VALVE_OPEN"));
        assert!(!flag(&mut test_bed, "PNEU_ENG_1_ANTI_ICE_VALVE_OPEN"));
        assert!(!flag(&mut test_bed, "PNEU_ENG_3_ANTI_ICE_FAULT"));
    }
}
