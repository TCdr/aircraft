//! Full-aircraft tests of the engine flameouts with more than one engine out: the whole A380 of
//! lib.rs (pneumatics, electrics, fuel, the engine failures), with the FADEC (fadec_a380x) played by
//! the test (the FADEC engine state and core speed).
//!
//! Procedure values the tests check:
//! - In-flight relight: several engines out, 28 000 ft maximum and 250 kt minimum for a windmill
//!   relight (one engine out: 30 000 ft, 260 kt).
//! - All engines flame out: RAT manual on, optimum relight speed 260 kt, with the APU available
//!   APU BLEED ON, then the ENG MASTERs ON two at a time.
//! - In flight the start valve opens below 11 % N2 or 260 kt CAS.

use super::A380;
use std::time::Duration;
use systems::{
    failures::FailureType,
    shared::InternationalStandardAtmosphere,
    simulation::test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
};
use uom::si::{
    f64::{Length, MassDensity, Velocity},
    length::foot,
    mass_density::kilogram_per_cubic_meter,
    pressure::pascal,
    thermodynamic_temperature::kelvin,
    velocity::knot,
};

const ENG_START_SEL_NORM: f64 = 1.;
const ENG_START_SEL_IGN_START: f64 = 2.;
/// L:A32NX_ENGINE_STATE of the FADEC
const ENGINE_STATE_ON: f64 = 1.;
const ENGINE_STATE_RESTARTING: f64 = 3.;
const ENGINE_STATE_SHUTTING: f64 = 4.;

const FRAME: Duration = Duration::from_millis(100);

/// The whole A380 in flight at this airspeed (CAS) and altitude, ISA, the four engines running,
/// ENG START selector NORM.
fn flying_a380(cas_knots: f64, altitude_feet: f64) -> SimulationTestBed<A380> {
    let mut test_bed = SimulationTestBed::new(A380::new);
    test_bed.set_on_ground(false);
    set_flight_conditions(&mut test_bed, cas_knots, altitude_feet);
    test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", ENG_START_SEL_NORM);
    for engine_number in 1..=4 {
        test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), true);
        set_engine(&mut test_bed, engine_number, ENGINE_STATE_ON, 80.);
    }
    test_bed.run_multiple_frames(Duration::from_secs(10));
    test_bed
}

fn set_flight_conditions(
    test_bed: &mut SimulationTestBed<A380>,
    cas_knots: f64,
    altitude_feet: f64,
) {
    let altitude = Length::new::<foot>(altitude_feet);
    let pressure = InternationalStandardAtmosphere::pressure_at_altitude(altitude);
    let temperature = InternationalStandardAtmosphere::temperature_at_altitude(altitude);
    // ISA density, and the true airspeed from it (the RAT turns with the true airspeed)
    let density = pressure.get::<pascal>() / (287.05 * temperature.get::<kelvin>());
    test_bed.set_indicated_airspeed(Velocity::new::<knot>(cas_knots));
    test_bed.set_true_airspeed(Velocity::new::<knot>(cas_knots * (1.225 / density).sqrt()));
    test_bed.set_pressure_altitude(altitude);
    test_bed.set_ambient_pressure(pressure);
    test_bed.set_ambient_temperature(temperature);
    test_bed.set_ambient_air_density(MassDensity::new::<kilogram_per_cubic_meter>(density));
}

/// The FADEC state and core speed (N3 in percent) of an engine; the MSFS spool speeds follow.
fn set_engine(
    test_bed: &mut SimulationTestBed<A380>,
    engine_number: usize,
    state: f64,
    core_speed_percent: f64,
) {
    test_bed.write_by_name(&format!("ENGINE_STATE:{}", engine_number), state);
    test_bed.write_by_name(&format!("ENGINE_N3:{}", engine_number), core_speed_percent);
    test_bed.write_by_name(&format!("ENGINE_N2:{}", engine_number), core_speed_percent);
    test_bed.write_by_name(
        &format!("TURB ENG CORRECTED N2:{}", engine_number),
        core_speed_percent,
    );
    test_bed.write_by_name(
        &format!("TURB ENG CORRECTED N1:{}", engine_number),
        core_speed_percent / 2.,
    );
}

