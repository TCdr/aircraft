//! Full-aircraft tests of the engine flameouts with more than one engine out: the whole A380 of
//! lib.rs (pneumatics, electrics, fuel, the engine failures), with the FADEC (fadec_a380x) played by
//! the test (the FADEC engine state and core speed).
//!
//! A380 FCOM (a380_fcom.txt):
//! - PRO-ABN-ECAM-10-70 ENG RELIGHT IN FLIGHT, l.174977-174979 (multiple engines): "MAX GUARANTEED
//!   ALTITUDE : 28000 FT", "MIN SPEED FOR WINDML RELIGHT : 250 KT" (single engine l.174902-174904:
//!   30000 FT, 260 KT).
//! - ENG ALL ENG FLAME OUT, l.173768-174788: "RAT MAN ON ... PRESS", "OPTIMUM RELIGHT SPEED :
//!   260 KT", "WHEN APU AVAIL: ... APU BLEED ... ON", "ENG MASTER (2 AT A TIME) ... ON".
//! - DSC-70-30 IN FLIGHT, l.113567-113570: "Engine start valve opens if N2 is below 11 %, or if the
//!   aircraft airspeed (CAS) is below 260 kt".

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

    // 11 % at 260 kt: at 255 kt the core windmills below 11 %, so the FADEC opens the start valve
    // (l.113567), which gets no air here (no APU bleed, crossbleed AUTO): only the windmill lights
    // the engine
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
/// needs starter air (FCOM DSC-70-30 l.113567-113570: the start valve opens below 260 kt).
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
    // starter. Before the duct vent (pneumatic.rs engine_ducts_without_air_source) the air trapped
    // in the engine's own bleed duct since the flameout pressurized the starter and it lit up.
    let mut test_bed = one_engine_out_at_fl100_and_255_kt_master_cycled(CROSS_BLEED_AUTO);

    assert!(!lights_up_within(&mut test_bed, 1, Duration::from_secs(30)));
}

#[test]
fn with_one_engine_out_a_starter_assisted_relight_lights_up_with_the_crossbleed_open() {
    // ENG RELIGHT IN FLIGHT l.174908: "XBLEED ... OPEN": the running engines turn the starter
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
    // "ENG START SEL ... IGN START" (l.173816): at NORM only a quick relight (master cycled within
    // 30 s, N2 above 45 %) lights up, and the cores windmill here
    let mut test_bed = all_four_engines_flamed_out();

    master_off_then_on(&mut test_bed, 1);
    assert!(!lights_up_within(&mut test_bed, 1, Duration::from_secs(30)));
}