/// The flameout of an engine: the FADEC shuts it down and its core windmills at the speed the
/// systems give for this airspeed.
fn flame_out(test_bed: &mut SimulationTestBed<A380>, engine_number: usize) {
    test_bed.fail(FailureType::EngineFlameout(engine_number));
    test_bed.run_with_delta(FRAME);
    let windmill_core_speed = windmill_core_speed(test_bed, engine_number);
    set_engine(
        test_bed,
        engine_number,
        ENGINE_STATE_SHUTTING,
        windmill_core_speed,
    );
    test_bed.run_with_delta(FRAME);
}

fn windmill_core_speed(test_bed: &mut SimulationTestBed<A380>, engine_number: usize) -> f64 {
    test_bed.read_by_name(&format!("ENGINE_{}_WINDMILL_N2", engine_number))
}

/// ENG MASTER OFF then ON (after the 30 s of the procedure): the FADEC restarts the engine.
fn master_off_then_on(test_bed: &mut SimulationTestBed<A380>, engine_number: usize) {
    let master = format!("FUELSYSTEM VALVE SWITCH:{}", engine_number);
    test_bed.write_by_name(&master, false);
    test_bed.run_multiple_frames(Duration::from_secs(30));
    test_bed.write_by_name(&master, true);
    test_bed.write_by_name(
        &format!("ENGINE_STATE:{}", engine_number),
        ENGINE_STATE_RESTARTING,
    );
}

/// The systems release the engine fuel cut (the engine lights up) within this time.
fn lights_up_within(
    test_bed: &mut SimulationTestBed<A380>,
    engine_number: usize,
    duration: Duration,
) -> bool {
    let mut elapsed = Duration::ZERO;
    while elapsed < duration {
        test_bed.run_with_delta(FRAME);
        elapsed += FRAME;
        let fuel_cut: bool = test_bed.read_by_name(&format!("ENGINE_{}_FUEL_CUT", engine_number));
        if !fuel_cut {
            return true;
        }
    }
    false
}

#[test]
fn with_two_engines_out_an_engine_relights_by_windmilling_at_255_kt() {
    // FL100, 255 kt: above the multiple-engine windmill speed (250 kt), below the single engine one
    let mut test_bed = flying_a380(255., 10_000.);
    test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", ENG_START_SEL_IGN_START);
    flame_out(&mut test_bed, 1);
    flame_out(&mut test_bed, 3);

    // 11 % at 260 kt: at 255 kt the core windmills below 11 %, so the FADEC opens the start valve,
    // which gets no air here (no APU bleed, crossbleed AUTO): only the windmill lights the engine
    let core_speed = windmill_core_speed(&mut test_bed, 1);
    assert!((core_speed - 11. * 255. / 260.).abs() < 0.01);

    master_off_then_on(&mut test_bed, 1);
    assert!(lights_up_within(&mut test_bed, 1, Duration::from_secs(1)));
    let start_valve_open: bool = test_bed.read_by_name("PNEU_ENG_1_STARTER_VALVE_OPEN");
    assert!(start_valve_open);
    let starter_pressurized: bool = test_bed.read_by_name("PNEU_ENG_1_STARTER_PRESSURIZED");
    assert!(!starter_pressurized);
}

/// FL100, 255 kt, one engine out: zone 2 of the relight envelope, a starter assisted relight that
/// needs starter air (the start valve opens below 260 kt).
fn one_engine_out_at_fl100_and_255_kt_master_cycled(
    cross_bleed_selector: f64,
) -> SimulationTestBed<A380> {
    let mut test_bed = flying_a380(255., 10_000.);
    test_bed.write_by_name("KNOB_OVHD_AIRCOND_XBLEED_Position", cross_bleed_selector);
    test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", ENG_START_SEL_IGN_START);
    flame_out(&mut test_bed, 1);
    master_off_then_on(&mut test_bed, 1);
    test_bed
}

const CROSS_BLEED_AUTO: f64 = 1.;
const CROSS_BLEED_OPEN: f64 = 2.;

#[test]
fn with_one_engine_out_no_starter_assisted_relight_without_apu_or_crossbleed_air() {
    // X BLEED AUTO and no APU bleed: the crossbleed valves stay closed and no air reaches the
    // starter. Without the duct vent (pneumatic.rs engine_ducts_without_air_source) the air trapped
    // in the engine's own bleed duct since the flameout pressurized the starter and it lit up.
    let mut test_bed = one_engine_out_at_fl100_and_255_kt_master_cycled(CROSS_BLEED_AUTO);

    assert!(!lights_up_within(&mut test_bed, 1, Duration::from_secs(30)));
}

#[test]
fn with_one_engine_out_a_starter_assisted_relight_lights_up_with_the_crossbleed_open() {
    // The relight procedure sets XBLEED OPEN: the running engines turn the starter
    let mut test_bed = one_engine_out_at_fl100_and_255_kt_master_cycled(CROSS_BLEED_OPEN);

    assert!(lights_up_within(&mut test_bed, 1, Duration::from_secs(5)));
    let starter_pressurized: bool = test_bed.read_by_name("PNEU_ENG_1_STARTER_PRESSURIZED");
    assert!(starter_pressurized);
}

/// FL260, 255 kt: above the starter assisted zones (FL250), in the multiple-engine windmill zone
/// only. Below FL250 a single engine relight at 255 kt can be starter assisted (zones 1 and 2).
#[test]
fn at_fl260_and_255_kt_only_a_multiple_engine_relight_lights_up() {
    let mut test_bed = flying_a380(255., 26_000.);
    test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", ENG_START_SEL_IGN_START);
    flame_out(&mut test_bed, 4);

    // one engine out: 255 kt is below the single engine windmill speed (260 kt)
    master_off_then_on(&mut test_bed, 4);
    assert!(!lights_up_within(&mut test_bed, 4, Duration::from_secs(30)));

    // two engines out: 250 kt
    flame_out(&mut test_bed, 3);
    master_off_then_on(&mut test_bed, 4);
    assert!(lights_up_within(&mut test_bed, 4, Duration::from_secs(1)));
}

#[test]
fn with_two_engines_out_no_windmill_relight_above_28000_ft() {
    let mut test_bed = flying_a380(300., 29_000.);
    test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", ENG_START_SEL_IGN_START);
    flame_out(&mut test_bed, 2);
    flame_out(&mut test_bed, 4);

    master_off_then_on(&mut test_bed, 2);
    assert!(!lights_up_within(&mut test_bed, 2, Duration::from_secs(30)));
}

/// The four engines flame out at FL200, 300 kt, ENG MASTERs ON.
fn all_four_engines_flamed_out() -> SimulationTestBed<A380> {
    let mut test_bed = flying_a380(300., 20_000.);
    for engine_number in 1..=4 {
        flame_out(&mut test_bed, engine_number);
    }
    test_bed.run_multiple_frames(Duration::from_secs(10));
    test_bed
}

#[test]
fn with_all_four_engines_out_the_rat_deploys_and_the_emergency_generator_supplies_ac_ess() {
    let mut test_bed = all_four_engines_flamed_out();

    for bus in ["AC_1", "AC_2", "AC_3", "AC_4"] {
        let powered: bool = test_bed.read_by_name(&format!("ELEC_{}_BUS_IS_POWERED", bus));
        assert!(!powered, "{} is not powered", bus);
    }
    let rat_position: f64 = test_bed.read_by_name("RAT_STOW_POSITION");
    assert!(rat_position > 0.99, "the RAT is out");
    let ac_ess_powered: bool = test_bed.read_by_name("ELEC_AC_ESS_BUS_IS_POWERED");
    assert!(ac_ess_powered, "the emergency generator supplies AC ESS");
}

#[test]
fn with_all_four_engines_out_each_engine_relights_by_windmilling_at_fl200_and_300_kt() {
    let mut test_bed = all_four_engines_flamed_out();
    test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", ENG_START_SEL_IGN_START);

    for engine_number in 1..=4 {
        master_off_then_on(&mut test_bed, engine_number);
        assert!(
            lights_up_within(&mut test_bed, engine_number, Duration::from_secs(1)),
            "engine {} relights",
            engine_number
        );
    }
}

#[test]
fn with_all_four_engines_out_no_relight_at_norm() {
    // The procedure sets the ENG START selector to IGN START: at NORM only a quick relight (master
    // cycled within 30 s, N2 above 45 %) lights up, and the cores windmill here
    let mut test_bed = all_four_engines_flamed_out();

    master_off_then_on(&mut test_bed, 1);
    assert!(!lights_up_within(&mut test_bed, 1, Duration::from_secs(30)));
}

/// L:A32NX_ENGINE_STATE of the FADEC
const ENGINE_STATE_OFF: f64 = 0.;
const ENGINE_STATE_STARTING: f64 = 2.;

/// The crossbleed engine start on the ground (ALL ENG BLEEDS ON, X BLEED AUTO, then the second
/// engine start). Engine 1 runs at idle, the APU bleed is OFF, engines 2 to 4 are stopped with
/// their ENG MASTER OFF, ENG START selector IGN START.
fn on_the_ground_with_engine_1_running_and_no_apu_bleed() -> SimulationTestBed<A380> {
    let mut test_bed = SimulationTestBed::new(A380::new);
    test_bed.set_on_ground(true);
    set_flight_conditions(&mut test_bed, 0., 0.);
    test_bed.write_by_name("XMLVAR_ENG_MODE_SEL", ENG_START_SEL_IGN_START);
    test_bed.write_by_name("KNOB_OVHD_AIRCOND_XBLEED_Position", CROSS_BLEED_AUTO);
    test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:1", true);
    set_engine(&mut test_bed, 1, ENGINE_STATE_ON, 70.);
    for engine_number in 2..=4 {
        test_bed.write_by_name(&format!("FUELSYSTEM VALVE SWITCH:{}", engine_number), false);
        set_engine(&mut test_bed, engine_number, ENGINE_STATE_OFF, 0.);
    }
    test_bed.run_multiple_frames(Duration::from_secs(10));
    test_bed
}

fn cross_bleed_valves_are_open(test_bed: &mut SimulationTestBed<A380>) -> [bool; 3] {
    ["L", "C", "R"].map(|valve| test_bed.read_by_name(&format!("PNEU_XBLEED_VALVE_{}_OPEN", valve)))
}

#[test]
fn on_the_ground_a_crossbleed_engine_start_gets_starter_air_from_the_running_engine() {
    // The crossbleed valves open automatically on the ground at engine start. Without it they stayed
    // closed at AUTO (no APU bleed, all ENG BLEED pbs ON): the starter of engine 2 got no air and the
    // FADEC reported START FAULT (NO STARTER AIR PRESSURE).
    let mut test_bed = on_the_ground_with_engine_1_running_and_no_apu_bleed();
    assert_eq!(cross_bleed_valves_are_open(&mut test_bed), [false; 3]);

    // ENG 2 MASTER ON: the FADEC starts the engine; the starter turns the core to 10 % N3
    test_bed.write_by_name("FUELSYSTEM VALVE SWITCH:2", true);
    set_engine(&mut test_bed, 2, ENGINE_STATE_STARTING, 10.);
    test_bed.run_multiple_frames(Duration::from_secs(15));

    let start_fault: f64 = test_bed.read_by_name("ENGINE_2_START_FAULT");
    assert_eq!(
        start_fault, 0.,
        "no START FAULT (6: NO STARTER AIR PRESSURE)"
    );
    let start_valve_open: bool = test_bed.read_by_name("PNEU_ENG_2_STARTER_VALVE_OPEN");
    assert!(start_valve_open);
    let starter_pressurized: bool = test_bed.read_by_name("PNEU_ENG_2_STARTER_PRESSURIZED");
    assert!(starter_pressurized, "the engine 1 bleed turns the starter");
    assert_eq!(cross_bleed_valves_are_open(&mut test_bed), [true; 3]);

    // the fuel lights up from 20 % N3, then the start valve closes above 58.4 % N3 and the
    // crossbleed valves close again
    set_engine(&mut test_bed, 2, ENGINE_STATE_STARTING, 25.);
    assert!(lights_up_within(&mut test_bed, 2, Duration::from_secs(5)));
    set_engine(&mut test_bed, 2, ENGINE_STATE_STARTING, 60.);
    test_bed.run_multiple_frames(Duration::from_secs(2));
    set_engine(&mut test_bed, 2, ENGINE_STATE_ON, 70.);
    test_bed.run_multiple_frames(Duration::from_secs(2));
    assert_eq!(cross_bleed_valves_are_open(&mut test_bed), [false; 3]);
    let start_fault: f64 = test_bed.read_by_name("ENGINE_2_START_FAULT");
    assert_eq!(start_fault, 0.);
}
