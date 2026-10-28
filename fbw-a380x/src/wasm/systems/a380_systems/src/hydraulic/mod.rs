use nalgebra::Vector3;

use std::time::Duration;
use uom::si::{
    angle::degree,
    angular_velocity::{degree_per_second, radian_per_second, revolution_per_minute},
    electric_current::ampere,
    f64::*,
    length::{inch, meter},
    mass::kilogram,
    pressure::psi,
    ratio::{percent, ratio},
    thermodynamic_temperature::degree_celsius,
    velocity::knot,
    volume::{cubic_inch, gallon, liter},
    volume_rate::gallon_per_second,
};

use systems::{
    accept_iterable,
    engine::Engine,
    hydraulic::{
        aerodynamic_model::AerodynamicModel,
        brake::{BrakeAssembly, BrakeProperties},
        brake_circuit::{BrakeAccumulatorCharacteristics, BrakeCircuit, BrakeCircuitController},
        bypass_pin::BypassPin,
        cargo_doors::{CargoDoor, HydraulicDoorController},
        flap_slat::{
            FlapSlatAssembly, SecondarySurface, SecondarySurfaceSide, SecondarySurfaceType,
        },
        landing_gear::{GearGravityExtension, GearSystemController, HydraulicGearSystem},
        linear_actuator::{
            Actuator, BoundedLinearLength, ElectroHydrostaticActuatorType,
            ElectroHydrostaticBackup, ElectroHydrostaticPowered, HydraulicAssemblyController,
            HydraulicLinearActuatorAssembly, HydraulicLocking, LinearActuatedRigidBodyOnHingeAxis,
            LinearActuator, LinearActuatorCharacteristics, LinearActuatorMode,
        },
        nose_steering::{
            SteeringActuator, SteeringAngleLimiter, SteeringController, SteeringRatioToAngle,
        },
        pumps::PumpCharacteristics,
        pushback::PushbackTug,
        trimmable_horizontal_stabilizer::{
            TrimmableHorizontalStabilizerActuator, TrimmableHorizontalStabilizerMotorController,
        },
        Accumulator, ElectricPump, EngineDrivenPump, HeatingElement, HydraulicCircuit,
        HydraulicCircuitController, HydraulicPressureSensors, ManualPump, PressureSwitch,
        PressureSwitchType, PriorityValve, PumpController, Reservoir,
    },
    landing_gear::{GearSystemSensors, LandingGearControlInterfaceUnitSet, TiltingGear},
    overhead::{AutoOffFaultPushButton, AutoOnFaultPushButton},
    shared::{
        interpolation, random_from_range, update_iterator::MaxStepLoop, AdirsDiscreteOutputs,
        AdirsMeasurementOutputs, AirbusElectricPumpId, AirbusEngineDrivenPumpId, CargoDoorLocked,
        ControllerSignal, DelayedFalseLogicGate, DelayedTrueLogicGate, ElectricalBusType,
        ElectricalBuses, EngineFirePushButtons, GearWheel, HydraulicColor, LandingGearHandle,
        LgciuInterface, LgciuWeightOnWheels, ReservoirAirPressure, SectionPressure,
        SurfacesPositions,
    },
    simulation::{
        InitContext, Read, SimulationElement, SimulationElementVisitor, SimulatorReader,
        SimulatorWriter, StartState, UpdateContext, VariableIdentifier, Write,
    },
};

use std::fmt::Debug;

mod sfcc;
use sfcc::SlatFlapComplex;
mod engine_pump_disc;
use engine_pump_disc::EnginePumpDisconnectionClutch;
pub mod autobrakes;
use autobrakes::A380AutobrakeController;
mod gear_secondary_doors;
mod heading_control_steering;
use heading_control_steering::HeadingControlFunction;
mod flight_control_actuator_failures;
use flight_control_actuator_failures::{
    reconfigure_actuator_pair, reconfigure_ebha_pair, A380FlightControlActuatorFailures,
};
mod brake_anti_skid_faults;
use brake_anti_skid_faults::{
    brake_pair_is_on_left_side, A380BrakeAntiSkidFaults, BrakePairPressures, BrakingState,
    BRAKE_PAIR_COUNT,
};
mod brake_steer_faults;
use brake_steer_faults::{
    A380BrakingControlFaults, A380SteeringControlSystem, EmergencyBrakeLaw, NoseWheelSteeringMode,
    NoseWheelSteeringSupply, PedalBrakingMode,
};

#[cfg(test)]
use systems::hydraulic::PressureSwitchState;

mod gear_steering_monitoring;
use gear_steering_monitoring::A380GearSteeringMonitoring;

const AC_EHA_BUS: ElectricalBusType = ElectricalBusType::AlternatingCurrentNamed("247XP");

struct A380TiltingGearsFactory {}
impl A380TiltingGearsFactory {
    fn new_a380_body_gear(context: &mut InitContext, is_left: bool) -> TiltingGear {
        let mut x_offset = Length::new::<meter>(2.85569);
        let y_offset = Length::new::<meter>(-5.04847);
        let z_offset = Length::new::<meter>(-0.235999);
        let distance_offset_fwd_to_aft_wheel = Length::new::<meter>(3.5);
        let low_to_up_height = Length::new::<meter>(0.280065);

        if is_left {
            x_offset *= -1.;
        }

        TiltingGear::new(
            context,
            low_to_up_height,
            if is_left { 1 } else { 2 },
            Vector3::new(
                x_offset.get::<meter>(),
                y_offset.get::<meter>(),
                z_offset.get::<meter>(),
            ),
            // Aft wheel as an offset aft, and height when aft wheel is down is same as fwd wheel down + down to up length
            // Note this only works if bogey tilt axis is in the middle
            Vector3::new(
                x_offset.get::<meter>(),
                (y_offset + low_to_up_height).get::<meter>(),
                (z_offset - distance_offset_fwd_to_aft_wheel).get::<meter>(),
            ),
            Angle::new::<degree>(9.89),
            Length::new::<meter>(0.711),
        )
    }

    fn new_a380_wing_gear(context: &mut InitContext, is_left: bool) -> TiltingGear {
        let mut x_offset = Length::new::<meter>(6.18848);
        let y_offset = Length::new::<meter>(-4.86875);
        let z_offset = Length::new::<meter>(2.6551);
        let distance_offset_fwd_to_aft_wheel = Length::new::<meter>(2.0);
        let low_to_up_height = Length::new::<meter>(0.134608);

        if is_left {
            x_offset *= -1.;
        }

        TiltingGear::new(
            context,
            low_to_up_height,
            if is_left { 3 } else { 4 },
            Vector3::new(
                x_offset.get::<meter>(),
                y_offset.get::<meter>(),
                z_offset.get::<meter>(),
            ),
            // Aft wheel as an offset aft, and height when aft wheel is down is same as fwd wheel down + down to up length
            // Note this only works if bogey tilt axis is in the middle
            Vector3::new(
                x_offset.get::<meter>(),
                (y_offset + low_to_up_height).get::<meter>(),
                (z_offset - distance_offset_fwd_to_aft_wheel).get::<meter>(),
            ),
            Angle::new::<degree>(9.),
            Length::new::<meter>(0.711),
        )
    }

    fn new_a380_tilt_assembly(context: &mut InitContext) -> A380TiltingGears {
        let left_body_gear = Self::new_a380_body_gear(context, true);
        let right_body_gear = Self::new_a380_body_gear(context, false);
        let left_wing_gear = Self::new_a380_wing_gear(context, true);
        let right_wing_gear = Self::new_a380_wing_gear(context, false);

        A380TiltingGears::new(
            left_body_gear,
            right_body_gear,
            left_wing_gear,
            right_wing_gear,
        )
    }
}

struct A380HydraulicReservoirFactory {}
impl A380HydraulicReservoirFactory {
    /// Total volume of the reservoir: 31.70 US gal (about 120 l)
    const RESERVOIR_TOTAL_VOLUME_GALLON: f64 = 31.70;

    /// RSVR LEVEL LO below 2.6 US gal in the reservoir
    const RESERVOIR_LOW_LEVEL_GALLON: f64 = 2.6;

    fn new_green_reservoir(context: &mut InitContext) -> Reservoir {
        let reservoir_offset_when_gear_up = if context.start_gear_down() {
            Volume::new::<gallon>(0.)
        } else {
            Volume::new::<gallon>(-1.3)
        };

        Reservoir::new(
            context,
            HydraulicColor::Green,
            Volume::new::<gallon>(Self::RESERVOIR_TOTAL_VOLUME_GALLON),
            Volume::new::<liter>(90.),
            Volume::new::<gallon>(12.) + reservoir_offset_when_gear_up,
            vec![PressureSwitch::new(
                Pressure::new::<psi>(25.),
                Pressure::new::<psi>(21.76),
                PressureSwitchType::Relative,
            )],
            Volume::new::<gallon>(Self::RESERVOIR_LOW_LEVEL_GALLON),
        )
    }

    fn new_yellow_reservoir(context: &mut InitContext) -> Reservoir {
        Reservoir::new(
            context,
            HydraulicColor::Yellow,
            Volume::new::<gallon>(Self::RESERVOIR_TOTAL_VOLUME_GALLON),
            Volume::new::<liter>(90.),
            Volume::new::<gallon>(12.7),
            vec![PressureSwitch::new(
                Pressure::new::<psi>(25.),
                Pressure::new::<psi>(21.76),
                PressureSwitchType::Relative,
            )],
            Volume::new::<gallon>(Self::RESERVOIR_LOW_LEVEL_GALLON),
        )
    }
}

pub struct A380HydraulicCircuitFactory {}
impl A380HydraulicCircuitFactory {
    // Engine pump section pressure switch: PMP A OR B PRESS LO below 2 500 PSI. No reset value is published: the high
    // threshold stays the one of the system pressure switch.
    const MIN_PRESS_EDP_SECTION_LO_HYST: f64 = 2500.0;
    const MIN_PRESS_EDP_SECTION_HI_HYST: f64 = 3700.0;
    // Electric pump section pressure switch: ELEC PMP A OR (B) FAULT below 1 885 PSI. Same high threshold as above.
    const MIN_PRESS_ELEC_PUMP_SECTION_LO_HYST: f64 = 1885.0;
    const MIN_PRESS_ELEC_PUMP_SECTION_HI_HYST: f64 = 3700.0;
    // Pump sections of the electric pumps A and B in each circuit (A380ElectricPumpId::into_pump_section_index)
    const ELEC_PUMP_SECTION_INDEXES: [usize; 2] = [4, 5];
    const MIN_PRESS_PRESSURISED_LO_HYST: f64 = 2900.0;
    const MIN_PRESS_PRESSURISED_HI_HYST: f64 = 3700.0;
    const HYDRAULIC_TARGET_PRESSURE_PSI: f64 = 5250.;

    // Design choice: no A380 servo flow figures are available. The servos that the flight control computers engage
    // and release get no flow at the pressure where the computers release them, so one electric pump re-centring all
    // the drooped surfaces levels the pressure out above it, instead of a release and re-engage loop.
    const FLIGHT_CONTROL_SERVO_FLOW_CUT_OFF_PSI: f64 = Self::MIN_PRESS_PRESSURISED_LO_HYST;

    // Nitrogen PSI precharge pressure
    const ACCUMULATOR_GAS_PRE_CHARGE_PSI: f64 = 2612.0;
    const ACCUMULATOR_MAX_VOLUME_GALLONS: f64 = 0.5;

    const PRIORITY_VALVE_PRESSURE_CUTOFF_PSI: f64 = 3000.;
    const PRIORITY_VALVE_PRESSURE_OPENED_PSI: f64 = 3800.;

    pub fn new_green_circuit(context: &mut InitContext) -> HydraulicCircuit {
        let reservoir = A380HydraulicReservoirFactory::new_green_reservoir(context);

        let circuit = HydraulicCircuit::new(
            context,
            HydraulicColor::Green,
            6,
            Ratio::new::<percent>(100.),
            Volume::new::<gallon>(10.),
            reservoir,
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_HI_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_EDP_SECTION_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_EDP_SECTION_HI_HYST),
            false,
            false,
            true,
            Pressure::new::<psi>(Self::HYDRAULIC_TARGET_PRESSURE_PSI),
            PriorityValve::new(
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_CUTOFF_PSI),
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_OPENED_PSI),
            ),
            Pressure::new::<psi>(Self::ACCUMULATOR_GAS_PRE_CHARGE_PSI),
            Volume::new::<gallon>(Self::ACCUMULATOR_MAX_VOLUME_GALLONS),
        );
        Self::with_electric_pump_pressure_switches(circuit)
    }

    /// The electric pump sections have their own pressure switch setting (1 885 PSI), the engine pump sections keep
    /// the circuit's one (2 500 PSI).
    fn with_electric_pump_pressure_switches(circuit: HydraulicCircuit) -> HydraulicCircuit {
        Self::ELEC_PUMP_SECTION_INDEXES
            .iter()
            .fold(circuit, |circuit, &pump_index| {
                circuit.with_pump_section_pressure_switch(
                    pump_index,
                    Pressure::new::<psi>(Self::MIN_PRESS_ELEC_PUMP_SECTION_LO_HYST),
                    Pressure::new::<psi>(Self::MIN_PRESS_ELEC_PUMP_SECTION_HI_HYST),
                )
            })
    }

    pub fn new_yellow_circuit(context: &mut InitContext) -> HydraulicCircuit {
        let reservoir = A380HydraulicReservoirFactory::new_yellow_reservoir(context);
        let circuit = HydraulicCircuit::new(
            context,
            HydraulicColor::Yellow,
            6,
            Ratio::new::<percent>(100.),
            Volume::new::<gallon>(10.),
            reservoir,
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_HI_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_EDP_SECTION_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_EDP_SECTION_HI_HYST),
            false,
            false,
            // The yellow auxiliary section is the body wheel steering (BWS) supply of the yellow electric pumps in
            // automatic mode (see A380HydraulicCircuitController::should_route_pump_to_auxiliary)
            true,
            Pressure::new::<psi>(Self::HYDRAULIC_TARGET_PRESSURE_PSI),
            PriorityValve::new(
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_CUTOFF_PSI),
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_OPENED_PSI),
            ),
            Pressure::new::<psi>(Self::ACCUMULATOR_GAS_PRE_CHARGE_PSI),
            Volume::new::<gallon>(Self::ACCUMULATOR_MAX_VOLUME_GALLONS),
        );
        Self::with_electric_pump_pressure_switches(circuit)
    }
}

struct A380CargoDoorFactory {}
impl A380CargoDoorFactory {
    const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 0.05;
    const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 4.;
    const FLOW_CONTROL_FORCE_GAIN: f64 = 200000.;

    const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 1000000.;
    const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 10.;

    fn a380_cargo_door_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        let actuator_characteristics = LinearActuatorCharacteristics::new(
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING / 3.,
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING,
            VolumeRate::new::<gallon_per_second>(0.02),
            Ratio::new::<percent>(Self::MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.06651697090182), // Real actuator 34.75cm^2
            Length::new::<meter>(0.0509),           // Real actuator retract area  14.55cm^2
            actuator_characteristics.max_flow(),
            600000.,
            15000.,
            500.,
            actuator_characteristics.slow_damping(),
            Duration::from_millis(100),
            [1., 1., 1., 1., 1., 1.],
            [1., 1., 1., 1., 1., 1.],
            [0., 0.2, 0.21, 0.79, 0.8, 1.],
            Self::FLOW_CONTROL_PROPORTIONAL_GAIN,
            Self::FLOW_CONTROL_INTEGRAL_GAIN,
            Self::FLOW_CONTROL_FORCE_GAIN,
            true,
            false,
            None,
            None,
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    /// Builds a cargo door body for A380-800
    fn a380_cargo_door_body(is_locked: bool) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(100. / 1000., 1855. / 1000., 2025. / 1000.);
        let cg_offset = Vector3::new(0., -size[1] / 2., 0.);

        let control_arm = Vector3::new(0., -0.45, 0.);
        let anchor = Vector3::new(-0.7596, -0.4, 0.);
        let axis_direction = Vector3::new(0., 0., 1.);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(250.),
            size,
            cg_offset,
            cg_offset,
            control_arm,
            anchor,
            Angle::new::<degree>(-23.),
            Angle::new::<degree>(136.),
            Angle::new::<degree>(-23.),
            100.,
            is_locked,
            axis_direction,
        )
    }

    /// Builds a cargo door assembly consisting of the door physical rigid body and the hydraulic actuator connected
    /// to it
    fn a380_cargo_door_assembly(context: &mut InitContext) -> HydraulicLinearActuatorAssembly<1> {
        let cargo_door_body = Self::a380_cargo_door_body(true);
        let cargo_door_actuator = Self::a380_cargo_door_actuator(context, &cargo_door_body);
        HydraulicLinearActuatorAssembly::new([cargo_door_actuator], cargo_door_body)
    }

    fn new_a380_cargo_door(context: &mut InitContext, id: &str) -> CargoDoor {
        let assembly = Self::a380_cargo_door_assembly(context);
        CargoDoor::new(
            context,
            id,
            assembly,
            Self::new_a380_cargo_door_aero_model(),
        )
    }

    fn new_a380_cargo_door_aero_model() -> AerodynamicModel {
        let body = Self::a380_cargo_door_body(false);
        AerodynamicModel::new(
            &body,
            Some(Vector3::new(1., 0., 0.)),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(1., 0., 0.)),
            Ratio::new::<ratio>(1.),
        )
    }
}

struct A380AileronFactory {}
impl A380AileronFactory {
    const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 5.;
    const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 4.;
    const FLOW_CONTROL_FORCE_GAIN: f64 = 150000.;

    const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 3500000.;
    const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 10.;

    // 427XP - AC ESS = AlternatingCurrentEssentialShed on the A380.
    // All EHAs are powered via the AC ESS busbar after an all engine flameout.
    const MIDDLE_PANEL_EHA_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrentEssentialShed;
    // 247XP - AC EHA
    const INWARD_PANEL_EHA_BUS: ElectricalBusType = AC_EHA_BUS;

    fn a380_aileron_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
        powered_by: Option<ElectricalBusType>,
    ) -> LinearActuator {
        let actuator_characteristics = LinearActuatorCharacteristics::new(
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING / 3.,
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING,
            VolumeRate::new::<gallon_per_second>(0.0825),
            Ratio::new::<percent>(Self::MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        // Aileron actuator real data:
        // Max force of 13500daN @ nominal 350bar. This gives a 0.003857m^2 of piston surface
        // This gives piston diameter of 2 * 0.035m = 0.07 meters
        // We use 0 as rod diameter as this is a symmetrical actuator so same surface each side
        // Max flow at rated max travel speed 81mm/s, this gives 0.003857m^2 * 81mm/s = 0.000312 m^3/s
        // = 0.08254 gal/s
        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.07),
            Length::new::<meter>(0.),
            actuator_characteristics.max_flow(),
            80000.,
            1500.,
            5000.,
            actuator_characteristics.slow_damping(),
            Duration::from_millis(300),
            [1., 1., 1., 1., 1., 1.],
            [1., 1., 1., 1., 1., 1.],
            [0., 0.2, 0.21, 0.79, 0.8, 1.],
            Self::FLOW_CONTROL_PROPORTIONAL_GAIN,
            Self::FLOW_CONTROL_INTEGRAL_GAIN,
            Self::FLOW_CONTROL_FORCE_GAIN,
            true,
            false,
            None,
            powered_by.map(|bus| {
                ElectroHydrostaticBackup::new(
                    bus,
                    ElectroHydrostaticActuatorType::ElectroHydrostaticActuator,
                )
            }),
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
        .with_flow_cut_off_pressure(Pressure::new::<psi>(
            A380HydraulicCircuitFactory::FLIGHT_CONTROL_SERVO_FLOW_CUT_OFF_PSI,
        ))
    }

    /// Builds an aileron control surface body for A380-800
    fn a380_aileron_body(
        init_drooped_down: bool,
        panel: AileronPanelPosition,
    ) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = match panel {
            AileronPanelPosition::Outward => Vector3::new(4.06, 0.16, 1.4),
            AileronPanelPosition::Middle => Vector3::new(2.9, 0.16, 1.37),
            AileronPanelPosition::Inward => Vector3::new(2.26, 0.16, 1.6),
        };

        let mass = match panel {
            AileronPanelPosition::Outward => Mass::new::<kilogram>(128.),
            AileronPanelPosition::Middle => Mass::new::<kilogram>(118.),
            AileronPanelPosition::Inward => Mass::new::<kilogram>(108.),
        };

        // CG at half the size
        let cg_offset = Vector3::new(0., 0., -0.5 * size[2]);
        let aero_center = Vector3::new(0., 0., -0.4 * size[2]);

        let control_arm = Vector3::new(0., -0.119, 0.);
        let anchor = Vector3::new(0., -0.119, 0.33);

        let init_position = if init_drooped_down {
            Angle::new::<degree>(-20.)
        } else {
            Angle::new::<degree>(0.)
        };

        LinearActuatedRigidBodyOnHingeAxis::new(
            mass,
            size,
            cg_offset,
            aero_center,
            control_arm,
            anchor,
            Angle::new::<degree>(-20.),
            Angle::new::<degree>(50.),
            init_position,
            1.,
            false,
            Vector3::new(1., 0., 0.),
        )
    }

    /// Builds an aileron assembly consisting of the aileron physical rigid body and two hydraulic actuators connected
    /// to it
    fn a380_aileron_assembly(
        context: &mut InitContext,
        init_drooped_down: bool,
        powered_by: Option<ElectricalBusType>,
        panel: AileronPanelPosition,
    ) -> HydraulicLinearActuatorAssembly<2> {
        let aileron_body = Self::a380_aileron_body(init_drooped_down, panel);

        let aileron_actuator_outward = Self::a380_aileron_actuator(context, &aileron_body, None);
        let aileron_actuator_inward =
            Self::a380_aileron_actuator(context, &aileron_body, powered_by);

        HydraulicLinearActuatorAssembly::new(
            [aileron_actuator_outward, aileron_actuator_inward],
            aileron_body,
        )
    }

    fn new_aileron(context: &mut InitContext, id: ActuatorSide) -> AileronAssembly {
        let init_drooped_down = !context.is_in_flight();
        let assembly_outward = Self::a380_aileron_assembly(
            context,
            init_drooped_down,
            None,
            AileronPanelPosition::Outward,
        );
        let assembly_middle = Self::a380_aileron_assembly(
            context,
            init_drooped_down,
            Some(Self::MIDDLE_PANEL_EHA_BUS),
            AileronPanelPosition::Middle,
        );
        let assembly_inward = Self::a380_aileron_assembly(
            context,
            init_drooped_down,
            Some(Self::INWARD_PANEL_EHA_BUS),
            AileronPanelPosition::Inward,
        );
        AileronAssembly::new(
            context,
            id,
            assembly_outward,
            assembly_middle,
            assembly_inward,
            Self::new_a380_aileron_aero_model(AileronPanelPosition::Outward),
            Self::new_a380_aileron_aero_model(AileronPanelPosition::Middle),
            Self::new_a380_aileron_aero_model(AileronPanelPosition::Inward),
        )
    }

    fn new_a380_aileron_aero_model(panel: AileronPanelPosition) -> AerodynamicModel {
        let body = Self::a380_aileron_body(true, panel);

        let area_coeff = match panel {
            AileronPanelPosition::Outward => Ratio::new::<ratio>(0.829),
            AileronPanelPosition::Middle => Ratio::new::<ratio>(0.896),
            AileronPanelPosition::Inward => Ratio::new::<ratio>(0.874),
        };

        // Aerodynamic object has a little rotation from horizontal direction so that at X°
        // of wing AOA the aileron gets some X°+Y° AOA as the overwing pressure sucks the aileron up
        AerodynamicModel::new(
            &body,
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., 0.208, 0.978)),
            Some(Vector3::new(0., 0.978, -0.208)),
            area_coeff,
        )
    }
}

struct A380SpoilerFactory {}
impl A380SpoilerFactory {
    const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 0.4;
    const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 0.4;
    const FLOW_CONTROL_FORCE_GAIN: f64 = 50000.;

    const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 400000.;

    const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 20.;

    // 427XP - AC ESS = AlternatingCurrentEssentialShed on the A380.
    // Spoiler 6 operates as an EHA powered by the AC ESS busbar.
    const SPOILER_6_EBHA_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrentEssentialShed;

    fn a380_spoiler_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
        powered_by: Option<ElectricalBusType>,
    ) -> LinearActuator {
        let actuator_characteristics = LinearActuatorCharacteristics::new(
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING / 5.,
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING,
            VolumeRate::new::<gallon_per_second>(0.23),
            Ratio::new::<percent>(Self::MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.09),
            Length::new::<meter>(0.05),
            actuator_characteristics.max_flow(),
            80000.,
            1500.,
            5000.,
            actuator_characteristics.slow_damping(),
            Duration::from_millis(300),
            [1., 1., 1., 1., 1., 1.],
            [1., 1., 1., 1., 1., 1.],
            [0., 0.2, 0.21, 0.79, 0.8, 1.],
            Self::FLOW_CONTROL_PROPORTIONAL_GAIN,
            Self::FLOW_CONTROL_INTEGRAL_GAIN,
            Self::FLOW_CONTROL_FORCE_GAIN,
            true,
            true,
            Some((
                AngularVelocity::new::<radian_per_second>(-10000.),
                AngularVelocity::new::<radian_per_second>(0.),
            )),
            powered_by.map(|bus| {
                ElectroHydrostaticBackup::new(
                    bus,
                    ElectroHydrostaticActuatorType::ElectricalBackupHydraulicActuator,
                )
            }),
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    /// Builds a spoiler control surface body for A380-800
    fn a380_spoiler_body() -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(1.785, 0.1, 0.685);
        let cg_offset = Vector3::new(0., 0., -0.5 * size[2]);
        let aero_center = Vector3::new(0., 0., -0.33 * size[2]);

        let control_arm = Vector3::new(0., -0.10 * size[2], -0.26 * size[2]);
        let anchor = Vector3::new(0., -0.45 * size[2], 0.26 * size[2]);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(42.),
            size,
            cg_offset,
            aero_center,
            control_arm,
            anchor,
            Angle::new::<degree>(-10.),
            Angle::new::<degree>(50.),
            Angle::new::<degree>(-10.),
            50.,
            false,
            Vector3::new(1., 0., 0.),
        )
    }

    /// Builds a spoiler assembly consisting of the spoiler physical rigid body and one hydraulic actuator
    fn a380_spoiler_assembly(
        context: &mut InitContext,
        powered_by: Option<ElectricalBusType>,
    ) -> HydraulicLinearActuatorAssembly<1> {
        let spoiler_body = Self::a380_spoiler_body();

        let spoiler_actuator = Self::a380_spoiler_actuator(context, &spoiler_body, powered_by);

        HydraulicLinearActuatorAssembly::new([spoiler_actuator], spoiler_body)
    }

    fn new_a380_spoiler_group(context: &mut InitContext, id: ActuatorSide) -> SpoilerGroup {
        let spoiler_1 = Self::new_a380_spoiler_element(context, id, 1, None);
        let spoiler_2 = Self::new_a380_spoiler_element(context, id, 2, None);
        let spoiler_3 = Self::new_a380_spoiler_element(context, id, 3, None);
        let spoiler_4 = Self::new_a380_spoiler_element(context, id, 4, None);
        let spoiler_5 = Self::new_a380_spoiler_element(context, id, 5, None);
        let spoiler_6 =
            Self::new_a380_spoiler_element(context, id, 6, Some(Self::SPOILER_6_EBHA_BUS));
        let spoiler_7 = Self::new_a380_spoiler_element(context, id, 7, None);
        let spoiler_8 = Self::new_a380_spoiler_element(context, id, 8, None);

        SpoilerGroup::new(
            context,
            match id {
                ActuatorSide::Left => "LEFT",
                ActuatorSide::Right => "RIGHT",
            },
            [
                spoiler_1, spoiler_2, spoiler_3, spoiler_4, spoiler_5, spoiler_6, spoiler_7,
                spoiler_8,
            ],
        )
    }

    fn new_a380_spoiler_element(
        context: &mut InitContext,
        id: ActuatorSide,
        id_number: usize,
        powered_by: Option<ElectricalBusType>,
    ) -> SpoilerElement {
        let assembly = Self::a380_spoiler_assembly(context, powered_by);
        SpoilerElement::new(
            context,
            id,
            id_number,
            assembly,
            Self::new_a380_spoiler_aero_model(),
        )
    }

    fn new_a380_spoiler_aero_model() -> AerodynamicModel {
        let body = Self::a380_spoiler_body();

        // Lift vector and normal are rotated 10° to acount for air supposedly following
        // wing profile that is 10° from horizontal
        // It means that with headwind and spoiler retracted (-10°), spoiler generates no lift
        AerodynamicModel::new(
            &body,
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., -0.174, 0.985)),
            Some(Vector3::new(0., 0.985, 0.174)),
            Ratio::new::<ratio>(0.9),
        )
    }
}

struct A380ElevatorFactory {}
impl A380ElevatorFactory {
    const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 1.5;
    const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 0.5;
    const FLOW_CONTROL_FORCE_GAIN: f64 = 400000.;

    const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 15000000.;
    const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 5.;

    // 247XP - AC EHA
    const LEFT_OUTWARD_PANEL_EHA_BUS: ElectricalBusType = AC_EHA_BUS;
    // 427XP - AC ESS = AlternatingCurrentEssentialShed on the A380.
    // All EHAs are powered via the AC ESS busbar after an all engine flameout.
    const RIGHT_OUTWARD_PANEL_EHA_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrentEssentialShed;
    // 427XP - AC ESS
    const LEFT_INWARD_PANEL_EHA_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrentEssentialShed;
    // 247XP - AC EHA
    const RIGHT_INWARD_PANEL_EHA_BUS: ElectricalBusType = AC_EHA_BUS;

    fn a380_elevator_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
        powered_by: Option<ElectricalBusType>,
    ) -> LinearActuator {
        let actuator_characteristics = LinearActuatorCharacteristics::new(
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING / 5.,
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING,
            VolumeRate::new::<gallon_per_second>(0.15),
            Ratio::new::<percent>(Self::MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.08),
            Length::new::<meter>(0.),
            actuator_characteristics.max_flow(),
            80000.,
            1500.,
            20000.,
            actuator_characteristics.slow_damping(),
            Duration::from_millis(300),
            [1., 1., 1., 1., 1., 1.],
            [1., 1., 1., 1., 1., 1.],
            [0., 0.2, 0.21, 0.79, 0.8, 1.],
            Self::FLOW_CONTROL_PROPORTIONAL_GAIN,
            Self::FLOW_CONTROL_INTEGRAL_GAIN,
            Self::FLOW_CONTROL_FORCE_GAIN,
            true,
            false,
            None,
            powered_by.map(|bus| {
                ElectroHydrostaticBackup::new(
                    bus,
                    ElectroHydrostaticActuatorType::ElectroHydrostaticActuator,
                )
            }),
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
        .with_flow_cut_off_pressure(Pressure::new::<psi>(
            A380HydraulicCircuitFactory::FLIGHT_CONTROL_SERVO_FLOW_CUT_OFF_PSI,
        ))
    }

    /// Builds an aileron control surface body for A380-800
    fn a380_elevator_body(
        init_drooped_down: bool,
        is_outer: bool,
    ) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = if is_outer {
            Vector3::new(9., 0.405, 2.23)
        } else {
            Vector3::new(5., 0.405, 2.49)
        };

        let mass = if is_outer {
            Mass::new::<kilogram>(243.)
        } else {
            Mass::new::<kilogram>(189.)
        };

        let cg_offset = Vector3::new(0., 0., -0.5 * size[2]);
        let aero_center = Vector3::new(0., 0., -0.3 * size[2]);

        let control_arm = Vector3::new(0., -0.154, 0.);
        let anchor = Vector3::new(0., -0.154, 0.41);

        let init_position = if init_drooped_down {
            Angle::new::<degree>(-20.)
        } else {
            Angle::new::<degree>(0.)
        };

        LinearActuatedRigidBodyOnHingeAxis::new(
            mass,
            size,
            cg_offset,
            aero_center,
            control_arm,
            anchor,
            Angle::new::<degree>(-20.),
            Angle::new::<degree>(50.),
            init_position,
            100.,
            false,
            Vector3::new(1., 0., 0.),
        )
    }

    /// Builds an aileron assembly consisting of the aileron physical rigid body and two hydraulic actuators connected
    /// to it
    fn a380_elevator_assembly(
        context: &mut InitContext,
        init_drooped_down: bool,
        powered_by: Option<ElectricalBusType>,
        is_outer: bool,
    ) -> HydraulicLinearActuatorAssembly<2> {
        let elevator_body = Self::a380_elevator_body(init_drooped_down, is_outer);

        let elevator_actuator_outboard =
            Self::a380_elevator_actuator(context, &elevator_body, None);
        let elevator_actuator_inbord =
            Self::a380_elevator_actuator(context, &elevator_body, powered_by);

        HydraulicLinearActuatorAssembly::new(
            [elevator_actuator_outboard, elevator_actuator_inbord],
            elevator_body,
        )
    }

    fn new_elevator(context: &mut InitContext, id: ActuatorSide) -> ElevatorAssembly {
        let init_drooped_down = !context.is_in_flight();

        let assembly_outward = Self::a380_elevator_assembly(
            context,
            init_drooped_down,
            if id == ActuatorSide::Left {
                Some(Self::LEFT_OUTWARD_PANEL_EHA_BUS)
            } else {
                Some(Self::RIGHT_OUTWARD_PANEL_EHA_BUS)
            },
            true,
        );
        let assembly_inward = Self::a380_elevator_assembly(
            context,
            init_drooped_down,
            if id == ActuatorSide::Left {
                Some(Self::LEFT_INWARD_PANEL_EHA_BUS)
            } else {
                Some(Self::RIGHT_INWARD_PANEL_EHA_BUS)
            },
            false,
        );
        ElevatorAssembly::new(
            context,
            id,
            assembly_outward,
            assembly_inward,
            Self::new_a380_elevator_aero_model(true),
            Self::new_a380_elevator_aero_model(false),
        )
    }

    fn new_a380_elevator_aero_model(is_outer: bool) -> AerodynamicModel {
        let body = Self::a380_elevator_body(true, is_outer);

        let area_coeff = if is_outer {
            Ratio::new::<ratio>(0.723)
        } else {
            Ratio::new::<ratio>(0.822)
        };

        AerodynamicModel::new(
            &body,
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(0., 1., 0.)),
            area_coeff,
        )
    }
}

struct A380RudderFactory {}
impl A380RudderFactory {
    const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 5.;
    const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 3.;
    const FLOW_CONTROL_FORCE_GAIN: f64 = 450000.;

    const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 1000000.;
    const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 10.;

    // 427XP - AC ESS = AlternatingCurrentEssentialShed on the A380
    const UPPER_AND_LOWER_PANEL_UPPER_EBHA_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrentEssentialShed;
    // 247XP - ACEHA
    const UPPER_PANEL_LOWER_EBHA_BUS: ElectricalBusType = AC_EHA_BUS;
    // 100XP1 - AC 1
    const LOWER_PANEL_LOWER_EBHA_BUS: ElectricalBusType = ElectricalBusType::AlternatingCurrent(1);

    fn a380_rudder_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
        powered_by: ElectricalBusType,
    ) -> LinearActuator {
        let actuator_characteristics = LinearActuatorCharacteristics::new(
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING / 4.,
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING,
            VolumeRate::new::<gallon_per_second>(0.25),
            Ratio::new::<percent>(Self::MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        // Rudder actuator real data:
        // Piston surface is 77.18cm^2, this gives a piston diameter of 0.099m.
        // Actuator maximum speed is 236.5 mm/s, this gives a maximum flow rate of
        // 0.001825 m^3/s = 0.4822 gal/s.
        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.099),
            Length::new::<meter>(0.),
            actuator_characteristics.max_flow(),
            80000.,
            1500.,
            10000.,
            actuator_characteristics.slow_damping(),
            Duration::from_millis(300),
            [1., 1., 1., 1., 1., 1.],
            [1., 1., 1., 1., 1., 1.],
            [0., 0.2, 0.21, 0.79, 0.8, 1.],
            Self::FLOW_CONTROL_PROPORTIONAL_GAIN,
            Self::FLOW_CONTROL_INTEGRAL_GAIN,
            Self::FLOW_CONTROL_FORCE_GAIN,
            true,
            false,
            None,
            Some(ElectroHydrostaticBackup::new(
                powered_by,
                ElectroHydrostaticActuatorType::ElectricalBackupHydraulicActuator,
            )),
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
        .with_flow_cut_off_pressure(Pressure::new::<psi>(
            A380HydraulicCircuitFactory::FLIGHT_CONTROL_SERVO_FLOW_CUT_OFF_PSI,
        ))
    }

    fn a380_rudder_body(
        init_at_center: bool,
        is_upper_body: bool,
    ) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = if is_upper_body {
            Vector3::new(0.5, 9.63, 2.9)
        } else {
            Vector3::new(0.5, 4.72, 3.41)
        };

        let mass = if is_upper_body {
            Mass::new::<kilogram>(357.)
        } else {
            Mass::new::<kilogram>(304.)
        };

        let cg_offset = Vector3::new(0., 0.5 * size[1], -0.5 * size[2]);
        let aero_center = Vector3::new(0., 0.5 * size[1], -0.3 * size[2]);

        let control_arm = Vector3::new(-0.18, 0., 0.);
        let anchor = Vector3::new(-0.18, 0., 0.850);

        let randomized_init_position_angle_degree = if init_at_center {
            0.
        } else {
            random_from_range(-15., 15.)
        };

        LinearActuatedRigidBodyOnHingeAxis::new(
            mass,
            size,
            cg_offset,
            aero_center,
            control_arm,
            anchor,
            Angle::new::<degree>(-30.),
            Angle::new::<degree>(60.),
            Angle::new::<degree>(randomized_init_position_angle_degree),
            100.,
            false,
            Vector3::new(0., 1., 0.),
        )
    }

    /// Builds an aileron assembly consisting of the aileron physical rigid body and two hydraulic actuators connected
    /// to it
    fn a380_rudder_assembly(
        context: &mut InitContext,
        init_at_center: bool,
        is_upper_body: bool,
        upper_powered_by: ElectricalBusType,
        lower_powered_by: ElectricalBusType,
    ) -> HydraulicLinearActuatorAssembly<2> {
        let rudder_body = Self::a380_rudder_body(init_at_center, is_upper_body);

        let rudder_actuator_upper =
            Self::a380_rudder_actuator(context, &rudder_body, upper_powered_by);
        let rudder_actuator_lower =
            Self::a380_rudder_actuator(context, &rudder_body, lower_powered_by);

        HydraulicLinearActuatorAssembly::new(
            [rudder_actuator_upper, rudder_actuator_lower],
            rudder_body,
        )
    }

    fn new_rudder(context: &mut InitContext) -> RudderAssembly {
        let init_at_center = context.start_state() == StartState::Taxi
            || context.start_state() == StartState::Runway
            || context.is_in_flight();

        let upper_assembly = Self::a380_rudder_assembly(
            context,
            init_at_center,
            true,
            Self::UPPER_AND_LOWER_PANEL_UPPER_EBHA_BUS,
            Self::UPPER_PANEL_LOWER_EBHA_BUS,
        );
        let lower_assembly = Self::a380_rudder_assembly(
            context,
            init_at_center,
            false,
            Self::UPPER_AND_LOWER_PANEL_UPPER_EBHA_BUS,
            Self::LOWER_PANEL_LOWER_EBHA_BUS,
        );
        RudderAssembly::new(
            context,
            upper_assembly,
            lower_assembly,
            Self::new_a380_rudder_aero_model(true),
            Self::new_a380_rudder_aero_model(false),
        )
    }

    fn new_a380_rudder_aero_model(is_upper_body: bool) -> AerodynamicModel {
        let body = Self::a380_rudder_body(true, is_upper_body);

        let coeff_area = if is_upper_body {
            Ratio::new::<ratio>(0.725)
        } else {
            Ratio::new::<ratio>(0.915)
        };

        AerodynamicModel::new(
            &body,
            Some(Vector3::new(1., 0., 0.)),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(1., 0., 0.)),
            coeff_area,
        )
    }
}

struct A380FlapsFactory {}
impl A380FlapsFactory {
    fn a380_flaps_factory(
        context: &mut InitContext,
        side: SecondarySurfaceSide,
    ) -> SecondarySurface {
        // 1 is most inboard. 3 is most outboard.
        SecondarySurface::new(context, side, SecondarySurfaceType::Flaps, 3)
    }
}

struct A380SlatsFactory {}
impl A380SlatsFactory {
    fn a380_slats_factory(
        context: &mut InitContext,
        side: SecondarySurfaceSide,
    ) -> SecondarySurface {
        // 1 is most inboard. 8 is most outboard.
        SecondarySurface::new(context, side, SecondarySurfaceType::Slats, 8)
    }
}

struct A380GearDoorFactory {}
impl A380GearDoorFactory {
    fn a380_nose_gear_door_aerodynamics() -> AerodynamicModel {
        // Faking the single door by only considering right door aerodynamics.
        // Will work with headwind, but will cause strange behaviour with massive crosswind.
        AerodynamicModel::new(
            &Self::a380_nose_gear_door_body(),
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., -0.2, 1.)),
            Some(Vector3::new(0., -1., -0.2)),
            Ratio::new::<ratio>(0.7),
        )
    }

    fn a380_left_gear_door_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a380_left_gear_door_body(),
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., -0.1, 1.)),
            Some(Vector3::new(0., 1., 0.1)),
            Ratio::new::<ratio>(0.7),
        )
    }

    fn a380_right_gear_door_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a380_right_gear_door_body(),
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., -0.1, 1.)),
            Some(Vector3::new(0., 1., 0.1)),
            Ratio::new::<ratio>(0.7),
        )
    }

    fn a380_nose_gear_door_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 5.;
        const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 0.15;
        const FLOW_CONTROL_FORCE_GAIN: f64 = 200000.;

        const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 28000.;
        const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 3.;

        let actuator_characteristics = LinearActuatorCharacteristics::new(
            MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING * 0.98,
            MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING * 1.02,
            VolumeRate::new::<gallon_per_second>(0.027),
            Ratio::new::<percent>(MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.0378),
            Length::new::<meter>(0.023),
            actuator_characteristics.max_flow(),
            20000.,
            5000.,
            2000.,
            actuator_characteristics.slow_damping(),
            Duration::from_millis(100),
            [1., 1., 1., 1., 0.5, 0.5],
            [0.5, 0.5, 1., 1., 1., 1.],
            [0., 0.15, 0.16, 0.84, 0.85, 1.],
            FLOW_CONTROL_PROPORTIONAL_GAIN,
            FLOW_CONTROL_INTEGRAL_GAIN,
            FLOW_CONTROL_FORCE_GAIN,
            true,
            false,
            None,
            None,
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    fn a380_main_gear_door_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 5.;
        const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 0.7;
        const FLOW_CONTROL_FORCE_GAIN: f64 = 200000.;

        const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 30000.;
        const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 5.;

        let actuator_characteristics = LinearActuatorCharacteristics::new(
            MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING * 0.98,
            MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING * 1.02,
            VolumeRate::new::<gallon_per_second>(0.09),
            Ratio::new::<percent>(MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.055),
            Length::new::<meter>(0.03),
            actuator_characteristics.max_flow(),
            200000.,
            2500.,
            2000.,
            actuator_characteristics.slow_damping(),
            Duration::from_millis(100),
            [1., 1., 1., 1., 0.5, 0.5],
            [0.5, 0.5, 1., 1., 1., 1.],
            [0., 0.07, 0.08, 0.9, 0.91, 1.],
            FLOW_CONTROL_PROPORTIONAL_GAIN,
            FLOW_CONTROL_INTEGRAL_GAIN,
            FLOW_CONTROL_FORCE_GAIN,
            true,
            false,
            None,
            None,
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    fn a380_left_gear_door_body() -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(-1.73, 0.02, 1.7);
        let cg_offset = Vector3::new(2. / 3. * size[0], 0.1, 0.);

        let control_arm = Vector3::new(-0.76, 0., 0.);
        let anchor = Vector3::new(-0.19, 0.23, 0.);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(50.),
            size,
            cg_offset,
            cg_offset,
            control_arm,
            anchor,
            Angle::new::<degree>(0.),
            Angle::new::<degree>(85.),
            Angle::new::<degree>(0.),
            150.,
            true,
            Vector3::new(0., 0., 1.),
        )
    }

    fn a380_right_gear_door_body() -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(1.73, 0.02, 1.7);
        let cg_offset = Vector3::new(2. / 3. * size[0], 0.1, 0.);

        let control_arm = Vector3::new(0.76, 0., 0.);
        let anchor = Vector3::new(0.19, 0.23, 0.);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(50.),
            size,
            cg_offset,
            cg_offset,
            control_arm,
            anchor,
            Angle::new::<degree>(-85.),
            Angle::new::<degree>(85.),
            Angle::new::<degree>(0.),
            150.,
            true,
            Vector3::new(0., 0., 1.),
        )
    }

    fn a380_nose_gear_door_body() -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(0.4, 0.02, 1.5);
        let cg_offset = Vector3::new(-0.5 * size[0], 0., 0.);

        let control_arm = Vector3::new(-0.1465, 0., 0.);
        let anchor = Vector3::new(-0.1465, 0.40, 0.);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(40.),
            size,
            cg_offset,
            cg_offset,
            control_arm,
            anchor,
            Angle::new::<degree>(0.),
            Angle::new::<degree>(85.),
            Angle::new::<degree>(0.),
            150.,
            true,
            Vector3::new(0., 0., 1.),
        )
    }

    fn a380_gear_door_assembly(
        context: &mut InitContext,
        wheel_id: GearWheel,
    ) -> HydraulicLinearActuatorAssembly<1> {
        let gear_door_body = match wheel_id {
            GearWheel::NOSE => Self::a380_nose_gear_door_body(),
            GearWheel::LEFT => Self::a380_left_gear_door_body(),
            GearWheel::RIGHT => Self::a380_right_gear_door_body(),
            GearWheel::WINGLEFT | GearWheel::WINGRIGHT => {
                panic!("TODO WING GEARS HYD NOT IMPLEMENTED YET ON 380")
            }
        };
        let gear_door_actuator = match wheel_id {
            GearWheel::NOSE => Self::a380_nose_gear_door_actuator(context, &gear_door_body),
            GearWheel::LEFT | GearWheel::RIGHT => {
                Self::a380_main_gear_door_actuator(context, &gear_door_body)
            }
            GearWheel::WINGLEFT | GearWheel::WINGRIGHT => {
                panic!("TODO WING GEARS HYD NOT IMPLEMENTED YET ON 380")
            }
        };

        HydraulicLinearActuatorAssembly::new([gear_door_actuator], gear_door_body)
    }
}

struct A380GearFactory {}
impl A380GearFactory {
    fn a380_nose_gear_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a380_nose_gear_body(true),
            Some(Vector3::new(0., 0., 1.)),
            None,
            None,
            Ratio::new::<ratio>(0.25),
        )
    }

    fn a380_right_gear_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a380_right_gear_body(true),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(0.3, 0., 1.)),
            Some(Vector3::new(1., 0., -0.3)),
            Ratio::new::<ratio>(0.7),
        )
    }

    fn a380_left_gear_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a380_left_gear_body(true),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(-0.3, 0., 1.)),
            Some(Vector3::new(-1., 0., -0.3)),
            Ratio::new::<ratio>(0.7),
        )
    }

    fn a380_nose_gear_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 5.;
        const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 0.3;
        const FLOW_CONTROL_FORCE_GAIN: f64 = 250000.;

        const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 900000.;
        const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 3.;

        let actuator_characteristics = LinearActuatorCharacteristics::new(
            MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING * 0.98,
            MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING * 1.02,
            VolumeRate::new::<gallon_per_second>(0.053),
            Ratio::new::<percent>(MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.0792),
            Length::new::<meter>(0.035),
            actuator_characteristics.max_flow(),
            800000.,
            150000.,
            50000.,
            actuator_characteristics.slow_damping(),
            Duration::from_millis(100),
            [1., 1., 1., 1., 0.5, 0.5],
            [0.5, 0.5, 1., 1., 1., 1.],
            [0., 0.1, 0.11, 0.89, 0.9, 1.],
            FLOW_CONTROL_PROPORTIONAL_GAIN,
            FLOW_CONTROL_INTEGRAL_GAIN,
            FLOW_CONTROL_FORCE_GAIN,
            true,
            false,
            None,
            None,
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    fn a380_main_gear_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 5.0;
        const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 0.3;
        const FLOW_CONTROL_FORCE_GAIN: f64 = 250000.;

        const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 2500000.;
        const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 5.;

        let actuator_characteristics = LinearActuatorCharacteristics::new(
            MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING * 0.98,
            MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING * 1.02,
            VolumeRate::new::<gallon_per_second>(0.17),
            Ratio::new::<percent>(MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.145),
            Length::new::<meter>(0.105),
            actuator_characteristics.max_flow(),
            800000.,
            350000.,
            50000.,
            actuator_characteristics.slow_damping(),
            Duration::from_millis(100),
            [1., 1., 1., 1., 0.5, 0.5],
            [0.2, 0.4, 1., 1., 1., 1.],
            [0., 0.13, 0.17, 0.95, 0.96, 1.],
            FLOW_CONTROL_PROPORTIONAL_GAIN,
            FLOW_CONTROL_INTEGRAL_GAIN,
            FLOW_CONTROL_FORCE_GAIN,
            true,
            false,
            None,
            None,
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    fn a380_left_gear_body(init_downlocked: bool) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(0.3, 3.453, 0.3);
        let cg_offset = Vector3::new(0., -3. / 4. * size[1], 0.);

        let control_arm = Vector3::new(0.1815, 0.15, 0.);
        let anchor = Vector3::new(0.26, 0.15, 0.);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(700.),
            size,
            cg_offset,
            cg_offset,
            control_arm,
            anchor,
            Angle::new::<degree>(0.),
            Angle::new::<degree>(80.),
            if init_downlocked {
                Angle::new::<degree>(0.)
            } else {
                Angle::new::<degree>(80.)
            },
            150.,
            true,
            Vector3::new(0., 0., 1.),
        )
    }

    fn a380_right_gear_body(init_downlocked: bool) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(0.3, 3.453, 0.3);
        let cg_offset = Vector3::new(0., -3. / 4. * size[1], 0.);

        let control_arm = Vector3::new(-0.1815, 0.15, 0.);
        let anchor = Vector3::new(-0.26, 0.15, 0.);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(700.),
            size,
            cg_offset,
            cg_offset,
            control_arm,
            anchor,
            Angle::new::<degree>(-80.),
            Angle::new::<degree>(80.),
            if init_downlocked {
                Angle::new::<degree>(0.)
            } else {
                Angle::new::<degree>(-80.)
            },
            150.,
            true,
            Vector3::new(0., 0., 1.),
        )
    }

    fn a380_nose_gear_body(init_downlocked: bool) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(0.3, 2.453, 0.3);
        let cg_offset = Vector3::new(0., -2. / 3. * size[1], 0.);

        let control_arm = Vector3::new(0., -0.093, 0.212);
        let anchor = Vector3::new(0., 0.56, 0.);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(300.),
            size,
            cg_offset,
            cg_offset,
            control_arm,
            anchor,
            Angle::new::<degree>(-101.),
            Angle::new::<degree>(92.),
            if init_downlocked {
                Angle::new::<degree>(-9.)
            } else {
                Angle::new::<degree>(-101.)
            },
            150.,
            true,
            Vector3::new(1., 0., 0.),
        )
    }

    fn a380_gear_assembly(
        context: &mut InitContext,
        wheel_id: GearWheel,
        init_downlocked: bool,
    ) -> HydraulicLinearActuatorAssembly<1> {
        let gear_body = match wheel_id {
            GearWheel::NOSE => Self::a380_nose_gear_body(init_downlocked),

            GearWheel::LEFT => Self::a380_left_gear_body(init_downlocked),

            GearWheel::RIGHT => Self::a380_right_gear_body(init_downlocked),

            GearWheel::WINGLEFT | GearWheel::WINGRIGHT => {
                panic!("TODO WING GEARS HYD NOT IMPLEMENTED YET ON 380")
            }
        };

        let gear_actuator = match wheel_id {
            GearWheel::NOSE => Self::a380_nose_gear_actuator(context, &gear_body),

            GearWheel::LEFT | GearWheel::RIGHT => {
                Self::a380_main_gear_actuator(context, &gear_body)
            }

            GearWheel::WINGLEFT | GearWheel::WINGRIGHT => {
                panic!("TODO WING GEARS HYD NOT IMPLEMENTED YET ON 380")
            }
        };

        HydraulicLinearActuatorAssembly::new([gear_actuator], gear_body)
    }
}

struct A380GearSystemFactory {}
impl A380GearSystemFactory {
    fn a380_gear_system(context: &mut InitContext) -> HydraulicGearSystem {
        let init_downlocked = context.start_gear_down();

        let nose_door = A380GearDoorFactory::a380_gear_door_assembly(context, GearWheel::NOSE);
        let left_door = A380GearDoorFactory::a380_gear_door_assembly(context, GearWheel::LEFT);
        let right_door = A380GearDoorFactory::a380_gear_door_assembly(context, GearWheel::RIGHT);

        let nose_gear =
            A380GearFactory::a380_gear_assembly(context, GearWheel::NOSE, init_downlocked);
        let left_gear =
            A380GearFactory::a380_gear_assembly(context, GearWheel::LEFT, init_downlocked);
        let right_gear =
            A380GearFactory::a380_gear_assembly(context, GearWheel::RIGHT, init_downlocked);

        HydraulicGearSystem::new(
            context,
            nose_door,
            left_door,
            right_door,
            nose_gear,
            left_gear,
            right_gear,
            A380GearDoorFactory::a380_left_gear_door_aerodynamics(),
            A380GearDoorFactory::a380_right_gear_door_aerodynamics(),
            A380GearDoorFactory::a380_nose_gear_door_aerodynamics(),
            A380GearFactory::a380_left_gear_aerodynamics(),
            A380GearFactory::a380_right_gear_aerodynamics(),
            A380GearFactory::a380_nose_gear_aerodynamics(),
        )
        // The main gears are not on the nose gear supply (GREEN): see A380HydraulicCircuitsSupplyOfMainGears
        .with_separate_main_gear_supply()
    }
}

/// Hydraulic supply of the main gear assemblies of the model: GREEN extends and retracts the NLG and the WLG and
/// operates their doors, YELLOW the BLG and its doors.
///
/// Simplification: the model has one left and one right main gear assembly, each standing for the wing and the body
/// gear of that side (the wing gears are animated with them), and one door assembly per side (the BLG doors). Each main
/// assembly therefore needs GREEN (WLG) and YELLOW (BLG): it gets the lower of the two pressures, and takes half of its
/// fluid from each system. This gives the aircraft's results:
/// - YELLOW lost: the BLG and the WLG remain extended and the BLG doors closed, even with GREEN available.
/// - YELLOW or GREEN lost: the landing gear extends by gravity.
/// - GREEN lost: the NLG and the WLG remain extended.
///
/// Not modelled: with GREEN lost the BLG retracts, with YELLOW lost the NLG retracts (the common LGCIU moves the gears
/// only when all the doors are open).
struct A380HydraulicCircuitsSupplyOfMainGears;
impl A380HydraulicCircuitsSupplyOfMainGears {
    /// Share of the main gear assembly fluid that each of GREEN (WLG) and YELLOW (BLG) gives
    const FLUID_SHARE_PER_CIRCUIT: f64 = 0.5;

    fn pressure(
        green_section: &impl SectionPressure,
        yellow_section: &impl SectionPressure,
    ) -> Pressure {
        green_section
            .pressure_downstream_priority_valve()
            .min(yellow_section.pressure_downstream_priority_valve())
    }
}

/// Gives a share of the fluid moved by an actuator to one hydraulic circuit. The last share resets the actuator volumes.
struct ActuatorFluidShare<'a, T: Actuator> {
    actuator: &'a mut T,
    share: f64,
    is_last_share: bool,
}
impl<T: Actuator> Actuator for ActuatorFluidShare<'_, T> {
    fn used_volume(&self) -> Volume {
        self.actuator.used_volume() * self.share
    }

    fn reservoir_return(&self) -> Volume {
        self.actuator.reservoir_return() * self.share
    }

    fn reset_volumes(&mut self) {
        if self.is_last_share {
            self.actuator.reset_volumes();
        }
    }
}

// FIXME Placeholder logic to remove when eha inhibit is handled on flight computer side
struct A380EhaInhibitPlaceholder {
    general_eng_1_starter_active_id: VariableIdentifier,
    general_eng_2_starter_active_id: VariableIdentifier,
    general_eng_3_starter_active_id: VariableIdentifier,
    general_eng_4_starter_active_id: VariableIdentifier,

    any_engine_master_on: bool,
    elec_backup_allowed: bool,

    on_ground_delay: DelayedTrueLogicGate,
}
impl A380EhaInhibitPlaceholder {
    fn new(context: &mut InitContext) -> Self {
        Self {
            general_eng_1_starter_active_id: context
                .get_identifier("GENERAL ENG STARTER ACTIVE:1".to_owned()),
            general_eng_2_starter_active_id: context
                .get_identifier("GENERAL ENG STARTER ACTIVE:2".to_owned()),
            general_eng_3_starter_active_id: context
                .get_identifier("GENERAL ENG STARTER ACTIVE:3".to_owned()),
            general_eng_4_starter_active_id: context
                .get_identifier("GENERAL ENG STARTER ACTIVE:4".to_owned()),

            any_engine_master_on: false,
            elec_backup_allowed: false,

            on_ground_delay: DelayedTrueLogicGate::new(Duration::from_secs(120)).starting_as(true),
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        lgciu1: &impl LgciuWeightOnWheels,
        lgciu2: &impl LgciuWeightOnWheels,
    ) {
        let is_on_ground = lgciu1.left_and_right_gear_compressed(true)
            || lgciu2.left_and_right_gear_compressed(true);

        self.on_ground_delay.update(context, is_on_ground);

        self.elec_backup_allowed = !self.on_ground_delay.output() || self.any_engine_master_on;
    }

    fn is_allowed(&self) -> bool {
        self.elec_backup_allowed
    }
}
impl SimulationElement for A380EhaInhibitPlaceholder {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.any_engine_master_on = reader.read(&self.general_eng_1_starter_active_id)
            || reader.read(&self.general_eng_2_starter_active_id)
            || reader.read(&self.general_eng_3_starter_active_id)
            || reader.read(&self.general_eng_4_starter_active_id);
    }
}

pub(super) struct A380Hydraulic {
    eha_backup_inhibit_logic: A380EhaInhibitPlaceholder,
    flight_control_actuator_failures: A380FlightControlActuatorFailures,
    nose_steering: SteeringActuator,
    /// GREEN in normal NWS, the steering LEHGS in alternate NWS
    nose_wheel_steering_supply: NoseWheelSteeringSupply,
    body_wheel_steering_left: SteeringActuator,
    body_wheel_steering_right: SteeringActuator,

    core_hydraulic_updater: MaxStepLoop,

    brake_steer_computer: A380HydraulicBrakeSteerComputerUnit,

    green_circuit: HydraulicCircuit,
    green_circuit_controller: A380HydraulicCircuitController,
    yellow_circuit: HydraulicCircuit,
    yellow_circuit_controller: A380HydraulicCircuitController,

    engine_driven_pump_1a: EngineDrivenPump,
    engine_driven_pump_1a_controller: A380EngineDrivenPumpController,

    engine_driven_pump_2a: EngineDrivenPump,
    engine_driven_pump_2a_controller: A380EngineDrivenPumpController,

    engine_driven_pump_3a: EngineDrivenPump,
    engine_driven_pump_3a_controller: A380EngineDrivenPumpController,

    engine_driven_pump_4a: EngineDrivenPump,
    engine_driven_pump_4a_controller: A380EngineDrivenPumpController,

    engine_driven_pump_1b: EngineDrivenPump,
    engine_driven_pump_1b_controller: A380EngineDrivenPumpController,

    engine_driven_pump_2b: EngineDrivenPump,
    engine_driven_pump_2b_controller: A380EngineDrivenPumpController,

    engine_driven_pump_3b: EngineDrivenPump,
    engine_driven_pump_3b_controller: A380EngineDrivenPumpController,

    engine_driven_pump_4b: EngineDrivenPump,
    engine_driven_pump_4b_controller: A380EngineDrivenPumpController,

    yellow_electric_pump_a: ElectricPump,
    yellow_electric_pump_a_controller: A380ElectricPumpController,

    yellow_electric_pump_b: ElectricPump,
    yellow_electric_pump_b_controller: A380ElectricPumpController,

    green_electric_pump_a: ElectricPump,
    green_electric_pump_a_controller: A380ElectricPumpController,

    green_electric_pump_b: ElectricPump,
    green_electric_pump_b_controller: A380ElectricPumpController,

    green_auxiliary_pump: ManualPump,
    green_electric_aux_pump_controller: A380AuxiliaryPumpController,

    pushback_tug: PushbackTug,
    bypass_pin: BypassPin,

    braking_circuit_norm: BrakeCircuit,
    braking_circuit_altn: BrakeCircuit,
    braking_force: A380BrakingForce,

    flap_system: FlapSlatAssembly,
    slat_system: FlapSlatAssembly,
    slats_flaps_complex: SlatFlapComplex,

    forward_cargo_door: CargoDoor,
    forward_cargo_door_controller: HydraulicDoorController,
    aft_cargo_door: CargoDoor,
    aft_cargo_door_controller: HydraulicDoorController,
    cargo_door_operation_inhibition: A380CargoDoorOperationInhibition,

    elevator_system_controller: ElevatorSystemHydraulicController,
    aileron_system_controller: AileronSystemHydraulicController,

    left_aileron: AileronAssembly,
    right_aileron: AileronAssembly,
    left_elevator: ElevatorAssembly,
    right_elevator: ElevatorAssembly,

    rudder_system_controller: RudderSystemHydraulicController,
    rudder: RudderAssembly,

    left_spoilers: SpoilerGroup,
    right_spoilers: SpoilerGroup,

    gear_system_gravity_extension_controller: A380GravityExtension,
    gear_system_hydraulic_controller: A380GearHydraulicController,
    gear_system: HydraulicGearSystem,
    brake_properties: BrakeProperties,
    left_wing_brake_assembly: BrakeAssembly<4>,
    right_wing_brake_assembly: BrakeAssembly<4>,
    left_body_brake_assembly: BrakeAssembly<4>,
    right_body_brake_assembly: BrakeAssembly<4>,

    // FIXME: remove when CPIOM G is implemented
    brake_temperature_ids: [VariableIdentifier; 16],

    ths_system_controller: TrimmableHorizontalStabilizerSystemHydraulicController,
    ths: TrimmableHorizontalStabilizerActuator,

    epump_auto_logic: A380ElectricPumpAutoLogic,

    tilting_gears: A380TiltingGears,
    aux_gear_doors: A380AuxiliaryGearDoorSet,
    gear_steering_monitoring: A380GearSteeringMonitoring,
}
impl A380Hydraulic {
    const FLAP_FPPU_TO_SURFACE_ANGLE_BREAKPTS: [f64; 12] = [
        0., 122.2, 215.68, 259.28, 279.84, 297.59, 338.99, 338.99, 338.99, 338.99, 338.99, 338.99,
    ];
    const FLAP_FPPU_TO_SURFACE_ANGLE_DEGREES: [f64; 12] =
        [0., 0., 8., 17., 22., 26., 33., 33., 33., 33., 33., 33.];

    const SLAT_FPPU_TO_SURFACE_ANGLE_BREAKPTS: [f64; 12] = [
        0., 286.48, 327.39, 327.39, 327.39, 327.39, 327.39, 327.39, 327.39, 327.39, 327.39, 327.39,
    ];
    const SLAT_FPPU_TO_SURFACE_ANGLE_DEGREES: [f64; 12] =
        [0., 20., 23., 23., 23., 23., 23., 23., 23., 23., 23., 23.];

    const FORWARD_CARGO_DOOR_ID: &'static str = "FWD";
    const AFT_CARGO_DOOR_ID: &'static str = "AFT";

    const ELECTRIC_PUMP_MAX_CURRENT_AMPERE: f64 = 75.;

    const GREEN_ELEC_PUMP_CONTROL_POWER_BUS: ElectricalBusType =
        ElectricalBusType::DirectCurrent(2);
    const YELLOW_ELEC_PUMP_CONTROL_POWER_BUS: ElectricalBusType =
        ElectricalBusType::DirectCurrent(1);

    const GREEN_A_ELEC_PUMP_SUPPLY_POWER_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrent(1);
    const GREEN_B_ELEC_PUMP_SUPPLY_POWER_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrent(2);
    const YELLOW_A_ELEC_PUMP_SUPPLY_POWER_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrent(3);
    const YELLOW_B_ELEC_PUMP_SUPPLY_POWER_BUS: ElectricalBusType =
        ElectricalBusType::AlternatingCurrent(4);

    const EDP_CONTROL_POWER_BUS1: ElectricalBusType = ElectricalBusType::DirectCurrentEssential;

    /// Nitrogen pre-charge of the ALTN brake accumulator, psi. Design choice (no published value): the pre-charge of
    /// the hydraulic system accumulators of this model (A380HydraulicCircuitFactory, 2 612 psi) instead of the A320
    /// 1 000 psi of a 3 000 psi system: from a charged accumulator one park brake application reaches the full
    /// pressure of about 3 600 psi and leaves the accumulator out of the amber arc of the triple pressure indicator
    /// (0-3 840 psi); with 1 000 psi the brakes stopped near 3 100 psi.
    const ALTERNATE_BRAKE_ACCUMULATOR_GAS_PRE_CHARGE: f64 = 2612.0;

    /// Full brake pressure, about 3 600 psi (park brake and ultimate braking); alternate braking performs as normal
    /// braking. The brakes of both circuits reach it at their full deflection.
    const FULL_BRAKE_PRESSURE_PSI: f64 = 3600.0;

    // Refresh rate of core hydraulic simulation
    const HYDRAULIC_SIM_TIME_STEP: Duration = Duration::from_millis(10);

    pub fn new(context: &mut InitContext) -> A380Hydraulic {
        let brake_accumulator_charac = BrakeAccumulatorCharacteristics::new(
            Volume::new::<gallon>(1.0),
            Pressure::new::<psi>(Self::ALTERNATE_BRAKE_ACCUMULATOR_GAS_PRE_CHARGE),
            Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
            Ratio::new::<ratio>(0.01),
        );

        let left_flaps = A380FlapsFactory::a380_flaps_factory(context, SecondarySurfaceSide::Left);
        let right_flaps =
            A380FlapsFactory::a380_flaps_factory(context, SecondarySurfaceSide::Right);
        let left_slats = A380SlatsFactory::a380_slats_factory(context, SecondarySurfaceSide::Left);
        let right_slats =
            A380SlatsFactory::a380_slats_factory(context, SecondarySurfaceSide::Right);

        A380Hydraulic {
            eha_backup_inhibit_logic: A380EhaInhibitPlaceholder::new(context),
            flight_control_actuator_failures: A380FlightControlActuatorFailures::new(context),
            nose_steering: SteeringActuator::new(
                context,
                "NOSE_WHEEL",
                Angle::new::<degree>(75.),
                AngularVelocity::new::<degree_per_second>(15.), // Reference is 15 deg/s
                Length::new::<meter>(0.11), // Diameter of 0.11 gives correct A380 flow of around 35 lpm at full speed
                Ratio::new::<ratio>(0.18),
                Pressure::new::<psi>(4000.),
                true,
            ),
            nose_wheel_steering_supply: NoseWheelSteeringSupply::new(),

            body_wheel_steering_left: SteeringActuator::new(
                context,
                "LEFT_BODY_STEERING",
                Angle::new::<degree>(15.),
                AngularVelocity::new::<degree_per_second>(4.5), // Reference is 4.5 deg/s
                Length::new::<meter>(0.11),                     // TODO
                Ratio::new::<ratio>(0.18),                      // TODO
                Pressure::new::<psi>(4000.),
                false,
            ),

            body_wheel_steering_right: SteeringActuator::new(
                context,
                "RIGHT_BODY_STEERING",
                Angle::new::<degree>(15.),
                AngularVelocity::new::<degree_per_second>(4.5), // Reference is 4.5 deg/s
                Length::new::<meter>(0.11),                     // TODO
                Ratio::new::<ratio>(0.18),                      // TODO
                Pressure::new::<psi>(4000.),
                false,
            ),

            core_hydraulic_updater: MaxStepLoop::new(Self::HYDRAULIC_SIM_TIME_STEP),

            brake_steer_computer: A380HydraulicBrakeSteerComputerUnit::new(context),

            green_circuit: A380HydraulicCircuitFactory::new_green_circuit(context),
            green_circuit_controller: A380HydraulicCircuitController::new(HydraulicColor::Green),
            yellow_circuit: A380HydraulicCircuitFactory::new_yellow_circuit(context),
            yellow_circuit_controller: A380HydraulicCircuitController::new(HydraulicColor::Yellow),

            engine_driven_pump_1a: EngineDrivenPump::new(
                context,
                AirbusEngineDrivenPumpId::Edp1a,
                PumpCharacteristics::a380_edp(),
            ),
            engine_driven_pump_1a_controller: A380EngineDrivenPumpController::new(
                context,
                A380EngineDrivenPumpId::Edp1a,
                vec![Self::EDP_CONTROL_POWER_BUS1],
            ),

            engine_driven_pump_2a: EngineDrivenPump::new(
                context,
                AirbusEngineDrivenPumpId::Edp2a,
                PumpCharacteristics::a380_edp(),
            ),
            engine_driven_pump_2a_controller: A380EngineDrivenPumpController::new(
                context,
                A380EngineDrivenPumpId::Edp2a,
                vec![Self::EDP_CONTROL_POWER_BUS1],
            ),

            engine_driven_pump_3a: EngineDrivenPump::new(
                context,
                AirbusEngineDrivenPumpId::Edp3a,
                PumpCharacteristics::a380_edp(),
            ),
            engine_driven_pump_3a_controller: A380EngineDrivenPumpController::new(
                context,
                A380EngineDrivenPumpId::Edp3a,
                vec![Self::EDP_CONTROL_POWER_BUS1],
            ),

            engine_driven_pump_4a: EngineDrivenPump::new(
                context,
                AirbusEngineDrivenPumpId::Edp4a,
                PumpCharacteristics::a380_edp(),
            ),
            engine_driven_pump_4a_controller: A380EngineDrivenPumpController::new(
                context,
                A380EngineDrivenPumpId::Edp4a,
                vec![Self::EDP_CONTROL_POWER_BUS1],
            ),

            engine_driven_pump_1b: EngineDrivenPump::new(
                context,
                AirbusEngineDrivenPumpId::Edp1b,
                PumpCharacteristics::a380_edp(),
            ),
            engine_driven_pump_1b_controller: A380EngineDrivenPumpController::new(
                context,
                A380EngineDrivenPumpId::Edp1b,
                vec![Self::EDP_CONTROL_POWER_BUS1],
            ),

            engine_driven_pump_2b: EngineDrivenPump::new(
                context,
                AirbusEngineDrivenPumpId::Edp2b,
                PumpCharacteristics::a380_edp(),
            ),
            engine_driven_pump_2b_controller: A380EngineDrivenPumpController::new(
                context,
                A380EngineDrivenPumpId::Edp2b,
                vec![Self::EDP_CONTROL_POWER_BUS1],
            ),

            engine_driven_pump_3b: EngineDrivenPump::new(
                context,
                AirbusEngineDrivenPumpId::Edp3b,
                PumpCharacteristics::a380_edp(),
            ),
            engine_driven_pump_3b_controller: A380EngineDrivenPumpController::new(
                context,
                A380EngineDrivenPumpId::Edp3b,
                vec![Self::EDP_CONTROL_POWER_BUS1],
            ),

            engine_driven_pump_4b: EngineDrivenPump::new(
                context,
                AirbusEngineDrivenPumpId::Edp4b,
                PumpCharacteristics::a380_edp(),
            ),
            engine_driven_pump_4b_controller: A380EngineDrivenPumpController::new(
                context,
                A380EngineDrivenPumpId::Edp4b,
                vec![Self::EDP_CONTROL_POWER_BUS1],
            ),

            yellow_electric_pump_a: ElectricPump::new(
                context,
                AirbusElectricPumpId::YellowA,
                Self::YELLOW_A_ELEC_PUMP_SUPPLY_POWER_BUS,
                ElectricCurrent::new::<ampere>(Self::ELECTRIC_PUMP_MAX_CURRENT_AMPERE),
                PumpCharacteristics::a380_electric_pump(),
            ),
            yellow_electric_pump_a_controller: A380ElectricPumpController::new(
                context,
                A380ElectricPumpId::YellowA,
                Self::YELLOW_ELEC_PUMP_CONTROL_POWER_BUS,
            ),

            yellow_electric_pump_b: ElectricPump::new(
                context,
                AirbusElectricPumpId::YellowB,
                Self::YELLOW_B_ELEC_PUMP_SUPPLY_POWER_BUS,
                ElectricCurrent::new::<ampere>(Self::ELECTRIC_PUMP_MAX_CURRENT_AMPERE),
                PumpCharacteristics::a380_electric_pump(),
            ),
            yellow_electric_pump_b_controller: A380ElectricPumpController::new(
                context,
                A380ElectricPumpId::YellowB,
                Self::YELLOW_ELEC_PUMP_CONTROL_POWER_BUS,
            ),

            green_electric_pump_a: ElectricPump::new(
                context,
                AirbusElectricPumpId::GreenA,
                Self::GREEN_A_ELEC_PUMP_SUPPLY_POWER_BUS,
                ElectricCurrent::new::<ampere>(Self::ELECTRIC_PUMP_MAX_CURRENT_AMPERE),
                PumpCharacteristics::a380_electric_pump(),
            ),
            green_electric_pump_a_controller: A380ElectricPumpController::new(
                context,
                A380ElectricPumpId::GreenA,
                Self::GREEN_ELEC_PUMP_CONTROL_POWER_BUS,
            ),

            green_electric_pump_b: ElectricPump::new(
                context,
                AirbusElectricPumpId::GreenB,
                Self::GREEN_B_ELEC_PUMP_SUPPLY_POWER_BUS,
                ElectricCurrent::new::<ampere>(Self::ELECTRIC_PUMP_MAX_CURRENT_AMPERE),
                PumpCharacteristics::a380_electric_pump(),
            ),
            green_electric_pump_b_controller: A380ElectricPumpController::new(
                context,
                A380ElectricPumpId::GreenB,
                Self::GREEN_ELEC_PUMP_CONTROL_POWER_BUS,
            ),

            green_auxiliary_pump: ManualPump::new(PumpCharacteristics::a380_aux_pump()),
            green_electric_aux_pump_controller: A380AuxiliaryPumpController::new(
                A380ElectricPumpId::GreenAuxiliary,
            ),

            pushback_tug: PushbackTug::new(context),
            bypass_pin: BypassPin::new(context),

            braking_circuit_norm: BrakeCircuit::new_with_max_brake_pressure(
                context,
                "NORM",
                HydraulicColor::Green,
                None,
                Volume::new::<gallon>(0.13),
                Pressure::new::<psi>(Self::FULL_BRAKE_PRESSURE_PSI),
            ),

            // Alternate brakes accumulator in real A320 is 1.5 gal capacity.
            // This is tuned down to 1.0 to match real world accumulator filling time
            // as a faster accumulator response has too much unstability
            braking_circuit_altn: BrakeCircuit::new_with_max_brake_pressure(
                context,
                "ALTN",
                HydraulicColor::Yellow,
                Some(Accumulator::new_brake_accumulator(brake_accumulator_charac)),
                Volume::new::<gallon>(0.13),
                Pressure::new::<psi>(Self::FULL_BRAKE_PRESSURE_PSI),
            ),

            braking_force: A380BrakingForce::new(context),

            flap_system: FlapSlatAssembly::new(
                context,
                SecondarySurfaceType::Flaps,
                left_flaps,
                right_flaps,
                Volume::new::<cubic_inch>(0.32),
                AngularVelocity::new::<radian_per_second>(0.07),
                Ratio::new::<ratio>(140.),
                Ratio::new::<ratio>(16.632),
                Ratio::new::<ratio>(314.98),
                Self::FLAP_FPPU_TO_SURFACE_ANGLE_BREAKPTS,
                Self::FLAP_FPPU_TO_SURFACE_ANGLE_DEGREES,
                Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
            ),
            slat_system: FlapSlatAssembly::new(
                context,
                SecondarySurfaceType::Slats,
                left_slats,
                right_slats,
                Volume::new::<cubic_inch>(0.32),
                AngularVelocity::new::<radian_per_second>(0.08),
                Ratio::new::<ratio>(140.),
                Ratio::new::<ratio>(16.632),
                Ratio::new::<ratio>(314.98),
                Self::SLAT_FPPU_TO_SURFACE_ANGLE_BREAKPTS,
                Self::SLAT_FPPU_TO_SURFACE_ANGLE_DEGREES,
                Pressure::new::<psi>(A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
            ),
            slats_flaps_complex: SlatFlapComplex::new(context),

            forward_cargo_door: A380CargoDoorFactory::new_a380_cargo_door(
                context,
                Self::FORWARD_CARGO_DOOR_ID,
            ),
            forward_cargo_door_controller: HydraulicDoorController::new(
                context,
                Self::FORWARD_CARGO_DOOR_ID,
            ),

            aft_cargo_door: A380CargoDoorFactory::new_a380_cargo_door(
                context,
                Self::AFT_CARGO_DOOR_ID,
            ),
            aft_cargo_door_controller: HydraulicDoorController::new(
                context,
                Self::AFT_CARGO_DOOR_ID,
            ),
            cargo_door_operation_inhibition: A380CargoDoorOperationInhibition::new(context),

            elevator_system_controller: ElevatorSystemHydraulicController::new(context),
            aileron_system_controller: AileronSystemHydraulicController::new(context),

            left_aileron: A380AileronFactory::new_aileron(context, ActuatorSide::Left),
            right_aileron: A380AileronFactory::new_aileron(context, ActuatorSide::Right),
            left_elevator: A380ElevatorFactory::new_elevator(context, ActuatorSide::Left),
            right_elevator: A380ElevatorFactory::new_elevator(context, ActuatorSide::Right),

            rudder_system_controller: RudderSystemHydraulicController::new(context),
            rudder: A380RudderFactory::new_rudder(context),

            left_spoilers: A380SpoilerFactory::new_a380_spoiler_group(context, ActuatorSide::Left),
            right_spoilers: A380SpoilerFactory::new_a380_spoiler_group(
                context,
                ActuatorSide::Right,
            ),

            gear_system_gravity_extension_controller: A380GravityExtension::new(context),
            gear_system_hydraulic_controller: A380GearHydraulicController::new(),
            gear_system: A380GearSystemFactory::a380_gear_system(context),
            brake_properties: BrakeProperties::new(
                // TODO: find more accurate numbers
                Length::new::<inch>(26.),
                Length::new::<inch>(20.),
                Mass::new::<kilogram>(110.),
            ),
            left_wing_brake_assembly: BrakeAssembly::new(
                context,
                "WHEEL RPM:1".to_owned(), // Should be "WHEEL RPM:3" but MSFS has weird definitions...
                [1, 2, 5, 6],
                [ElectricalBusType::DirectCurrent(1); 4], // TODO
                None,
            ),
            right_wing_brake_assembly: BrakeAssembly::new(
                context,
                "WHEEL RPM:2".to_owned(), // Should be "WHEEL RPM:4" but MSFS has weird definitions...
                [3, 4, 7, 8],
                [ElectricalBusType::DirectCurrent(1); 4], // TODO
                None,
            ),
            left_body_brake_assembly: BrakeAssembly::new(
                context,
                "WHEEL RPM:1".to_owned(),
                [9, 10, 13, 14],
                [ElectricalBusType::DirectCurrent(1); 4], // TODO
                None,
            ),
            right_body_brake_assembly: BrakeAssembly::new(
                context,
                "WHEEL RPM:2".to_owned(),
                [11, 12, 15, 16],
                [ElectricalBusType::DirectCurrent(1); 4], // TODO
                None,
            ),

            brake_temperature_ids: (1..=16)
                .map(|index| context.get_identifier(format!("REPORTED_BRAKE_TEMPERATURE_{index}")))
                .collect::<Vec<_>>()
                .try_into()
                .unwrap(),
            ths_system_controller: TrimmableHorizontalStabilizerSystemHydraulicController::new(
                context,
            ),
            ths: TrimmableHorizontalStabilizerActuator::new(
                context,
                Angle::new::<degree>(-2.),
                Angle::new::<degree>(12.),
                AngularVelocity::new::<revolution_per_minute>(5000.),
                Pressure::new::<psi>(5000.),
                Volume::new::<cubic_inch>(0.4), // This value is just copied from the A320s THS. No idea about the real value
                0.00005,
            ),

            epump_auto_logic: A380ElectricPumpAutoLogic::new(
                Self::GREEN_A_ELEC_PUMP_SUPPLY_POWER_BUS,
                Self::GREEN_B_ELEC_PUMP_SUPPLY_POWER_BUS,
                Self::YELLOW_A_ELEC_PUMP_SUPPLY_POWER_BUS,
                Self::YELLOW_B_ELEC_PUMP_SUPPLY_POWER_BUS,
            ),

            tilting_gears: A380TiltingGearsFactory::new_a380_tilt_assembly(context),

            aux_gear_doors: A380AuxiliaryGearDoorSet::new(context),
            gear_steering_monitoring: A380GearSteeringMonitoring::new(context),
        }
    }

    pub(super) fn update(
        &mut self,
        context: &UpdateContext,
        engines: [&impl Engine; 4],
        overhead_panel: &A380HydraulicOverheadPanel,
        autobrake_panel: &A380AutobrakePanel,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        lgcius: &LandingGearControlInterfaceUnitSet,
        reservoir_pneumatics: &impl ReservoirAirPressure,
        adirs: &(impl AdirsDiscreteOutputs + AdirsMeasurementOutputs),
    ) {
        self.core_hydraulic_updater.update(context);

        self.cargo_door_operation_inhibition.update(engines);
        let cargo_door_operation_inhibited = self.cargo_door_operation_inhibition.is_inhibited();
        self.forward_cargo_door_controller
            .set_operation_inhibited(cargo_door_operation_inhibited);
        self.aft_cargo_door_controller
            .set_operation_inhibited(cargo_door_operation_inhibited);

        self.update_with_sim_rate(
            context,
            overhead_panel,
            autobrake_panel,
            lgcius.lgciu1(),
            lgcius.lgciu2(),
            engines,
            adirs,
            lgcius,
        );

        for cur_time_step in self.core_hydraulic_updater {
            self.update_physics(&context.with_delta(cur_time_step), lgcius, adirs);

            self.update_core_hydraulics(
                &context.with_delta(cur_time_step),
                engines,
                overhead_panel,
                engine_fire_push_buttons,
                lgcius.lgciu1(),
                lgcius.lgciu2(),
                reservoir_pneumatics,
            );
        }
    }

    fn edp_has_fault(&self, pump_id: A380EngineDrivenPumpId) -> bool {
        match pump_id {
            A380EngineDrivenPumpId::Edp1a => self.engine_driven_pump_1a_controller.has_any_fault(),
            A380EngineDrivenPumpId::Edp2a => self.engine_driven_pump_2a_controller.has_any_fault(),
            A380EngineDrivenPumpId::Edp3a => self.engine_driven_pump_3a_controller.has_any_fault(),
            A380EngineDrivenPumpId::Edp4a => self.engine_driven_pump_4a_controller.has_any_fault(),

            A380EngineDrivenPumpId::Edp1b => self.engine_driven_pump_1b_controller.has_any_fault(),
            A380EngineDrivenPumpId::Edp2b => self.engine_driven_pump_2b_controller.has_any_fault(),
            A380EngineDrivenPumpId::Edp3b => self.engine_driven_pump_3b_controller.has_any_fault(),
            A380EngineDrivenPumpId::Edp4b => self.engine_driven_pump_4b_controller.has_any_fault(),
        }
    }

    fn pump_disc_has_fault(&self, engine_id: usize) -> bool {
        match engine_id {
            1 => {
                self.engine_driven_pump_1a_controller.has_disc_fault()
                    || self.engine_driven_pump_1b_controller.has_disc_fault()
            }
            2 => {
                self.engine_driven_pump_2a_controller.has_disc_fault()
                    || self.engine_driven_pump_2b_controller.has_disc_fault()
            }
            3 => {
                self.engine_driven_pump_3a_controller.has_disc_fault()
                    || self.engine_driven_pump_3b_controller.has_disc_fault()
            }
            4 => {
                self.engine_driven_pump_4a_controller.has_disc_fault()
                    || self.engine_driven_pump_4b_controller.has_disc_fault()
            }
            _ => panic!("Not more than 4 engines!!"),
        }
    }

    fn epump_has_fault(&self, pump_id: A380ElectricPumpId) -> bool {
        match pump_id {
            A380ElectricPumpId::YellowA => self.yellow_electric_pump_a_controller.has_any_fault(),
            A380ElectricPumpId::YellowB => self.yellow_electric_pump_b_controller.has_any_fault(),
            A380ElectricPumpId::GreenA => self.green_electric_pump_a_controller.has_any_fault(),
            A380ElectricPumpId::GreenB => self.green_electric_pump_b_controller.has_any_fault(),

            A380ElectricPumpId::GreenAuxiliary => false, // TODO check the fault behaviour
        }
    }

    pub fn green_reservoir(&self) -> &Reservoir {
        self.green_circuit.reservoir()
    }

    pub fn yellow_reservoir(&self) -> &Reservoir {
        self.yellow_circuit.reservoir()
    }

    pub fn left_elevator_aero_torques(&self) -> (Torque, Torque) {
        self.left_elevator.aerodynamic_torques_outer_inner()
    }

    pub fn right_elevator_aero_torques(&self) -> (Torque, Torque) {
        self.right_elevator.aerodynamic_torques_outer_inner()
    }

    pub fn up_down_rudder_aero_torques(&self) -> (Torque, Torque) {
        self.rudder.aerodynamic_torques_up_down()
    }

    /// The LGCIS do not retract the gear out of its retraction configuration (L/G RETRACTION FAULT)
    pub fn is_gear_retraction_inhibited(&self) -> bool {
        self.gear_steering_monitoring.is_retraction_inhibited()
    }

    #[cfg(test)]
    fn nose_wheel_steering_pin_is_inserted(&self) -> bool {
        self.bypass_pin.is_nose_wheel_steering_pin_inserted()
    }

    #[cfg(test)]
    fn is_green_pressure_switch_pressurised(&self) -> bool {
        self.green_circuit.system_section_pressure_switch() == PressureSwitchState::Pressurised
    }

    #[cfg(test)]
    fn is_yellow_pressure_switch_pressurised(&self) -> bool {
        self.yellow_circuit.system_section_pressure_switch() == PressureSwitchState::Pressurised
    }

    fn update_physics(
        &mut self,
        context: &UpdateContext,
        lgcius: &LandingGearControlInterfaceUnitSet,
        adirs: &impl AdirsDiscreteOutputs,
    ) {
        self.forward_cargo_door.update(
            context,
            &self.forward_cargo_door_controller,
            self.green_circuit.auxiliary_section(),
        );

        self.aft_cargo_door.update(
            context,
            &self.aft_cargo_door_controller,
            self.green_circuit.auxiliary_section(),
        );

        self.gear_system_hydraulic_controller.update(
            adirs,
            lgcius.lgciu1(),
            lgcius.lgciu2(),
            &self
                .gear_steering_monitoring
                .gravity_extension(&self.gear_system_gravity_extension_controller),
        );

        self.ths.update(
            context,
            self.ths_system_controller.controllers(),
            [
                self.green_circuit
                    .system_section()
                    .pressure_downstream_leak_valve(),
                self.yellow_circuit
                    .system_section()
                    .pressure_downstream_leak_valve(),
            ],
        );

        self.left_aileron.update(
            context,
            [
                self.aileron_system_controller
                    .left_controllers(AileronPanelPosition::Outward),
                self.aileron_system_controller
                    .left_controllers(AileronPanelPosition::Middle),
                self.aileron_system_controller
                    .left_controllers(AileronPanelPosition::Inward),
            ],
            [
                self.green_circuit.system_section(),
                self.yellow_circuit.system_section(),
                self.green_circuit.system_section(),
            ],
            [
                self.yellow_circuit.system_section(),
                self.green_circuit.system_section(),
                self.yellow_circuit.system_section(),
            ],
        );

        self.right_aileron.update(
            context,
            [
                self.aileron_system_controller
                    .right_controllers(AileronPanelPosition::Outward),
                self.aileron_system_controller
                    .right_controllers(AileronPanelPosition::Middle),
                self.aileron_system_controller
                    .right_controllers(AileronPanelPosition::Inward),
            ],
            [
                self.green_circuit.system_section(),
                self.yellow_circuit.system_section(),
                self.green_circuit.system_section(),
            ],
            [
                self.yellow_circuit.system_section(),
                self.green_circuit.system_section(),
                self.yellow_circuit.system_section(),
            ],
        );

        self.left_elevator.update(
            context,
            [
                self.elevator_system_controller
                    .left_controllers(ElevatorPanelPosition::Outward),
                self.elevator_system_controller
                    .left_controllers(ElevatorPanelPosition::Inward),
            ],
            [
                self.green_circuit.system_section(),
                self.green_circuit.system_section(),
            ],
            [
                self.green_circuit.system_section(),
                self.green_circuit.system_section(),
            ],
        );

        self.right_elevator.update(
            context,
            [
                self.elevator_system_controller
                    .right_controllers(ElevatorPanelPosition::Outward),
                self.elevator_system_controller
                    .right_controllers(ElevatorPanelPosition::Inward),
            ],
            [
                self.yellow_circuit.system_section(),
                self.yellow_circuit.system_section(),
            ],
            [
                self.yellow_circuit.system_section(),
                self.yellow_circuit.system_section(),
            ],
        );

        self.rudder.update(
            context,
            [
                self.rudder_system_controller
                    .controllers(RudderPanelPosition::Upper),
                self.rudder_system_controller
                    .controllers(RudderPanelPosition::Lower),
            ],
            [
                self.yellow_circuit.system_section(),
                self.green_circuit.system_section(),
            ],
            [
                self.green_circuit.system_section(),
                self.yellow_circuit.system_section(),
            ],
        );

        self.left_spoilers.update(
            context,
            self.green_circuit.system_section(),
            self.yellow_circuit.system_section(),
            &self.eha_backup_inhibit_logic,
        );

        self.right_spoilers.update(
            context,
            self.green_circuit.system_section(),
            self.yellow_circuit.system_section(),
            &self.eha_backup_inhibit_logic,
        );

        self.gear_system.update_with_main_gear_pressure(
            context,
            &self.gear_system_hydraulic_controller,
            lgcius.active_lgciu(),
            self.green_circuit
                .system_section()
                .pressure_downstream_priority_valve(),
            A380HydraulicCircuitsSupplyOfMainGears::pressure(
                self.green_circuit.system_section(),
                self.yellow_circuit.system_section(),
            ),
        );
    }

    /// The body wheel steering takes the yellow auxiliary section while a yellow electric pump runs in automatic mode
    /// (pushback or towing: only the BWS is pressurized), else the yellow system section (engine pumps, or electric
    /// pumps in manual mode).
    fn is_body_wheel_steering_on_yellow_auxiliary(&self) -> bool {
        self.yellow_circuit_controller
            .is_any_epump_routed_to_auxiliary()
    }

    fn update_body_wheel_steering(&mut self, context: &UpdateContext) {
        if self.is_body_wheel_steering_on_yellow_auxiliary() {
            self.body_wheel_steering_left.update(
                context,
                self.yellow_circuit.auxiliary_section(),
                self.brake_steer_computer.left_body_steering_controller(),
                &self.pushback_tug,
                &self.bypass_pin,
            );
            self.body_wheel_steering_right.update(
                context,
                self.yellow_circuit.auxiliary_section(),
                self.brake_steer_computer.right_body_steering_controller(),
                &self.pushback_tug,
                &self.bypass_pin,
            );
        } else {
            self.body_wheel_steering_left.update(
                context,
                self.yellow_circuit.system_section(),
                self.brake_steer_computer.left_body_steering_controller(),
                &self.pushback_tug,
                &self.bypass_pin,
            );
            self.body_wheel_steering_right.update(
                context,
                self.yellow_circuit.system_section(),
                self.brake_steer_computer.right_body_steering_controller(),
                &self.pushback_tug,
                &self.bypass_pin,
            );
        }
    }

    fn update_with_sim_rate(
        &mut self,
        context: &UpdateContext,
        overhead_panel: &A380HydraulicOverheadPanel,
        autobrake_panel: &A380AutobrakePanel,
        lgciu1: &impl LgciuInterface,
        lgciu2: &impl LgciuInterface,
        engines: [&impl Engine; 4],
        adirs: &impl AdirsMeasurementOutputs,
        lgcius: &LandingGearControlInterfaceUnitSet,
    ) {
        self.eha_backup_inhibit_logic
            .update(context, lgciu1, lgciu2);

        self.gear_system_gravity_extension_controller
            .update(context);

        self.aileron_system_controller.update(
            &self.eha_backup_inhibit_logic,
            &self.flight_control_actuator_failures,
        );

        self.elevator_system_controller.update(
            &self.eha_backup_inhibit_logic,
            &self.flight_control_actuator_failures,
        );

        self.ths_system_controller
            .update(&self.flight_control_actuator_failures);

        self.rudder_system_controller.update(
            &self.eha_backup_inhibit_logic,
            &self.flight_control_actuator_failures,
        );

        self.tilting_gears.update(context);

        // GREEN supplies the normal NWS; the alternate NWS uses the steering LEHGS. The BWS stays on YELLOW.
        self.nose_wheel_steering_supply.update(
            self.brake_steer_computer.nose_wheel_steering_mode(),
            self.green_circuit.system_section(),
        );
        self.nose_steering.update(
            context,
            &self.nose_wheel_steering_supply,
            &self.brake_steer_computer,
            &self.pushback_tug,
            &self.bypass_pin,
        );
        self.gear_steering_monitoring.update(
            lgcius.active_lgciu(),
            lgcius.gear_handle_is_down(),
            self.nose_steering.position_feedback(),
            self.brake_steer_computer.is_body_wheel_steering_locked(),
        );

        self.update_body_wheel_steering(context);

        // Process brake logic (which circuit brakes) and send brake demands (how much)
        self.brake_steer_computer.update(
            context,
            self.green_circuit.system_section(),
            lgciu1,
            lgciu2,
            autobrake_panel,
            engines,
            adirs,
            self.left_spoilers.ground_spoilers_are_requested()
                && self.right_spoilers.ground_spoilers_are_requested(),
            self.nose_steering.position_feedback(),
        );

        self.pushback_tug.update(context);
        self.bypass_pin.update(&self.pushback_tug);

        let brake_pairs = self
            .brake_steer_computer
            .brake_pair_pressures(&self.braking_circuit_norm, &self.braking_circuit_altn);
        // Design choice: one pressure per brake assembly (gear), the mean of its two brake pairs, so a released or a
        // residual braking pair heats the brakes of its gear at half its pressure difference
        let gear_pressure = |first_pair: usize, second_pair: usize| {
            (brake_pairs[first_pair].highest() + brake_pairs[second_pair].highest()) / 2.
        };
        for (brake_assembly, braking_pressure, gear_position) in [
            (
                &mut self.left_wing_brake_assembly,
                gear_pressure(0, 2),
                self.gear_system.left_gear_position(),
            ),
            (
                &mut self.left_body_brake_assembly,
                gear_pressure(4, 6),
                self.gear_system.left_gear_position(),
            ),
            (
                &mut self.right_body_brake_assembly,
                gear_pressure(5, 7),
                self.gear_system.right_gear_position(),
            ),
            (
                &mut self.right_wing_brake_assembly,
                gear_pressure(1, 3),
                self.gear_system.right_gear_position(),
            ),
        ] {
            brake_assembly.update(
                context,
                &self.brake_properties,
                braking_pressure,
                false,
                gear_position.get::<ratio>() > 0.25,
            );
        }

        self.braking_force.update_forces(
            context,
            &brake_pairs,
            engines[0],
            engines[1],
            &self.bypass_pin,
        );

        self.slats_flaps_complex
            .update(context, adirs, &self.flap_system, &self.slat_system);

        self.flap_system.update(
            context,
            self.slats_flaps_complex.flap_pcu(0),
            self.slats_flaps_complex.flap_pcu(1),
            self.green_circuit.system_section(),
            self.yellow_circuit.system_section(),
        );

        self.slat_system.update(
            context,
            self.slats_flaps_complex.slat_pcu(0),
            self.slats_flaps_complex.slat_pcu(1),
            self.green_circuit.system_section(),
            self.green_circuit.system_section(),
        );

        self.forward_cargo_door_controller.update(
            context,
            &self.forward_cargo_door,
            self.green_circuit.auxiliary_section(),
        );

        self.aft_cargo_door_controller.update(
            context,
            &self.aft_cargo_door,
            self.green_circuit.auxiliary_section(),
        );

        self.slats_flaps_complex
            .update(context, adirs, &self.flap_system, &self.slat_system);

        self.epump_auto_logic.update(
            context,
            &self.forward_cargo_door_controller,
            &self.aft_cargo_door_controller,
            self.brake_steer_computer
                .should_pressurise_for_body_steering(),
            overhead_panel,
        );

        // Placeholder to move auxiliary gear doors. To remove when gear system fully implemented
        self.aux_gear_doors.update(
            context,
            lgcius.active_lgciu(),
            self.gear_system
                .main_gear_hydraulic_manifold_pressure()
                .get::<psi>()
                > 2000.,
        )
    }

    // For each hydraulic loop retrieves volumes from and to each actuator and pass it to the loops
    fn update_actuators_volume(&mut self) {
        self.update_green_actuators_volume();
        self.update_yellow_actuators_volume();
        self.update_gear_actuators_volume();
    }

    /// Nose gear and its doors on GREEN; main gear assemblies half on GREEN, half on YELLOW
    /// (A380HydraulicCircuitsSupplyOfMainGears)
    fn update_gear_actuators_volume(&mut self) {
        for actuator in self.gear_system.nose_gear_actuators() {
            self.green_circuit.update_system_actuator_volumes(actuator);
        }

        for actuator in self.gear_system.main_gear_actuators() {
            self.green_circuit
                .update_system_actuator_volumes(&mut ActuatorFluidShare {
                    actuator: &mut *actuator,
                    share: A380HydraulicCircuitsSupplyOfMainGears::FLUID_SHARE_PER_CIRCUIT,
                    is_last_share: false,
                });
            self.yellow_circuit
                .update_system_actuator_volumes(&mut ActuatorFluidShare {
                    actuator,
                    share: A380HydraulicCircuitsSupplyOfMainGears::FLUID_SHARE_PER_CIRCUIT,
                    is_last_share: true,
                });
        }
    }

    fn update_green_actuators_volume(&mut self) {
        self.green_circuit
            .update_system_actuator_volumes(&mut self.braking_circuit_norm);

        // Normal NWS takes its fluid from GREEN; the steering LEHGS of the alternate NWS has its own reservoir, not
        // modelled.
        if self.nose_wheel_steering_supply.is_supplied_by_green() {
            self.green_circuit
                .update_system_actuator_volumes(&mut self.nose_steering);
        } else {
            self.nose_steering.reset_volumes();
        }

        self.green_circuit
            .update_system_actuator_volumes(self.left_aileron.actuator(
                AileronActuatorPosition::Outward,
                AileronPanelPosition::Outward,
            ));

        // This one is EHA, TODO check if it's connected to green or yellow for filling
        self.green_circuit
            .update_system_actuator_volumes(self.left_aileron.actuator(
                AileronActuatorPosition::Inward,
                AileronPanelPosition::Middle,
            ));

        self.green_circuit
            .update_system_actuator_volumes(self.left_aileron.actuator(
                AileronActuatorPosition::Outward,
                AileronPanelPosition::Inward,
            ));

        self.green_circuit
            .update_system_actuator_volumes(self.right_aileron.actuator(
                AileronActuatorPosition::Outward,
                AileronPanelPosition::Outward,
            ));

        // This one is EHA, TODO check if it's connected to green or yellow for filling
        self.green_circuit
            .update_system_actuator_volumes(self.right_aileron.actuator(
                AileronActuatorPosition::Inward,
                AileronPanelPosition::Middle,
            ));

        self.green_circuit
            .update_system_actuator_volumes(self.right_aileron.actuator(
                AileronActuatorPosition::Outward,
                AileronPanelPosition::Inward,
            ));

        self.green_circuit
            .update_system_actuator_volumes(self.left_elevator.actuator(
                ElevatorActuatorPosition::Outward,
                ElevatorPanelPosition::Outward,
            ));

        // This one is EHA, TODO check if it's connected to green or yellow for filling
        self.green_circuit
            .update_system_actuator_volumes(self.left_elevator.actuator(
                ElevatorActuatorPosition::Inward,
                ElevatorPanelPosition::Outward,
            ));

        self.green_circuit
            .update_system_actuator_volumes(self.left_elevator.actuator(
                ElevatorActuatorPosition::Outward,
                ElevatorPanelPosition::Inward,
            ));

        // This one is EHA, TODO check if it's connected to green or yellow for filling
        self.green_circuit
            .update_system_actuator_volumes(self.left_elevator.actuator(
                ElevatorActuatorPosition::Inward,
                ElevatorPanelPosition::Inward,
            ));

        self.green_circuit
            .update_auxiliary_actuator_volumes(self.forward_cargo_door.actuator());

        self.green_circuit
            .update_auxiliary_actuator_volumes(self.aft_cargo_door.actuator());

        self.green_circuit.update_system_actuator_volumes(
            self.rudder
                .actuator(RudderActuatorPosition::Lower, RudderPanelPosition::Upper),
        );
        self.green_circuit.update_system_actuator_volumes(
            self.rudder
                .actuator(RudderActuatorPosition::Upper, RudderPanelPosition::Lower),
        );

        self.green_circuit
            .update_system_actuator_volumes(self.flap_system.left_motor());
        self.green_circuit
            .update_system_actuator_volumes(self.slat_system.right_motor());

        self.green_circuit
            .update_system_actuator_volumes(self.left_spoilers.actuator(1));
        self.green_circuit
            .update_system_actuator_volumes(self.left_spoilers.actuator(3));
        self.green_circuit
            .update_system_actuator_volumes(self.left_spoilers.actuator(5));
        self.green_circuit
            .update_system_actuator_volumes(self.left_spoilers.actuator(7));

        self.green_circuit
            .update_system_actuator_volumes(self.right_spoilers.actuator(1));
        self.green_circuit
            .update_system_actuator_volumes(self.right_spoilers.actuator(3));
        self.green_circuit
            .update_system_actuator_volumes(self.right_spoilers.actuator(5));
        self.green_circuit
            .update_system_actuator_volumes(self.right_spoilers.actuator(7));

        self.green_circuit
            .update_system_actuator_volumes(self.ths.left_motor());
    }

    fn update_yellow_actuators_volume(&mut self) {
        self.yellow_circuit
            .update_system_actuator_volumes(self.left_aileron.actuator(
                AileronActuatorPosition::Inward,
                AileronPanelPosition::Outward,
            ));

        self.yellow_circuit
            .update_system_actuator_volumes(self.left_aileron.actuator(
                AileronActuatorPosition::Outward,
                AileronPanelPosition::Middle,
            ));

        // This one is EHA, TODO check if it's connected to green or yellow for filling
        self.yellow_circuit
            .update_system_actuator_volumes(self.left_aileron.actuator(
                AileronActuatorPosition::Inward,
                AileronPanelPosition::Inward,
            ));

        self.yellow_circuit
            .update_system_actuator_volumes(self.right_aileron.actuator(
                AileronActuatorPosition::Inward,
                AileronPanelPosition::Outward,
            ));

        self.yellow_circuit
            .update_system_actuator_volumes(self.right_aileron.actuator(
                AileronActuatorPosition::Outward,
                AileronPanelPosition::Middle,
            ));

        // This one is EHA, TODO check if it's connected to green or yellow for filling
        self.yellow_circuit
            .update_system_actuator_volumes(self.right_aileron.actuator(
                AileronActuatorPosition::Inward,
                AileronPanelPosition::Inward,
            ));

        self.yellow_circuit
            .update_system_actuator_volumes(&mut self.braking_circuit_altn);

        self.yellow_circuit
            .update_system_actuator_volumes(self.flap_system.right_motor());

        if self.is_body_wheel_steering_on_yellow_auxiliary() {
            self.yellow_circuit
                .update_auxiliary_actuator_volumes(&mut self.body_wheel_steering_left);
            self.yellow_circuit
                .update_auxiliary_actuator_volumes(&mut self.body_wheel_steering_right);
        } else {
            self.yellow_circuit
                .update_system_actuator_volumes(&mut self.body_wheel_steering_left);
            self.yellow_circuit
                .update_system_actuator_volumes(&mut self.body_wheel_steering_right);
        }

        self.yellow_circuit
            .update_system_actuator_volumes(self.right_elevator.actuator(
                ElevatorActuatorPosition::Outward,
                ElevatorPanelPosition::Outward,
            ));

        // This one is EHA, TODO check if it's connected to green or yellow for filling
        self.yellow_circuit
            .update_system_actuator_volumes(self.right_elevator.actuator(
                ElevatorActuatorPosition::Inward,
                ElevatorPanelPosition::Outward,
            ));

        self.yellow_circuit
            .update_system_actuator_volumes(self.right_elevator.actuator(
                ElevatorActuatorPosition::Outward,
                ElevatorPanelPosition::Inward,
            ));

        // This one is EHA, TODO check if it's connected to green or yellow for filling
        self.yellow_circuit
            .update_system_actuator_volumes(self.right_elevator.actuator(
                ElevatorActuatorPosition::Inward,
                ElevatorPanelPosition::Inward,
            ));

        self.yellow_circuit.update_system_actuator_volumes(
            self.rudder
                .actuator(RudderActuatorPosition::Upper, RudderPanelPosition::Upper),
        );
        self.yellow_circuit.update_system_actuator_volumes(
            self.rudder
                .actuator(RudderActuatorPosition::Lower, RudderPanelPosition::Lower),
        );

        self.yellow_circuit
            .update_system_actuator_volumes(self.left_spoilers.actuator(0));
        self.yellow_circuit
            .update_system_actuator_volumes(self.left_spoilers.actuator(2));
        self.yellow_circuit
            .update_system_actuator_volumes(self.left_spoilers.actuator(4));
        self.yellow_circuit
            .update_system_actuator_volumes(self.left_spoilers.actuator(6));

        self.yellow_circuit
            .update_system_actuator_volumes(self.right_spoilers.actuator(0));
        self.yellow_circuit
            .update_system_actuator_volumes(self.right_spoilers.actuator(2));
        self.yellow_circuit
            .update_system_actuator_volumes(self.right_spoilers.actuator(4));
        self.yellow_circuit
            .update_system_actuator_volumes(self.right_spoilers.actuator(6));

        self.yellow_circuit
            .update_system_actuator_volumes(self.ths.right_motor());
    }

    // All the core hydraulics updates that needs to be done at the slowest fixed step rate
    fn update_core_hydraulics(
        &mut self,
        context: &UpdateContext,
        engines: [&impl Engine; 4],
        overhead_panel: &A380HydraulicOverheadPanel,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        lgciu1: &impl LgciuInterface,
        lgciu2: &impl LgciuInterface,
        reservoir_pneumatics: &impl ReservoirAirPressure,
    ) {
        // First update what is currently consumed and given back by each actuator
        // Todo: might have to split the actuator volumes by expected number of loops
        self.update_actuators_volume();

        self.engine_driven_pump_1a_controller.update(
            overhead_panel,
            engine_fire_push_buttons,
            engines,
            &self.green_circuit,
            lgciu1,
            self.green_circuit.reservoir(),
            &self.engine_driven_pump_1a,
        );

        self.engine_driven_pump_1a.update(
            context,
            self.green_circuit
                .pump_section(A380EngineDrivenPumpId::Edp1a.into_pump_section_index()),
            self.green_circuit.reservoir(),
            engines[0].hydraulic_pump_output_speed(),
            &self.engine_driven_pump_1a_controller,
        );

        self.engine_driven_pump_2a_controller.update(
            overhead_panel,
            engine_fire_push_buttons,
            engines,
            &self.green_circuit,
            lgciu2,
            self.green_circuit.reservoir(),
            &self.engine_driven_pump_2a,
        );

        self.engine_driven_pump_2a.update(
            context,
            self.green_circuit
                .pump_section(A380EngineDrivenPumpId::Edp2a.into_pump_section_index()),
            self.green_circuit.reservoir(),
            engines[1].hydraulic_pump_output_speed(),
            &self.engine_driven_pump_2a_controller,
        );

        self.engine_driven_pump_3a_controller.update(
            overhead_panel,
            engine_fire_push_buttons,
            engines,
            &self.yellow_circuit,
            lgciu1,
            self.yellow_circuit.reservoir(),
            &self.engine_driven_pump_3a,
        );

        self.engine_driven_pump_3a.update(
            context,
            self.yellow_circuit
                .pump_section(A380EngineDrivenPumpId::Edp3a.into_pump_section_index()),
            self.yellow_circuit.reservoir(),
            engines[2].hydraulic_pump_output_speed(),
            &self.engine_driven_pump_3a_controller,
        );

        self.engine_driven_pump_4a_controller.update(
            overhead_panel,
            engine_fire_push_buttons,
            engines,
            &self.yellow_circuit,
            lgciu2,
            self.yellow_circuit.reservoir(),
            &self.engine_driven_pump_4a,
        );

        self.engine_driven_pump_4a.update(
            context,
            self.yellow_circuit
                .pump_section(A380EngineDrivenPumpId::Edp4a.into_pump_section_index()),
            self.yellow_circuit.reservoir(),
            engines[3].hydraulic_pump_output_speed(),
            &self.engine_driven_pump_4a_controller,
        );

        self.engine_driven_pump_1b_controller.update(
            overhead_panel,
            engine_fire_push_buttons,
            engines,
            &self.green_circuit,
            lgciu1,
            self.green_circuit.reservoir(),
            &self.engine_driven_pump_1b,
        );

        self.engine_driven_pump_1b.update(
            context,
            self.green_circuit
                .pump_section(A380EngineDrivenPumpId::Edp1b.into_pump_section_index()),
            self.green_circuit.reservoir(),
            engines[0].hydraulic_pump_output_speed(),
            &self.engine_driven_pump_1b_controller,
        );

        self.engine_driven_pump_2b_controller.update(
            overhead_panel,
            engine_fire_push_buttons,
            engines,
            &self.green_circuit,
            lgciu2,
            self.green_circuit.reservoir(),
            &self.engine_driven_pump_2b,
        );

        self.engine_driven_pump_2b.update(
            context,
            self.green_circuit
                .pump_section(A380EngineDrivenPumpId::Edp2b.into_pump_section_index()),
            self.green_circuit.reservoir(),
            engines[1].hydraulic_pump_output_speed(),
            &self.engine_driven_pump_2b_controller,
        );

        self.engine_driven_pump_3b_controller.update(
            overhead_panel,
            engine_fire_push_buttons,
            engines,
            &self.yellow_circuit,
            lgciu1,
            self.yellow_circuit.reservoir(),
            &self.engine_driven_pump_3b,
        );

        self.engine_driven_pump_3b.update(
            context,
            self.yellow_circuit
                .pump_section(A380EngineDrivenPumpId::Edp3b.into_pump_section_index()),
            self.yellow_circuit.reservoir(),
            engines[2].hydraulic_pump_output_speed(),
            &self.engine_driven_pump_3b_controller,
        );

        self.engine_driven_pump_4b_controller.update(
            overhead_panel,
            engine_fire_push_buttons,
            engines,
            &self.yellow_circuit,
            lgciu2,
            self.yellow_circuit.reservoir(),
            &self.engine_driven_pump_4b,
        );

        self.engine_driven_pump_4b.update(
            context,
            self.yellow_circuit
                .pump_section(A380EngineDrivenPumpId::Edp4b.into_pump_section_index()),
            self.yellow_circuit.reservoir(),
            engines[3].hydraulic_pump_output_speed(),
            &self.engine_driven_pump_4b_controller,
        );

        self.green_electric_pump_a_controller.update(
            context,
            overhead_panel,
            &self.green_circuit,
            self.green_circuit.reservoir(),
            engines,
            lgciu1,
            &self.epump_auto_logic,
            &self.green_electric_pump_a,
        );

        self.green_electric_pump_a.update(
            context,
            self.green_circuit
                .pump_section(A380ElectricPumpId::GreenA.into_pump_section_index()),
            self.green_circuit.reservoir(),
            &self.green_electric_pump_a_controller,
        );
        self.green_electric_pump_b_controller.update(
            context,
            overhead_panel,
            &self.green_circuit,
            self.green_circuit.reservoir(),
            engines,
            lgciu1,
            &self.epump_auto_logic,
            &self.green_electric_pump_b,
        );
        self.green_electric_pump_b.update(
            context,
            self.green_circuit
                .pump_section(A380ElectricPumpId::GreenB.into_pump_section_index()),
            self.green_circuit.reservoir(),
            &self.green_electric_pump_b_controller,
        );

        self.yellow_electric_pump_a_controller.update(
            context,
            overhead_panel,
            &self.yellow_circuit,
            self.yellow_circuit.reservoir(),
            engines,
            lgciu2,
            &self.epump_auto_logic,
            &self.yellow_electric_pump_a,
        );
        self.yellow_electric_pump_a.update(
            context,
            self.yellow_circuit
                .pump_section(A380ElectricPumpId::YellowA.into_pump_section_index()),
            self.yellow_circuit.reservoir(),
            &self.yellow_electric_pump_a_controller,
        );

        self.yellow_electric_pump_b_controller.update(
            context,
            overhead_panel,
            &self.yellow_circuit,
            self.yellow_circuit.reservoir(),
            engines,
            lgciu2,
            &self.epump_auto_logic,
            &self.yellow_electric_pump_b,
        );
        self.yellow_electric_pump_b.update(
            context,
            self.yellow_circuit
                .pump_section(A380ElectricPumpId::YellowB.into_pump_section_index()),
            self.yellow_circuit.reservoir(),
            &self.yellow_electric_pump_b_controller,
        );

        self.green_electric_aux_pump_controller
            .update(&self.epump_auto_logic);
        self.green_auxiliary_pump.update(
            context,
            self.green_circuit.auxiliary_section(),
            self.green_circuit.reservoir(),
            &self.green_electric_aux_pump_controller,
        );

        self.green_circuit_controller.update(
            context,
            engine_fire_push_buttons,
            [
                &self.green_electric_pump_a_controller,
                &self.green_electric_pump_b_controller,
            ],
        );

        self.green_circuit.update(
            context,
            &mut [
                &mut self.engine_driven_pump_1a,
                &mut self.engine_driven_pump_1b,
                &mut self.engine_driven_pump_2a,
                &mut self.engine_driven_pump_2b,
                &mut self.green_electric_pump_a,
                &mut self.green_electric_pump_b,
            ],
            None::<&mut ElectricPump>,
            Some(&mut self.green_auxiliary_pump),
            None,
            &self.green_circuit_controller,
            reservoir_pneumatics.green_reservoir_pressure(),
        );

        self.yellow_circuit_controller.update(
            context,
            engine_fire_push_buttons,
            [
                &self.yellow_electric_pump_a_controller,
                &self.yellow_electric_pump_b_controller,
            ],
        );
        self.yellow_circuit.update(
            context,
            &mut [
                &mut self.engine_driven_pump_3a,
                &mut self.engine_driven_pump_3b,
                &mut self.engine_driven_pump_4a,
                &mut self.engine_driven_pump_4b,
                &mut self.yellow_electric_pump_a,
                &mut self.yellow_electric_pump_b,
            ],
            None::<&mut ElectricPump>,
            None::<&mut ElectricPump>,
            None,
            &self.yellow_circuit_controller,
            reservoir_pneumatics.yellow_reservoir_pressure(),
        );

        self.braking_circuit_norm.update(
            context,
            self.green_circuit.system_section(),
            self.brake_steer_computer.norm_controller(),
        );
        self.braking_circuit_altn.update(
            context,
            self.yellow_circuit.system_section(),
            self.brake_steer_computer.alternate_controller(),
        );
    }

    pub fn gear_system(&self) -> &impl GearSystemSensors {
        &self.gear_system
    }
}

impl SurfacesPositions for A380Hydraulic {
    fn left_ailerons_positions(&self) -> &[f64] {
        self.left_aileron.positions()
    }

    fn right_ailerons_positions(&self) -> &[f64] {
        self.right_aileron.positions()
    }

    fn left_spoilers_positions(&self) -> &[f64] {
        self.left_spoilers.positions()
    }

    fn right_spoilers_positions(&self) -> &[f64] {
        self.right_spoilers.positions()
    }

    fn left_flaps_position(&self) -> f64 {
        self.flap_system.left_position()
    }

    fn right_flaps_position(&self) -> f64 {
        self.flap_system.right_position()
    }
}

impl CargoDoorLocked for A380Hydraulic {
    fn fwd_cargo_door_locked(&self) -> bool {
        self.forward_cargo_door.is_locked()
    }
    fn aft_cargo_door_locked(&self) -> bool {
        self.aft_cargo_door.is_locked()
    }
}

impl SimulationElement for A380Hydraulic {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.eha_backup_inhibit_logic.accept(visitor);

        self.engine_driven_pump_1a.accept(visitor);
        self.engine_driven_pump_1a_controller.accept(visitor);

        self.engine_driven_pump_2a.accept(visitor);
        self.engine_driven_pump_2a_controller.accept(visitor);

        self.engine_driven_pump_3a.accept(visitor);
        self.engine_driven_pump_3a_controller.accept(visitor);

        self.engine_driven_pump_4a.accept(visitor);
        self.engine_driven_pump_4a_controller.accept(visitor);

        self.engine_driven_pump_1b.accept(visitor);
        self.engine_driven_pump_1b_controller.accept(visitor);

        self.engine_driven_pump_2b.accept(visitor);
        self.engine_driven_pump_2b_controller.accept(visitor);

        self.engine_driven_pump_3b.accept(visitor);
        self.engine_driven_pump_3b_controller.accept(visitor);

        self.engine_driven_pump_4b.accept(visitor);
        self.engine_driven_pump_4b_controller.accept(visitor);

        self.yellow_electric_pump_a.accept(visitor);
        self.yellow_electric_pump_a_controller.accept(visitor);

        self.yellow_electric_pump_b.accept(visitor);
        self.yellow_electric_pump_b_controller.accept(visitor);

        self.green_electric_pump_a.accept(visitor);
        self.green_electric_pump_a_controller.accept(visitor);

        self.green_electric_pump_b.accept(visitor);
        self.green_electric_pump_b_controller.accept(visitor);

        self.epump_auto_logic.accept(visitor);

        self.forward_cargo_door_controller.accept(visitor);
        self.forward_cargo_door.accept(visitor);

        self.aft_cargo_door_controller.accept(visitor);
        self.aft_cargo_door.accept(visitor);
        self.cargo_door_operation_inhibition.accept(visitor);

        self.pushback_tug.accept(visitor);
        self.bypass_pin.accept(visitor);

        self.green_circuit.accept(visitor);
        self.yellow_circuit.accept(visitor);

        self.brake_steer_computer.accept(visitor);

        self.braking_circuit_norm.accept(visitor);
        self.braking_circuit_altn.accept(visitor);
        self.braking_force.accept(visitor);

        self.nose_steering.accept(visitor);
        self.body_wheel_steering_left.accept(visitor);
        self.body_wheel_steering_right.accept(visitor);

        self.slats_flaps_complex.accept(visitor);
        self.flap_system.accept(visitor);
        self.slat_system.accept(visitor);

        self.flight_control_actuator_failures.accept(visitor);
        self.elevator_system_controller.accept(visitor);
        self.aileron_system_controller.accept(visitor);
        self.rudder_system_controller.accept(visitor);

        self.left_aileron.accept(visitor);
        self.right_aileron.accept(visitor);
        self.left_elevator.accept(visitor);
        self.right_elevator.accept(visitor);
        self.rudder.accept(visitor);

        self.left_spoilers.accept(visitor);
        self.right_spoilers.accept(visitor);

        self.gear_system_gravity_extension_controller
            .accept(visitor);
        self.gear_system.accept(visitor);
        self.left_wing_brake_assembly.accept(visitor);
        self.right_wing_brake_assembly.accept(visitor);
        self.left_body_brake_assembly.accept(visitor);
        self.right_body_brake_assembly.accept(visitor);

        self.ths_system_controller.accept(visitor);
        self.ths.accept(visitor);

        self.tilting_gears.accept(visitor);

        self.aux_gear_doors.accept(visitor);
        self.gear_steering_monitoring.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        let left_wing_brake_temperatures =
            self.left_wing_brake_assembly.brake_temperature_sensors();
        let right_wing_brake_temperatures =
            self.right_wing_brake_assembly.brake_temperature_sensors();
        let left_body_brake_temperatures =
            self.left_body_brake_assembly.brake_temperature_sensors();
        let right_body_brake_temperatures =
            self.right_body_brake_assembly.brake_temperature_sensors();
        let brake_temp_sensors = left_wing_brake_temperatures[..2]
            .iter()
            .chain(&right_wing_brake_temperatures[..2])
            .chain(&left_wing_brake_temperatures[2..])
            .chain(&right_wing_brake_temperatures[2..])
            .chain(&left_body_brake_temperatures[..2])
            .chain(&right_body_brake_temperatures[..2])
            .chain(&left_body_brake_temperatures[2..])
            .chain(&right_body_brake_temperatures[2..]);
        for (temp_sensor, id) in brake_temp_sensors.zip(&self.brake_temperature_ids) {
            writer.write(
                id,
                temp_sensor
                    .signal()
                    .unwrap_or_default()
                    .get::<degree_celsius>() as u32,
            );
        }
    }
}

struct A380GearHydraulicController {
    safety_valve_should_open: bool,
    cutoff_valve_should_open: bool,
    vent_valves_should_open: bool,
    doors_uplock_mechanical_release: bool,
    gears_uplock_mechanical_release: bool,
}
impl A380GearHydraulicController {
    fn new() -> Self {
        Self {
            safety_valve_should_open: true,
            cutoff_valve_should_open: true,
            vent_valves_should_open: false,
            doors_uplock_mechanical_release: false,
            gears_uplock_mechanical_release: false,
        }
    }

    fn update(
        &mut self,
        adirs: &impl AdirsDiscreteOutputs,
        lgciu1: &(impl LgciuWeightOnWheels + LandingGearHandle),
        lgciu2: &impl LgciuWeightOnWheels,
        gear_gravity_extension: &impl GearGravityExtension,
    ) {
        self.update_safety_valve(adirs, lgciu1, lgciu2);

        self.update_safety_and_vent_valve(gear_gravity_extension);

        self.update_uplocks(gear_gravity_extension);
    }

    fn update_uplocks(&mut self, gear_gravity_extension: &impl GearGravityExtension) {
        self.doors_uplock_mechanical_release =
            gear_gravity_extension.extension_handle_number_of_turns() >= 2;
        self.gears_uplock_mechanical_release =
            gear_gravity_extension.extension_handle_number_of_turns() >= 3;
    }

    fn update_safety_and_vent_valve(&mut self, gear_gravity_extension: &impl GearGravityExtension) {
        let one_or_more_handle_turns =
            gear_gravity_extension.extension_handle_number_of_turns() >= 1;

        self.cutoff_valve_should_open = !one_or_more_handle_turns;

        self.vent_valves_should_open = one_or_more_handle_turns;
    }

    fn update_safety_valve(
        &mut self,
        adirs: &impl AdirsDiscreteOutputs,
        lgciu1: &(impl LgciuWeightOnWheels + LandingGearHandle),
        lgciu2: &impl LgciuWeightOnWheels,
    ) {
        let speed_condition = adirs.low_speed_warning_4(1) || adirs.low_speed_warning_4(3);

        let on_ground_condition = lgciu1.left_and_right_gear_compressed(true)
            || lgciu2.left_and_right_gear_compressed(true);

        let self_maintained_gear_lever_condition =
            self.safety_valve_should_open || lgciu1.gear_handle_is_down();

        self.safety_valve_should_open =
            (speed_condition || on_ground_condition) && self_maintained_gear_lever_condition;
    }
}
impl GearSystemController for A380GearHydraulicController {
    fn safety_valve_should_open(&self) -> bool {
        self.safety_valve_should_open
    }

    fn shut_off_valve_should_open(&self) -> bool {
        self.cutoff_valve_should_open
    }

    fn vent_valves_should_open(&self) -> bool {
        self.vent_valves_should_open
    }

    fn doors_uplocks_should_mechanically_unlock(&self) -> bool {
        self.doors_uplock_mechanical_release
    }

    fn gears_uplocks_should_mechanically_unlock(&self) -> bool {
        self.gears_uplock_mechanical_release
    }
}

/// Hydraulic circuit valves of one A380 system: fire shutoff valves, leak measurement valve and the auxiliary selector
/// valves of the electric pump sections.
///
/// Electric pumps running automatically only pressurize the cargo door actuation (green) or the BWS (yellow); started
/// manually, the yellow pumps power the whole YELLOW system and the green pumps the whole GREEN system except the
/// cargo door actuation. So an electric pump in automatic mode is routed to the auxiliary section, a pump in manual
/// mode to the system section.
struct A380HydraulicCircuitController {
    circuit_id: HydraulicColor,
    should_open_fire_shutoff_valve: [bool; 2],
    should_open_leak_measurement_valve: bool,
    epumps_in_auto_mode: DelayedFalseLogicGate,
    routing_epump_sections_to_aux: DelayedTrueLogicGate,
    /// Electric pump A, B runs in automatic mode (index 0 is pump section 4, index 1 is pump section 5)
    epump_in_auto_mode: [bool; 2],
}
impl A380HydraulicCircuitController {
    const DELAY_TO_REOPEN_LEAK_VALVE_AFTER_AUTO_MODE_USE: Duration = Duration::from_secs(15);
    const DELAY_TO_CLOSE_AUX_SELECTOR_ON_AUTO_MODE_USE: Duration = Duration::from_millis(450);

    fn new(circuit_id: HydraulicColor) -> Self {
        Self {
            circuit_id,
            should_open_fire_shutoff_valve: [true, true],
            should_open_leak_measurement_valve: true,
            epumps_in_auto_mode: DelayedFalseLogicGate::new(
                Self::DELAY_TO_REOPEN_LEAK_VALVE_AFTER_AUTO_MODE_USE,
            ),
            routing_epump_sections_to_aux: DelayedTrueLogicGate::new(
                Self::DELAY_TO_CLOSE_AUX_SELECTOR_ON_AUTO_MODE_USE,
            ),
            epump_in_auto_mode: [false, false],
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        epump_controllers: [&A380ElectricPumpController; 2],
    ) {
        self.epump_in_auto_mode = [
            epump_controllers[0].is_pressurising_in_auto_mode(),
            epump_controllers[1].is_pressurising_in_auto_mode(),
        ];

        self.epumps_in_auto_mode.update(
            context,
            self.epump_in_auto_mode[0] || self.epump_in_auto_mode[1],
        );

        self.routing_epump_sections_to_aux
            .update(context, self.epumps_in_auto_mode.output());

        match self.circuit_id {
            HydraulicColor::Green => {
                self.should_open_fire_shutoff_valve = [
                    !engine_fire_push_buttons.is_released(1),
                    !engine_fire_push_buttons.is_released(2),
                ];
            }
            HydraulicColor::Yellow => {
                self.should_open_fire_shutoff_valve = [
                    !engine_fire_push_buttons.is_released(3),
                    !engine_fire_push_buttons.is_released(4),
                ];
            }
            HydraulicColor::Blue => panic!("NO BLUE CIRCUIT IN A380"),
        };

        self.update_leak_measurement_valve(context);
    }

    fn update_leak_measurement_valve(&mut self, context: &UpdateContext) {
        let measurement_valve_open_demand_raw = match &mut self.circuit_id {
            HydraulicColor::Green => {
                true
                // TODO
                // overhead_panel.green_leak_measurement_valve_is_on()
                //     && !self.epumps_in_auto_mode.output()
            }
            HydraulicColor::Yellow => {
                // TODO
                // overhead_panel.yellow_leak_measurement_valve_is_on(),
                true
            }
            HydraulicColor::Blue => false,
        };

        self.should_open_leak_measurement_valve = measurement_valve_open_demand_raw
            || self.plane_state_disables_leak_valve_closing(context);
    }

    fn plane_state_disables_leak_valve_closing(&self, context: &UpdateContext) -> bool {
        context.indicated_airspeed() >= Velocity::new::<knot>(100.)
    }

    /// An electric pump in automatic mode is routed to the auxiliary section (yellow: the BWS supply)
    fn is_any_epump_routed_to_auxiliary(&self) -> bool {
        // Electric pump sections are 4 (pump A) and 5 (pump B)
        (4..6).any(|pump_index| self.should_route_pump_to_auxiliary(pump_index))
    }
}
impl HydraulicCircuitController for A380HydraulicCircuitController {
    fn should_open_fire_shutoff_valve(&self, fire_valve_index: usize) -> bool {
        // There is one fire valve per pump section by hydraulic library design, so that's 2 per engine
        // As A380 has only one fire valve per engine, we drive both engine fire valves at once
        if fire_valve_index == 1 || fire_valve_index == 2 {
            self.should_open_fire_shutoff_valve[0]
        } else if fire_valve_index == 3 || fire_valve_index == 4 {
            self.should_open_fire_shutoff_valve[1]
        } else {
            true
        }
    }

    fn should_open_leak_measurement_valve(&self) -> bool {
        self.should_open_leak_measurement_valve
    }

    fn should_route_pump_to_auxiliary(&self, pump_index: usize) -> bool {
        // If it's an engine section (<4) we can't route to aux. Else it's a pump elec section (>=4) so
        //   we route it once the selector valve is set, only while that pump runs in automatic mode
        //   (a pump in manual mode pressurises the system section).
        pump_index >= 4
            && self.routing_epump_sections_to_aux.output()
            && self.epump_in_auto_mode[pump_index - 4]
    }
}

use std::fmt::Display;

use self::{autobrakes::A380AutobrakePanel, gear_secondary_doors::A380AuxiliaryGearDoorSet};
#[derive(Clone, Copy, PartialEq, Debug)]
enum A380EngineDrivenPumpId {
    Edp1a,
    Edp1b,
    Edp2a,
    Edp2b,
    Edp3a,
    Edp3b,
    Edp4a,
    Edp4b,
}
impl A380EngineDrivenPumpId {
    fn into_engine_num(self) -> usize {
        match self {
            A380EngineDrivenPumpId::Edp1a => 1,
            A380EngineDrivenPumpId::Edp1b => 1,
            A380EngineDrivenPumpId::Edp2a => 2,
            A380EngineDrivenPumpId::Edp2b => 2,
            A380EngineDrivenPumpId::Edp3a => 3,
            A380EngineDrivenPumpId::Edp3b => 3,
            A380EngineDrivenPumpId::Edp4a => 4,
            A380EngineDrivenPumpId::Edp4b => 4,
        }
    }

    fn into_engine_index(self) -> usize {
        self.into_engine_num() - 1
    }

    fn into_pump_section_index(self) -> usize {
        match self {
            A380EngineDrivenPumpId::Edp1a => 0,
            A380EngineDrivenPumpId::Edp1b => 1,
            A380EngineDrivenPumpId::Edp2a => 2,
            A380EngineDrivenPumpId::Edp2b => 3,
            A380EngineDrivenPumpId::Edp3a => 0,
            A380EngineDrivenPumpId::Edp3b => 1,
            A380EngineDrivenPumpId::Edp4a => 2,
            A380EngineDrivenPumpId::Edp4b => 3,
        }
    }
}
impl Display for A380EngineDrivenPumpId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            A380EngineDrivenPumpId::Edp1a => write!(f, "1A"),
            A380EngineDrivenPumpId::Edp1b => write!(f, "1B"),
            A380EngineDrivenPumpId::Edp2a => write!(f, "2A"),
            A380EngineDrivenPumpId::Edp2b => write!(f, "2B"),
            A380EngineDrivenPumpId::Edp3a => write!(f, "3A"),
            A380EngineDrivenPumpId::Edp3b => write!(f, "3B"),
            A380EngineDrivenPumpId::Edp4a => write!(f, "4A"),
            A380EngineDrivenPumpId::Edp4b => write!(f, "4B"),
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
enum A380ElectricPumpId {
    GreenA,
    GreenB,
    YellowA,
    YellowB,
    GreenAuxiliary,
}
impl A380ElectricPumpId {
    fn into_pump_section_index(self) -> usize {
        match self {
            A380ElectricPumpId::GreenA => 4,
            A380ElectricPumpId::YellowA => 4,
            A380ElectricPumpId::GreenB => 5,
            A380ElectricPumpId::YellowB => 5,
            A380ElectricPumpId::GreenAuxiliary => 0,
        }
    }
}
impl Display for A380ElectricPumpId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            A380ElectricPumpId::GreenA => write!(f, "GA"),
            A380ElectricPumpId::YellowA => write!(f, "YA"),
            A380ElectricPumpId::GreenB => write!(f, "GB"),
            A380ElectricPumpId::YellowB => write!(f, "YB"),
            A380ElectricPumpId::GreenAuxiliary => write!(f, "Gaux"),
        }
    }
}

struct A380EngineDrivenPumpController {
    low_press_id: VariableIdentifier,
    disconnected_id: VariableIdentifier,
    windmill_start_id: VariableIdentifier,

    is_powered: bool,
    powered_by: Vec<ElectricalBusType>,
    pump_id: A380EngineDrivenPumpId,
    should_pressurise: bool,
    has_pressure_low_fault: bool,
    has_air_pressure_low_fault: bool,
    has_low_level_fault: bool,
    is_pressure_low: bool,
    has_overheat_fault: bool,

    /// Reservoir low level whatever the pb-sw position (ENG PMP A+B DISC FAULT light)
    is_reservoir_level_low: bool,
    /// The ENG PMP pb-sw is OFF but the pump section still has pressure: depressurisation failed
    is_depressurisation_unsuccessful: bool,

    are_pumps_commanded_disconnected: bool,

    /// The FADEC is starting the engine by windmilling (a380_systems engine_failure.rs)
    engine_windmill_start: bool,

    disconnection_mechanism: EnginePumpDisconnectionClutch,
}
impl A380EngineDrivenPumpController {
    fn new(
        context: &mut InitContext,
        pump_id: A380EngineDrivenPumpId,
        powered_by: Vec<ElectricalBusType>,
    ) -> Self {
        let engine_num = pump_id.into_engine_num();
        Self {
            low_press_id: context.get_identifier(format!("HYD_EDPUMP_{}_LOW_PRESS", pump_id)),
            disconnected_id: context.get_identifier(format!("HYD_ENG_{}AB_PUMP_DISC", engine_num)),
            windmill_start_id: context
                .get_identifier(format!("ENGINE_{}_WINDMILL_START", engine_num)),

            is_powered: false,
            powered_by,
            pump_id,
            should_pressurise: true,

            has_pressure_low_fault: false,
            has_air_pressure_low_fault: false,
            has_low_level_fault: false,

            is_pressure_low: true,
            has_overheat_fault: false,

            is_reservoir_level_low: false,
            is_depressurisation_unsuccessful: false,

            are_pumps_commanded_disconnected: false,

            engine_windmill_start: false,

            disconnection_mechanism: EnginePumpDisconnectionClutch::new(
                Self::disconnection_power_supply(engine_num),
            ),
        }
    }

    /// Engine pump disconnection supply: engine 1 pumps DC 2, engine 2 pumps DC 1, engine 3 pumps DC 2, engine 4
    /// pumps DC 1.
    fn disconnection_power_supply(engine_num: usize) -> ElectricalBusType {
        match engine_num {
            1 | 3 => ElectricalBusType::DirectCurrent(2),
            2 | 4 => ElectricalBusType::DirectCurrent(1),
            _ => panic!("Only 4 engines on A380"),
        }
    }

    fn update_low_pressure(
        &mut self,
        engines: [&impl Engine; 4],
        hydraulic_circuit: &impl HydraulicPressureSensors,
        lgciu: &impl LgciuInterface,
    ) {
        self.is_pressure_low = self.should_pressurise()
            && !hydraulic_circuit
                .pump_section_switch_pressurised(self.pump_id.into_pump_section_index());

        // TODO Fault inhibit copied from A320
        self.has_pressure_low_fault = self.is_pressure_low
            && (!(engines[self.pump_id.into_engine_index()].oil_pressure_is_low()
                && lgciu.right_gear_compressed(false)
                && lgciu.left_gear_compressed(false)));
    }

    fn update_low_air_pressure(
        &mut self,
        reservoir: &Reservoir,
        overhead_panel: &A380HydraulicOverheadPanel,
    ) {
        self.has_air_pressure_low_fault =
            reservoir.is_low_air_pressure() && overhead_panel.edp_push_button_is_auto(self.pump_id);
    }

    fn update_low_level(
        &mut self,
        reservoir: &Reservoir,
        overhead_panel: &A380HydraulicOverheadPanel,
    ) {
        self.is_reservoir_level_low = reservoir.is_low_level();
        self.has_low_level_fault =
            self.is_reservoir_level_low && overhead_panel.edp_push_button_is_auto(self.pump_id);
    }

    fn update(
        &mut self,
        overhead_panel: &A380HydraulicOverheadPanel,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        engines: [&impl Engine; 4],
        hydraulic_circuit: &impl HydraulicPressureSensors,
        lgciu: &impl LgciuInterface,
        reservoir: &Reservoir,
        pump_status: &impl HeatingElement,
    ) {
        let mut should_pressurise_if_powered = false;
        if overhead_panel.edp_push_button_is_auto(self.pump_id)
            && !engine_fire_push_buttons.is_released(self.pump_id.into_engine_num())
        {
            should_pressurise_if_powered = true;
        } else if overhead_panel.edp_push_button_is_off(self.pump_id)
            || engine_fire_push_buttons.is_released(self.pump_id.into_engine_num())
        {
            should_pressurise_if_powered = false;
        }

        // During a windmilling start the FADEC disconnects both hydraulic pumps to widen the relight envelope. Design
        // choice: both pumps of the engine are depressurised (off-loaded) for the start; the clutch of the ENG PUMPS
        // DISC pb is not used, it cannot be reconnected in flight.
        if self.engine_windmill_start {
            should_pressurise_if_powered = false;
        }

        self.are_pumps_commanded_disconnected = self.are_pumps_commanded_disconnected
            || overhead_panel.engines_edp_disconnected(self.pump_id.into_engine_num());

        self.disconnection_mechanism
            .update(overhead_panel.engines_edp_disconnected(self.pump_id.into_engine_num()));

        // Inverted logic, no power means solenoid valve always leave pump in pressurise mode
        // TODO disconnected pump is just depressurising it as a placeholder for disc mechanism
        self.should_pressurise = (!self.is_powered || should_pressurise_if_powered)
            && !self.are_pumps_commanded_disconnected;

        self.update_low_pressure(engines, hydraulic_circuit, lgciu);

        self.update_low_air_pressure(reservoir, overhead_panel);

        self.update_low_level(reservoir, overhead_panel);

        self.has_overheat_fault = reservoir.is_overheating() || pump_status.is_overheating();

        // Same rule as the FWS (HydOverheatFlags.ts): "not successful" is read from the pump section pressure switch
        self.is_depressurisation_unsuccessful = overhead_panel.edp_push_button_is_off(self.pump_id)
            && hydraulic_circuit
                .pump_section_switch_pressurised(self.pump_id.into_pump_section_index());
    }

    /// ENG PMP pb-sw FAULT light: pump failed or to be depressurised, with HYD ENG PMP PRESS LO, SYS OVHT, SYS TEMP
    /// EXCESS HI, RSVR LEVEL LO or RSVR AIR PRESS LO. It goes off when the crew selects OFF, except for an overheat,
    /// which keeps it on until the overheat is gone: the PRESS LO, LEVEL LO and AIR PRESS LO terms need the pb-sw at
    /// AUTO, the overheat term does not.
    fn has_any_fault(&self) -> bool {
        self.has_pressure_low_fault
            || self.has_air_pressure_low_fault
            || self.has_low_level_fault
            || self.has_overheat_fault
    }

    /// ENG PMP A+B DISC pb FAULT light: with HYD RSVR LEVEL LO, a SYS OVHT whose pump depressurisation failed (the
    /// procedure then asks for DISC), or SYS TEMP EXCESS HI; it goes off when the crew selects DISC. The low level
    /// lights it whatever the ENG PMP pb-sw position. SYS TEMP EXCESS HI is not modelled (the reservoir has a single
    /// overheat state).
    fn has_disc_fault(&self) -> bool {
        (self.is_reservoir_level_low
            || (self.has_overheat_fault && self.is_depressurisation_unsuccessful))
            && !self.are_pumps_commanded_disconnected
    }
}
impl PumpController for A380EngineDrivenPumpController {
    fn should_pressurise(&self) -> bool {
        self.should_pressurise
    }

    fn is_input_shaft_connected(&self) -> bool {
        self.disconnection_mechanism.is_connected()
    }
}
impl SimulationElement for A380EngineDrivenPumpController {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.disconnection_mechanism.accept(visitor);
        visitor.visit(self);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.engine_windmill_start = reader.read(&self.windmill_start_id);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.low_press_id, self.is_pressure_low);
        writer.write(&self.disconnected_id, self.are_pumps_commanded_disconnected);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.any_is_powered(&self.powered_by);
    }
}

struct A380ElectricPumpAutoLogic {
    green_pump_a_selected: bool,
    yellow_pump_a_selected: bool,

    is_required_for_cargo_door_operation: DelayedFalseLogicGate,
    cargo_door_in_operation_previous: bool,

    is_required_for_body_steering_operation: DelayedFalseLogicGate,
    body_steering_in_operation_previous: bool,

    green_a_pump_powered_by: ElectricalBusType,
    green_b_pump_powered_by: ElectricalBusType,
    yellow_a_pump_powered_by: ElectricalBusType,
    yellow_b_pump_powered_by: ElectricalBusType,

    green_a_pump_bus_powered: bool,
    green_b_pump_bus_powered: bool,
    yellow_a_pump_bus_powered: bool,
    yellow_b_pump_bus_powered: bool,
}
impl A380ElectricPumpAutoLogic {
    const DURATION_OF_PUMP_ACTIVATION_AFTER_CARGO_DOOR_OPERATION: Duration =
        Duration::from_secs(20);

    const DURATION_OF_PUMP_ACTIVATION_AFTER_BODY_STEERING_OPERATION: Duration =
        Duration::from_secs(30);
    fn new(
        green_a_pump_powered_by: ElectricalBusType,
        green_b_pump_powered_by: ElectricalBusType,
        yellow_a_pump_powered_by: ElectricalBusType,
        yellow_b_pump_powered_by: ElectricalBusType,
    ) -> Self {
        Self {
            green_pump_a_selected: random_from_range(0., 1.) < 0.5,
            yellow_pump_a_selected: random_from_range(0., 1.) < 0.5,

            is_required_for_cargo_door_operation: DelayedFalseLogicGate::new(
                Self::DURATION_OF_PUMP_ACTIVATION_AFTER_CARGO_DOOR_OPERATION,
            ),
            cargo_door_in_operation_previous: false,

            is_required_for_body_steering_operation: DelayedFalseLogicGate::new(
                Self::DURATION_OF_PUMP_ACTIVATION_AFTER_BODY_STEERING_OPERATION,
            ),
            body_steering_in_operation_previous: false,

            green_a_pump_powered_by,
            green_b_pump_powered_by,
            yellow_a_pump_powered_by,
            yellow_b_pump_powered_by,

            green_a_pump_bus_powered: false,
            green_b_pump_bus_powered: false,
            yellow_a_pump_bus_powered: false,
            yellow_b_pump_bus_powered: false,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        forward_cargo_door_controller: &HydraulicDoorController,
        aft_cargo_door_controller: &HydraulicDoorController,
        is_body_steering_active: bool,
        overhead: &A380HydraulicOverheadPanel,
    ) {
        self.update_auto_run_logic(
            context,
            forward_cargo_door_controller,
            aft_cargo_door_controller,
            is_body_steering_active,
        );

        self.select_pump_in_use(overhead);
    }

    fn update_auto_run_logic(
        &mut self,
        context: &UpdateContext,
        forward_cargo_door_controller: &HydraulicDoorController,
        aft_cargo_door_controller: &HydraulicDoorController,
        is_body_steering_active: bool,
    ) {
        self.cargo_door_in_operation_previous = self.is_required_for_cargo_door_operation.output();

        self.is_required_for_cargo_door_operation.update(
            context,
            forward_cargo_door_controller.should_pressurise_hydraulics()
                || aft_cargo_door_controller.should_pressurise_hydraulics(),
        );

        self.body_steering_in_operation_previous =
            self.is_required_for_body_steering_operation.output();

        self.is_required_for_body_steering_operation
            .update(context, is_body_steering_active);
    }

    fn select_pump_in_use(&mut self, overhead: &A380HydraulicOverheadPanel) {
        let should_change_pump_for_cargo = !self.cargo_door_in_operation_previous
            && self.is_required_for_cargo_door_operation.output();
        let should_change_pump_for_body_steering = !self.body_steering_in_operation_previous
            && self.is_required_for_body_steering_operation.output();

        if should_change_pump_for_cargo
            && (self.green_pump_a_selected
                && !overhead.epump_button_off_is_off(A380ElectricPumpId::GreenB)
                || !self.green_pump_a_selected
                    && !overhead.epump_button_off_is_off(A380ElectricPumpId::GreenA))
        {
            self.green_pump_a_selected = !self.green_pump_a_selected
        }

        // If a pump selected but no AC to power it and B would have power : get back on B
        if self.green_pump_a_selected
            && !self.green_a_pump_bus_powered
            && self.green_b_pump_bus_powered
        {
            self.green_pump_a_selected = false;
        }
        if self.yellow_pump_a_selected
            && !self.yellow_a_pump_bus_powered
            && self.yellow_b_pump_bus_powered
        {
            self.yellow_pump_a_selected = false;
        }

        if should_change_pump_for_body_steering
            && (self.yellow_pump_a_selected
                && !overhead.epump_button_off_is_off(A380ElectricPumpId::YellowB)
                || !self.yellow_pump_a_selected
                    && !overhead.epump_button_off_is_off(A380ElectricPumpId::YellowA))
        {
            self.yellow_pump_a_selected = !self.yellow_pump_a_selected
        }
    }

    fn should_auto_run_pump(&self, pump_id: A380ElectricPumpId) -> bool {
        let green_operation_required = self.is_required_for_cargo_door_operation.output();
        let yellow_operation_required = self.is_required_for_body_steering_operation.output();
        match pump_id {
            A380ElectricPumpId::GreenA => {
                self.green_a_pump_bus_powered
                    && green_operation_required
                    && self.green_pump_a_selected
            }
            A380ElectricPumpId::GreenB => {
                self.green_b_pump_bus_powered
                    && green_operation_required
                    && !self.green_pump_a_selected
            }
            A380ElectricPumpId::YellowA => {
                self.yellow_a_pump_bus_powered
                    && yellow_operation_required
                    && self.yellow_pump_a_selected
            }
            A380ElectricPumpId::YellowB => {
                self.yellow_b_pump_bus_powered
                    && yellow_operation_required
                    && !self.yellow_pump_a_selected
            }
            A380ElectricPumpId::GreenAuxiliary => {
                // Only allow AUX if no AC. This is actually a manual pump using external electric/pneumatic wrench
                green_operation_required
                    && !self.green_a_pump_bus_powered
                    && !self.green_b_pump_bus_powered
                    && !self.yellow_a_pump_bus_powered
                    && !self.yellow_b_pump_bus_powered
            }
        }
    }
}
impl SimulationElement for A380ElectricPumpAutoLogic {
    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.green_a_pump_bus_powered = buses.is_powered(self.green_a_pump_powered_by);
        self.green_b_pump_bus_powered = buses.is_powered(self.green_b_pump_powered_by);
        self.yellow_a_pump_bus_powered = buses.is_powered(self.yellow_a_pump_powered_by);
        self.yellow_b_pump_bus_powered = buses.is_powered(self.yellow_b_pump_powered_by);
    }
}

// Whether any engine runs, for the cargo door operation inhibition below. Place holder logic for now using oil press
fn is_any_engine_running(engines: [&impl Engine; 4]) -> bool {
    !(engines[0].oil_pressure_is_low()
        && engines[1].oil_pressure_is_low()
        && engines[2].oil_pressure_is_low()
        && engines[3].oil_pressure_is_low())
}

/// Whether the cargo door actuation has no hydraulic power. Only the green electric pumps in automatic mode power the
/// cargo door actuation, and they are inhibited as soon as engine 1 or 2 runs; the door operation is also inhibited in
/// taxi and flight and with engines 3 and 4 running (the actuator is then isolated by a valve). Design choice: the door
/// operation is inhibited with any engine running (oil pressure placeholder), which covers both cases on ground.
struct A380CargoDoorOperationInhibition {
    inhibited_id: VariableIdentifier,
    is_inhibited: bool,
}
impl A380CargoDoorOperationInhibition {
    fn new(context: &mut InitContext) -> Self {
        Self {
            inhibited_id: context.get_identifier("HYD_CARGO_DOOR_OPERATION_INHIBITED".to_owned()),
            is_inhibited: false,
        }
    }

    fn update(&mut self, engines: [&impl Engine; 4]) {
        self.is_inhibited = is_any_engine_running(engines);
    }

    fn is_inhibited(&self) -> bool {
        self.is_inhibited
    }
}
impl SimulationElement for A380CargoDoorOperationInhibition {
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.inhibited_id, self.is_inhibited);
    }
}

struct A380ElectricPumpController {
    low_press_id: VariableIdentifier,

    pump_id: A380ElectricPumpId,

    is_powered: bool,
    powered_by: ElectricalBusType,

    should_pressurise: bool,
    /// The pump section pressure stays low while the pump is commanded, see update_low_pressure
    has_pressure_low_fault: bool,
    pressure_low_confirmation: DelayedTrueLogicGate,
    has_air_pressure_low_fault: bool,
    has_low_level_fault: bool,
    /// The pump motor itself overheats (a pump failure)
    has_overheat_fault: bool,
    /// The system (reservoir) overheats: HYD SYS OVHT
    has_system_overheat_fault: bool,
    is_on_ground_with_all_engines_off: bool,

    is_pressure_low: bool,
    /// Started by the auto logic (cargo doors, BWS), see update_operating_mode
    is_in_auto_mode: bool,
    /// Started by the ELEC PMP ON pb, see update_operating_mode
    is_in_manual_mode: bool,
}
impl A380ElectricPumpController {
    /// How long the pump section pressure must stay low, with the pump commanded, before it is a pump failure (ELEC
    /// PMP pb-sw FAULT light, below 1 885 PSI). Design choice (no published time): the same 3 s as the FWS confirmation
    /// of the HYD_*_EPUMP_LOW_PRESS signal for that ECAM alert (FwsCore.ts yellowAPumpLoPressConfNode), which the FAULT
    /// light goes with. A pump that starts on ground takes about 2 s to raise its section above the pressure switch,
    /// which must not light the FAULT.
    const PRESSURE_LOW_FAULT_CONFIRMATION_TIME: Duration = Duration::from_secs(3);

    fn new(
        context: &mut InitContext,
        pump_id: A380ElectricPumpId,
        powered_by: ElectricalBusType,
    ) -> Self {
        Self {
            low_press_id: context.get_identifier(format!("HYD_{}_EPUMP_LOW_PRESS", pump_id)),

            pump_id,

            is_powered: false,
            powered_by,

            should_pressurise: false,

            has_pressure_low_fault: false,
            pressure_low_confirmation: DelayedTrueLogicGate::new(
                Self::PRESSURE_LOW_FAULT_CONFIRMATION_TIME,
            ),
            has_air_pressure_low_fault: false,
            has_low_level_fault: false,
            has_overheat_fault: false,
            has_system_overheat_fault: false,
            is_on_ground_with_all_engines_off: false,

            is_pressure_low: true,

            is_in_auto_mode: false,
            is_in_manual_mode: false,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        overhead_panel: &A380HydraulicOverheadPanel,
        hydraulic_circuit: &impl HydraulicPressureSensors,
        reservoir: &Reservoir,
        engines: [&impl Engine; 4],
        lgciu: &impl LgciuWeightOnWheels,
        auto_logic: &A380ElectricPumpAutoLogic,
        pump_status: &impl HeatingElement,
    ) {
        self.update_operating_mode(overhead_panel, auto_logic);

        // Overheat state of the previous update: it is what the HSMU monitors before commanding the pump
        self.update_overheat(pump_status, reservoir);

        // The HSMU switches off an overheating electric pump. Design choice: the pump is off while its overheat is
        // detected, it can run again once cooled (the ECAM procedure then asks for the ELEC PMP pb-sw OFF).
        self.should_pressurise = (self.is_in_manual_mode || self.is_in_auto_mode)
            && !overhead_panel.epump_button_off_is_off(self.pump_id)
            && !self.is_inhibited(engines, lgciu)
            && !self.has_overheat_fault
            && self.is_powered;

        self.is_on_ground_with_all_engines_off =
            lgciu.left_and_right_gear_compressed(false) && !is_any_engine_running(engines);

        self.update_low_pressure(context, hydraulic_circuit);

        self.update_low_air_pressure(reservoir, overhead_panel);

        self.update_low_level(reservoir, overhead_panel);
    }

    /// In automatic mode any action on the ELEC PMP ON pb is disregarded; in manual mode the automatic mode is
    /// disregarded (e.g. cargo door actuation). So the mode that started first is kept: the ON pb starts the manual
    /// mode only while the pump does not run in automatic mode, and the automatic request is ignored while the pump is
    /// in manual mode.
    fn update_operating_mode(
        &mut self,
        overhead_panel: &A380HydraulicOverheadPanel,
        auto_logic: &A380ElectricPumpAutoLogic,
    ) {
        // State of the previous update, before should_pressurise is computed again
        let was_running_in_auto_mode = self.is_pressurising_in_auto_mode();

        self.is_in_manual_mode = overhead_panel.epump_button_on_is_on(self.pump_id)
            && (self.is_in_manual_mode || !was_running_in_auto_mode);
        self.is_in_auto_mode =
            auto_logic.should_auto_run_pump(self.pump_id) && !self.is_in_manual_mode;
    }

    /// The electric pumps work on ground only, and the green (yellow) pumps are inhibited as soon as engine 1 or 2
    /// (3 or 4) runs, because of the variable frequency of the engine generators.
    /// Design choices: an engine runs when its oil pressure is not low (the placeholder signal used before), and the
    /// green pumps read LGCIU 1, the yellow pumps LGCIU 2 for "on ground" (both main gears compressed).
    fn is_inhibited(&self, engines: [&impl Engine; 4], lgciu: &impl LgciuWeightOnWheels) -> bool {
        let side_engines = match self.pump_id {
            A380ElectricPumpId::GreenA | A380ElectricPumpId::GreenB => [0, 1],
            A380ElectricPumpId::YellowA | A380ElectricPumpId::YellowB => [2, 3],
            // The auxiliary pump has no controller of this kind (A380ElectricPumpAutoLogic)
            A380ElectricPumpId::GreenAuxiliary => [0, 1],
        };
        let side_engine_running = side_engines
            .iter()
            .any(|&engine| !engines[engine].oil_pressure_is_low());
        let on_ground = lgciu.left_and_right_gear_compressed(false);

        side_engine_running || !on_ground
    }

    /// is_pressure_low (the LO PR indication, HYD_*_EPUMP_LOW_PRESS) follows the pressure switch at once; the FAULT
    /// light term waits for PRESSURE_LOW_FAULT_CONFIRMATION_TIME, so the spin-up of a pump that has just started is
    /// not a pump failure. It resets at once when the pump is no longer commanded (pb-sw OFF).
    fn update_low_pressure(
        &mut self,
        context: &UpdateContext,
        hydraulic_circuit: &impl HydraulicPressureSensors,
    ) {
        self.is_pressure_low = self.should_pressurise()
            && !hydraulic_circuit
                .pump_section_switch_pressurised(self.pump_id.into_pump_section_index());

        self.pressure_low_confirmation
            .update(context, self.is_pressure_low);
        self.has_pressure_low_fault = self.pressure_low_confirmation.output();
    }

    fn update_overheat(&mut self, pump_status: &impl HeatingElement, reservoir: &Reservoir) {
        self.has_overheat_fault = pump_status.is_overheating();
        self.has_system_overheat_fault = reservoir.is_overheating();
    }

    fn update_low_air_pressure(
        &mut self,
        reservoir: &Reservoir,
        overhead_panel: &A380HydraulicOverheadPanel,
    ) {
        self.has_air_pressure_low_fault = reservoir.is_low_air_pressure()
            && !overhead_panel.epump_button_off_is_off(self.pump_id);
    }

    fn update_low_level(
        &mut self,
        reservoir: &Reservoir,
        overhead_panel: &A380HydraulicOverheadPanel,
    ) {
        self.has_low_level_fault =
            reservoir.is_low_level() && !overhead_panel.epump_button_off_is_off(self.pump_id);
    }

    /// ELEC PMP pb-sw FAULT light: the pump is failed (motor above 180 °C or pressure below 1 885 PSI), or must be
    /// stopped for a system failure (SYS OVHT, SYS TEMP EXCESS HI, RSVR LEVEL LO, RSVR AIR PRESS LO) on the ground with
    /// all engines off, as the procedures that turn the pumps off. It goes off when the crew selects OFF, except for an
    /// overheat, which keeps it on until the overheat is gone.
    fn has_any_fault(&self) -> bool {
        let pump_failure = self.has_pressure_low_fault || self.has_overheat_fault;
        let system_failure = self.has_low_level_fault
            || self.has_air_pressure_low_fault
            || self.has_system_overheat_fault;

        pump_failure || (system_failure && self.is_on_ground_with_all_engines_off)
    }

    /// The pump runs for the auto logic (cargo doors, BWS), so it is routed to the auxiliary section
    fn is_pressurising_in_auto_mode(&self) -> bool {
        self.is_in_auto_mode && self.should_pressurise
    }
}
impl PumpController for A380ElectricPumpController {
    fn should_pressurise(&self) -> bool {
        self.should_pressurise
    }
}
impl SimulationElement for A380ElectricPumpController {
    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.low_press_id, self.is_pressure_low);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }
}

struct A380AuxiliaryPumpController {
    pump_id: A380ElectricPumpId,

    should_pressurise: bool,
}
impl A380AuxiliaryPumpController {
    fn new(pump_id: A380ElectricPumpId) -> Self {
        Self {
            pump_id,
            should_pressurise: false,
        }
    }

    fn update(&mut self, auto_logic: &A380ElectricPumpAutoLogic) {
        self.should_pressurise = auto_logic.should_auto_run_pump(self.pump_id)
    }
}
impl PumpController for A380AuxiliaryPumpController {
    fn should_pressurise(&self) -> bool {
        self.should_pressurise
    }
}

struct A380BrakeSystemOutputs {
    left_demand: Ratio,
    right_demand: Ratio,
    pressure_limit: Pressure,
}
impl A380BrakeSystemOutputs {
    fn new() -> Self {
        Self {
            left_demand: Ratio::new::<ratio>(0.),
            right_demand: Ratio::new::<ratio>(0.),
            pressure_limit: Pressure::new::<psi>(3000.),
        }
    }

    fn set_pressure_limit(&mut self, pressure_limit: Pressure) {
        self.pressure_limit = pressure_limit;
    }

    fn set_brake_demands(&mut self, left_demand: Ratio, right_demand: Ratio) {
        self.left_demand = left_demand
            .min(Ratio::new::<ratio>(1.))
            .max(Ratio::new::<ratio>(0.));
        self.right_demand = right_demand
            .min(Ratio::new::<ratio>(1.))
            .max(Ratio::new::<ratio>(0.));
    }

    fn set_no_demands(&mut self) {
        self.left_demand = Ratio::new::<ratio>(0.);
        self.right_demand = Ratio::new::<ratio>(0.);
    }

    fn set_max_demands(&mut self) {
        self.left_demand = Ratio::new::<ratio>(1.);
        self.right_demand = Ratio::new::<ratio>(1.);
    }
}
impl BrakeCircuitController for A380BrakeSystemOutputs {
    fn pressure_limit(&self) -> Pressure {
        self.pressure_limit
    }

    fn left_brake_demand(&self) -> Ratio {
        self.left_demand
    }

    fn right_brake_demand(&self) -> Ratio {
        self.right_demand
    }
}

struct BodyWheelSteeringController {
    requested_position: Angle,
    is_left_side: bool,
}
impl BodyWheelSteeringController {
    const NOSE_ANGLE_INPUT_DEGREES: [f64; 4] = [-70., -20., 20., 70.];
    const BODY_STEERING_DEMAND_DEGREES: [f64; 4] = [15., 0., 0., -11.];

    const MAX_BODY_STEERING_SPEED_ENABLING_KNOT: f64 = 30.;

    fn new(is_left_side: bool) -> Self {
        Self {
            requested_position: Angle::default(),
            is_left_side,
        }
    }

    fn update(&mut self, context: &UpdateContext, nose_steering_angle: Angle, available: bool) {
        // A failed or uncontrolled BWS stays centred and locked
        if available
            && context.ground_speed().get::<knot>() < Self::MAX_BODY_STEERING_SPEED_ENABLING_KNOT
        {
            self.requested_position = if self.is_left_side {
                Angle::new::<degree>(interpolation(
                    &Self::NOSE_ANGLE_INPUT_DEGREES,
                    &Self::BODY_STEERING_DEMAND_DEGREES,
                    nose_steering_angle.get::<degree>(),
                ))
            } else {
                -Angle::new::<degree>(interpolation(
                    &Self::NOSE_ANGLE_INPUT_DEGREES,
                    &Self::BODY_STEERING_DEMAND_DEGREES,
                    -nose_steering_angle.get::<degree>(),
                ))
            };
        } else {
            self.requested_position = Angle::default();
        }
    }
}
impl SteeringController for BodyWheelSteeringController {
    fn requested_position(&self) -> Angle {
        self.requested_position
    }
}

struct BodyWheelSteeringControl {
    left_controller: BodyWheelSteeringController,
    right_controller: BodyWheelSteeringController,
}
impl BodyWheelSteeringControl {
    fn default() -> Self {
        Self {
            left_controller: BodyWheelSteeringController::new(true),
            right_controller: BodyWheelSteeringController::new(false),
        }
    }

    fn update(&mut self, context: &UpdateContext, nose_steering_feedback: Angle, available: bool) {
        self.left_controller
            .update(context, nose_steering_feedback, available);
        self.right_controller
            .update(context, nose_steering_feedback, available);
    }

    fn left_controller(&self) -> &impl SteeringController {
        &self.left_controller
    }

    fn right_controller(&self) -> &impl SteeringController {
        &self.right_controller
    }

    fn is_requesting_steering(&self) -> bool {
        self.left_controller
            .requested_position()
            .get::<degree>()
            .abs()
            > 0.1
            || self
                .right_controller
                .requested_position()
                .get::<degree>()
                .abs()
                > 0.1
    }
}

struct PedalSteeringDynamicLimiter {
    pedal_steering_limiter_landing: SteeringAngleLimiter<5>,
    pedal_steering_limiter_takeoff: SteeringAngleLimiter<5>,
    is_landing_mode: bool,
}
impl PedalSteeringDynamicLimiter {
    const SPEED_MAP_FOR_PEDAL_ACTION_KNOT: [f64; 5] = [0., 100., 150., 1500.0, 2800.0];
    const STEERING_ANGLE_FOR_PEDAL_ACTION_TAKEOFF_RATIO: [f64; 5] = [1., 1., 0.333, 0.333, 0.333]; // Used in takeoff mode only
    const STEERING_ANGLE_FOR_PEDAL_ACTION_LANDING_RATIO: [f64; 5] = [1., 1., 0., 0., 0.]; // Used in landing mode only
    const SPEED_TO_SWITCH_TAKEOFF_MODE_KNOT: f64 = 100.;

    fn default() -> Self {
        Self {
            pedal_steering_limiter_landing: SteeringAngleLimiter::new(
                Self::SPEED_MAP_FOR_PEDAL_ACTION_KNOT,
                Self::STEERING_ANGLE_FOR_PEDAL_ACTION_LANDING_RATIO,
            ),
            pedal_steering_limiter_takeoff: SteeringAngleLimiter::new(
                Self::SPEED_MAP_FOR_PEDAL_ACTION_KNOT,
                Self::STEERING_ANGLE_FOR_PEDAL_ACTION_TAKEOFF_RATIO,
            ),
            is_landing_mode: false,
        }
    }

    fn update(&mut self, ground_speed: Velocity, lgciu: &impl LgciuWeightOnWheels) {
        if !lgciu.left_and_right_gear_compressed(false) {
            self.is_landing_mode = true;
        }
        if ground_speed.get::<knot>() < Self::SPEED_TO_SWITCH_TAKEOFF_MODE_KNOT
            && lgciu.left_and_right_gear_compressed(false)
        {
            self.is_landing_mode = false;
        }
    }

    fn angle_from_speed(&self, speed: Velocity, angle_demand: Angle) -> Angle {
        if self.is_landing_mode {
            self.pedal_steering_limiter_landing
                .angle_from_speed(speed, angle_demand)
        } else {
            self.pedal_steering_limiter_takeoff
                .angle_from_speed(speed, angle_demand)
        }
    }
}

struct A380HydraulicBrakeSteerComputerUnit {
    park_brake_lever_pos_id: VariableIdentifier,

    antiskid_brakes_active_id: VariableIdentifier,
    left_brake_pedal_input_id: VariableIdentifier,
    right_brake_pedal_input_id: VariableIdentifier,

    rudder_pedal_input_id: VariableIdentifier,
    tiller_handle_input_id: VariableIdentifier,
    tiller_pedal_disconnect_id: VariableIdentifier,
    autopilot_nosewheel_demand_id: VariableIdentifier,

    autobrake_controller: A380AutobrakeController,
    parking_brake_demand: bool,

    /// L:A32NX_PRIM_n_HEALTHY (fly-by-wire module): the AUTO BRK needs two PRIMs
    prim_healthy_ids: [VariableIdentifier; 3],
    prims_healthy: [bool; 3],

    left_brake_pilot_input: Ratio,
    right_brake_pilot_input: Ratio,

    norm_brake_outputs: A380BrakeSystemOutputs,
    alternate_brake_outputs: A380BrakeSystemOutputs,

    normal_brakes_available: bool,
    should_disable_auto_brake_when_retracting: DelayedTrueLogicGate,
    anti_skid_activated: bool,

    /// BCS normal / alternate braking and EBCU faults, and the resulting braking mode of the pedals
    braking_faults: A380BrakingControlFaults,
    /// BCS 1/2, gear group anti-skid and brake pair faults
    anti_skid_faults: A380BrakeAntiSkidFaults,
    pedal_braking_mode: PedalBrakingMode,
    pedal_braking_mode_id: VariableIdentifier,
    /// EBCU pressure law of the emergency braking (take-off or landing law)
    emergency_brake_law: EmergencyBrakeLaw,
    /// SCS 1 and 2: NWS mode and BWS availability
    steering_control: A380SteeringControlSystem,

    tiller_pedal_disconnect: bool,
    tiller_handle_position: Ratio,
    rudder_pedal_position: Ratio,
    autopilot_nosewheel_demand: Ratio,

    pedal_steering_limiter: PedalSteeringDynamicLimiter,
    pedal_input_map: SteeringRatioToAngle<6>,
    tiller_steering_limiter: SteeringAngleLimiter<5>,
    tiller_input_map: SteeringRatioToAngle<6>,
    final_steering_position_request: Angle,

    body_wheel_steering_control: BodyWheelSteeringControl,

    heading_control_function: HeadingControlFunction,
}
impl A380HydraulicBrakeSteerComputerUnit {
    const RUDDER_PEDAL_INPUT_GAIN: f64 = 32.;
    const RUDDER_PEDAL_INPUT_MAP: [f64; 6] = [0., 1., 2., 32., 32., 32.];
    const RUDDER_PEDAL_INPUT_CURVE_MAP: [f64; 6] = [0., 0., 2., 6.4, 6.4, 6.4];
    const MAX_RUDDER_INPUT_INCLUDING_AUTOPILOT_DEGREE: f64 = 6.;

    const TILLER_INPUT_GAIN: f64 = 75.;
    const TILLER_INPUT_MAP: [f64; 6] = [0., 1., 20., 40., 66., 75.];
    const TILLER_INPUT_CURVE_MAP: [f64; 6] = [0., 0., 4., 15., 45., 74.];

    const AUTOPILOT_STEERING_INPUT_GAIN: f64 = 6.;

    const SPEED_MAP_FOR_TILLER_ACTION_KNOT: [f64; 5] = [0., 40., 100., 1500.0, 2800.0];
    const STEERING_ANGLE_FOR_TILLER_ACTION_RATIO: [f64; 5] = [1., 1., 0., 0., 0.];

    const MAX_STEERING_ANGLE_DEMAND_DEGREES: f64 = 70.;

    const AUTOBRAKE_GEAR_RETRACTION_DURATION_S: f64 = 3.;

    /// The basic AUTO BRK needs at least two PRIMs
    const MIN_HEALTHY_PRIMS_FOR_AUTOBRAKE: usize = 2;

    const PILOT_INPUT_DETECTION_TRESHOLD: f64 = 0.2;

    fn new(context: &mut InitContext) -> Self {
        Self {
            park_brake_lever_pos_id: context.get_identifier("PARK_BRAKE_LEVER_POS".to_owned()),
            antiskid_brakes_active_id: context.get_identifier("ANTISKID BRAKES ACTIVE".to_owned()),
            left_brake_pedal_input_id: context.get_identifier("LEFT_BRAKE_PEDAL_INPUT".to_owned()),
            right_brake_pedal_input_id: context
                .get_identifier("RIGHT_BRAKE_PEDAL_INPUT".to_owned()),

            rudder_pedal_input_id: context.get_identifier("RUDDER_PEDAL_POSITION_RATIO".to_owned()),
            tiller_handle_input_id: context.get_identifier("TILLER_HANDLE_POSITION".to_owned()),
            tiller_pedal_disconnect_id: context
                .get_identifier("TILLER_PEDAL_DISCONNECT".to_owned()),
            autopilot_nosewheel_demand_id: context
                .get_identifier("AUTOPILOT_NOSEWHEEL_DEMAND".to_owned()),

            autobrake_controller: A380AutobrakeController::new(context),

            parking_brake_demand: true,
            prim_healthy_ids: [1, 2, 3]
                .map(|number| context.get_identifier(format!("PRIM_{}_HEALTHY", number))),
            prims_healthy: [false; 3],
            left_brake_pilot_input: Ratio::new::<ratio>(0.0),
            right_brake_pilot_input: Ratio::new::<ratio>(0.0),
            norm_brake_outputs: A380BrakeSystemOutputs::new(),
            alternate_brake_outputs: A380BrakeSystemOutputs::new(),
            normal_brakes_available: false,
            should_disable_auto_brake_when_retracting: DelayedTrueLogicGate::new(
                Duration::from_secs_f64(Self::AUTOBRAKE_GEAR_RETRACTION_DURATION_S),
            ),
            anti_skid_activated: true,

            braking_faults: A380BrakingControlFaults::new(context),
            anti_skid_faults: A380BrakeAntiSkidFaults::new(context),
            pedal_braking_mode: PedalBrakingMode::Normal,
            pedal_braking_mode_id: context.get_identifier("BRAKES_PEDAL_BRAKING_MODE".to_owned()),
            emergency_brake_law: EmergencyBrakeLaw::initial(context.is_in_flight()),
            steering_control: A380SteeringControlSystem::new(context),

            tiller_pedal_disconnect: false,
            tiller_handle_position: Ratio::new::<ratio>(0.),
            rudder_pedal_position: Ratio::new::<ratio>(0.),
            autopilot_nosewheel_demand: Ratio::new::<ratio>(0.),

            pedal_steering_limiter: PedalSteeringDynamicLimiter::default(),
            pedal_input_map: SteeringRatioToAngle::new(
                Ratio::new::<ratio>(Self::RUDDER_PEDAL_INPUT_GAIN),
                Self::RUDDER_PEDAL_INPUT_MAP,
                Self::RUDDER_PEDAL_INPUT_CURVE_MAP,
            ),
            tiller_steering_limiter: SteeringAngleLimiter::new(
                Self::SPEED_MAP_FOR_TILLER_ACTION_KNOT,
                Self::STEERING_ANGLE_FOR_TILLER_ACTION_RATIO,
            ),
            tiller_input_map: SteeringRatioToAngle::new(
                Ratio::new::<ratio>(Self::TILLER_INPUT_GAIN),
                Self::TILLER_INPUT_MAP,
                Self::TILLER_INPUT_CURVE_MAP,
            ),
            final_steering_position_request: Angle::new::<degree>(0.),

            body_wheel_steering_control: BodyWheelSteeringControl::default(),

            heading_control_function: HeadingControlFunction::default(),
        }
    }

    /// The basic AUTO BRK arms with A-SKID available (normal and alternate braking), at least two PRIMs (they give it
    /// the ground spoiler extension command) and at least one ADIRU in NAV. Alternate braking keeps A-SKID and AUTO
    /// BRK; emergency braking (EBCU) has neither. A gear group without anti-skid (partial A-SKID) loses the AUTO BRK
    /// too.
    fn allow_autobrake_arming(&self, adirs: &impl AdirsMeasurementOutputs) -> bool {
        let a_skid_available = matches!(
            self.pedal_braking_mode,
            PedalBrakingMode::Normal | PedalBrakingMode::Alternate
        ) && !self.anti_skid_faults.any_gear_group_anti_skid_lost();
        let healthy_prims = self
            .prims_healthy
            .iter()
            .filter(|&&healthy| healthy)
            .count();

        a_skid_available
            && healthy_prims >= Self::MIN_HEALTHY_PRIMS_FOR_AUTOBRAKE
            && (adirs.is_fully_aligned(1) || adirs.is_fully_aligned(2) || adirs.is_fully_aligned(3))
    }

    /// The normal braking has its hydraulic power while the GREEN system pressure switch is pressurised (the model
    /// supplies the normal braking of all the gears from GREEN, see brake_steer_faults.rs). Design choice (no published
    /// switching pressure): the GREEN system pressure switch of this 5 000 psi model, 2 900 / 3 700 psi
    /// (MIN_PRESS_PRESSURISED_*), in place of the A320 1 305 / 2 176 psi. The normal braking comes back only with the
    /// pedals released.
    fn update_normal_braking_availability(&mut self, normal_braking_hydraulic_pressurised: bool) {
        if normal_braking_hydraulic_pressurised
            && (self.left_brake_pilot_input.get::<ratio>() < Self::PILOT_INPUT_DETECTION_TRESHOLD
                && self.right_brake_pilot_input.get::<ratio>()
                    < Self::PILOT_INPUT_DETECTION_TRESHOLD)
        {
            self.normal_brakes_available = true;
        } else if !normal_braking_hydraulic_pressurised {
            self.normal_brakes_available = false;
        }
    }

    fn update_brake_pressure_limitation(&mut self) {
        let full_brake_pressure = Pressure::new::<psi>(A380Hydraulic::FULL_BRAKE_PRESSURE_PSI);

        // Normal braking (pedals and AUTO BRK) up to the full brake pressure
        self.norm_brake_outputs
            .set_pressure_limit(full_brake_pressure);

        let alternate_brake_pressure_limit = if self.parking_brake_demand {
            // The parking brake applies full pressure (about 3 600 PSI) on the BLG brakes; with the pedals pressed the
            // highest commanded pressure applies, so the park brake pressure is the highest one.
            full_brake_pressure
        } else if self.pedal_braking_mode == PedalBrakingMode::Emergency {
            // Emergency braking (EBCU, no A-SKID): A-SKID sw OFF, or the BCS lost normal and alternate braking.
            // EBCU landing law 1 000 psi, take-off law 1 700 psi (EmergencyBrakeLaw)
            self.emergency_brake_law.pressure_limit()
        } else {
            // Alternate braking performs as normal braking
            full_brake_pressure
        };

        self.alternate_brake_outputs
            .set_pressure_limit(alternate_brake_pressure_limit);
    }

    /// Updates brakes and nose steering demands
    fn update(
        &mut self,
        context: &UpdateContext,
        current_pressure: &impl SectionPressure,
        lgciu1: &impl LgciuInterface,
        lgciu2: &impl LgciuInterface,
        autobrake_panel: &A380AutobrakePanel,
        engines: [&impl Engine; 4],
        adirs: &impl AdirsMeasurementOutputs,
        placeholder_ground_spoilers_out: bool,
        nose_steering_feedback: Angle,
    ) {
        let any_engine_running = engines.iter().any(|engine| !engine.oil_pressure_is_low());
        self.steering_control.update(
            current_pressure.is_pressure_switch_pressurised(),
            any_engine_running,
        );

        // TODO split steering part from braking part in two different computers instances
        self.update_steering_demands(context, adirs, lgciu1, nose_steering_feedback);
        self.body_wheel_steering_control.update(
            context,
            nose_steering_feedback,
            self.steering_control.is_body_wheel_steering_available(),
        );

        self.update_normal_braking_availability(current_pressure.is_pressure_switch_pressurised());
        self.pedal_braking_mode = self.braking_faults.pedal_braking_mode(
            self.normal_brakes_available,
            self.anti_skid_activated,
            self.anti_skid_faults.anti_skid_lost_on_all_gears(),
        );
        let main_gears_in_flight = !(lgciu1.left_and_right_gear_compressed(true)
            || lgciu2.left_and_right_gear_compressed(true));
        self.emergency_brake_law = self
            .emergency_brake_law
            .next(main_gears_in_flight, self.parking_brake_demand);
        self.update_brake_pressure_limitation();

        self.autobrake_controller.update(
            context,
            autobrake_panel,
            self.allow_autobrake_arming(adirs),
            self.left_brake_pilot_input,
            self.right_brake_pilot_input,
            lgciu1,
            lgciu2,
            placeholder_ground_spoilers_out,
        );

        let is_in_flight_gear_lever_up = !(lgciu1.left_and_right_gear_compressed(true)
            || lgciu2.left_and_right_gear_compressed(true)
            || lgciu1.gear_handle_is_down());

        self.should_disable_auto_brake_when_retracting
            .update(context, is_in_flight_gear_lever_up);

        // Design choice: a leaking normal servo valve sees the GREEN supply on the ground or with the gear lever down,
        // not in flight with the gear up (normal brake selector valve closed)
        self.anti_skid_faults.update(
            self.pedal_braking_mode,
            self.normal_brakes_available && !is_in_flight_gear_lever_up,
        );

        // Manual braking is only available on the ground. Design choice: on the ground as soon as one main gear is
        // compressed (LGCIU 1 or 2), so that a touchdown on one side does not delay the pedal braking; the park brake
        // (ultimate braking) and the AUTO BRK are not affected.
        let main_gear_on_ground = lgciu1.left_gear_compressed(true)
            || lgciu1.right_gear_compressed(true)
            || lgciu2.left_gear_compressed(true)
            || lgciu2.right_gear_compressed(true);
        let (left_pedal_demand, right_pedal_demand) = if main_gear_on_ground {
            (self.left_brake_pilot_input, self.right_brake_pilot_input)
        } else {
            (Ratio::default(), Ratio::default())
        };
        let autobrake_demand = self.autobrake_controller.brake_output();

        if is_in_flight_gear_lever_up {
            // Retraction braking is a normal braking function
            if self.should_disable_auto_brake_when_retracting.output()
                || self.braking_faults.normal_braking_failed()
            {
                self.norm_brake_outputs.set_no_demands();
            } else {
                // Slight brake pressure to stop the spinning wheels (have no pressure data available yet, 0.2 is random one)
                self.norm_brake_outputs
                    .set_brake_demands(Ratio::new::<ratio>(0.2), Ratio::new::<ratio>(0.2));
            }

            self.alternate_brake_outputs.set_no_demands();
        } else {
            let green_used_for_brakes =
                self.pedal_braking_mode == PedalBrakingMode::Normal && !self.parking_brake_demand;

            if green_used_for_brakes {
                // Final output on normal brakes is max(pilot demand , autobrake demand) to allow pilot override autobrake demand
                self.norm_brake_outputs.set_brake_demands(
                    left_pedal_demand.max(autobrake_demand),
                    right_pedal_demand.max(autobrake_demand),
                );

                self.alternate_brake_outputs.set_no_demands();
            } else if self.parking_brake_demand {
                // The park brake applies the full pressure on the alternate circuit (ultimate braking). The pedals
                // still brake on the normal circuit, without setting PARK BRK OFF: on each gear the highest commanded
                // pressure applies. AUTO BRK is not available with the PARK BRK ON.
                self.alternate_brake_outputs.set_max_demands();

                if self.pedal_braking_mode == PedalBrakingMode::Normal {
                    self.norm_brake_outputs
                        .set_brake_demands(left_pedal_demand, right_pedal_demand);
                } else {
                    self.norm_brake_outputs.set_no_demands();
                }
            } else {
                self.norm_brake_outputs.set_no_demands();

                match self.pedal_braking_mode {
                    // BRAKES PEDAL BRAKING FAULT: no pedal braking
                    PedalBrakingMode::None => self.alternate_brake_outputs.set_no_demands(),
                    // Alternate braking with A-SKID keeps the AUTO BRK, the pilot overrides the autobrake as on the
                    // normal circuit
                    PedalBrakingMode::Alternate => self.alternate_brake_outputs.set_brake_demands(
                        left_pedal_demand.max(autobrake_demand),
                        right_pedal_demand.max(autobrake_demand),
                    ),
                    // Emergency braking (EBCU): no AUTO BRK; Normal is the green branch above
                    PedalBrakingMode::Emergency | PedalBrakingMode::Normal => self
                        .alternate_brake_outputs
                        .set_brake_demands(left_pedal_demand, right_pedal_demand),
                }
            }
        }
    }

    fn is_body_wheel_steering_locked(&self) -> bool {
        self.steering_control.is_body_wheel_steering_locked()
    }

    fn update_steering_demands(
        &mut self,
        context: &UpdateContext,
        adirs: &impl AdirsMeasurementOutputs,
        lgciu1: &impl LgciuInterface,
        nose_steering_feedback: Angle,
    ) {
        self.pedal_steering_limiter
            .update(context.ground_speed(), lgciu1); // TODO check which lgciu input is used for mode determination

        let steer_angle_from_autopilot = Angle::new::<degree>(
            self.autopilot_nosewheel_demand.get::<ratio>() * Self::AUTOPILOT_STEERING_INPUT_GAIN,
        );

        let steer_angle_from_pedals = if self.tiller_pedal_disconnect
            || !self.steering_control.is_pedal_steering_available()
        {
            Angle::new::<degree>(0.)
        } else {
            self.pedal_input_map
                .angle_demand_from_input_demand(self.rudder_pedal_position)
        };

        // TODO Here ground speed would be probably computed from wheel sensor logic
        let final_steer_rudder_plus_autopilot = self.pedal_steering_limiter.angle_from_speed(
            context.ground_speed(),
            (steer_angle_from_pedals + steer_angle_from_autopilot)
                .min(Angle::new::<degree>(
                    Self::MAX_RUDDER_INPUT_INCLUDING_AUTOPILOT_DEGREE,
                ))
                .max(Angle::new::<degree>(
                    -Self::MAX_RUDDER_INPUT_INCLUDING_AUTOPILOT_DEGREE,
                )),
        );

        let steer_angle_from_tiller = self.tiller_steering_limiter.angle_from_speed(
            context.ground_speed(),
            self.tiller_input_map
                .angle_demand_from_input_demand(self.tiller_handle_position),
        );

        let any_steering_demand_active = steer_angle_from_autopilot.abs()
            > Angle::new::<degree>(0.)
            || steer_angle_from_pedals.abs() > Angle::new::<degree>(0.1)
            || steer_angle_from_tiller.abs() > Angle::new::<degree>(0.1);

        self.heading_control_function.update(
            context,
            1,
            adirs,
            any_steering_demand_active,
            nose_steering_feedback,
        );

        // Unlike the A320 A/SKID & N/W STRG switch, the A380 A-SKID switch does not cut off the steering.
        // Without NWS (all engines shut down, both NWS modes or both SCS failed) the SCS commands nothing and the nose
        // wheels caster.
        let nose_wheel_steering_available =
            self.steering_control.nose_wheel_steering_mode() != NoseWheelSteeringMode::Off;
        self.final_steering_position_request =
            if nose_wheel_steering_available && lgciu1.nose_gear_compressed(false) {
                (final_steer_rudder_plus_autopilot
                    + steer_angle_from_tiller
                    + self.heading_control_function.steering_output())
                .min(Angle::new::<degree>(
                    Self::MAX_STEERING_ANGLE_DEMAND_DEGREES,
                ))
                .max(Angle::new::<degree>(
                    -Self::MAX_STEERING_ANGLE_DEMAND_DEGREES,
                ))
            } else {
                Angle::new::<degree>(0.)
            };
    }

    fn norm_controller(&self) -> &impl BrakeCircuitController {
        &self.norm_brake_outputs
    }

    /// The pressure of each brake pair (index 0 = brakes 1/2), with the gear group and brake pair faults
    fn brake_pair_pressures(
        &self,
        norm_brakes: &BrakeCircuit,
        altn_brakes: &BrakeCircuit,
    ) -> [BrakePairPressures; BRAKE_PAIR_COUNT] {
        self.anti_skid_faults.brake_pair_pressures(
            BrakePairPressures {
                normal: norm_brakes.left_brake_pressure(),
                alternate: altn_brakes.left_brake_pressure(),
            },
            BrakePairPressures {
                normal: norm_brakes.right_brake_pressure(),
                alternate: altn_brakes.right_brake_pressure(),
            },
            BrakingState {
                pedal_braking_mode: self.pedal_braking_mode,
                parking_brake_on: self.parking_brake_demand,
                emergency_pressure_limit: self.emergency_brake_law.pressure_limit(),
            },
        )
    }

    fn alternate_controller(&self) -> &impl BrakeCircuitController {
        &self.alternate_brake_outputs
    }

    fn left_body_steering_controller(&self) -> &impl SteeringController {
        self.body_wheel_steering_control.left_controller()
    }

    fn right_body_steering_controller(&self) -> &impl SteeringController {
        self.body_wheel_steering_control.right_controller()
    }

    fn should_pressurise_for_body_steering(&self) -> bool {
        self.body_wheel_steering_control.is_requesting_steering()
    }

    fn nose_wheel_steering_mode(&self) -> NoseWheelSteeringMode {
        self.steering_control.nose_wheel_steering_mode()
    }
}
impl SimulationElement for A380HydraulicBrakeSteerComputerUnit {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.autobrake_controller.accept(visitor);
        self.braking_faults.accept(visitor);
        self.anti_skid_faults.accept(visitor);
        self.steering_control.accept(visitor);
        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.pedal_braking_mode_id,
            f64::from(self.pedal_braking_mode),
        );
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        self.parking_brake_demand = reader.read(&self.park_brake_lever_pos_id);

        for (healthy, id) in self
            .prims_healthy
            .iter_mut()
            .zip(self.prim_healthy_ids.iter())
        {
            let value: f64 = reader.read(id);
            *healthy = value > 0.5;
        }

        self.anti_skid_activated = reader.read(&self.antiskid_brakes_active_id);
        self.left_brake_pilot_input =
            Ratio::new::<percent>(reader.read(&self.left_brake_pedal_input_id));
        self.right_brake_pilot_input =
            Ratio::new::<percent>(reader.read(&self.right_brake_pedal_input_id));

        self.tiller_handle_position =
            Ratio::new::<ratio>(reader.read(&self.tiller_handle_input_id));
        self.rudder_pedal_position = Ratio::new::<ratio>(reader.read(&self.rudder_pedal_input_id));
        self.tiller_pedal_disconnect = reader.read(&self.tiller_pedal_disconnect_id);

        self.autopilot_nosewheel_demand =
            Ratio::new::<ratio>(reader.read(&self.autopilot_nosewheel_demand_id));
    }
}
impl SteeringController for A380HydraulicBrakeSteerComputerUnit {
    fn requested_position(&self) -> Angle {
        self.final_steering_position_request
    }
}

struct A380BrakingForce {
    brake_left_force_factor_id: VariableIdentifier,
    brake_right_force_factor_id: VariableIdentifier,
    trailing_edge_flaps_left_percent_id: VariableIdentifier,
    trailing_edge_flaps_right_percent_id: VariableIdentifier,

    enabled_chocks_id: VariableIdentifier,
    light_beacon_on_id: VariableIdentifier,

    left_braking_force: f64,
    right_braking_force: f64,

    flap_position: f64,

    is_chocks_enabled: bool,
    is_light_beacon_on: bool,
}
impl A380BrakingForce {
    /// The brake pressure of the full brake force: the full brake pressure, about 3 600 psi
    const REFERENCE_PRESSURE_FOR_MAX_FORCE: f64 = A380Hydraulic::FULL_BRAKE_PRESSURE_PSI;

    const FLAPS_BREAKPOINTS: [f64; 3] = [0., 50., 100.];

    /// Brake force ratio [0:1] of one brake circuit: sqrt(pressure / full brake pressure). The square root gives a bit
    /// more punch to the lower brake pressures (like the 1 000 psi of the EBCU landing law) than a linear formula, as
    /// the A320 formula (50 * sqrt(pressure) / 2 538 psi), normalised to the full brake pressure of the A380.
    fn force_from_pressure(pressure: Pressure) -> f64 {
        (pressure.get::<psi>().max(0.) / Self::REFERENCE_PRESSURE_FOR_MAX_FORCE).sqrt()
    }

    /// Brake force ratio [0:1] of one side: the mean of its four brake pairs, each the sum of its NORM and ALTN
    /// circuit forces
    fn side_force(brake_pairs: &[BrakePairPressures; BRAKE_PAIR_COUNT], left_side: bool) -> f64 {
        let force_sum: f64 = brake_pairs
            .iter()
            .enumerate()
            .filter(|(pair, _)| brake_pair_is_on_left_side(*pair) == left_side)
            .map(|(_, pressures)| {
                (Self::force_from_pressure(pressures.normal)
                    + Self::force_from_pressure(pressures.alternate))
                .clamp(0., 1.)
            })
            .sum();
        force_sum / (BRAKE_PAIR_COUNT / 2) as f64
    }

    const FLAPS_PENALTY_PERCENT: [f64; 3] = [5., 5., 0.];

    pub fn new(context: &mut InitContext) -> Self {
        A380BrakingForce {
            brake_left_force_factor_id: context
                .get_identifier("BRAKE LEFT FORCE FACTOR".to_owned()),
            brake_right_force_factor_id: context
                .get_identifier("BRAKE RIGHT FORCE FACTOR".to_owned()),
            trailing_edge_flaps_left_percent_id: context
                .get_identifier("LEFT_FLAPS_POSITION_PERCENT".to_owned()),
            trailing_edge_flaps_right_percent_id: context
                .get_identifier("RIGHT_FLAPS_POSITION_PERCENT".to_owned()),

            enabled_chocks_id: context.get_identifier("MODEL_WHEELCHOCKS_ENABLED".to_owned()),
            light_beacon_on_id: context.get_identifier("LIGHT BEACON".to_owned()),

            left_braking_force: 0.,
            right_braking_force: 0.,

            flap_position: 0.,

            is_chocks_enabled: false,
            is_light_beacon_on: false,
        }
    }

    pub fn update_forces(
        &mut self,
        context: &UpdateContext,
        brake_pairs: &[BrakePairPressures; BRAKE_PAIR_COUNT],
        engine1: &impl Engine,
        engine2: &impl Engine,
        bypass_pin: &BypassPin,
    ) {
        self.left_braking_force = Self::side_force(brake_pairs, true);
        self.right_braking_force = Self::side_force(brake_pairs, false);

        self.correct_with_flaps_state(context);

        self.update_chocks_braking(context, engine1, engine2, bypass_pin);
    }

    fn correct_with_flaps_state(&mut self, context: &UpdateContext) {
        let flap_correction = Ratio::new::<percent>(interpolation(
            &Self::FLAPS_BREAKPOINTS,
            &Self::FLAPS_PENALTY_PERCENT,
            self.flap_position,
        ));

        // Using airspeed with formula 0.1 * sqrt(airspeed) to get a 0 to 1 ratio to use our flap correction
        // This way the less airspeed, the less our correction is used as it is an aerodynamic effect on brakes
        let mut airspeed_corrective_factor =
            0.1 * context.indicated_airspeed().get::<knot>().abs().sqrt();
        airspeed_corrective_factor = airspeed_corrective_factor.min(1.0);

        let final_flaps_correction_with_speed = flap_correction * airspeed_corrective_factor;

        self.left_braking_force = self.left_braking_force
            - (self.left_braking_force * final_flaps_correction_with_speed.get::<ratio>());

        self.right_braking_force = self.right_braking_force
            - (self.right_braking_force * final_flaps_correction_with_speed.get::<ratio>());
    }

    fn update_chocks_braking(
        &mut self,
        context: &UpdateContext,
        engine1: &impl Engine,
        engine2: &impl Engine,
        bypass_pin: &BypassPin,
    ) {
        let chocks_on_wheels = context.is_on_ground()
            && engine1.corrected_n1().get::<percent>() < 3.5
            && engine2.corrected_n1().get::<percent>() < 3.5
            && !bypass_pin.is_nose_wheel_steering_pin_inserted()
            && !self.is_light_beacon_on;

        if self.is_chocks_enabled && chocks_on_wheels {
            self.left_braking_force = 1.;
            self.right_braking_force = 1.;
        }
    }
}

impl SimulationElement for A380BrakingForce {
    fn write(&self, writer: &mut SimulatorWriter) {
        // BRAKE XXXX FORCE FACTOR is the actual braking force we want the plane to generate in the simulator
        writer.write(&self.brake_left_force_factor_id, self.left_braking_force);
        writer.write(&self.brake_right_force_factor_id, self.right_braking_force);
    }

    fn read(&mut self, reader: &mut SimulatorReader) {
        let left_flap: f64 = reader.read(&self.trailing_edge_flaps_left_percent_id);
        let right_flap: f64 = reader.read(&self.trailing_edge_flaps_right_percent_id);
        self.flap_position = (left_flap + right_flap) / 2.;

        self.is_chocks_enabled = reader.read(&self.enabled_chocks_id);
        self.is_light_beacon_on = reader.read(&self.light_beacon_on_id);
    }
}

pub(super) struct A380HydraulicOverheadPanel {
    edp1a_push_button: AutoOffFaultPushButton,
    edp2a_push_button: AutoOffFaultPushButton,
    edp3a_push_button: AutoOffFaultPushButton,
    edp4a_push_button: AutoOffFaultPushButton,
    edp1b_push_button: AutoOffFaultPushButton,
    edp2b_push_button: AutoOffFaultPushButton,
    edp3b_push_button: AutoOffFaultPushButton,
    edp4b_push_button: AutoOffFaultPushButton,

    eng1_edp_disconnect: AutoOffFaultPushButton,
    eng2_edp_disconnect: AutoOffFaultPushButton,
    eng3_edp_disconnect: AutoOffFaultPushButton,
    eng4_edp_disconnect: AutoOffFaultPushButton,

    yellow_epump_a_on_push_button: AutoOnFaultPushButton,
    yellow_epump_b_on_push_button: AutoOnFaultPushButton,
    green_epump_a_on_push_button: AutoOnFaultPushButton,
    green_epump_b_on_push_button: AutoOnFaultPushButton,

    yellow_epump_a_off_push_button: AutoOffFaultPushButton,
    yellow_epump_b_off_push_button: AutoOffFaultPushButton,
    green_epump_a_off_push_button: AutoOffFaultPushButton,
    green_epump_b_off_push_button: AutoOffFaultPushButton,

    green_leak_measurement_push_button: AutoOffFaultPushButton,
    yellow_leak_measurement_push_button: AutoOffFaultPushButton,
}
impl A380HydraulicOverheadPanel {
    pub(super) fn new(context: &mut InitContext) -> A380HydraulicOverheadPanel {
        A380HydraulicOverheadPanel {
            edp1a_push_button: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_1A_PUMP"),
            edp2a_push_button: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_2A_PUMP"),
            edp3a_push_button: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_3A_PUMP"),
            edp4a_push_button: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_4A_PUMP"),
            edp1b_push_button: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_1B_PUMP"),
            edp2b_push_button: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_2B_PUMP"),
            edp3b_push_button: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_3B_PUMP"),
            edp4b_push_button: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_4B_PUMP"),

            eng1_edp_disconnect: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_1AB_PUMP_DISC"),
            eng2_edp_disconnect: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_2AB_PUMP_DISC"),
            eng3_edp_disconnect: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_3AB_PUMP_DISC"),
            eng4_edp_disconnect: AutoOffFaultPushButton::new_auto(context, "HYD_ENG_4AB_PUMP_DISC"),

            yellow_epump_a_on_push_button: AutoOnFaultPushButton::new_auto(
                context,
                "HYD_EPUMPYA_ON",
            ),
            yellow_epump_b_on_push_button: AutoOnFaultPushButton::new_auto(
                context,
                "HYD_EPUMPYB_ON",
            ),

            green_epump_a_on_push_button: AutoOnFaultPushButton::new_auto(
                context,
                "HYD_EPUMPGA_ON",
            ),
            green_epump_b_on_push_button: AutoOnFaultPushButton::new_auto(
                context,
                "HYD_EPUMPGB_ON",
            ),

            yellow_epump_a_off_push_button: AutoOffFaultPushButton::new_auto(
                context,
                "HYD_EPUMPYA_OFF",
            ),
            yellow_epump_b_off_push_button: AutoOffFaultPushButton::new_auto(
                context,
                "HYD_EPUMPYB_OFF",
            ),

            green_epump_a_off_push_button: AutoOffFaultPushButton::new_auto(
                context,
                "HYD_EPUMPGA_OFF",
            ),
            green_epump_b_off_push_button: AutoOffFaultPushButton::new_auto(
                context,
                "HYD_EPUMPGB_OFF",
            ),

            green_leak_measurement_push_button: AutoOffFaultPushButton::new_auto(
                context,
                "HYD_LEAK_MEASUREMENT_G",
            ),

            yellow_leak_measurement_push_button: AutoOffFaultPushButton::new_auto(
                context,
                "HYD_LEAK_MEASUREMENT_Y",
            ),
        }
    }

    pub(super) fn update(&mut self, hyd: &A380Hydraulic) {
        self.eng1_edp_disconnect
            .set_fault(hyd.pump_disc_has_fault(1));
        self.eng2_edp_disconnect
            .set_fault(hyd.pump_disc_has_fault(2));
        self.eng3_edp_disconnect
            .set_fault(hyd.pump_disc_has_fault(3));
        self.eng4_edp_disconnect
            .set_fault(hyd.pump_disc_has_fault(4));

        self.edp1a_push_button
            .set_fault(hyd.edp_has_fault(A380EngineDrivenPumpId::Edp1a));
        self.edp2a_push_button
            .set_fault(hyd.edp_has_fault(A380EngineDrivenPumpId::Edp2a));
        self.edp3a_push_button
            .set_fault(hyd.edp_has_fault(A380EngineDrivenPumpId::Edp3a));
        self.edp4a_push_button
            .set_fault(hyd.edp_has_fault(A380EngineDrivenPumpId::Edp4a));

        self.edp1b_push_button
            .set_fault(hyd.edp_has_fault(A380EngineDrivenPumpId::Edp1b));
        self.edp2b_push_button
            .set_fault(hyd.edp_has_fault(A380EngineDrivenPumpId::Edp2b));
        self.edp3b_push_button
            .set_fault(hyd.edp_has_fault(A380EngineDrivenPumpId::Edp3b));
        self.edp4b_push_button
            .set_fault(hyd.edp_has_fault(A380EngineDrivenPumpId::Edp4b));

        self.yellow_epump_a_off_push_button
            .set_fault(hyd.epump_has_fault(A380ElectricPumpId::YellowA));
        self.yellow_epump_b_off_push_button
            .set_fault(hyd.epump_has_fault(A380ElectricPumpId::YellowB));

        self.green_epump_a_off_push_button
            .set_fault(hyd.epump_has_fault(A380ElectricPumpId::GreenA));
        self.green_epump_b_off_push_button
            .set_fault(hyd.epump_has_fault(A380ElectricPumpId::GreenB));

        if self.yellow_epump_a_off_push_button.is_off() {
            self.yellow_epump_a_on_push_button.push_auto()
        }
        if self.yellow_epump_b_off_push_button.is_off() {
            self.yellow_epump_b_on_push_button.push_auto()
        }
        if self.green_epump_a_off_push_button.is_off() {
            self.green_epump_a_on_push_button.push_auto()
        }
        if self.green_epump_b_off_push_button.is_off() {
            self.green_epump_b_on_push_button.push_auto()
        }
    }

    fn engines_edp_disconnected(&self, engine_num: usize) -> bool {
        match engine_num {
            1 => !self.eng1_edp_disconnect.is_auto(),
            2 => !self.eng2_edp_disconnect.is_auto(),
            3 => !self.eng3_edp_disconnect.is_auto(),
            4 => !self.eng4_edp_disconnect.is_auto(),
            _ => panic!("Only 4 engines on A380"),
        }
    }

    fn epump_button_off_is_off(&self, pump_id: A380ElectricPumpId) -> bool {
        match pump_id {
            A380ElectricPumpId::GreenA => self.green_epump_a_off_push_button.is_off(),
            A380ElectricPumpId::GreenB => self.green_epump_b_off_push_button.is_off(),
            A380ElectricPumpId::YellowA => self.yellow_epump_a_off_push_button.is_off(),
            A380ElectricPumpId::YellowB => self.yellow_epump_b_off_push_button.is_off(),
            A380ElectricPumpId::GreenAuxiliary => true,
        }
    }

    fn edp_push_button_is_auto(&self, pump_id: A380EngineDrivenPumpId) -> bool {
        match pump_id {
            A380EngineDrivenPumpId::Edp1a => self.edp1a_push_button.is_auto(),
            A380EngineDrivenPumpId::Edp2a => self.edp2a_push_button.is_auto(),
            A380EngineDrivenPumpId::Edp3a => self.edp3a_push_button.is_auto(),
            A380EngineDrivenPumpId::Edp4a => self.edp4a_push_button.is_auto(),
            A380EngineDrivenPumpId::Edp1b => self.edp1b_push_button.is_auto(),
            A380EngineDrivenPumpId::Edp2b => self.edp2b_push_button.is_auto(),
            A380EngineDrivenPumpId::Edp3b => self.edp3b_push_button.is_auto(),
            A380EngineDrivenPumpId::Edp4b => self.edp4b_push_button.is_auto(),
        }
    }

    fn edp_push_button_is_off(&self, pump_id: A380EngineDrivenPumpId) -> bool {
        match pump_id {
            A380EngineDrivenPumpId::Edp1a => self.edp1a_push_button.is_off(),
            A380EngineDrivenPumpId::Edp2a => self.edp2a_push_button.is_off(),
            A380EngineDrivenPumpId::Edp3a => self.edp3a_push_button.is_off(),
            A380EngineDrivenPumpId::Edp4a => self.edp4a_push_button.is_off(),
            A380EngineDrivenPumpId::Edp1b => self.edp1b_push_button.is_off(),
            A380EngineDrivenPumpId::Edp2b => self.edp2b_push_button.is_off(),
            A380EngineDrivenPumpId::Edp3b => self.edp3b_push_button.is_off(),
            A380EngineDrivenPumpId::Edp4b => self.edp4b_push_button.is_off(),
        }
    }

    fn epump_button_on_is_on(&self, pump_id: A380ElectricPumpId) -> bool {
        match pump_id {
            A380ElectricPumpId::GreenA => self.green_epump_a_on_push_button.is_on(),
            A380ElectricPumpId::GreenB => self.green_epump_b_on_push_button.is_on(),
            A380ElectricPumpId::YellowA => self.yellow_epump_a_on_push_button.is_on(),
            A380ElectricPumpId::YellowB => self.yellow_epump_b_on_push_button.is_on(),
            A380ElectricPumpId::GreenAuxiliary => false,
        }
    }
}
impl SimulationElement for A380HydraulicOverheadPanel {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.edp1a_push_button.accept(visitor);
        self.edp2a_push_button.accept(visitor);
        self.edp3a_push_button.accept(visitor);
        self.edp4a_push_button.accept(visitor);

        self.edp1b_push_button.accept(visitor);
        self.edp2b_push_button.accept(visitor);
        self.edp3b_push_button.accept(visitor);
        self.edp4b_push_button.accept(visitor);

        self.eng1_edp_disconnect.accept(visitor);
        self.eng2_edp_disconnect.accept(visitor);
        self.eng3_edp_disconnect.accept(visitor);
        self.eng4_edp_disconnect.accept(visitor);

        self.yellow_epump_a_on_push_button.accept(visitor);
        self.yellow_epump_b_on_push_button.accept(visitor);
        self.green_epump_a_on_push_button.accept(visitor);
        self.green_epump_b_on_push_button.accept(visitor);

        self.yellow_epump_a_off_push_button.accept(visitor);
        self.yellow_epump_b_off_push_button.accept(visitor);
        self.green_epump_a_off_push_button.accept(visitor);
        self.green_epump_b_off_push_button.accept(visitor);

        self.green_leak_measurement_push_button.accept(visitor);
        self.yellow_leak_measurement_push_button.accept(visitor);

        visitor.visit(self);
    }
}

#[derive(Clone, Copy, PartialEq)]
struct AileronController {
    mode: LinearActuatorMode,
    requested_position: Ratio,
}
impl AileronController {
    fn new() -> Self {
        Self {
            mode: LinearActuatorMode::ClosedCircuitDamping,

            requested_position: Ratio::new::<ratio>(0.),
        }
    }

    fn set_mode(&mut self, mode: LinearActuatorMode) {
        self.mode = mode;
    }

    /// Receives a [0;1] position request, 0 is down 1 is up
    fn set_requested_position(&mut self, requested_position: Ratio) {
        self.requested_position = requested_position
            .min(Ratio::new::<ratio>(1.))
            .max(Ratio::new::<ratio>(0.));
    }
}
impl HydraulicAssemblyController for AileronController {
    fn requested_mode(&self) -> LinearActuatorMode {
        self.mode
    }

    fn requested_position(&self) -> Ratio {
        self.requested_position
    }

    fn should_lock(&self) -> bool {
        false
    }

    fn requested_lock_position(&self) -> Ratio {
        Ratio::default()
    }
}
impl HydraulicLocking for AileronController {}
impl ElectroHydrostaticPowered for AileronController {
    fn should_activate_electrical_mode(&self) -> bool {
        self.requested_mode() == LinearActuatorMode::PositionControl
    }
}

struct AileronSystemHydraulicController {
    left_inboard_aileron_green_actuator_solenoid_id: VariableIdentifier,
    left_inboard_aileron_eha_actuator_solenoid_id: VariableIdentifier,
    left_midboard_aileron_yellow_actuator_solenoid_id: VariableIdentifier,
    left_midboard_aileron_eha_actuator_solenoid_id: VariableIdentifier,
    left_outboard_aileron_green_actuator_solenoid_id: VariableIdentifier,
    left_outboard_aileron_yellow_actuator_solenoid_id: VariableIdentifier,
    right_inboard_aileron_green_actuator_solenoid_id: VariableIdentifier,
    right_inboard_aileron_eha_actuator_solenoid_id: VariableIdentifier,
    right_midboard_aileron_yellow_actuator_solenoid_id: VariableIdentifier,
    right_midboard_aileron_eha_actuator_solenoid_id: VariableIdentifier,
    right_outboard_aileron_green_actuator_solenoid_id: VariableIdentifier,
    right_outboard_aileron_yellow_actuator_solenoid_id: VariableIdentifier,

    left_inboard_aileron_green_actuator_position_demand_id: VariableIdentifier,
    left_inboard_aileron_eha_actuator_position_demand_id: VariableIdentifier,
    left_midboard_aileron_yellow_actuator_position_demand_id: VariableIdentifier,
    left_midboard_aileron_eha_actuator_position_demand_id: VariableIdentifier,
    left_outboard_aileron_green_actuator_position_demand_id: VariableIdentifier,
    left_outboard_aileron_yellow_actuator_position_demand_id: VariableIdentifier,
    right_inboard_aileron_green_actuator_position_demand_id: VariableIdentifier,
    right_inboard_aileron_eha_actuator_position_demand_id: VariableIdentifier,
    right_midboard_aileron_yellow_actuator_position_demand_id: VariableIdentifier,
    right_midboard_aileron_eha_actuator_position_demand_id: VariableIdentifier,
    right_outboard_aileron_green_actuator_position_demand_id: VariableIdentifier,
    right_outboard_aileron_yellow_actuator_position_demand_id: VariableIdentifier,

    left_inboard_position_requests_from_fbw: [Ratio; 2],
    left_inboard_solenoid_energized_from_fbw: [bool; 2],
    left_midboard_position_requests_from_fbw: [Ratio; 2],
    left_midboard_solenoid_energized_from_fbw: [bool; 2],
    left_outboard_position_requests_from_fbw: [Ratio; 2],
    left_outboard_solenoid_energized_from_fbw: [bool; 2],
    right_inboard_position_requests_from_fbw: [Ratio; 2],
    right_inboard_solenoid_energized_from_fbw: [bool; 2],
    right_midboard_position_requests_from_fbw: [Ratio; 2],
    right_midboard_solenoid_energized_from_fbw: [bool; 2],
    right_outboard_position_requests_from_fbw: [Ratio; 2],
    right_outboard_solenoid_energized_from_fbw: [bool; 2],

    left_aileron_controllers: [[AileronController; 2]; 3],
    right_aileron_controllers: [[AileronController; 2]; 3],

    eha_backup_allowed: bool,
}
impl AileronSystemHydraulicController {
    fn new(context: &mut InitContext) -> Self {
        Self {
            left_inboard_aileron_green_actuator_solenoid_id: context
                .get_identifier("LEFT_INBOARD_AIL_GREEN_SERVO_SOLENOID_ENERGIZED".to_owned()),
            left_inboard_aileron_eha_actuator_solenoid_id: context
                .get_identifier("LEFT_INBOARD_AIL_EHA_SERVO_SOLENOID_ENERGIZED".to_owned()),
            left_midboard_aileron_yellow_actuator_solenoid_id: context
                .get_identifier("LEFT_MIDBOARD_AIL_YELLOW_SERVO_SOLENOID_ENERGIZED".to_owned()),
            left_midboard_aileron_eha_actuator_solenoid_id: context
                .get_identifier("LEFT_MIDBOARD_AIL_EHA_SERVO_SOLENOID_ENERGIZED".to_owned()),
            left_outboard_aileron_green_actuator_solenoid_id: context
                .get_identifier("LEFT_OUTBOARD_AIL_GREEN_SERVO_SOLENOID_ENERGIZED".to_owned()),
            left_outboard_aileron_yellow_actuator_solenoid_id: context
                .get_identifier("LEFT_OUTBOARD_AIL_YELLOW_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_inboard_aileron_green_actuator_solenoid_id: context
                .get_identifier("RIGHT_INBOARD_AIL_GREEN_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_inboard_aileron_eha_actuator_solenoid_id: context
                .get_identifier("RIGHT_INBOARD_AIL_EHA_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_midboard_aileron_yellow_actuator_solenoid_id: context
                .get_identifier("RIGHT_MIDBOARD_AIL_YELLOW_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_midboard_aileron_eha_actuator_solenoid_id: context
                .get_identifier("RIGHT_MIDBOARD_AIL_EHA_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_outboard_aileron_green_actuator_solenoid_id: context
                .get_identifier("RIGHT_OUTBOARD_AIL_GREEN_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_outboard_aileron_yellow_actuator_solenoid_id: context
                .get_identifier("RIGHT_OUTBOARD_AIL_YELLOW_SERVO_SOLENOID_ENERGIZED".to_owned()),

            left_inboard_aileron_green_actuator_position_demand_id: context
                .get_identifier("LEFT_INBOARD_AIL_GREEN_COMMANDED_POSITION".to_owned()),
            left_inboard_aileron_eha_actuator_position_demand_id: context
                .get_identifier("LEFT_INBOARD_AIL_EHA_COMMANDED_POSITION".to_owned()),
            left_midboard_aileron_yellow_actuator_position_demand_id: context
                .get_identifier("LEFT_MIDBOARD_AIL_YELLOW_COMMANDED_POSITION".to_owned()),
            left_midboard_aileron_eha_actuator_position_demand_id: context
                .get_identifier("LEFT_MIDBOARD_AIL_EHA_COMMANDED_POSITION".to_owned()),
            left_outboard_aileron_green_actuator_position_demand_id: context
                .get_identifier("LEFT_OUTBOARD_AIL_GREEN_COMMANDED_POSITION".to_owned()),
            left_outboard_aileron_yellow_actuator_position_demand_id: context
                .get_identifier("LEFT_OUTBOARD_AIL_YELLOW_COMMANDED_POSITION".to_owned()),
            right_inboard_aileron_green_actuator_position_demand_id: context
                .get_identifier("RIGHT_INBOARD_AIL_GREEN_COMMANDED_POSITION".to_owned()),
            right_inboard_aileron_eha_actuator_position_demand_id: context
                .get_identifier("RIGHT_INBOARD_AIL_EHA_COMMANDED_POSITION".to_owned()),
            right_midboard_aileron_yellow_actuator_position_demand_id: context
                .get_identifier("RIGHT_MIDBOARD_AIL_YELLOW_COMMANDED_POSITION".to_owned()),
            right_midboard_aileron_eha_actuator_position_demand_id: context
                .get_identifier("RIGHT_MIDBOARD_AIL_EHA_COMMANDED_POSITION".to_owned()),
            right_outboard_aileron_green_actuator_position_demand_id: context
                .get_identifier("RIGHT_OUTBOARD_AIL_GREEN_COMMANDED_POSITION".to_owned()),
            right_outboard_aileron_yellow_actuator_position_demand_id: context
                .get_identifier("RIGHT_OUTBOARD_AIL_YELLOW_COMMANDED_POSITION".to_owned()),

            left_inboard_position_requests_from_fbw: [Ratio::default(); 2],
            left_inboard_solenoid_energized_from_fbw: [false; 2],
            left_midboard_position_requests_from_fbw: [Ratio::default(); 2],
            left_midboard_solenoid_energized_from_fbw: [false; 2],
            left_outboard_position_requests_from_fbw: [Ratio::default(); 2],
            left_outboard_solenoid_energized_from_fbw: [false; 2],
            right_inboard_position_requests_from_fbw: [Ratio::default(); 2],
            right_inboard_solenoid_energized_from_fbw: [false; 2],
            right_midboard_position_requests_from_fbw: [Ratio::default(); 2],
            right_midboard_solenoid_energized_from_fbw: [false; 2],
            right_outboard_position_requests_from_fbw: [Ratio::default(); 2],
            right_outboard_solenoid_energized_from_fbw: [false; 2],

            // Controllers are in outward->inward order, so for aileron [Blue circuit, Green circuit]
            left_aileron_controllers: [[AileronController::new(), AileronController::new()]; 3],
            right_aileron_controllers: [[AileronController::new(), AileronController::new()]; 3],

            eha_backup_allowed: false,
        }
    }

    fn left_controllers(
        &self,
        panel: AileronPanelPosition,
    ) -> &[impl HydraulicAssemblyController + HydraulicLocking + ElectroHydrostaticPowered] {
        &self.left_aileron_controllers[panel as usize][..]
    }

    fn right_controllers(
        &self,
        panel: AileronPanelPosition,
    ) -> &[impl HydraulicAssemblyController + HydraulicLocking + ElectroHydrostaticPowered] {
        &self.right_aileron_controllers[panel as usize][..]
    }

    fn update(
        &mut self,
        eha_backup_placeholder: &A380EhaInhibitPlaceholder,
        actuator_failures: &A380FlightControlActuatorFailures,
    ) {
        self.eha_backup_allowed = eha_backup_placeholder.is_allowed();

        self.reconfigure_failed_actuators(actuator_failures);
        self.update_aileron_controllers_positions();
        self.update_aileron_controllers_modes();
        self.filter_dual_control();
    }

    /// The outer ailerons have two hydraulic actuators; on the mid and inner ailerons the second actuator is an EHA,
    /// which can take over only when its electrical backup is allowed
    fn reconfigure_failed_actuators(&mut self, failures: &A380FlightControlActuatorFailures) {
        let outer_can_take_over = [true, true];
        let with_eha_can_take_over = [true, self.eha_backup_allowed];

        reconfigure_actuator_pair(
            &mut self.left_outboard_solenoid_energized_from_fbw,
            &mut self.left_outboard_position_requests_from_fbw,
            failures.left_aileron_failed(AileronPanelPosition::Outward as usize),
            outer_can_take_over,
        );
        reconfigure_actuator_pair(
            &mut self.left_midboard_solenoid_energized_from_fbw,
            &mut self.left_midboard_position_requests_from_fbw,
            failures.left_aileron_failed(AileronPanelPosition::Middle as usize),
            with_eha_can_take_over,
        );
        reconfigure_actuator_pair(
            &mut self.left_inboard_solenoid_energized_from_fbw,
            &mut self.left_inboard_position_requests_from_fbw,
            failures.left_aileron_failed(AileronPanelPosition::Inward as usize),
            with_eha_can_take_over,
        );
        reconfigure_actuator_pair(
            &mut self.right_outboard_solenoid_energized_from_fbw,
            &mut self.right_outboard_position_requests_from_fbw,
            failures.right_aileron_failed(AileronPanelPosition::Outward as usize),
            outer_can_take_over,
        );
        reconfigure_actuator_pair(
            &mut self.right_midboard_solenoid_energized_from_fbw,
            &mut self.right_midboard_position_requests_from_fbw,
            failures.right_aileron_failed(AileronPanelPosition::Middle as usize),
            with_eha_can_take_over,
        );
        reconfigure_actuator_pair(
            &mut self.right_inboard_solenoid_energized_from_fbw,
            &mut self.right_inboard_position_requests_from_fbw,
            failures.right_aileron_failed(AileronPanelPosition::Inward as usize),
            with_eha_can_take_over,
        );
    }

    fn update_aileron_controllers_positions(&mut self) {
        self.left_aileron_controllers[AileronPanelPosition::Outward as usize]
            [AileronActuatorPosition::Outward as usize]
            .set_requested_position(
                self.left_outboard_position_requests_from_fbw
                    [AileronActuatorPosition::Outward as usize],
            );
        self.left_aileron_controllers[AileronPanelPosition::Outward as usize]
            [AileronActuatorPosition::Inward as usize]
            .set_requested_position(
                self.left_outboard_position_requests_from_fbw
                    [AileronActuatorPosition::Inward as usize],
            );

        self.left_aileron_controllers[AileronPanelPosition::Middle as usize]
            [AileronActuatorPosition::Outward as usize]
            .set_requested_position(
                self.left_midboard_position_requests_from_fbw
                    [AileronActuatorPosition::Outward as usize],
            );
        self.left_aileron_controllers[AileronPanelPosition::Middle as usize]
            [AileronActuatorPosition::Inward as usize]
            .set_requested_position(
                self.left_midboard_position_requests_from_fbw
                    [AileronActuatorPosition::Inward as usize],
            );

        self.left_aileron_controllers[AileronPanelPosition::Inward as usize]
            [AileronActuatorPosition::Outward as usize]
            .set_requested_position(
                self.left_inboard_position_requests_from_fbw
                    [AileronActuatorPosition::Outward as usize],
            );
        self.left_aileron_controllers[AileronPanelPosition::Inward as usize]
            [AileronActuatorPosition::Inward as usize]
            .set_requested_position(
                self.left_inboard_position_requests_from_fbw
                    [AileronActuatorPosition::Inward as usize],
            );

        self.right_aileron_controllers[AileronPanelPosition::Outward as usize]
            [AileronActuatorPosition::Outward as usize]
            .set_requested_position(
                self.right_outboard_position_requests_from_fbw
                    [AileronActuatorPosition::Outward as usize],
            );
        self.right_aileron_controllers[AileronPanelPosition::Outward as usize]
            [AileronActuatorPosition::Inward as usize]
            .set_requested_position(
                self.right_outboard_position_requests_from_fbw
                    [AileronActuatorPosition::Inward as usize],
            );

        self.right_aileron_controllers[AileronPanelPosition::Middle as usize]
            [AileronActuatorPosition::Outward as usize]
            .set_requested_position(
                self.right_midboard_position_requests_from_fbw
                    [AileronActuatorPosition::Outward as usize],
            );
        self.right_aileron_controllers[AileronPanelPosition::Middle as usize]
            [AileronActuatorPosition::Inward as usize]
            .set_requested_position(
                self.right_midboard_position_requests_from_fbw
                    [AileronActuatorPosition::Inward as usize],
            );

        self.right_aileron_controllers[AileronPanelPosition::Inward as usize]
            [AileronActuatorPosition::Outward as usize]
            .set_requested_position(
                self.right_inboard_position_requests_from_fbw
                    [AileronActuatorPosition::Outward as usize],
            );
        self.right_aileron_controllers[AileronPanelPosition::Inward as usize]
            [AileronActuatorPosition::Inward as usize]
            .set_requested_position(
                self.right_inboard_position_requests_from_fbw
                    [AileronActuatorPosition::Inward as usize],
            );
    }

    // FIXME  We don't allow dual control for now as this causes issues in actuator solver
    // To remove if actuator solver can handle this case or flight control never request it by design
    fn filter_dual_control(&mut self) {
        for controller in &mut self.left_aileron_controllers {
            if controller[AileronActuatorPosition::Outward as usize].mode
                == LinearActuatorMode::PositionControl
                && controller[AileronActuatorPosition::Inward as usize].mode
                    == LinearActuatorMode::PositionControl
            {
                controller[AileronActuatorPosition::Outward as usize].mode =
                    LinearActuatorMode::PositionControl;
                controller[AileronActuatorPosition::Inward as usize].mode =
                    LinearActuatorMode::ActiveDamping;
            }
        }

        for controller in &mut self.right_aileron_controllers {
            if controller[AileronActuatorPosition::Outward as usize].mode
                == LinearActuatorMode::PositionControl
                && controller[AileronActuatorPosition::Inward as usize].mode
                    == LinearActuatorMode::PositionControl
            {
                controller[AileronActuatorPosition::Outward as usize].mode =
                    LinearActuatorMode::PositionControl;
                controller[AileronActuatorPosition::Inward as usize].mode =
                    LinearActuatorMode::ActiveDamping;
            }
        }
    }

    /// Will drive mode from solenoid state
    /// -If energized actuator controls position
    /// -If not energized actuator is slaved in damping
    /// -We differentiate case of all actuators in damping mode where we set a more dampened
    /// mode to reach realistic slow droop speed.
    fn update_aileron_controllers_modes(&mut self) {
        if self
            .left_outboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.left_aileron_controllers[AileronPanelPosition::Outward as usize]
                [AileronActuatorPosition::Outward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.left_outboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Outward as usize],
                ));
            self.left_aileron_controllers[AileronPanelPosition::Outward as usize]
                [AileronActuatorPosition::Inward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.left_outboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in
                &mut self.left_aileron_controllers[AileronPanelPosition::Outward as usize]
            {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }

        if self
            .left_midboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.left_aileron_controllers[AileronPanelPosition::Middle as usize]
                [AileronActuatorPosition::Outward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.left_midboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Outward as usize],
                ));
            self.left_aileron_controllers[AileronPanelPosition::Middle as usize]
                [AileronActuatorPosition::Inward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.left_midboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in
                &mut self.left_aileron_controllers[AileronPanelPosition::Middle as usize]
            {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }

        if self
            .left_inboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.left_aileron_controllers[AileronPanelPosition::Inward as usize]
                [AileronActuatorPosition::Outward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.left_inboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Outward as usize],
                ));
            self.left_aileron_controllers[AileronPanelPosition::Inward as usize]
                [AileronActuatorPosition::Inward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.left_inboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in
                &mut self.left_aileron_controllers[AileronPanelPosition::Inward as usize]
            {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }

        if self
            .right_outboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.right_aileron_controllers[AileronPanelPosition::Outward as usize]
                [AileronActuatorPosition::Outward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.right_outboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Outward as usize],
                ));
            self.right_aileron_controllers[AileronPanelPosition::Outward as usize]
                [AileronActuatorPosition::Inward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.right_outboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in
                &mut self.right_aileron_controllers[AileronPanelPosition::Outward as usize]
            {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }

        if self
            .right_midboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.right_aileron_controllers[AileronPanelPosition::Middle as usize]
                [AileronActuatorPosition::Outward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.right_midboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Outward as usize],
                ));
            self.right_aileron_controllers[AileronPanelPosition::Middle as usize]
                [AileronActuatorPosition::Inward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.right_midboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in
                &mut self.right_aileron_controllers[AileronPanelPosition::Middle as usize]
            {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }

        if self
            .right_inboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.right_aileron_controllers[AileronPanelPosition::Inward as usize]
                [AileronActuatorPosition::Outward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.right_inboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Outward as usize],
                ));
            self.right_aileron_controllers[AileronPanelPosition::Inward as usize]
                [AileronActuatorPosition::Inward as usize]
                .set_mode(Self::aileron_actuator_mode_from_solenoid(
                    self.right_inboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in
                &mut self.right_aileron_controllers[AileronPanelPosition::Inward as usize]
            {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }
    }

    fn aileron_actuator_mode_from_solenoid(solenoid_energized: bool) -> LinearActuatorMode {
        if solenoid_energized {
            LinearActuatorMode::PositionControl
        } else {
            LinearActuatorMode::ActiveDamping
        }
    }

    fn aileron_actuator_position_from_surface_angle(surface_angle: Angle) -> Ratio {
        Ratio::new::<ratio>(surface_angle.get::<degree>() / 50. + 20. / 50.)
    }
}
impl SimulationElement for AileronSystemHydraulicController {
    fn read(&mut self, reader: &mut SimulatorReader) {
        // Note that we reverse left, as positions are just passed through msfs for now
        self.left_inboard_position_requests_from_fbw = [
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.left_inboard_aileron_green_actuator_position_demand_id),
            )),
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.left_inboard_aileron_eha_actuator_position_demand_id),
            )),
        ];
        self.left_inboard_solenoid_energized_from_fbw = [
            reader.read(&self.left_inboard_aileron_green_actuator_solenoid_id),
            reader.read(&self.left_inboard_aileron_eha_actuator_solenoid_id)
                && self.eha_backup_allowed,
        ];

        self.left_midboard_position_requests_from_fbw = [
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.left_midboard_aileron_yellow_actuator_position_demand_id),
            )),
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.left_midboard_aileron_eha_actuator_position_demand_id),
            )),
        ];
        self.left_midboard_solenoid_energized_from_fbw = [
            reader.read(&self.left_midboard_aileron_yellow_actuator_solenoid_id),
            reader.read(&self.left_midboard_aileron_eha_actuator_solenoid_id)
                && self.eha_backup_allowed,
        ];

        self.left_outboard_position_requests_from_fbw = [
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.left_outboard_aileron_green_actuator_position_demand_id),
            )),
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.left_outboard_aileron_yellow_actuator_position_demand_id),
            )),
        ];
        self.left_outboard_solenoid_energized_from_fbw = [
            reader.read(&self.left_outboard_aileron_green_actuator_solenoid_id),
            reader.read(&self.left_outboard_aileron_yellow_actuator_solenoid_id),
        ];

        self.right_inboard_position_requests_from_fbw = [
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.right_inboard_aileron_green_actuator_position_demand_id),
            )),
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.right_inboard_aileron_eha_actuator_position_demand_id),
            )),
        ];
        self.right_inboard_solenoid_energized_from_fbw = [
            reader.read(&self.right_inboard_aileron_green_actuator_solenoid_id),
            reader.read(&self.right_inboard_aileron_eha_actuator_solenoid_id)
                && self.eha_backup_allowed,
        ];

        self.right_midboard_position_requests_from_fbw = [
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.right_midboard_aileron_yellow_actuator_position_demand_id),
            )),
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.right_midboard_aileron_eha_actuator_position_demand_id),
            )),
        ];
        self.right_midboard_solenoid_energized_from_fbw = [
            reader.read(&self.right_midboard_aileron_yellow_actuator_solenoid_id),
            reader.read(&self.right_midboard_aileron_eha_actuator_solenoid_id)
                && self.eha_backup_allowed,
        ];

        self.right_outboard_position_requests_from_fbw = [
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.right_outboard_aileron_green_actuator_position_demand_id),
            )),
            Self::aileron_actuator_position_from_surface_angle(-Angle::new::<degree>(
                reader.read(&self.right_outboard_aileron_yellow_actuator_position_demand_id),
            )),
        ];
        self.right_outboard_solenoid_energized_from_fbw = [
            reader.read(&self.right_outboard_aileron_green_actuator_solenoid_id),
            reader.read(&self.right_outboard_aileron_yellow_actuator_solenoid_id),
        ];
    }
}

struct ElevatorSystemHydraulicController {
    left_inboard_elevator_green_actuator_solenoid_id: VariableIdentifier,
    left_inboard_elevator_eha_actuator_solenoid_id: VariableIdentifier,
    left_outboard_elevator_green_actuator_solenoid_id: VariableIdentifier,
    left_outboard_elevator_eha_actuator_solenoid_id: VariableIdentifier,
    right_inboard_elevator_yellow_actuator_solenoid_id: VariableIdentifier,
    right_inboard_elevator_eha_actuator_solenoid_id: VariableIdentifier,
    right_outboard_elevator_yellow_actuator_solenoid_id: VariableIdentifier,
    right_outboard_elevator_eha_actuator_solenoid_id: VariableIdentifier,

    left_inboard_elevator_green_actuator_position_demand_id: VariableIdentifier,
    left_inboard_elevator_eha_actuator_position_demand_id: VariableIdentifier,
    left_outboard_elevator_green_actuator_position_demand_id: VariableIdentifier,
    left_outboard_elevator_eha_actuator_position_demand_id: VariableIdentifier,
    right_inboard_elevator_yellow_actuator_position_demand_id: VariableIdentifier,
    right_inboard_elevator_eha_actuator_position_demand_id: VariableIdentifier,
    right_outboard_elevator_yellow_actuator_position_demand_id: VariableIdentifier,
    right_outboard_elevator_eha_actuator_position_demand_id: VariableIdentifier,

    left_inboard_position_requests_from_fbw: [Ratio; 2],
    left_inboard_solenoid_energized_from_fbw: [bool; 2],
    left_outboard_position_requests_from_fbw: [Ratio; 2],
    left_outboard_solenoid_energized_from_fbw: [bool; 2],
    right_inboard_position_requests_from_fbw: [Ratio; 2],
    right_inboard_solenoid_energized_from_fbw: [bool; 2],
    right_outboard_position_requests_from_fbw: [Ratio; 2],
    right_outboard_solenoid_energized_from_fbw: [bool; 2],

    left_controllers: [[AileronController; 2]; 2],
    right_controllers: [[AileronController; 2]; 2],

    eha_backup_allowed: bool,
}
impl ElevatorSystemHydraulicController {
    fn new(context: &mut InitContext) -> Self {
        Self {
            left_inboard_elevator_green_actuator_solenoid_id: context
                .get_identifier("LEFT_INBOARD_ELEV_GREEN_SERVO_SOLENOID_ENERGIZED".to_owned()),
            left_inboard_elevator_eha_actuator_solenoid_id: context
                .get_identifier("LEFT_INBOARD_ELEV_EHA_SERVO_SOLENOID_ENERGIZED".to_owned()),
            left_outboard_elevator_green_actuator_solenoid_id: context
                .get_identifier("LEFT_OUTBOARD_ELEV_GREEN_SERVO_SOLENOID_ENERGIZED".to_owned()),
            left_outboard_elevator_eha_actuator_solenoid_id: context
                .get_identifier("LEFT_OUTBOARD_ELEV_EHA_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_inboard_elevator_yellow_actuator_solenoid_id: context
                .get_identifier("RIGHT_INBOARD_ELEV_YELLOW_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_inboard_elevator_eha_actuator_solenoid_id: context
                .get_identifier("RIGHT_INBOARD_ELEV_EHA_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_outboard_elevator_yellow_actuator_solenoid_id: context
                .get_identifier("RIGHT_OUTBOARD_ELEV_YELLOW_SERVO_SOLENOID_ENERGIZED".to_owned()),
            right_outboard_elevator_eha_actuator_solenoid_id: context
                .get_identifier("RIGHT_OUTBOARD_ELEV_EHA_SERVO_SOLENOID_ENERGIZED".to_owned()),

            left_inboard_elevator_green_actuator_position_demand_id: context
                .get_identifier("LEFT_INBOARD_ELEV_GREEN_COMMANDED_POSITION".to_owned()),
            left_inboard_elevator_eha_actuator_position_demand_id: context
                .get_identifier("LEFT_INBOARD_ELEV_EHA_COMMANDED_POSITION".to_owned()),
            left_outboard_elevator_green_actuator_position_demand_id: context
                .get_identifier("LEFT_OUTBOARD_ELEV_GREEN_COMMANDED_POSITION".to_owned()),
            left_outboard_elevator_eha_actuator_position_demand_id: context
                .get_identifier("LEFT_OUTBOARD_ELEV_EHA_COMMANDED_POSITION".to_owned()),
            right_inboard_elevator_yellow_actuator_position_demand_id: context
                .get_identifier("RIGHT_INBOARD_ELEV_YELLOW_COMMANDED_POSITION".to_owned()),
            right_inboard_elevator_eha_actuator_position_demand_id: context
                .get_identifier("RIGHT_INBOARD_ELEV_EHA_COMMANDED_POSITION".to_owned()),
            right_outboard_elevator_yellow_actuator_position_demand_id: context
                .get_identifier("RIGHT_OUTBOARD_ELEV_YELLOW_COMMANDED_POSITION".to_owned()),
            right_outboard_elevator_eha_actuator_position_demand_id: context
                .get_identifier("RIGHT_OUTBOARD_ELEV_EHA_COMMANDED_POSITION".to_owned()),

            left_inboard_position_requests_from_fbw: [Ratio::default(); 2],
            left_inboard_solenoid_energized_from_fbw: [false; 2],
            left_outboard_position_requests_from_fbw: [Ratio::default(); 2],
            left_outboard_solenoid_energized_from_fbw: [false; 2],
            right_inboard_position_requests_from_fbw: [Ratio::default(); 2],
            right_inboard_solenoid_energized_from_fbw: [false; 2],
            right_outboard_position_requests_from_fbw: [Ratio::default(); 2],
            right_outboard_solenoid_energized_from_fbw: [false; 2],

            // Controllers are in outboard->inboard order
            left_controllers: [[AileronController::new(), AileronController::new()]; 2],
            right_controllers: [[AileronController::new(), AileronController::new()]; 2],

            eha_backup_allowed: false,
        }
    }

    fn left_controllers(
        &self,
        panel: ElevatorPanelPosition,
    ) -> &[impl HydraulicAssemblyController + HydraulicLocking + ElectroHydrostaticPowered] {
        &self.left_controllers[panel as usize][..]
    }

    fn right_controllers(
        &self,
        panel: ElevatorPanelPosition,
    ) -> &[impl HydraulicAssemblyController + HydraulicLocking + ElectroHydrostaticPowered] {
        &self.right_controllers[panel as usize][..]
    }

    fn update(
        &mut self,
        eha_backup_placeholder: &A380EhaInhibitPlaceholder,
        actuator_failures: &A380FlightControlActuatorFailures,
    ) {
        self.eha_backup_allowed = eha_backup_placeholder.is_allowed();

        self.reconfigure_failed_actuators(actuator_failures);
        self.update_elevator_controllers_positions();
        self.update_elevator_controllers_solenoids();
    }

    /// The second actuator of each elevator is an EHA, which can take over only when its electrical backup is allowed
    fn reconfigure_failed_actuators(&mut self, failures: &A380FlightControlActuatorFailures) {
        let can_take_over = [true, self.eha_backup_allowed];

        reconfigure_actuator_pair(
            &mut self.left_outboard_solenoid_energized_from_fbw,
            &mut self.left_outboard_position_requests_from_fbw,
            failures.left_elevator_failed(ElevatorPanelPosition::Outward as usize),
            can_take_over,
        );
        reconfigure_actuator_pair(
            &mut self.left_inboard_solenoid_energized_from_fbw,
            &mut self.left_inboard_position_requests_from_fbw,
            failures.left_elevator_failed(ElevatorPanelPosition::Inward as usize),
            can_take_over,
        );
        reconfigure_actuator_pair(
            &mut self.right_outboard_solenoid_energized_from_fbw,
            &mut self.right_outboard_position_requests_from_fbw,
            failures.right_elevator_failed(ElevatorPanelPosition::Outward as usize),
            can_take_over,
        );
        reconfigure_actuator_pair(
            &mut self.right_inboard_solenoid_energized_from_fbw,
            &mut self.right_inboard_position_requests_from_fbw,
            failures.right_elevator_failed(ElevatorPanelPosition::Inward as usize),
            can_take_over,
        );
    }

    fn update_elevator_controllers_positions(&mut self) {
        self.left_controllers[ElevatorPanelPosition::Outward as usize]
            [ElevatorActuatorPosition::Outward as usize]
            .set_requested_position(
                self.left_outboard_position_requests_from_fbw
                    [ElevatorActuatorPosition::Outward as usize],
            );
        self.left_controllers[ElevatorPanelPosition::Outward as usize]
            [ElevatorActuatorPosition::Inward as usize]
            .set_requested_position(
                self.left_outboard_position_requests_from_fbw
                    [ElevatorActuatorPosition::Inward as usize],
            );
        self.left_controllers[ElevatorPanelPosition::Inward as usize]
            [ElevatorActuatorPosition::Outward as usize]
            .set_requested_position(
                self.left_inboard_position_requests_from_fbw
                    [ElevatorActuatorPosition::Outward as usize],
            );
        self.left_controllers[ElevatorPanelPosition::Inward as usize]
            [ElevatorActuatorPosition::Inward as usize]
            .set_requested_position(
                self.left_inboard_position_requests_from_fbw
                    [ElevatorActuatorPosition::Inward as usize],
            );

        self.right_controllers[ElevatorPanelPosition::Outward as usize]
            [ElevatorActuatorPosition::Outward as usize]
            .set_requested_position(
                self.right_outboard_position_requests_from_fbw
                    [ElevatorActuatorPosition::Outward as usize],
            );
        self.right_controllers[ElevatorPanelPosition::Outward as usize]
            [ElevatorActuatorPosition::Inward as usize]
            .set_requested_position(
                self.right_outboard_position_requests_from_fbw
                    [ElevatorActuatorPosition::Inward as usize],
            );
        self.right_controllers[ElevatorPanelPosition::Inward as usize]
            [ElevatorActuatorPosition::Outward as usize]
            .set_requested_position(
                self.right_inboard_position_requests_from_fbw
                    [ElevatorActuatorPosition::Outward as usize],
            );
        self.right_controllers[ElevatorPanelPosition::Inward as usize]
            [ElevatorActuatorPosition::Inward as usize]
            .set_requested_position(
                self.right_inboard_position_requests_from_fbw
                    [ElevatorActuatorPosition::Inward as usize],
            );
    }

    fn update_elevator_controllers_solenoids(&mut self) {
        if self
            .left_outboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.left_controllers[ElevatorPanelPosition::Outward as usize]
                [ElevatorActuatorPosition::Outward as usize]
                .set_mode(Self::elevator_actuator_mode_from_solenoid(
                    self.left_outboard_solenoid_energized_from_fbw
                        [ElevatorActuatorPosition::Outward as usize],
                ));
            self.left_controllers[ElevatorPanelPosition::Outward as usize]
                [ElevatorActuatorPosition::Inward as usize]
                .set_mode(Self::elevator_actuator_mode_from_solenoid(
                    self.left_outboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in &mut self.left_controllers[ElevatorPanelPosition::Outward as usize] {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }
        if self
            .left_inboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.left_controllers[ElevatorPanelPosition::Inward as usize]
                [ElevatorActuatorPosition::Outward as usize]
                .set_mode(Self::elevator_actuator_mode_from_solenoid(
                    self.left_inboard_solenoid_energized_from_fbw
                        [ElevatorActuatorPosition::Outward as usize],
                ));
            self.left_controllers[ElevatorPanelPosition::Inward as usize]
                [ElevatorActuatorPosition::Inward as usize]
                .set_mode(Self::elevator_actuator_mode_from_solenoid(
                    self.left_inboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in &mut self.left_controllers[ElevatorPanelPosition::Inward as usize] {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }

        if self
            .right_outboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.right_controllers[ElevatorPanelPosition::Outward as usize]
                [ElevatorActuatorPosition::Outward as usize]
                .set_mode(Self::elevator_actuator_mode_from_solenoid(
                    self.right_outboard_solenoid_energized_from_fbw
                        [ElevatorActuatorPosition::Outward as usize],
                ));
            self.right_controllers[ElevatorPanelPosition::Outward as usize]
                [ElevatorActuatorPosition::Inward as usize]
                .set_mode(Self::elevator_actuator_mode_from_solenoid(
                    self.right_outboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in &mut self.right_controllers[ElevatorPanelPosition::Outward as usize] {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }
        if self
            .right_inboard_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
        {
            self.right_controllers[ElevatorPanelPosition::Inward as usize]
                [ElevatorActuatorPosition::Outward as usize]
                .set_mode(Self::elevator_actuator_mode_from_solenoid(
                    self.right_inboard_solenoid_energized_from_fbw
                        [ElevatorActuatorPosition::Outward as usize],
                ));
            self.right_controllers[ElevatorPanelPosition::Inward as usize]
                [ElevatorActuatorPosition::Inward as usize]
                .set_mode(Self::elevator_actuator_mode_from_solenoid(
                    self.right_inboard_solenoid_energized_from_fbw
                        [AileronActuatorPosition::Inward as usize],
                ));
        } else {
            for controller in &mut self.right_controllers[ElevatorPanelPosition::Inward as usize] {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping);
            }
        }
    }

    fn elevator_actuator_mode_from_solenoid(solenoid_energized: bool) -> LinearActuatorMode {
        if solenoid_energized {
            LinearActuatorMode::PositionControl
        } else {
            LinearActuatorMode::ActiveDamping
        }
    }

    fn elevator_actuator_position_from_surface_angle(surface_angle: Angle) -> Ratio {
        Ratio::new::<ratio>((-surface_angle.get::<degree>() / 50. + 20. / 50.).clamp(0., 1.))
    }
}
impl SimulationElement for ElevatorSystemHydraulicController {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.left_inboard_position_requests_from_fbw = [
            Self::elevator_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.left_inboard_elevator_green_actuator_position_demand_id),
            )),
            Self::elevator_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.left_inboard_elevator_eha_actuator_position_demand_id),
            )),
        ];
        self.left_inboard_solenoid_energized_from_fbw = [
            reader.read(&self.left_inboard_elevator_green_actuator_solenoid_id),
            reader.read(&self.left_inboard_elevator_eha_actuator_solenoid_id)
                && self.eha_backup_allowed,
        ];

        self.left_outboard_position_requests_from_fbw = [
            Self::elevator_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.left_outboard_elevator_green_actuator_position_demand_id),
            )),
            Self::elevator_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.left_outboard_elevator_eha_actuator_position_demand_id),
            )),
        ];
        self.left_outboard_solenoid_energized_from_fbw = [
            reader.read(&self.left_outboard_elevator_green_actuator_solenoid_id),
            reader.read(&self.left_outboard_elevator_eha_actuator_solenoid_id)
                && self.eha_backup_allowed,
        ];

        self.right_inboard_position_requests_from_fbw = [
            Self::elevator_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.right_inboard_elevator_yellow_actuator_position_demand_id),
            )),
            Self::elevator_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.right_inboard_elevator_eha_actuator_position_demand_id),
            )),
        ];
        self.right_inboard_solenoid_energized_from_fbw = [
            reader.read(&self.right_inboard_elevator_yellow_actuator_solenoid_id),
            reader.read(&self.right_inboard_elevator_eha_actuator_solenoid_id)
                && self.eha_backup_allowed,
        ];

        self.right_outboard_position_requests_from_fbw = [
            Self::elevator_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.right_outboard_elevator_yellow_actuator_position_demand_id),
            )),
            Self::elevator_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.right_outboard_elevator_eha_actuator_position_demand_id),
            )),
        ];
        self.right_outboard_solenoid_energized_from_fbw = [
            reader.read(&self.right_outboard_elevator_yellow_actuator_solenoid_id),
            reader.read(&self.right_outboard_elevator_eha_actuator_solenoid_id)
                && self.eha_backup_allowed,
        ];
    }
}

#[derive(Clone, Copy, PartialEq)]
struct TrimmableHorizontalStabilizerMotorElectricalController {
    should_motor_activate: bool,
    requested_position: Angle,
}
impl TrimmableHorizontalStabilizerMotorElectricalController {
    fn new() -> Self {
        Self {
            should_motor_activate: false,

            requested_position: Angle::default(),
        }
    }

    fn set_mode(&mut self, should_motor_activate: bool) {
        self.should_motor_activate = should_motor_activate;
    }

    /// Receives a [0;1] position request, 0 is down 1 is up
    fn set_requested_position(&mut self, requested_position: Angle) {
        self.requested_position = requested_position;
    }
}
impl TrimmableHorizontalStabilizerMotorController
    for TrimmableHorizontalStabilizerMotorElectricalController
{
    fn motor_should_activate(&self) -> bool {
        self.should_motor_activate
    }

    fn requested_position(&self) -> Angle {
        self.requested_position
    }
}

struct TrimmableHorizontalStabilizerSystemHydraulicController {
    ths_green_actuator_solenoid_id: VariableIdentifier,
    ths_yellow_actuator_solenoid_id: VariableIdentifier,

    ths_green_actuator_position_demand_id: VariableIdentifier,
    ths_yellow_actuator_position_demand_id: VariableIdentifier,

    position_requests_from_fbw: [Angle; 2],
    solenoid_energized_from_fbw: [bool; 2],

    controllers: [TrimmableHorizontalStabilizerMotorElectricalController; 2],
}
impl TrimmableHorizontalStabilizerSystemHydraulicController {
    fn new(context: &mut InitContext) -> Self {
        Self {
            ths_green_actuator_solenoid_id: context
                .get_identifier("THS_GREEN_SERVO_SOLENOID_ENERGIZED".to_owned()),
            ths_yellow_actuator_solenoid_id: context
                .get_identifier("THS_YELLOW_SERVO_SOLENOID_ENERGIZED".to_owned()),

            ths_green_actuator_position_demand_id: context
                .get_identifier("THS_GREEN_COMMANDED_POSITION".to_owned()),
            ths_yellow_actuator_position_demand_id: context
                .get_identifier("THS_YELLOW_COMMANDED_POSITION".to_owned()),

            position_requests_from_fbw: [Angle::default(); 2],
            solenoid_energized_from_fbw: [false; 2],

            // Controllers are in green->yellow order
            controllers: [
                TrimmableHorizontalStabilizerMotorElectricalController::new(),
                TrimmableHorizontalStabilizerMotorElectricalController::new(),
            ],
        }
    }

    fn controllers(&self) -> &[TrimmableHorizontalStabilizerMotorElectricalController; 2] {
        &self.controllers
    }

    fn update(&mut self, actuator_failures: &A380FlightControlActuatorFailures) {
        reconfigure_actuator_pair(
            &mut self.solenoid_energized_from_fbw,
            &mut self.position_requests_from_fbw,
            actuator_failures.stabilizer_motor_failed(),
            [true, true],
        );
        self.update_ths_controllers_positions();
        self.update_ths_controllers_solenoids();
    }

    fn update_ths_controllers_positions(&mut self) {
        self.controllers[TrimmableHorizontalStabilizerMotorPosition::Green as usize]
            .set_requested_position(
                self.position_requests_from_fbw
                    [TrimmableHorizontalStabilizerMotorPosition::Green as usize],
            );
        self.controllers[TrimmableHorizontalStabilizerMotorPosition::Yellow as usize]
            .set_requested_position(
                self.position_requests_from_fbw
                    [TrimmableHorizontalStabilizerMotorPosition::Yellow as usize],
            );
    }

    fn update_ths_controllers_solenoids(&mut self) {
        self.controllers[TrimmableHorizontalStabilizerMotorPosition::Green as usize].set_mode(
            self.solenoid_energized_from_fbw
                [TrimmableHorizontalStabilizerMotorPosition::Green as usize],
        );
        self.controllers[TrimmableHorizontalStabilizerMotorPosition::Yellow as usize].set_mode(
            self.solenoid_energized_from_fbw
                [TrimmableHorizontalStabilizerMotorPosition::Yellow as usize],
        );
    }
}
impl SimulationElement for TrimmableHorizontalStabilizerSystemHydraulicController {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.position_requests_from_fbw = [
            -Angle::new::<degree>(reader.read(&self.ths_green_actuator_position_demand_id)),
            -Angle::new::<degree>(reader.read(&self.ths_yellow_actuator_position_demand_id)),
        ];
        self.solenoid_energized_from_fbw = [
            reader.read(&self.ths_green_actuator_solenoid_id),
            reader.read(&self.ths_yellow_actuator_solenoid_id),
        ];
    }
}

#[derive(Clone, Copy, PartialEq)]
struct RudderController {
    mode: LinearActuatorMode,
    electric_mode_active: bool,
    requested_position: Ratio,
}
impl RudderController {
    fn new() -> Self {
        Self {
            mode: LinearActuatorMode::ClosedCircuitDamping,

            electric_mode_active: false,

            requested_position: Ratio::new::<ratio>(0.),
        }
    }

    fn set_mode(&mut self, mode: LinearActuatorMode, electric_mode_active: bool) {
        self.mode = mode;
        self.electric_mode_active = electric_mode_active;
    }

    /// Receives a [0;1] position request, 0 is down 1 is up
    fn set_requested_position(&mut self, requested_position: Ratio) {
        self.requested_position = requested_position
            .min(Ratio::new::<ratio>(1.))
            .max(Ratio::new::<ratio>(0.));
    }
}
impl HydraulicAssemblyController for RudderController {
    fn requested_mode(&self) -> LinearActuatorMode {
        self.mode
    }

    fn requested_position(&self) -> Ratio {
        self.requested_position
    }

    fn should_lock(&self) -> bool {
        false
    }

    fn requested_lock_position(&self) -> Ratio {
        Ratio::default()
    }
}
impl HydraulicLocking for RudderController {}
impl ElectroHydrostaticPowered for RudderController {
    fn should_activate_electrical_mode(&self) -> bool {
        self.electric_mode_active
    }
}

struct RudderSystemHydraulicController {
    upper_rudder_yellow_actuator_hydraulic_solenoid_id: VariableIdentifier,
    upper_rudder_yellow_actuator_electric_solenoid_id: VariableIdentifier,
    upper_rudder_green_actuator_hydraulic_solenoid_id: VariableIdentifier,
    upper_rudder_green_actuator_electric_solenoid_id: VariableIdentifier,
    lower_rudder_yellow_actuator_hydraulic_solenoid_id: VariableIdentifier,
    lower_rudder_yellow_actuator_electric_solenoid_id: VariableIdentifier,
    lower_rudder_green_actuator_hydraulic_solenoid_id: VariableIdentifier,
    lower_rudder_green_actuator_electric_solenoid_id: VariableIdentifier,

    upper_rudder_yellow_actuator_position_demand_id: VariableIdentifier,
    upper_rudder_green_actuator_position_demand_id: VariableIdentifier,
    lower_rudder_yellow_actuator_position_demand_id: VariableIdentifier,
    lower_rudder_green_actuator_position_demand_id: VariableIdentifier,

    upper_position_requests_from_fbw: [Ratio; 2],
    upper_hydraulic_mode_solenoid_energized_from_fbw: [bool; 2],
    upper_electric_mode_solenoid_energized_from_fbw: [bool; 2],
    lower_position_requests_from_fbw: [Ratio; 2],
    lower_hydraulic_mode_solenoid_energized_from_fbw: [bool; 2],
    lower_electric_mode_solenoid_energized_from_fbw: [bool; 2],

    rudder_controllers: [[RudderController; 2]; 2],

    eha_backup_allowed: bool,
}
impl RudderSystemHydraulicController {
    fn new(context: &mut InitContext) -> Self {
        Self {
            upper_rudder_yellow_actuator_hydraulic_solenoid_id: context.get_identifier(
                "UPPER_RUDDER_YELLOW_EBHA_HYDRAULIC_MODE_SOLENOID_ENERGIZED".to_owned(),
            ),
            upper_rudder_yellow_actuator_electric_solenoid_id: context.get_identifier(
                "UPPER_RUDDER_YELLOW_EBHA_ELECTRIC_MODE_SOLENOID_ENERGIZED".to_owned(),
            ),
            upper_rudder_green_actuator_hydraulic_solenoid_id: context.get_identifier(
                "UPPER_RUDDER_GREEN_EBHA_HYDRAULIC_MODE_SOLENOID_ENERGIZED".to_owned(),
            ),
            upper_rudder_green_actuator_electric_solenoid_id: context.get_identifier(
                "UPPER_RUDDER_GREEN_EBHA_ELECTRIC_MODE_SOLENOID_ENERGIZED".to_owned(),
            ),
            lower_rudder_yellow_actuator_hydraulic_solenoid_id: context.get_identifier(
                "LOWER_RUDDER_YELLOW_EBHA_HYDRAULIC_MODE_SOLENOID_ENERGIZED".to_owned(),
            ),
            lower_rudder_yellow_actuator_electric_solenoid_id: context.get_identifier(
                "LOWER_RUDDER_YELLOW_EBHA_ELECTRIC_MODE_SOLENOID_ENERGIZED".to_owned(),
            ),
            lower_rudder_green_actuator_hydraulic_solenoid_id: context.get_identifier(
                "LOWER_RUDDER_GREEN_EBHA_HYDRAULIC_MODE_SOLENOID_ENERGIZED".to_owned(),
            ),
            lower_rudder_green_actuator_electric_solenoid_id: context.get_identifier(
                "LOWER_RUDDER_GREEN_EBHA_ELECTRIC_MODE_SOLENOID_ENERGIZED".to_owned(),
            ),

            upper_rudder_yellow_actuator_position_demand_id: context
                .get_identifier("UPPER_RUDDER_YELLOW_EBHA_COMMANDED_POSITION".to_owned()),
            upper_rudder_green_actuator_position_demand_id: context
                .get_identifier("UPPER_RUDDER_GREEN_EBHA_COMMANDED_POSITION".to_owned()),
            lower_rudder_yellow_actuator_position_demand_id: context
                .get_identifier("LOWER_RUDDER_YELLOW_EBHA_COMMANDED_POSITION".to_owned()),
            lower_rudder_green_actuator_position_demand_id: context
                .get_identifier("LOWER_RUDDER_GREEN_EBHA_COMMANDED_POSITION".to_owned()),

            upper_position_requests_from_fbw: [Ratio::default(); 2],
            upper_hydraulic_mode_solenoid_energized_from_fbw: [false; 2],
            upper_electric_mode_solenoid_energized_from_fbw: [false; 2],
            lower_position_requests_from_fbw: [Ratio::default(); 2],
            lower_hydraulic_mode_solenoid_energized_from_fbw: [false; 2],
            lower_electric_mode_solenoid_energized_from_fbw: [false; 2],

            // Controllers are in Upper -> Lower order
            rudder_controllers: [[RudderController::new(), RudderController::new()]; 2],

            eha_backup_allowed: false,
        }
    }

    fn controllers(
        &self,
        panel: RudderPanelPosition,
    ) -> &[impl HydraulicAssemblyController + HydraulicLocking + ElectroHydrostaticPowered] {
        &self.rudder_controllers[panel as usize][..]
    }

    fn update(
        &mut self,
        eha_backup_placeholder: &A380EhaInhibitPlaceholder,
        actuator_failures: &A380FlightControlActuatorFailures,
    ) {
        self.eha_backup_allowed = eha_backup_placeholder.is_allowed();
        self.reconfigure_failed_actuators(actuator_failures);
        self.update_rudder_controllers_positions();
        self.update_rudder_controllers_solenoids();
    }

    fn reconfigure_failed_actuators(&mut self, failures: &A380FlightControlActuatorFailures) {
        reconfigure_ebha_pair(
            &mut self.upper_hydraulic_mode_solenoid_energized_from_fbw,
            &mut self.upper_electric_mode_solenoid_energized_from_fbw,
            &mut self.upper_position_requests_from_fbw,
            failures.rudder_failed(RudderPanelPosition::Upper as usize),
            failures.rudder_electrical_part_failed(RudderPanelPosition::Upper as usize),
        );
        reconfigure_ebha_pair(
            &mut self.lower_hydraulic_mode_solenoid_energized_from_fbw,
            &mut self.lower_electric_mode_solenoid_energized_from_fbw,
            &mut self.lower_position_requests_from_fbw,
            failures.rudder_failed(RudderPanelPosition::Lower as usize),
            failures.rudder_electrical_part_failed(RudderPanelPosition::Lower as usize),
        );
    }

    fn update_rudder_controllers_positions(&mut self) {
        self.rudder_controllers[RudderPanelPosition::Upper as usize]
            [RudderPanelPosition::Upper as usize]
            .set_requested_position(
                self.upper_position_requests_from_fbw[RudderPanelPosition::Upper as usize],
            );
        self.rudder_controllers[RudderPanelPosition::Upper as usize]
            [RudderPanelPosition::Lower as usize]
            .set_requested_position(
                self.upper_position_requests_from_fbw[RudderPanelPosition::Lower as usize],
            );
        self.rudder_controllers[RudderPanelPosition::Lower as usize]
            [RudderPanelPosition::Upper as usize]
            .set_requested_position(
                self.lower_position_requests_from_fbw[RudderPanelPosition::Upper as usize],
            );
        self.rudder_controllers[RudderPanelPosition::Lower as usize]
            [RudderPanelPosition::Lower as usize]
            .set_requested_position(
                self.lower_position_requests_from_fbw[RudderPanelPosition::Lower as usize],
            );
    }

    fn update_rudder_controllers_solenoids(&mut self) {
        if self
            .upper_hydraulic_mode_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
            || self
                .upper_electric_mode_solenoid_energized_from_fbw
                .iter()
                .any(|x| *x)
        {
            self.rudder_controllers[RudderPanelPosition::Upper as usize]
                [RudderActuatorPosition::Upper as usize]
                .set_mode(
                    Self::rudder_actuator_mode_from_solenoid(
                        self.upper_hydraulic_mode_solenoid_energized_from_fbw
                            [RudderActuatorPosition::Upper as usize]
                            || self.upper_electric_mode_solenoid_energized_from_fbw
                                [RudderActuatorPosition::Upper as usize],
                    ),
                    self.upper_electric_mode_solenoid_energized_from_fbw
                        [RudderActuatorPosition::Upper as usize],
                );
            self.rudder_controllers[RudderPanelPosition::Upper as usize]
                [RudderActuatorPosition::Lower as usize]
                .set_mode(
                    Self::rudder_actuator_mode_from_solenoid(
                        self.upper_hydraulic_mode_solenoid_energized_from_fbw
                            [RudderActuatorPosition::Lower as usize]
                            || self.upper_electric_mode_solenoid_energized_from_fbw
                                [RudderActuatorPosition::Lower as usize],
                    ),
                    self.upper_electric_mode_solenoid_energized_from_fbw
                        [RudderActuatorPosition::Lower as usize],
                );
        } else {
            for controller in &mut self.rudder_controllers[RudderPanelPosition::Upper as usize] {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping, false);
            }
        }
        if self
            .lower_hydraulic_mode_solenoid_energized_from_fbw
            .iter()
            .any(|x| *x)
            || self
                .lower_electric_mode_solenoid_energized_from_fbw
                .iter()
                .any(|x| *x)
        {
            self.rudder_controllers[RudderPanelPosition::Lower as usize]
                [RudderActuatorPosition::Upper as usize]
                .set_mode(
                    Self::rudder_actuator_mode_from_solenoid(
                        self.lower_hydraulic_mode_solenoid_energized_from_fbw
                            [RudderActuatorPosition::Upper as usize]
                            || self.lower_electric_mode_solenoid_energized_from_fbw
                                [RudderActuatorPosition::Upper as usize],
                    ),
                    self.lower_electric_mode_solenoid_energized_from_fbw
                        [RudderActuatorPosition::Upper as usize],
                );
            self.rudder_controllers[RudderPanelPosition::Lower as usize]
                [RudderActuatorPosition::Lower as usize]
                .set_mode(
                    Self::rudder_actuator_mode_from_solenoid(
                        self.lower_hydraulic_mode_solenoid_energized_from_fbw
                            [RudderActuatorPosition::Lower as usize]
                            || self.lower_electric_mode_solenoid_energized_from_fbw
                                [RudderActuatorPosition::Lower as usize],
                    ),
                    self.lower_electric_mode_solenoid_energized_from_fbw
                        [RudderActuatorPosition::Lower as usize],
                );
        } else {
            for controller in &mut self.rudder_controllers[RudderPanelPosition::Lower as usize] {
                controller.set_mode(LinearActuatorMode::ClosedCircuitDamping, false);
            }
        }
    }

    fn rudder_actuator_mode_from_solenoid(solenoid_energized: bool) -> LinearActuatorMode {
        if solenoid_energized {
            LinearActuatorMode::PositionControl
        } else {
            LinearActuatorMode::ActiveDamping
        }
    }

    fn rudder_actuator_position_from_surface_angle(surface_angle: Angle) -> Ratio {
        Ratio::new::<ratio>(-surface_angle.get::<degree>() / 60. + 0.5)
    }
}
impl SimulationElement for RudderSystemHydraulicController {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.upper_position_requests_from_fbw = [
            Self::rudder_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.upper_rudder_yellow_actuator_position_demand_id),
            )),
            Self::rudder_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.upper_rudder_green_actuator_position_demand_id),
            )),
        ];
        self.upper_hydraulic_mode_solenoid_energized_from_fbw = [
            reader.read(&self.upper_rudder_yellow_actuator_hydraulic_solenoid_id),
            reader.read(&self.upper_rudder_green_actuator_hydraulic_solenoid_id),
        ];
        self.upper_electric_mode_solenoid_energized_from_fbw = [
            reader.read(&self.upper_rudder_yellow_actuator_electric_solenoid_id)
                && self.eha_backup_allowed,
            reader.read(&self.upper_rudder_green_actuator_electric_solenoid_id)
                && self.eha_backup_allowed,
        ];

        self.lower_position_requests_from_fbw = [
            Self::rudder_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.lower_rudder_green_actuator_position_demand_id),
            )),
            Self::rudder_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.lower_rudder_yellow_actuator_position_demand_id),
            )),
        ];
        self.lower_hydraulic_mode_solenoid_energized_from_fbw = [
            reader.read(&self.lower_rudder_green_actuator_hydraulic_solenoid_id),
            reader.read(&self.lower_rudder_yellow_actuator_hydraulic_solenoid_id),
        ];
        self.lower_electric_mode_solenoid_energized_from_fbw = [
            reader.read(&self.lower_rudder_green_actuator_electric_solenoid_id)
                && self.eha_backup_allowed,
            reader.read(&self.lower_rudder_yellow_actuator_electric_solenoid_id)
                && self.eha_backup_allowed,
        ];
    }
}

#[derive(PartialEq, Clone, Copy)]
enum ActuatorSide {
    Left,
    Right,
}

#[derive(PartialEq, Clone, Copy)]
enum AileronActuatorPosition {
    Outward = 0,
    Inward = 1,
}

#[derive(PartialEq, Clone, Copy)]
enum AileronPanelPosition {
    Outward = 0,
    Middle = 1,
    Inward = 2,
}
enum RudderActuatorPosition {
    Upper = 0,
    Lower = 1,
}

enum RudderPanelPosition {
    Upper = 0,
    Lower = 1,
}

enum ElevatorActuatorPosition {
    Outward = 0,
    Inward = 1,
}

enum ElevatorPanelPosition {
    Outward = 0,
    Inward = 1,
}

enum TrimmableHorizontalStabilizerMotorPosition {
    Green = 0,
    Yellow = 1,
}

struct AileronAssembly {
    hydraulic_assemblies: [HydraulicLinearActuatorAssembly<2>; 3],

    position_out_id: VariableIdentifier,
    position_mid_id: VariableIdentifier,
    position_in_id: VariableIdentifier,

    positions: [f64; 3],
    aerodynamic_models: [AerodynamicModel; 3],
}
impl AileronAssembly {
    fn new(
        context: &mut InitContext,
        id: ActuatorSide,
        outward_hydraulic_assembly: HydraulicLinearActuatorAssembly<2>,
        middle_hydraulic_assembly: HydraulicLinearActuatorAssembly<2>,
        inward_hydraulic_assembly: HydraulicLinearActuatorAssembly<2>,
        aerodynamic_model_outer: AerodynamicModel,
        aerodynamic_model_middle: AerodynamicModel,
        aerodynamic_model_inner: AerodynamicModel,
    ) -> Self {
        Self {
            hydraulic_assemblies: [
                outward_hydraulic_assembly,
                middle_hydraulic_assembly,
                inward_hydraulic_assembly,
            ],
            position_out_id: match id {
                ActuatorSide::Left => {
                    context.get_identifier("HYD_AIL_LEFT_OUTWARD_DEFLECTION".to_owned())
                }
                ActuatorSide::Right => {
                    context.get_identifier("HYD_AIL_RIGHT_OUTWARD_DEFLECTION".to_owned())
                }
            },
            position_mid_id: match id {
                ActuatorSide::Left => {
                    context.get_identifier("HYD_AIL_LEFT_MIDDLE_DEFLECTION".to_owned())
                }
                ActuatorSide::Right => {
                    context.get_identifier("HYD_AIL_RIGHT_MIDDLE_DEFLECTION".to_owned())
                }
            },
            position_in_id: match id {
                ActuatorSide::Left => {
                    context.get_identifier("HYD_AIL_LEFT_INWARD_DEFLECTION".to_owned())
                }
                ActuatorSide::Right => {
                    context.get_identifier("HYD_AIL_RIGHT_INWARD_DEFLECTION".to_owned())
                }
            },
            positions: [0.; 3],
            aerodynamic_models: [
                aerodynamic_model_outer,
                aerodynamic_model_middle,
                aerodynamic_model_inner,
            ],
        }
    }

    fn actuator(
        &mut self,
        circuit_position: AileronActuatorPosition,
        panel_position: AileronPanelPosition,
    ) -> &mut impl Actuator {
        self.hydraulic_assemblies[panel_position as usize].actuator(circuit_position as usize)
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        controllers: [&[impl HydraulicAssemblyController + HydraulicLocking + ElectroHydrostaticPowered];
            3],
        current_pressure_outward: [&impl SectionPressure; 3],
        current_pressure_inward: [&impl SectionPressure; 3],
    ) {
        for idx in 0..3 {
            self.aerodynamic_models[idx]
                .update_body(context, self.hydraulic_assemblies[idx].body());
            self.hydraulic_assemblies[idx].update(
                context,
                controllers[idx],
                [
                    current_pressure_outward[idx].pressure_downstream_leak_valve(),
                    current_pressure_inward[idx].pressure_downstream_leak_valve(),
                ],
            );

            self.positions[idx] = self.hydraulic_assemblies[idx]
                .position_normalized()
                .get::<ratio>();
        }
    }

    fn positions(&self) -> &[f64; 3] {
        &self.positions
    }
}
impl SimulationElement for AileronAssembly {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.hydraulic_assemblies, visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.position_out_id, self.positions[0]);
        writer.write(&self.position_mid_id, self.positions[1]);
        writer.write(&self.position_in_id, self.positions[2]);
    }
}
impl Debug for AileronAssembly {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "\nAILERON ASSEMBLY => \nAIL OUT {:?}\nAIL MID {:?}\nAIL IN {:?}",
            self.hydraulic_assemblies[0],
            self.hydraulic_assemblies[1],
            self.hydraulic_assemblies[2],
        )
    }
}

struct ElevatorAssembly {
    hydraulic_assemblies: [HydraulicLinearActuatorAssembly<2>; 2],

    position_out_id: VariableIdentifier,
    position_in_id: VariableIdentifier,

    positions: [Ratio; 2],

    aerodynamic_models: [AerodynamicModel; 2],
}
impl ElevatorAssembly {
    fn new(
        context: &mut InitContext,
        id: ActuatorSide,
        outward_hydraulic_assembly: HydraulicLinearActuatorAssembly<2>,
        inward_hydraulic_assembly: HydraulicLinearActuatorAssembly<2>,
        aerodynamic_model_outer: AerodynamicModel,
        aerodynamic_model_inner: AerodynamicModel,
    ) -> Self {
        Self {
            hydraulic_assemblies: [outward_hydraulic_assembly, inward_hydraulic_assembly],
            position_out_id: match id {
                ActuatorSide::Left => {
                    context.get_identifier("HYD_ELEV_LEFT_OUTWARD_DEFLECTION".to_owned())
                }
                ActuatorSide::Right => {
                    context.get_identifier("HYD_ELEV_RIGHT_OUTWARD_DEFLECTION".to_owned())
                }
            },
            position_in_id: match id {
                ActuatorSide::Left => {
                    context.get_identifier("HYD_ELEV_LEFT_INWARD_DEFLECTION".to_owned())
                }
                ActuatorSide::Right => {
                    context.get_identifier("HYD_ELEV_RIGHT_INWARD_DEFLECTION".to_owned())
                }
            },

            positions: [Ratio::new::<ratio>(0.); 2],
            aerodynamic_models: [aerodynamic_model_outer, aerodynamic_model_inner],
        }
    }

    fn actuator(
        &mut self,
        circuit_position: ElevatorActuatorPosition,
        panel_position: ElevatorPanelPosition,
    ) -> &mut impl Actuator {
        self.hydraulic_assemblies[panel_position as usize].actuator(circuit_position as usize)
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        elevator_controllers: [&[impl HydraulicAssemblyController + HydraulicLocking + ElectroHydrostaticPowered];
            2],
        current_pressure_outward: [&impl SectionPressure; 2],
        current_pressure_inward: [&impl SectionPressure; 2],
    ) {
        for idx in 0..2 {
            self.aerodynamic_models[idx]
                .update_body(context, self.hydraulic_assemblies[idx].body());

            self.hydraulic_assemblies[idx].update(
                context,
                elevator_controllers[idx],
                [
                    current_pressure_outward[idx].pressure_downstream_leak_valve(),
                    current_pressure_inward[idx].pressure_downstream_leak_valve(),
                ],
            );

            self.positions[idx] = self.hydraulic_assemblies[idx].position_normalized();
        }
    }

    // Returns aerodynamic torques for (outer,inner) control surfaces
    fn aerodynamic_torques_outer_inner(&self) -> (Torque, Torque) {
        (
            self.hydraulic_assemblies[0].aerodynamic_torque(),
            self.hydraulic_assemblies[1].aerodynamic_torque(),
        )
    }
}
impl SimulationElement for ElevatorAssembly {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.hydraulic_assemblies, visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.position_out_id,
            self.positions[ElevatorPanelPosition::Outward as usize].get::<ratio>(),
        );
        writer.write(
            &self.position_in_id,
            self.positions[ElevatorPanelPosition::Inward as usize].get::<ratio>(),
        );
    }
}
impl Debug for ElevatorAssembly {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "\nElevator assembly => Outward assembly / {:?} Inward assembly / {:?}",
            self.hydraulic_assemblies[0], self.hydraulic_assemblies[1]
        )
    }
}

struct RudderAssembly {
    hydraulic_assemblies: [HydraulicLinearActuatorAssembly<2>; 2],

    position_upper_id: VariableIdentifier,

    position_lower_id: VariableIdentifier,

    positions: [Ratio; 2],

    aerodynamic_models: [AerodynamicModel; 2],
}
impl RudderAssembly {
    fn new(
        context: &mut InitContext,
        upper_hydraulic_assembly: HydraulicLinearActuatorAssembly<2>,
        lower_hydraulic_assembly: HydraulicLinearActuatorAssembly<2>,
        aerodynamic_model_upper: AerodynamicModel,
        aerodynamic_model_lower: AerodynamicModel,
    ) -> Self {
        Self {
            hydraulic_assemblies: [upper_hydraulic_assembly, lower_hydraulic_assembly],

            position_upper_id: context.get_identifier("HYD_UPPER_RUD_DEFLECTION".to_owned()),

            position_lower_id: context.get_identifier("HYD_LOWER_RUD_DEFLECTION".to_owned()),

            positions: [Ratio::new::<ratio>(0.); 2],

            aerodynamic_models: [aerodynamic_model_upper, aerodynamic_model_lower],
        }
    }

    fn actuator(
        &mut self,
        circuit_position: RudderActuatorPosition,
        panel_position: RudderPanelPosition,
    ) -> &mut impl Actuator {
        self.hydraulic_assemblies[panel_position as usize].actuator(circuit_position as usize)
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        rudder_controllers: [&[impl HydraulicAssemblyController + HydraulicLocking + ElectroHydrostaticPowered];
            2],
        current_pressure_upper: [&impl SectionPressure; 2],
        current_pressure_lower: [&impl SectionPressure; 2],
    ) {
        for idx in 0..2 {
            self.aerodynamic_models[idx]
                .update_body(context, self.hydraulic_assemblies[idx].body());

            self.hydraulic_assemblies[idx].update(
                context,
                rudder_controllers[idx],
                [
                    current_pressure_upper[idx].pressure_downstream_leak_valve(),
                    current_pressure_lower[idx].pressure_downstream_leak_valve(),
                ],
            );

            self.positions[idx] = self.hydraulic_assemblies[idx].position_normalized();
        }
    }

    // Returns aerodynamic torques for (upper,lower) control surfaces
    fn aerodynamic_torques_up_down(&self) -> (Torque, Torque) {
        (
            self.hydraulic_assemblies[0].aerodynamic_torque(),
            self.hydraulic_assemblies[1].aerodynamic_torque(),
        )
    }
}
impl SimulationElement for RudderAssembly {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        accept_iterable!(self.hydraulic_assemblies, visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(
            &self.position_upper_id,
            self.positions[RudderPanelPosition::Upper as usize].get::<ratio>(),
        );
        writer.write(
            &self.position_lower_id,
            self.positions[RudderPanelPosition::Lower as usize].get::<ratio>(),
        );
    }
}

struct SpoilerElement {
    hydraulic_assembly: HydraulicLinearActuatorAssembly<1>,

    position_id: VariableIdentifier,

    position: Ratio,

    aerodynamic_model: AerodynamicModel,
}
impl SpoilerElement {
    fn new(
        context: &mut InitContext,
        id: ActuatorSide,
        id_num: usize,
        hydraulic_assembly: HydraulicLinearActuatorAssembly<1>,
        aerodynamic_model: AerodynamicModel,
    ) -> Self {
        Self {
            hydraulic_assembly,
            position_id: match id {
                ActuatorSide::Left => {
                    context.get_identifier(format!("HYD_SPOILER_{}_LEFT_DEFLECTION", id_num))
                }
                ActuatorSide::Right => {
                    context.get_identifier(format!("HYD_SPOILER_{}_RIGHT_DEFLECTION", id_num))
                }
            },
            position: Ratio::new::<ratio>(0.),
            aerodynamic_model,
        }
    }

    fn actuator(&mut self) -> &mut impl Actuator {
        self.hydraulic_assembly.actuator(0)
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        spoiler_controller: &(impl HydraulicAssemblyController
              + HydraulicLocking
              + ElectroHydrostaticPowered),
        current_pressure: Pressure,
    ) {
        self.aerodynamic_model
            .update_body(context, self.hydraulic_assembly.body());
        self.hydraulic_assembly.update(
            context,
            std::slice::from_ref(spoiler_controller),
            [current_pressure],
        );

        self.position = self.hydraulic_assembly.position_normalized();
    }

    fn position(&self) -> f64 {
        self.position.get::<ratio>()
    }
}
impl SimulationElement for SpoilerElement {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.hydraulic_assembly.accept(visitor);

        visitor.visit(self);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.position_id, self.position.get::<ratio>());
    }
}

struct SpoilerGroup {
    spoilers: [SpoilerElement; 8],
    hydraulic_controllers: [SpoilerController; 8],
    spoiler_positions: [f64; 8],

    eha_backup_allowed: bool,
}
impl SpoilerGroup {
    const PLACE_HOLDER_POSITION_DEMAND_THRESHOLD_TO_DECLARE_GROUND_SPOILER_RATIO: f64 = 0.55;

    fn new(context: &mut InitContext, spoiler_side: &str, spoilers: [SpoilerElement; 8]) -> Self {
        Self {
            spoilers,
            hydraulic_controllers: [
                SpoilerController::new(context, spoiler_side, 1),
                SpoilerController::new(context, spoiler_side, 2),
                SpoilerController::new(context, spoiler_side, 3),
                SpoilerController::new(context, spoiler_side, 4),
                SpoilerController::new(context, spoiler_side, 5),
                SpoilerController::new(context, spoiler_side, 6),
                SpoilerController::new(context, spoiler_side, 7),
                SpoilerController::new(context, spoiler_side, 8),
            ],
            spoiler_positions: [0.; 8],

            eha_backup_allowed: false,
        }
    }

    fn update(
        &mut self,
        context: &UpdateContext,
        green_section: &impl SectionPressure,
        yellow_section: &impl SectionPressure,
        eha_backup_placeholder: &A380EhaInhibitPlaceholder,
    ) {
        // FIXME REMOVE elec backup inhibit once handles from flight computers
        self.eha_backup_allowed = eha_backup_placeholder.is_allowed();
        self.hydraulic_controllers[5].set_elec_backup_allowed(self.eha_backup_allowed);

        self.spoilers[0].update(
            context,
            &self.hydraulic_controllers[0],
            yellow_section.pressure_downstream_leak_valve(),
        );
        self.spoilers[1].update(
            context,
            &self.hydraulic_controllers[1],
            green_section.pressure_downstream_leak_valve(),
        );
        self.spoilers[2].update(
            context,
            &self.hydraulic_controllers[2],
            yellow_section.pressure_downstream_leak_valve(),
        );
        self.spoilers[3].update(
            context,
            &self.hydraulic_controllers[3],
            green_section.pressure_downstream_leak_valve(),
        );
        self.spoilers[4].update(
            context,
            &self.hydraulic_controllers[4],
            yellow_section.pressure_downstream_leak_valve(),
        );
        self.spoilers[5].update(
            context,
            &self.hydraulic_controllers[5],
            green_section.pressure_downstream_leak_valve(),
        );
        self.spoilers[6].update(
            context,
            &self.hydraulic_controllers[6],
            yellow_section.pressure_downstream_leak_valve(),
        );
        self.spoilers[7].update(
            context,
            &self.hydraulic_controllers[7],
            green_section.pressure_downstream_leak_valve(),
        );

        self.spoiler_positions = [
            self.spoilers[0].position(),
            self.spoilers[1].position(),
            self.spoilers[2].position(),
            self.spoilers[3].position(),
            self.spoilers[4].position(),
            self.spoilers[5].position(),
            self.spoilers[6].position(),
            self.spoilers[7].position(),
        ];
    }

    fn actuator(&mut self, spoiler_idx: usize) -> &mut impl Actuator {
        self.spoilers[spoiler_idx].actuator()
    }

    fn positions(&self) -> &[f64; 8] {
        &self.spoiler_positions
    }

    fn ground_spoilers_are_requested(&self) -> bool {
        // Placeholder to decide if ground spoilers are requested. TODO use actual signal from flight controls
        self.hydraulic_controllers[0].requested_position()
            > Ratio::new::<ratio>(
                Self::PLACE_HOLDER_POSITION_DEMAND_THRESHOLD_TO_DECLARE_GROUND_SPOILER_RATIO,
            )
            && self.hydraulic_controllers[1].requested_position()
                > Ratio::new::<ratio>(
                    Self::PLACE_HOLDER_POSITION_DEMAND_THRESHOLD_TO_DECLARE_GROUND_SPOILER_RATIO,
                )
    }
}
impl SimulationElement for SpoilerGroup {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        for controller in &mut self.hydraulic_controllers {
            controller.accept(visitor);
        }

        for spoiler in &mut self.spoilers {
            spoiler.accept(visitor);
        }

        visitor.visit(self);
    }
}

struct SpoilerController {
    position_demand_id: VariableIdentifier,
    electrical_mode_ena_id: Option<VariableIdentifier>,
    requested_position: Ratio,
    elec_backup_active: bool,

    elec_backup_allowed: bool,
}
impl SpoilerController {
    fn new(context: &mut InitContext, spoiler_side: &str, spoiler_id_number: usize) -> Self {
        Self {
            position_demand_id: context.get_identifier(format!(
                "{}_SPOILER_{}_COMMANDED_POSITION",
                spoiler_side, spoiler_id_number
            )),
            electrical_mode_ena_id: if spoiler_id_number == 6 {
                Some(
                    context.get_identifier(format!(
                        "{}_SPOILER_6_EBHA_ELECTRONIC_ENABLE",
                        spoiler_side
                    )),
                )
            } else {
                None
            },

            requested_position: Ratio::new::<ratio>(0.),
            elec_backup_active: false,

            elec_backup_allowed: false,
        }
    }

    fn set_elec_backup_allowed(&mut self, elec_backup_allowed: bool) {
        self.elec_backup_allowed = elec_backup_allowed;
    }

    fn spoiler_actuator_position_from_surface_angle(surface_angle: Angle) -> Ratio {
        Ratio::new::<ratio>((surface_angle.get::<degree>() / 50.).clamp(0., 1.))
    }
}
impl HydraulicAssemblyController for SpoilerController {
    fn requested_mode(&self) -> LinearActuatorMode {
        LinearActuatorMode::PositionControl
    }

    fn requested_position(&self) -> Ratio {
        self.requested_position
    }

    fn should_lock(&self) -> bool {
        false
    }

    fn requested_lock_position(&self) -> Ratio {
        Ratio::default()
    }
}
impl SimulationElement for SpoilerController {
    fn read(&mut self, reader: &mut SimulatorReader) {
        self.requested_position =
            Self::spoiler_actuator_position_from_surface_angle(Angle::new::<degree>(
                reader.read(&self.position_demand_id),
            ));

        if let Some(elec_mode_id) = self.electrical_mode_ena_id {
            self.elec_backup_active = reader.read(&elec_mode_id);
        };
    }
}
impl HydraulicLocking for SpoilerController {}
impl ElectroHydrostaticPowered for SpoilerController {
    fn should_activate_electrical_mode(&self) -> bool {
        self.elec_backup_active && self.elec_backup_allowed
    }
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum A380GravityExtensionSwitchPosition {
    Reset = 0,
    Off = 1,
    Extension = 2,
}
impl From<f64> for A380GravityExtensionSwitchPosition {
    fn from(value: f64) -> Self {
        match value as u8 {
            0 => A380GravityExtensionSwitchPosition::Reset,
            1 => A380GravityExtensionSwitchPosition::Off,
            2 => A380GravityExtensionSwitchPosition::Extension,
            _ => A380GravityExtensionSwitchPosition::Off,
        }
    }
}

/// The two Free Fall Control Modules (FFCM) of the landing gear gravity extension. With the L/G GRVTY sw DOWN a timer
/// sequences the commands: 1. the cut-out valves isolate the retraction actuators, 2. the retraction actuators go to
/// gravity mode, 3. the door uplocks open, 4. the gear uplocks open (NLG and WLG, then BLG). Without failure the last
/// gear downlocks 70 s after the sw is set DOWN.
///
/// Only that total is published. Design choice for the steps 3 and 4: in the model the doors take about 20 s to fall
/// open and the gears about 25 s to fall to their downlock, so the door uplocks open after 25 s and the gear uplocks
/// after 45 s: the last gear downlocks about 70 s after the sw is set DOWN. The model releases all the gear uplocks
/// together (one main gear assembly per side stands for its WLG and BLG).
///
/// The sequence step is given to the gear hydraulic controller as the "number of handle turns" of the common gear
/// system: 1 = steps 1 and 2 (cut-out and vent valves), 2 = door uplocks open, 3 = gear uplocks open.
struct A380GravityExtension {
    gear_gravity_extension_handle_position_id: VariableIdentifier,

    switch_position: A380GravityExtensionSwitchPosition,

    /// Time since the L/G GRVTY sw was set DOWN (held when the sw leaves DOWN, cleared by RESET)
    sequence_time: Duration,
}
impl A380GravityExtension {
    const DOOR_UPLOCKS_RELEASE_TIME: Duration = Duration::from_secs(25);
    const GEAR_UPLOCKS_RELEASE_TIME: Duration = Duration::from_secs(45);

    fn new(context: &mut InitContext) -> Self {
        Self {
            gear_gravity_extension_handle_position_id: context
                .get_identifier("LG_GRVTY_SWITCH_POS".to_owned()),

            switch_position: A380GravityExtensionSwitchPosition::Off,

            sequence_time: Duration::ZERO,
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        match self.switch_position {
            A380GravityExtensionSwitchPosition::Reset => self.sequence_time = Duration::ZERO,
            A380GravityExtensionSwitchPosition::Extension => {
                self.sequence_time =
                    (self.sequence_time + context.delta()).min(Self::GEAR_UPLOCKS_RELEASE_TIME)
            }
            A380GravityExtensionSwitchPosition::Off => {}
        }
    }
}
impl GearGravityExtension for A380GravityExtension {
    fn extension_handle_number_of_turns(&self) -> u8 {
        if self.sequence_time >= Self::GEAR_UPLOCKS_RELEASE_TIME {
            3
        } else if self.sequence_time >= Self::DOOR_UPLOCKS_RELEASE_TIME {
            2
        } else if self.sequence_time > Duration::ZERO {
            1
        } else {
            0
        }
    }
}
impl SimulationElement for A380GravityExtension {
    fn read(&mut self, reader: &mut SimulatorReader) {
        let switch_position: f64 = reader.read(&self.gear_gravity_extension_handle_position_id);
        self.switch_position = switch_position.into();
    }
}

struct A380TiltingGears {
    left_body_gear: TiltingGear,
    right_body_gear: TiltingGear,
    left_wing_gear: TiltingGear,
    right_wing_gear: TiltingGear,
}
impl A380TiltingGears {
    fn new(
        left_body_gear: TiltingGear,
        right_body_gear: TiltingGear,
        left_wing_gear: TiltingGear,
        right_wing_gear: TiltingGear,
    ) -> Self {
        Self {
            left_body_gear,
            right_body_gear,
            left_wing_gear,
            right_wing_gear,
        }
    }

    fn update(&mut self, context: &UpdateContext) {
        self.left_body_gear.update(context);
        self.right_body_gear.update(context);
        self.left_wing_gear.update(context);
        self.right_wing_gear.update(context);
    }
}
impl SimulationElement for A380TiltingGears {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.left_body_gear.accept(visitor);
        self.right_body_gear.accept(visitor);
        self.left_wing_gear.accept(visitor);
        self.right_wing_gear.accept(visitor);

        visitor.visit(self);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use more_asserts::*;

    mod a380_hydraulics {
        use super::*;
        use rstest::rstest;

        use autobrakes::A380AutobrakeMode;
        use systems::{
            electrical::{
                test::TestElectricitySource, ElectricalBus, Electricity, ElectricitySource,
                ExternalPowerSource,
            },
            engine::{trent_engine::TrentEngine, EngineFireOverheadPanel},
            failures::FailureType,
            hydraulic::cargo_doors::{DoorControlState, HydraulicDoorController},
            landing_gear::{GearSystemState, LandingGear, LandingGearControlInterfaceUnitSet},
            pneumatic::PressurizeableReservoir,
            shared::{
                arinc429::{Arinc429Word, SignStatus},
                EmergencyElectricalState, FlightControlSurface, LgciuId, PotentialOrigin,
            },
            simulation::{
                test::{ReadByName, SimulationTestBed, TestBed, WriteByName},
                Aircraft, InitContext,
            },
        };

        use uom::si::{
            angle::degree,
            electric_potential::volt,
            length::foot,
            ratio::{percent, ratio},
        };

        struct A380TestAdirus {
            airspeed: Velocity,
            any_aligned: bool,
        }
        impl A380TestAdirus {
            fn default() -> Self {
                Self {
                    airspeed: Velocity::default(),
                    any_aligned: true,
                }
            }

            fn update(&mut self, context: &UpdateContext) {
                self.airspeed = context.true_airspeed();
            }

            fn set_aligned(&mut self, is_aligned: bool) {
                self.any_aligned = is_aligned;
            }
        }
        impl AdirsDiscreteOutputs for A380TestAdirus {
            fn low_speed_warning_1(&self, _: usize) -> bool {
                self.airspeed.get::<knot>() > 50.
            }

            fn low_speed_warning_2(&self, _: usize) -> bool {
                self.airspeed.get::<knot>() > 260.
            }

            fn low_speed_warning_3(&self, _: usize) -> bool {
                self.airspeed.get::<knot>() > 100.
            }

            fn low_speed_warning_4(&self, _: usize) -> bool {
                self.airspeed.get::<knot>() < 260.
            }
        }
        impl AdirsMeasurementOutputs for A380TestAdirus {
            fn is_fully_aligned(&self, _: usize) -> bool {
                self.any_aligned
            }

            fn latitude(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
                Arinc429Word::new(Angle::default(), SignStatus::NormalOperation)
            }
            fn longitude(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
                Arinc429Word::new(Angle::default(), SignStatus::NormalOperation)
            }
            fn heading(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
                Arinc429Word::new(Angle::default(), SignStatus::NormalOperation)
            }
            fn true_heading(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
                Arinc429Word::new(Angle::default(), SignStatus::NormalOperation)
            }
            fn vertical_speed(&self, _adiru_number: usize) -> Arinc429Word<Velocity> {
                Arinc429Word::new(Velocity::default(), SignStatus::NormalOperation)
            }
            fn altitude(&self, _adiru_number: usize) -> Arinc429Word<Length> {
                Arinc429Word::new(Length::default(), SignStatus::NormalOperation)
            }
            fn angle_of_attack(&self, _adiru_number: usize) -> Arinc429Word<Angle> {
                Arinc429Word::new(Angle::default(), SignStatus::NormalOperation)
            }
            fn computed_airspeed(&self, _adiru_number: usize) -> Arinc429Word<Velocity> {
                Arinc429Word::new(Velocity::default(), SignStatus::NormalOperation)
            }
        }

        struct A380TestPneumatics {
            pressure: Pressure,
        }
        impl A380TestPneumatics {
            pub fn new() -> Self {
                Self {
                    pressure: Pressure::new::<psi>(50.),
                }
            }

            fn set_nominal_air_pressure(&mut self) {
                self.pressure = Pressure::new::<psi>(50.);
            }

            fn set_low_air_pressure(&mut self) {
                self.pressure = Pressure::new::<psi>(1.);
            }
        }
        impl ReservoirAirPressure for A380TestPneumatics {
            fn green_reservoir_pressure(&self) -> Pressure {
                self.pressure
            }

            fn blue_reservoir_pressure(&self) -> Pressure {
                self.pressure
            }

            fn yellow_reservoir_pressure(&self) -> Pressure {
                self.pressure
            }
        }

        struct A380TestElectrical {
            airspeed: Velocity,
            all_ac_lost: bool,
        }
        impl A380TestElectrical {
            pub fn new() -> Self {
                A380TestElectrical {
                    airspeed: Velocity::new::<knot>(100.),
                    all_ac_lost: false,
                }
            }

            fn update(&mut self, context: &UpdateContext) {
                self.airspeed = context.indicated_airspeed();
            }
        }
        impl EmergencyElectricalState for A380TestElectrical {
            fn is_in_emergency_elec(&self) -> bool {
                self.all_ac_lost && self.airspeed >= Velocity::new::<knot>(100.)
            }
        }
        impl SimulationElement for A380TestElectrical {
            fn receive_power(&mut self, buses: &impl ElectricalBuses) {
                self.all_ac_lost = !buses.is_powered(ElectricalBusType::AlternatingCurrent(1))
                    && !buses.is_powered(ElectricalBusType::AlternatingCurrent(2));
            }
        }
        struct A380HydraulicsTestAircraft {
            pneumatics: A380TestPneumatics,
            engine_1: TrentEngine,
            engine_2: TrentEngine,
            engine_3: TrentEngine,
            engine_4: TrentEngine,
            hydraulics: A380Hydraulic,
            overhead: A380HydraulicOverheadPanel,
            autobrake_panel: A380AutobrakePanel,
            engine_fire_overhead: EngineFireOverheadPanel<4>,

            landing_gear: LandingGear,
            lgcius: LandingGearControlInterfaceUnitSet,
            adirus: A380TestAdirus,
            electrical: A380TestElectrical,
            ext_pwr: ExternalPowerSource,

            powered_source_ac: TestElectricitySource,
            ac_ground_service_bus: ElectricalBus,
            dc_ground_service_bus: ElectricalBus,
            ac_ess_bus: ElectricalBus,
            ac_1_bus: ElectricalBus,
            ac_2_bus: ElectricalBus,
            ac_3_bus: ElectricalBus,
            ac_4_bus: ElectricalBus,
            ac_eha_bus: ElectricalBus,
            dc_1_bus: ElectricalBus,
            dc_2_bus: ElectricalBus,
            dc_ess_bus: ElectricalBus,
            dc_hot_1_bus: ElectricalBus,
            dc_hot_2_bus: ElectricalBus,

            // Electric buses states to be able to kill them dynamically
            is_ac_ground_service_powered: bool,
            is_dc_ground_service_powered: bool,
            is_ac_ess_powered: bool,
            is_ac_1_powered: bool,
            is_ac_2_powered: bool,
            is_ac_3_powered: bool,
            is_ac_4_powered: bool,
            is_ac_eha_powered: bool,
            is_dc_1_powered: bool,
            is_dc_2_powered: bool,
            is_dc_ess_powered: bool,
            is_dc_hot_1_powered: bool,
            is_dc_hot_2_powered: bool,
        }
        impl A380HydraulicsTestAircraft {
            fn new(context: &mut InitContext) -> Self {
                Self {
                    pneumatics: A380TestPneumatics::new(),
                    engine_1: TrentEngine::new(context, 1),
                    engine_2: TrentEngine::new(context, 2),
                    engine_3: TrentEngine::new(context, 3),
                    engine_4: TrentEngine::new(context, 4),
                    hydraulics: A380Hydraulic::new(context),
                    overhead: A380HydraulicOverheadPanel::new(context),
                    autobrake_panel: A380AutobrakePanel::new(context),
                    engine_fire_overhead: EngineFireOverheadPanel::new(context),
                    landing_gear: LandingGear::new(context, true),
                    lgcius: LandingGearControlInterfaceUnitSet::new(
                        context,
                        ElectricalBusType::DirectCurrentEssential,
                        ElectricalBusType::DirectCurrentGndFltService,
                    ),
                    adirus: A380TestAdirus::default(),
                    electrical: A380TestElectrical::new(),
                    ext_pwr: ExternalPowerSource::new(context, 1),
                    powered_source_ac: TestElectricitySource::powered(
                        context,
                        PotentialOrigin::EngineGenerator(1),
                    ),
                    ac_ground_service_bus: ElectricalBus::new(
                        context,
                        ElectricalBusType::AlternatingCurrentGndFltService,
                    ),
                    dc_ground_service_bus: ElectricalBus::new(
                        context,
                        ElectricalBusType::DirectCurrentGndFltService,
                    ),
                    // The A380 AC ESS busbar (400XP), supply of the 427XP EHAs/EBHAs
                    ac_ess_bus: ElectricalBus::new(
                        context,
                        ElectricalBusType::AlternatingCurrentEssentialShed,
                    ),
                    ac_1_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(1)),
                    ac_2_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(2)),
                    ac_3_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(3)),
                    ac_4_bus: ElectricalBus::new(context, ElectricalBusType::AlternatingCurrent(4)),
                    ac_eha_bus: ElectricalBus::new(context, AC_EHA_BUS),
                    dc_1_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(1)),
                    dc_2_bus: ElectricalBus::new(context, ElectricalBusType::DirectCurrent(2)),
                    dc_ess_bus: ElectricalBus::new(
                        context,
                        ElectricalBusType::DirectCurrentEssential,
                    ),
                    dc_hot_1_bus: ElectricalBus::new(
                        context,
                        ElectricalBusType::DirectCurrentHot(1),
                    ),
                    dc_hot_2_bus: ElectricalBus::new(
                        context,
                        ElectricalBusType::DirectCurrentHot(2),
                    ),
                    is_ac_ground_service_powered: true,
                    is_dc_ground_service_powered: true,
                    is_ac_ess_powered: true,
                    is_ac_1_powered: true,
                    is_ac_2_powered: true,
                    is_ac_3_powered: true,
                    is_ac_4_powered: true,
                    is_ac_eha_powered: true,
                    is_dc_1_powered: true,
                    is_dc_2_powered: true,
                    is_dc_ess_powered: true,
                    is_dc_hot_1_powered: true,
                    is_dc_hot_2_powered: true,
                }
            }

            fn set_adirs_alignement(&mut self, is_aligned: bool) {
                self.adirus.set_aligned(is_aligned)
            }

            fn is_green_edp_commanded_on(&self) -> bool {
                self.hydraulics
                    .engine_driven_pump_1a_controller
                    .should_pressurise()
            }

            fn is_yellow_edp_commanded_on(&self) -> bool {
                self.hydraulics
                    .engine_driven_pump_3a_controller
                    .should_pressurise()
            }

            fn get_yellow_brake_accumulator_fluid_volume(&self) -> Volume {
                self.hydraulics
                    .braking_circuit_altn
                    .accumulator_fluid_volume()
            }

            fn is_nws_pin_inserted(&self) -> bool {
                self.hydraulics.nose_wheel_steering_pin_is_inserted()
            }

            fn is_yellow_a_epump_controller_pressurising(&self) -> bool {
                self.hydraulics
                    .yellow_electric_pump_a_controller
                    .should_pressurise()
            }

            fn is_yellow_b_epump_controller_pressurising(&self) -> bool {
                self.hydraulics
                    .yellow_electric_pump_b_controller
                    .should_pressurise()
            }

            fn is_green_epump_a_controller_pressurising(&self) -> bool {
                self.hydraulics
                    .green_electric_pump_a_controller
                    .should_pressurise()
            }

            fn is_green_epump_b_controller_pressurising(&self) -> bool {
                self.hydraulics
                    .green_electric_pump_b_controller
                    .should_pressurise()
            }

            fn is_edp1a_green_pump_controller_pressurising(&self) -> bool {
                self.hydraulics
                    .engine_driven_pump_1a_controller
                    .should_pressurise()
            }

            fn is_edp2a_yellow_pump_controller_pressurising(&self) -> bool {
                self.hydraulics
                    .engine_driven_pump_2a_controller
                    .should_pressurise()
            }

            fn is_green_pressure_switch_pressurised(&self) -> bool {
                self.hydraulics.is_green_pressure_switch_pressurised()
            }

            fn is_yellow_pressure_switch_pressurised(&self) -> bool {
                self.hydraulics.is_yellow_pressure_switch_pressurised()
            }

            fn nose_steering_position(&self) -> Angle {
                self.hydraulics.nose_steering.position_feedback()
            }

            fn is_cargo_fwd_door_locked_up(&self) -> bool {
                self.hydraulics
                    .forward_cargo_door_controller
                    .control_state()
                    == DoorControlState::UpLocked
            }

            fn is_cargo_aft_door_locked_up(&self) -> bool {
                self.hydraulics.aft_cargo_door_controller.control_state()
                    == DoorControlState::UpLocked
            }

            fn set_ac_bus_1_is_powered(&mut self, bus_is_alive: bool) {
                self.is_ac_1_powered = bus_is_alive;
            }

            fn set_ac_bus_2_is_powered(&mut self, bus_is_alive: bool) {
                self.is_ac_2_powered = bus_is_alive;
            }

            fn set_ac_bus_3_is_powered(&mut self, bus_is_alive: bool) {
                self.is_ac_3_powered = bus_is_alive;
            }

            fn set_ac_bus_4_is_powered(&mut self, bus_is_alive: bool) {
                self.is_ac_4_powered = bus_is_alive;
            }

            fn _set_dc_ground_service_is_powered(&mut self, bus_is_alive: bool) {
                self.is_dc_ground_service_powered = bus_is_alive;
            }

            fn set_ac_ground_service_is_powered(&mut self, bus_is_alive: bool) {
                self.is_ac_ground_service_powered = bus_is_alive;
            }

            fn set_dc_bus_1_is_powered(&mut self, bus_is_alive: bool) {
                self.is_dc_1_powered = bus_is_alive;
            }

            fn set_dc_bus_2_is_powered(&mut self, bus_is_alive: bool) {
                self.is_dc_2_powered = bus_is_alive;
            }

            fn set_ac_ess_is_powered(&mut self, bus_is_alive: bool) {
                self.is_ac_ess_powered = bus_is_alive;
            }

            fn set_ac_eha_is_powered(&mut self, bus_is_alive: bool) {
                self.is_ac_eha_powered = bus_is_alive;
            }

            fn _set_dc_ess_is_powered(&mut self, bus_is_alive: bool) {
                self.is_dc_ess_powered = bus_is_alive;
            }
        }

        impl Aircraft for A380HydraulicsTestAircraft {
            fn update_before_power_distribution(
                &mut self,
                _: &UpdateContext,
                electricity: &mut Electricity,
            ) {
                self.powered_source_ac
                    .power_with_potential(ElectricPotential::new::<volt>(115.));
                electricity.supplied_by(&self.powered_source_ac);

                if self.is_ac_1_powered {
                    electricity.flow(&self.powered_source_ac, &self.ac_1_bus);
                }

                if self.is_ac_2_powered {
                    electricity.flow(&self.powered_source_ac, &self.ac_2_bus);
                }

                if self.is_ac_3_powered {
                    electricity.flow(&self.powered_source_ac, &self.ac_3_bus);
                }

                if self.is_ac_4_powered {
                    electricity.flow(&self.powered_source_ac, &self.ac_4_bus);
                }

                if self.is_ac_eha_powered {
                    electricity.flow(&self.powered_source_ac, &self.ac_eha_bus);
                }

                if self.is_ac_ground_service_powered {
                    electricity.flow(&self.powered_source_ac, &self.ac_ground_service_bus);
                }

                if self.is_dc_ground_service_powered {
                    electricity.flow(&self.powered_source_ac, &self.dc_ground_service_bus);
                }

                if self.is_ac_ess_powered {
                    electricity.flow(&self.powered_source_ac, &self.ac_ess_bus);
                }

                if self.is_dc_1_powered {
                    electricity.flow(&self.powered_source_ac, &self.dc_1_bus);
                }

                if self.is_dc_2_powered {
                    electricity.flow(&self.powered_source_ac, &self.dc_2_bus);
                }

                if self.is_dc_ess_powered {
                    electricity.flow(&self.powered_source_ac, &self.dc_ess_bus);
                }

                if self.is_dc_hot_1_powered {
                    electricity.flow(&self.powered_source_ac, &self.dc_hot_1_bus);
                }

                if self.is_dc_hot_2_powered {
                    electricity.flow(&self.powered_source_ac, &self.dc_hot_2_bus);
                }
            }

            fn update_after_power_distribution(&mut self, context: &UpdateContext) {
                self.electrical.update(context);

                self.adirus.update(context);

                self.lgcius
                    .set_retraction_inhibited(self.hydraulics.is_gear_retraction_inhibited());
                self.lgcius.update(
                    context,
                    &self.landing_gear,
                    &self.hydraulics.gear_system,
                    self.ext_pwr.output_potential().is_powered(),
                    true,
                );

                self.hydraulics.update(
                    context,
                    [
                        &self.engine_1,
                        &self.engine_2,
                        &self.engine_3,
                        &self.engine_4,
                    ],
                    &self.overhead,
                    &self.autobrake_panel,
                    &self.engine_fire_overhead,
                    &self.lgcius,
                    &self.pneumatics,
                    &self.adirus,
                );

                self.overhead.update(&self.hydraulics);
            }
        }
        impl SimulationElement for A380HydraulicsTestAircraft {
            fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
                self.engine_1.accept(visitor);
                self.engine_2.accept(visitor);
                self.engine_3.accept(visitor);
                self.engine_4.accept(visitor);
                self.landing_gear.accept(visitor);
                self.lgcius.accept(visitor);
                self.hydraulics.accept(visitor);
                self.autobrake_panel.accept(visitor);
                self.overhead.accept(visitor);
                self.engine_fire_overhead.accept(visitor);
                self.electrical.accept(visitor);
                self.ext_pwr.accept(visitor);

                visitor.visit(self);
            }
        }

        struct A380HydraulicsTestBed {
            test_bed: SimulationTestBed<A380HydraulicsTestAircraft>,
        }
        impl A380HydraulicsTestBed {
            fn new_with_start_state(start_state: StartState) -> Self {
                let mut test_bed = Self {
                    test_bed: SimulationTestBed::new_with_start_state(
                        start_state,
                        A380HydraulicsTestAircraft::new,
                    ),
                };
                // The test bed has no PRIM: the three PRIMs are healthy unless a test fails them
                for prim_number in 1..=3 {
                    test_bed = test_bed.set_prim_healthy(prim_number, true);
                }
                test_bed
            }

            /// L:A32NX_PRIM_n_HEALTHY, written by the fly-by-wire module in the sim
            fn set_prim_healthy(mut self, prim_number: usize, healthy: bool) -> Self {
                self.write_by_name(&format!("PRIM_{}_HEALTHY", prim_number), healthy);
                self
            }

            fn run_one_tick(mut self) -> Self {
                self.run_with_delta(A380Hydraulic::HYDRAULIC_SIM_TIME_STEP);
                self
            }

            fn run_waiting_for(mut self, delta: Duration) -> Self {
                self.test_bed.run_multiple_frames(delta);
                self
            }

            fn set_adirs_not_aligned(&mut self) {
                self.command(|a| a.set_adirs_alignement(false));
            }

            fn is_green_edp_commanded_on(&self) -> bool {
                self.query(|a| a.is_green_edp_commanded_on())
            }

            fn is_yellow_edp_commanded_on(&self) -> bool {
                self.query(|a| a.is_yellow_edp_commanded_on())
            }

            fn is_green_pressure_switch_pressurised(&self) -> bool {
                self.query(|a| a.is_green_pressure_switch_pressurised())
            }

            fn is_yellow_pressure_switch_pressurised(&self) -> bool {
                self.query(|a| a.is_yellow_pressure_switch_pressurised())
            }

            fn is_flaps_moving(&mut self) -> bool {
                self.read_by_name("IS_FLAPS_MOVING")
            }

            fn is_slats_moving(&mut self) -> bool {
                self.read_by_name("IS_SLATS_MOVING")
            }

            fn nose_steering_position(&self) -> Angle {
                self.query(|a| a.nose_steering_position())
            }

            fn is_cargo_fwd_door_locked_down(&mut self) -> bool {
                self.read_by_name("FWD_DOOR_CARGO_LOCKED")
            }

            fn is_cargo_fwd_door_locked_up(&self) -> bool {
                self.query(|a| a.is_cargo_fwd_door_locked_up())
            }

            fn is_cargo_aft_door_locked_up(&self) -> bool {
                self.query(|a| a.is_cargo_aft_door_locked_up())
            }

            fn cargo_fwd_door_position(&mut self) -> f64 {
                self.read_by_name("FWD_DOOR_CARGO_POSITION")
            }

            fn cargo_aft_door_position(&mut self) -> f64 {
                self.read_by_name("AFT_DOOR_CARGO_POSITION")
            }

            fn is_cargo_door_operation_inhibited(&mut self) -> bool {
                self.read_by_name("HYD_CARGO_DOOR_OPERATION_INHIBITED")
            }

            fn green_pressure(&mut self) -> Pressure {
                self.read_by_name("HYD_GREEN_SYSTEM_1_SECTION_PRESSURE")
            }

            fn yellow_pressure(&mut self) -> Pressure {
                self.read_by_name("HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE")
            }

            fn green_pressure_auxiliary(&mut self) -> Pressure {
                self.read_by_name("HYD_GREEN_AUXILIARY_1_SECTION_PRESSURE")
            }

            fn yellow_pressure_auxiliary(&mut self) -> Pressure {
                self.read_by_name("HYD_YELLOW_AUXILIARY_1_SECTION_PRESSURE")
            }

            fn green_epump_a_has_fault(&mut self) -> bool {
                self.read_by_name("OVHD_HYD_EPUMPGA_OFF_PB_HAS_FAULT")
            }

            fn green_epump_b_has_fault(&mut self) -> bool {
                self.read_by_name("OVHD_HYD_EPUMPGB_OFF_PB_HAS_FAULT")
            }

            fn yellow_epump_a_has_fault(&mut self) -> bool {
                self.read_by_name("OVHD_HYD_EPUMPYA_OFF_PB_HAS_FAULT")
            }

            fn eng1_pumps_disc_has_fault(&mut self) -> bool {
                self.read_by_name("OVHD_HYD_ENG_1AB_PUMP_DISC_PB_HAS_FAULT")
            }

            fn is_green_reservoir_level_low(&self) -> bool {
                self.query(|a| a.hydraulics.green_reservoir().is_low_level())
            }

            fn is_green_reservoir_overheating(&self) -> bool {
                self.query(|a| a.hydraulics.green_reservoir().is_overheating())
            }

            fn is_edp_1a_overheating(&self) -> bool {
                self.query(|a| a.hydraulics.engine_driven_pump_1a.is_overheating())
            }

            fn is_green_epump_a_overheating(&self) -> bool {
                self.query(|a| a.hydraulics.green_electric_pump_a.is_overheating())
            }

            fn green_reservoir_available_volume(&self) -> Volume {
                self.query(|a| a.hydraulics.green_reservoir().available_volume())
            }

            /// Runs one second steps until the condition is true, then 500 ms more so that the controllers, which read
            /// the state of the previous update, show it too; panics after max_seconds instead of hanging
            fn run_until(
                mut self,
                max_seconds: u64,
                description: &str,
                condition: impl Fn(&mut Self) -> bool,
            ) -> Self {
                for _ in 0..max_seconds {
                    if condition(&mut self) {
                        return self.run_waiting_for(Duration::from_millis(500));
                    }
                    self = self.run_waiting_for(Duration::from_secs(1));
                }
                assert!(
                    condition(&mut self),
                    "Still not {} after {} s",
                    description,
                    max_seconds
                );
                self.run_waiting_for(Duration::from_millis(500))
            }

            fn get_yellow_reservoir_volume(&mut self) -> Volume {
                self.read_by_name("HYD_YELLOW_RESERVOIR_LEVEL")
            }

            fn green_edp_has_fault(&mut self) -> bool {
                self.read_by_name("OVHD_HYD_ENG_1A_PUMP_PB_HAS_FAULT")
            }

            fn yellow_edp_has_fault(&mut self) -> bool {
                self.read_by_name("OVHD_HYD_ENG_3A_PUMP_PB_HAS_FAULT")
            }

            fn is_yellow_epump_a_press_low(&mut self) -> bool {
                self.read_by_name("HYD_YA_EPUMP_LOW_PRESS")
            }

            fn get_brake_left_yellow_pressure(&mut self) -> Pressure {
                self.read_by_name("HYD_BRAKE_ALTN_LEFT_PRESS")
            }

            fn get_brake_right_yellow_pressure(&mut self) -> Pressure {
                self.read_by_name("HYD_BRAKE_ALTN_RIGHT_PRESS")
            }

            fn get_green_reservoir_volume(&mut self) -> Volume {
                self.read_by_name("HYD_GREEN_RESERVOIR_LEVEL")
            }

            fn autobrake_mode(&mut self) -> A380AutobrakeMode {
                ReadByName::<A380HydraulicsTestBed, f64>::read_by_name(
                    self,
                    "AUTOBRAKES_ARMED_MODE",
                )
                .into()
            }

            fn get_brake_left_green_pressure(&mut self) -> Pressure {
                self.read_by_name("HYD_BRAKE_NORM_LEFT_PRESS")
            }

            fn get_brake_right_green_pressure(&mut self) -> Pressure {
                self.read_by_name("HYD_BRAKE_NORM_RIGHT_PRESS")
            }

            fn get_brake_yellow_accumulator_pressure(&mut self) -> Pressure {
                self.read_by_name("HYD_BRAKE_ALTN_ACC_PRESS")
            }

            fn get_brake_yellow_accumulator_fluid_volume(&self) -> Volume {
                self.query(|a| a.get_yellow_brake_accumulator_fluid_volume())
            }

            fn get_left_aileron_panel_position(&mut self, panel: AileronPanelPosition) -> Ratio {
                match panel {
                    AileronPanelPosition::Outward => {
                        Ratio::new::<ratio>(self.read_by_name("HYD_AIL_LEFT_OUTWARD_DEFLECTION"))
                    }
                    AileronPanelPosition::Middle => {
                        Ratio::new::<ratio>(self.read_by_name("HYD_AIL_LEFT_MIDDLE_DEFLECTION"))
                    }
                    AileronPanelPosition::Inward => {
                        Ratio::new::<ratio>(self.read_by_name("HYD_AIL_LEFT_INWARD_DEFLECTION"))
                    }
                }
            }

            fn get_right_aileron_panel_position(&mut self, panel: AileronPanelPosition) -> Ratio {
                match panel {
                    AileronPanelPosition::Outward => {
                        Ratio::new::<ratio>(self.read_by_name("HYD_AIL_RIGHT_OUTWARD_DEFLECTION"))
                    }
                    AileronPanelPosition::Middle => {
                        Ratio::new::<ratio>(self.read_by_name("HYD_AIL_RIGHT_MIDDLE_DEFLECTION"))
                    }
                    AileronPanelPosition::Inward => {
                        Ratio::new::<ratio>(self.read_by_name("HYD_AIL_RIGHT_INWARD_DEFLECTION"))
                    }
                }
            }

            fn get_left_aileron_mean_position(&mut self) -> Ratio {
                (self.get_left_aileron_panel_position(AileronPanelPosition::Outward)
                    + self.get_left_aileron_panel_position(AileronPanelPosition::Middle)
                    + self.get_left_aileron_panel_position(AileronPanelPosition::Inward))
                    / 3.
            }

            fn get_right_aileron_mean_position(&mut self) -> Ratio {
                (self.get_right_aileron_panel_position(AileronPanelPosition::Outward)
                    + self.get_right_aileron_panel_position(AileronPanelPosition::Middle)
                    + self.get_right_aileron_panel_position(AileronPanelPosition::Inward))
                    / 3.
            }

            fn _get_left_elevator_position(&mut self) -> Ratio {
                Ratio::new::<ratio>(self.read_by_name("HYD_ELEV_LEFT_DEFLECTION"))
            }

            fn _get_mean_right_spoilers_position(&mut self) -> Ratio {
                (Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_1_RIGHT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_2_RIGHT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_3_RIGHT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_4_RIGHT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_5_RIGHT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_6_RIGHT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_7_RIGHT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_8_RIGHT_DEFLECTION")))
                    / 8.
            }

            fn get_mean_left_spoilers_position(&mut self) -> Ratio {
                (Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_1_LEFT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_2_LEFT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_3_LEFT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_4_LEFT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_5_LEFT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_6_LEFT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_7_LEFT_DEFLECTION"))
                    + Ratio::new::<ratio>(self.read_by_name("HYD_SPOILER_8_LEFT_DEFLECTION")))
                    / 8.
            }

            fn get_right_spoiler_position(&mut self, panel_id: usize) -> Ratio {
                Ratio::new::<ratio>(
                    self.read_by_name(
                        format!("HYD_SPOILER_{}_RIGHT_DEFLECTION", panel_id).as_str(),
                    ),
                )
            }

            fn get_left_spoiler_position(&mut self, panel_id: usize) -> Ratio {
                Ratio::new::<ratio>(
                    self.read_by_name(format!("HYD_SPOILER_{}_LEFT_DEFLECTION", panel_id).as_str()),
                )
            }

            fn _get_right_elevator_position(&mut self) -> Ratio {
                Ratio::new::<ratio>(self.read_by_name("HYD_ELEV_RIGHT_DEFLECTION"))
            }

            fn _get_rudder_position(&mut self) -> Ratio {
                Ratio::new::<ratio>(self.read_by_name("HYD_RUD_DEFLECTION"))
            }

            fn set_rudder_input(mut self, steer_ratio: Ratio) -> Self {
                self.write_by_name("RUDDER_PEDAL_POSITION_RATIO", steer_ratio.get::<ratio>());
                self
            }

            fn get_nose_steering_ratio(&mut self) -> Ratio {
                Ratio::new::<ratio>(self.read_by_name("NOSE_WHEEL_POSITION_RATIO"))
            }

            fn get_left_body_steering_steering_ratio(&mut self) -> Ratio {
                Ratio::new::<ratio>(self.read_by_name("LEFT_BODY_STEERING_POSITION_RATIO"))
            }

            fn get_right_body_steering_steering_ratio(&mut self) -> Ratio {
                Ratio::new::<ratio>(self.read_by_name("RIGHT_BODY_STEERING_POSITION_RATIO"))
            }

            fn _is_fire_valve_eng1_closed(&mut self) -> bool {
                !ReadByName::<A380HydraulicsTestBed, bool>::read_by_name(
                    self,
                    "HYD_GREEN_PUMP_1_FIRE_VALVE_OPENED",
                ) && !self.query(|a| a.hydraulics.green_circuit.is_fire_shutoff_valve_open(0))
            }

            fn _is_fire_valve_eng2_closed(&mut self) -> bool {
                !ReadByName::<A380HydraulicsTestBed, bool>::read_by_name(
                    self,
                    "HYD_YELLOW_PUMP_1_FIRE_VALVE_OPENED",
                ) && !self.query(|a| a.hydraulics.green_circuit.is_fire_shutoff_valve_open(0))
            }

            fn engines_off(self) -> Self {
                self.stop_eng1().stop_eng2().stop_eng3().stop_eng4()
            }

            fn external_power(mut self, is_connected: bool) -> Self {
                self.write_by_name("EXT_PWR_AVAIL:1", is_connected);

                if is_connected {
                    self = self.on_the_ground();
                }
                self
            }

            fn on_the_ground(mut self) -> Self {
                self.set_pressure_altitude(Length::new::<foot>(0.));
                self.set_on_ground(true);
                self.set_indicated_airspeed(Velocity::new::<knot>(5.));
                self
            }

            fn on_the_ground_after_touchdown(mut self) -> Self {
                self.set_pressure_altitude(Length::new::<foot>(0.));
                self.set_on_ground(true);
                self.set_indicated_airspeed(Velocity::new::<knot>(100.));
                self
            }

            fn air_press_low(mut self) -> Self {
                self.command(|a| a.pneumatics.set_low_air_pressure());
                self
            }

            fn air_press_nominal(mut self) -> Self {
                self.command(|a| a.pneumatics.set_nominal_air_pressure());
                self
            }

            fn in_flight(mut self) -> Self {
                self.set_on_ground(false);
                self.set_pressure_altitude(Length::new::<foot>(2500.));
                self.set_indicated_airspeed(Velocity::new::<knot>(180.));

                self.start_eng1(Ratio::new::<percent>(80.))
                    .start_eng2(Ratio::new::<percent>(80.))
                    .start_eng3(Ratio::new::<percent>(80.))
                    .start_eng4(Ratio::new::<percent>(80.))
                    .set_ground_speed(Velocity::new::<knot>(180.))
                    .set_gear_lever_up()
                    .set_park_brake(false)
                    .external_power(false)
            }

            fn set_ground_speed(mut self, ground_speed: Velocity) -> Self {
                self.write_by_name("GPS GROUND SPEED", ground_speed.get::<knot>());
                self
            }

            fn adirs_not_aligned(mut self) -> Self {
                self.set_adirs_not_aligned();
                self
            }

            fn sim_not_ready(mut self) -> Self {
                self.set_sim_is_ready(false);
                self
            }

            fn sim_ready(mut self) -> Self {
                self.set_sim_is_ready(true);
                self
            }

            fn set_tiller_demand(mut self, steering_ratio: Ratio) -> Self {
                self.write_by_name("TILLER_HANDLE_POSITION", steering_ratio.get::<ratio>());
                self
            }

            fn _set_autopilot_steering_demand(mut self, steering_ratio: Ratio) -> Self {
                self.write_by_name("AUTOPILOT_NOSEWHEEL_DEMAND", steering_ratio.get::<ratio>());
                self
            }

            fn set_eng1_fire_button(mut self, is_active: bool) -> Self {
                self.write_by_name("FIRE_BUTTON_ENG1", is_active);
                self
            }

            fn set_eng2_fire_button(mut self, is_active: bool) -> Self {
                self.write_by_name("FIRE_BUTTON_ENG2", is_active);
                self
            }

            fn open_fwd_cargo_door(mut self) -> Self {
                self.write_by_name("FWD_DOOR_CARGO_OPEN_REQ", 1.);
                self
            }

            fn open_aft_cargo_door(mut self) -> Self {
                self.write_by_name("AFT_DOOR_CARGO_OPEN_REQ", 1.);
                self
            }

            fn close_fwd_cargo_door(mut self) -> Self {
                self.write_by_name("FWD_DOOR_CARGO_OPEN_REQ", 0.);
                self
            }

            fn set_pushback_state(mut self, is_pushed_back: bool) -> Self {
                if is_pushed_back {
                    self.write_by_name("PUSHBACK STATE", 0.);
                } else {
                    self.write_by_name("PUSHBACK STATE", 3.);
                }
                self
            }

            fn set_pushback_angle(mut self, angle: AngularVelocity) -> Self {
                self.write_by_name("ROTATION VELOCITY BODY Y", angle.get::<degree_per_second>());
                self.write_by_name("VELOCITY BODY Z", -1.);

                self
            }

            fn is_nw_disc_memo_shown(&mut self) -> bool {
                self.read_by_name("HYD_NW_STRG_DISC_ECAM_MEMO")
            }

            fn start_eng1(mut self, n2: Ratio) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:1", true);
                self.write_by_name("ENGINE_N2:1", n2);
                self.write_by_name("ENGINE_N3:1", n2);

                self
            }

            fn start_eng2(mut self, n2: Ratio) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:2", true);
                self.write_by_name("ENGINE_N2:2", n2);
                self.write_by_name("ENGINE_N3:2", n2);

                self
            }

            fn start_eng3(mut self, n2: Ratio) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:3", true);
                self.write_by_name("ENGINE_N2:3", n2);
                self.write_by_name("ENGINE_N3:3", n2);

                self
            }

            fn start_eng4(mut self, n2: Ratio) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:4", true);
                self.write_by_name("ENGINE_N2:4", n2);
                self.write_by_name("ENGINE_N3:4", n2);

                self
            }

            fn stop_eng1(mut self) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:1", false);
                self.write_by_name("ENGINE_N2:1", 0.);
                self.write_by_name("ENGINE_N3:1", 0.);

                self
            }

            fn _stopping_eng1(mut self) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:1", false);
                self.write_by_name("ENGINE_N2:1", 25.);
                self.write_by_name("ENGINE_N3:1", 25.);

                self
            }

            fn stop_eng2(mut self) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:2", false);
                self.write_by_name("ENGINE_N2:2", 0.);
                self.write_by_name("ENGINE_N3:2", 0.);

                self
            }

            fn _stopping_eng2(mut self) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:2", false);
                self.write_by_name("ENGINE_N2:2", 25.);
                self.write_by_name("ENGINE_N3:2", 25.);

                self
            }

            fn stop_eng3(mut self) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:3", false);
                self.write_by_name("ENGINE_N2:3", 0.);
                self.write_by_name("ENGINE_N3:3", 0.);

                self
            }

            fn stop_eng4(mut self) -> Self {
                self.write_by_name("GENERAL ENG STARTER ACTIVE:4", false);
                self.write_by_name("ENGINE_N2:4", 0.);
                self.write_by_name("ENGINE_N3:4", 0.);

                self
            }

            fn set_park_brake(mut self, is_set: bool) -> Self {
                self.write_by_name("PARK_BRAKE_LEVER_POS", is_set);
                self
            }

            fn set_gear_lever_up(mut self) -> Self {
                // One tick is needed so lever up can be evaluated
                self.write_by_name("GEAR_LEVER_POSITION_REQUEST", false);
                self = self.run_one_tick();

                self
            }

            fn set_gear_lever_down(mut self) -> Self {
                self.write_by_name("GEAR_LEVER_POSITION_REQUEST", true);

                self
            }

            fn set_anti_skid(mut self, is_set: bool) -> Self {
                self.write_by_name("ANTISKID BRAKES ACTIVE", is_set);
                self
            }

            fn set_yellow_e_pump_a(mut self, is_on: bool) -> Self {
                self.write_by_name("OVHD_HYD_EPUMPYA_ON_PB_IS_AUTO", !is_on);
                self
            }

            fn set_yellow_e_pump_b(mut self, is_on: bool) -> Self {
                self.write_by_name("OVHD_HYD_EPUMPYB_ON_PB_IS_AUTO", !is_on);
                self
            }

            fn set_green_e_pump_a(mut self, is_on: bool) -> Self {
                self.write_by_name("OVHD_HYD_EPUMPGA_ON_PB_IS_AUTO", !is_on);
                self
            }

            fn set_green_e_pump_b(mut self, is_on: bool) -> Self {
                self.write_by_name("OVHD_HYD_EPUMPGB_ON_PB_IS_AUTO", !is_on);
                self
            }

            fn set_green_ed_pump(mut self, is_auto: bool) -> Self {
                self.write_by_name("OVHD_HYD_ENG_1A_PUMP_PB_IS_AUTO", is_auto);
                self
            }

            fn set_green_ed_pump_1b(mut self, is_auto: bool) -> Self {
                self.write_by_name("OVHD_HYD_ENG_1B_PUMP_PB_IS_AUTO", is_auto);
                self
            }

            fn set_yellow_e_pump_a_off(mut self, is_off: bool) -> Self {
                self.write_by_name("OVHD_HYD_EPUMPYA_OFF_PB_IS_AUTO", !is_off);
                self
            }

            fn set_green_e_pump_a_off(mut self, is_off: bool) -> Self {
                self.write_by_name("OVHD_HYD_EPUMPGA_OFF_PB_IS_AUTO", !is_off);
                self
            }

            fn set_yellow_ed_pump(mut self, is_auto: bool) -> Self {
                self.write_by_name("OVHD_HYD_ENG_3A_PUMP_PB_IS_AUTO", is_auto);
                self
            }

            fn set_flaps_handle_position(mut self, pos: u8) -> Self {
                self.write_by_name("FLAPS_HANDLE_INDEX", pos as f64);
                self
            }

            fn set_disconnect_engine_edp(mut self, engine_id: usize) -> Self {
                match engine_id {
                    1 => self.write_by_name("OVHD_HYD_ENG_1AB_PUMP_DISC_PB_IS_AUTO", false),
                    2 => self.write_by_name("OVHD_HYD_ENG_2AB_PUMP_DISC_PB_IS_AUTO", false),
                    3 => self.write_by_name("OVHD_HYD_ENG_3AB_PUMP_DISC_PB_IS_AUTO", false),
                    4 => self.write_by_name("OVHD_HYD_ENG_4AB_PUMP_DISC_PB_IS_AUTO", false),
                    _ => panic!("Only 4 engines buddy!"),
                };

                self
            }

            fn get_flaps_left_position_percent(&mut self) -> f64 {
                let values: &[f64] = &[
                    self.read_by_name("LEFT_FLAPS_1_POSITION_PERCENT"),
                    self.read_by_name("LEFT_FLAPS_2_POSITION_PERCENT"),
                    self.read_by_name("LEFT_FLAPS_3_POSITION_PERCENT"),
                ];
                values.iter().sum::<f64>() / (values.len() as f64)
            }

            fn get_flaps_right_position_percent(&mut self) -> f64 {
                let values: &[f64] = &[
                    self.read_by_name("RIGHT_FLAPS_1_POSITION_PERCENT"),
                    self.read_by_name("RIGHT_FLAPS_2_POSITION_PERCENT"),
                    self.read_by_name("RIGHT_FLAPS_3_POSITION_PERCENT"),
                ];
                values.iter().sum::<f64>() / (values.len() as f64)
            }

            fn get_slats_left_position_percent(&mut self) -> f64 {
                let values: &[f64] = &[
                    self.read_by_name("LEFT_SLATS_1_POSITION_PERCENT"),
                    self.read_by_name("LEFT_SLATS_2_POSITION_PERCENT"),
                    self.read_by_name("LEFT_SLATS_3_POSITION_PERCENT"),
                    self.read_by_name("LEFT_SLATS_4_POSITION_PERCENT"),
                    self.read_by_name("LEFT_SLATS_5_POSITION_PERCENT"),
                    self.read_by_name("LEFT_SLATS_6_POSITION_PERCENT"),
                    self.read_by_name("LEFT_SLATS_7_POSITION_PERCENT"),
                    self.read_by_name("LEFT_SLATS_8_POSITION_PERCENT"),
                ];
                values.iter().sum::<f64>() / (values.len() as f64)
            }

            /// SFCC configuration as written to FLAPS_CONF_INDEX (0 = CONF 0, 1 = CONF 1, 2 = CONF 1+F ...)
            fn flaps_conf_index(&mut self) -> f64 {
                self.read_by_name("FLAPS_CONF_INDEX")
            }

            fn sfcc_slat_flap_system_status_word(&mut self, sfcc_number: u8) -> Arinc429Word<u32> {
                self.read_by_name(&format!("SFCC_{sfcc_number}_SLAT_FLAP_SYSTEM_STATUS_WORD"))
            }

            fn left_flaps_surface_angle(&mut self) -> Angle {
                Angle::new::<degree>(self.read_by_name("LEFT_FLAPS_ANGLE"))
            }

            fn left_slats_surface_angle(&mut self) -> Angle {
                Angle::new::<degree>(self.read_by_name("LEFT_SLATS_ANGLE"))
            }

            fn get_slats_right_position_percent(&mut self) -> f64 {
                let values: &[f64] = &[
                    self.read_by_name("RIGHT_SLATS_1_POSITION_PERCENT"),
                    self.read_by_name("RIGHT_SLATS_2_POSITION_PERCENT"),
                    self.read_by_name("RIGHT_SLATS_3_POSITION_PERCENT"),
                    self.read_by_name("RIGHT_SLATS_4_POSITION_PERCENT"),
                    self.read_by_name("RIGHT_SLATS_5_POSITION_PERCENT"),
                    self.read_by_name("RIGHT_SLATS_6_POSITION_PERCENT"),
                    self.read_by_name("RIGHT_SLATS_7_POSITION_PERCENT"),
                    self.read_by_name("RIGHT_SLATS_8_POSITION_PERCENT"),
                ];
                values.iter().sum::<f64>() / (values.len() as f64)
            }

            fn get_real_gear_position(&mut self, wheel_id: GearWheel) -> Ratio {
                match wheel_id {
                    GearWheel::NOSE => self.read_by_name("GEAR_CENTER_POSITION"),
                    GearWheel::LEFT => self.read_by_name("GEAR_LEFT_POSITION"),
                    GearWheel::RIGHT => self.read_by_name("GEAR_RIGHT_POSITION"),
                    GearWheel::WINGLEFT | GearWheel::WINGRIGHT => {
                        panic!("TODO WING GEARS HYD NOT IMPLEMENTED YET ON 380")
                    }
                }
            }

            fn get_real_gear_door_position(&mut self, wheel_id: GearWheel) -> Ratio {
                match wheel_id {
                    GearWheel::NOSE => self.read_by_name("GEAR_DOOR_CENTER_POSITION"),
                    GearWheel::LEFT => self.read_by_name("GEAR_DOOR_LEFT_POSITION"),
                    GearWheel::RIGHT => self.read_by_name("GEAR_DOOR_RIGHT_POSITION"),
                    GearWheel::WINGLEFT | GearWheel::WINGRIGHT => {
                        panic!("TODO WING GEARS HYD NOT IMPLEMENTED YET ON 380")
                    }
                }
            }

            fn is_all_auxiliary_gear_door_opened(&mut self) -> bool {
                let left_pos =
                    Ratio::new::<percent>(self.read_by_name("SECONDARY_GEAR_DOOR_LEFT_POSITION"));
                let right_pos =
                    Ratio::new::<percent>(self.read_by_name("SECONDARY_GEAR_DOOR_RIGHT_POSITION"));

                left_pos.get::<ratio>() > 0.95 && right_pos.get::<ratio>() > 0.95
            }

            fn is_all_auxiliary_gear_door_closed(&mut self) -> bool {
                let left_pos =
                    Ratio::new::<percent>(self.read_by_name("SECONDARY_GEAR_DOOR_LEFT_POSITION"));
                let right_pos =
                    Ratio::new::<percent>(self.read_by_name("SECONDARY_GEAR_DOOR_RIGHT_POSITION"));

                left_pos.get::<ratio>() < 0.05 && right_pos.get::<ratio>() < 0.05
            }

            fn is_all_gears_really_up(&mut self) -> bool {
                self.get_real_gear_position(GearWheel::NOSE) <= Ratio::new::<ratio>(0.01)
                    && self.get_real_gear_position(GearWheel::LEFT) <= Ratio::new::<ratio>(0.01)
                    && self.get_real_gear_position(GearWheel::RIGHT) <= Ratio::new::<ratio>(0.01)
            }

            fn is_all_gears_really_down(&mut self) -> bool {
                self.get_real_gear_position(GearWheel::NOSE) >= Ratio::new::<ratio>(0.99)
                    && self.get_real_gear_position(GearWheel::LEFT) >= Ratio::new::<ratio>(0.99)
                    && self.get_real_gear_position(GearWheel::RIGHT) >= Ratio::new::<ratio>(0.99)
            }

            fn is_all_doors_really_up(&mut self) -> bool {
                self.get_real_gear_door_position(GearWheel::NOSE) <= Ratio::new::<ratio>(0.01)
                    && self.get_real_gear_door_position(GearWheel::LEFT)
                        <= Ratio::new::<ratio>(0.01)
                    && self.get_real_gear_door_position(GearWheel::RIGHT)
                        <= Ratio::new::<ratio>(0.01)
            }

            fn is_all_doors_really_down(&mut self) -> bool {
                self.get_real_gear_door_position(GearWheel::NOSE) >= Ratio::new::<ratio>(0.9)
                    && self.get_real_gear_door_position(GearWheel::LEFT) >= Ratio::new::<ratio>(0.9)
                    && self.get_real_gear_door_position(GearWheel::RIGHT)
                        >= Ratio::new::<ratio>(0.9)
            }

            fn ac_bus_1_lost(mut self) -> Self {
                self.command(|a| a.set_ac_bus_1_is_powered(false));
                self
            }

            fn ac_bus_2_lost(mut self) -> Self {
                self.command(|a| a.set_ac_bus_2_is_powered(false));
                self
            }

            fn ac_bus_3_lost(mut self) -> Self {
                self.command(|a| a.set_ac_bus_3_is_powered(false));
                self
            }

            fn ac_bus_4_lost(mut self) -> Self {
                self.command(|a| a.set_ac_bus_4_is_powered(false));
                self
            }

            fn _dc_ground_service_lost(mut self) -> Self {
                self.command(|a| a._set_dc_ground_service_is_powered(false));
                self
            }

            fn _dc_ground_service_avail(mut self) -> Self {
                self.command(|a| a._set_dc_ground_service_is_powered(true));
                self
            }

            fn ac_ground_service_lost(mut self) -> Self {
                self.command(|a| a.set_ac_ground_service_is_powered(false));
                self
            }

            fn dc_bus_1_lost(mut self) -> Self {
                self.command(|a| a.set_dc_bus_1_is_powered(false));
                self
            }

            fn dc_bus_2_lost(mut self) -> Self {
                self.command(|a| a.set_dc_bus_2_is_powered(false));
                self
            }

            fn dc_ess_lost(mut self) -> Self {
                self.command(|a| a._set_dc_ess_is_powered(false));
                self
            }

            fn _dc_ess_active(mut self) -> Self {
                self.command(|a| a._set_dc_ess_is_powered(true));
                self
            }

            fn ac_ess_lost(mut self) -> Self {
                self.command(|a| a.set_ac_ess_is_powered(false));
                self
            }

            fn ac_ess_active(mut self) -> Self {
                self.command(|a| a.set_ac_ess_is_powered(true));
                self
            }

            fn ac_eha_lost(mut self) -> Self {
                self.command(|a| a.set_ac_eha_is_powered(false));
                self
            }

            fn ac_eha_active(mut self) -> Self {
                self.command(|a| a.set_ac_eha_is_powered(true));
                self
            }

            fn set_cold_dark_inputs(self) -> Self {
                self.set_eng1_fire_button(false)
                    .set_eng2_fire_button(false)
                    .set_yellow_e_pump_a(false)
                    .set_green_ed_pump(true)
                    .set_yellow_ed_pump(true)
                    .set_park_brake(true)
                    .set_anti_skid(true)
                    .set_left_brake(Ratio::new::<percent>(0.))
                    .set_right_brake(Ratio::new::<percent>(0.))
                    .set_gear_lever_down()
                    .set_pushback_state(false)
                    .air_press_nominal()
                    .set_elac1_actuators_energized()
                    .set_ailerons_neutral()
                    .set_elevator_neutral()
            }

            fn set_left_brake(mut self, position: Ratio) -> Self {
                self.write_by_name("LEFT_BRAKE_PEDAL_INPUT", position);
                self
            }

            fn set_right_brake(mut self, position: Ratio) -> Self {
                self.write_by_name("RIGHT_BRAKE_PEDAL_INPUT", position);
                self
            }

            fn set_autobrake_btv(mut self) -> Self {
                self.write_by_name("AUTOBRAKES_SELECTED_MODE", 1.);
                self
            }

            /// A runway and a runway exit selected on the airport map (OANS), in metres
            fn set_btv_runway_and_exit(mut self) -> Self {
                self.write_arinc429_by_name("OANS_RWY_LENGTH", 4500., SignStatus::NormalOperation);
                self.write_arinc429_by_name(
                    "OANS_BTV_REQ_STOPPING_DISTANCE",
                    2000.,
                    SignStatus::NormalOperation,
                );
                self.write_arinc429_by_name(
                    "OANS_BTV_REMAINING_DIST_TO_EXIT",
                    2000.,
                    SignStatus::NormalOperation,
                );
                self
            }

            /// An ECAM alert lists BTV in STATUS INOP SYS (FWS, L:A32NX_FWC_1_BTV_INOP)
            fn set_fws_btv_inop(mut self, inop: bool) -> Self {
                self.write_by_name("FWC_1_BTV_INOP", inop);
                self
            }

            fn set_autobrake_low(mut self) -> Self {
                self.write_by_name("AUTOBRAKES_SELECTED_MODE", 2.);
                self
            }

            fn set_autobrake_l2(mut self) -> Self {
                self.write_by_name("AUTOBRAKES_SELECTED_MODE", 3.);
                self
            }

            fn set_autobrake_l3(mut self) -> Self {
                self.write_by_name("AUTOBRAKES_SELECTED_MODE", 4.);
                self
            }

            fn set_autobrake_high(mut self) -> Self {
                self.write_by_name("AUTOBRAKES_SELECTED_MODE", 5.);
                self
            }

            fn set_autobrake_rto(mut self) -> Self {
                self.write_by_name("OVHD_AUTOBRK_RTO_ARM_IS_PRESSED", true);
                self = self.run_one_tick();
                self.write_by_name("OVHD_AUTOBRK_RTO_ARM_IS_PRESSED", false);
                self
            }

            fn set_left_spoiler_6_elec_backup_active(mut self) -> Self {
                self.write_by_name("LEFT_SPOILER_6_EBHA_ELECTRONIC_ENABLE", true);
                self
            }

            fn set_right_spoiler_6_elec_backup_active(mut self) -> Self {
                self.write_by_name("RIGHT_SPOILER_6_EBHA_ELECTRONIC_ENABLE", true);
                self
            }

            fn set_deploy_ground_spoilers(mut self) -> Self {
                self = self.set_right_spoilers_out();
                self = self.set_left_spoilers_out();
                self
            }

            fn set_retract_ground_spoilers(mut self) -> Self {
                self = self.set_right_spoilers_in();
                self = self.set_left_spoilers_in();
                self
            }

            fn set_ailerons_neutral(mut self) -> Self {
                self.write_by_name("LEFT_AIL_BLUE_COMMANDED_POSITION", 0.);
                self.write_by_name("RIGHT_AIL_BLUE_COMMANDED_POSITION", 0.);
                self.write_by_name("LEFT_AIL_GREEN_COMMANDED_POSITION", 0.);
                self.write_by_name("RIGHT_AIL_GREEN_COMMANDED_POSITION", 0.);
                self
            }

            fn base_string_for_aileron_control(
                side: ActuatorSide,
                panel: AileronPanelPosition,
                actuator: AileronActuatorPosition,
            ) -> String {
                let base_string = match panel {
                    AileronPanelPosition::Outward => match actuator {
                        AileronActuatorPosition::Inward => "OUTBOARD_AIL_YELLOW",
                        AileronActuatorPosition::Outward => "OUTBOARD_AIL_GREEN",
                    },

                    AileronPanelPosition::Middle => match actuator {
                        AileronActuatorPosition::Inward => "MIDBOARD_AIL_EHA",
                        AileronActuatorPosition::Outward => "MIDBOARD_AIL_YELLOW",
                    },

                    AileronPanelPosition::Inward => match actuator {
                        AileronActuatorPosition::Inward => "INBOARD_AIL_EHA",
                        AileronActuatorPosition::Outward => "INBOARD_AIL_GREEN",
                    },
                };

                match side {
                    ActuatorSide::Left => format!("LEFT_{}", base_string),
                    ActuatorSide::Right => format!("RIGHT_{}", base_string),
                }
            }

            fn base_string_for_aileron_solenoid(
                side: ActuatorSide,
                panel: AileronPanelPosition,
                actuator: AileronActuatorPosition,
            ) -> String {
                format!(
                    "{}_SERVO_SOLENOID_ENERGIZED",
                    Self::base_string_for_aileron_control(side, panel, actuator)
                )
            }

            fn base_string_for_aileron_position(
                side: ActuatorSide,
                panel: AileronPanelPosition,
                actuator: AileronActuatorPosition,
            ) -> String {
                format!(
                    "{}_COMMANDED_POSITION",
                    Self::base_string_for_aileron_control(side, panel, actuator)
                )
            }

            fn reset_all_aileron_commands_per_side(mut self, side: ActuatorSide) -> Self {
                self.write_by_name(
                    Self::base_string_for_aileron_solenoid(
                        side,
                        AileronPanelPosition::Outward,
                        AileronActuatorPosition::Outward,
                    )
                    .as_str(),
                    0.,
                );
                self.write_by_name(
                    Self::base_string_for_aileron_solenoid(
                        side,
                        AileronPanelPosition::Outward,
                        AileronActuatorPosition::Inward,
                    )
                    .as_str(),
                    0.,
                );
                self.write_by_name(
                    Self::base_string_for_aileron_solenoid(
                        side,
                        AileronPanelPosition::Middle,
                        AileronActuatorPosition::Outward,
                    )
                    .as_str(),
                    0.,
                );
                self.write_by_name(
                    Self::base_string_for_aileron_solenoid(
                        side,
                        AileronPanelPosition::Middle,
                        AileronActuatorPosition::Inward,
                    )
                    .as_str(),
                    0.,
                );
                self.write_by_name(
                    Self::base_string_for_aileron_solenoid(
                        side,
                        AileronPanelPosition::Inward,
                        AileronActuatorPosition::Outward,
                    )
                    .as_str(),
                    0.,
                );
                self.write_by_name(
                    Self::base_string_for_aileron_solenoid(
                        side,
                        AileronPanelPosition::Inward,
                        AileronActuatorPosition::Inward,
                    )
                    .as_str(),
                    0.,
                );

                self
            }

            fn reset_all_aileron_commands(mut self) -> Self {
                self = self.reset_all_aileron_commands_per_side(ActuatorSide::Left);
                self = self.reset_all_aileron_commands_per_side(ActuatorSide::Right);

                self
            }

            fn set_aileron_panel_neutral(
                mut self,
                side: ActuatorSide,
                panel: AileronPanelPosition,
                actuator: AileronActuatorPosition,
            ) -> Self {
                self.write_by_name(
                    Self::base_string_for_aileron_solenoid(side, panel, actuator).as_str(),
                    1.,
                );
                self.write_by_name(
                    Self::base_string_for_aileron_position(side, panel, actuator).as_str(),
                    0.,
                );
                self
            }

            /// The test bed has no PRIM: engages or releases every yellow flight control servo with a neutral surface
            /// demand, as the PRIMs do on ground
            fn set_yellow_flight_control_servos_engaged(
                mut self,
                engaged: bool,
                ths_demand: Angle,
            ) -> Self {
                for servo in [
                    "LEFT_OUTBOARD_AIL_YELLOW",
                    "RIGHT_OUTBOARD_AIL_YELLOW",
                    "LEFT_MIDBOARD_AIL_YELLOW",
                    "RIGHT_MIDBOARD_AIL_YELLOW",
                    "RIGHT_INBOARD_ELEV_YELLOW",
                    "RIGHT_OUTBOARD_ELEV_YELLOW",
                ] {
                    self.write_by_name(&format!("{}_SERVO_SOLENOID_ENERGIZED", servo), engaged);
                    self.write_by_name(&format!("{}_COMMANDED_POSITION", servo), 0.);
                }

                self.write_by_name("THS_YELLOW_SERVO_SOLENOID_ENERGIZED", engaged);
                self.write_by_name("THS_YELLOW_COMMANDED_POSITION", ths_demand.get::<degree>());

                for rudder in ["UPPER_RUDDER_YELLOW_EBHA", "LOWER_RUDDER_YELLOW_EBHA"] {
                    self.write_by_name(
                        &format!("{}_HYDRAULIC_MODE_SOLENOID_ENERGIZED", rudder),
                        engaged,
                    );
                    self.write_by_name(&format!("{}_COMMANDED_POSITION", rudder), 0.);
                }

                self
            }

            fn set_elevator_neutral(mut self) -> Self {
                self.write_by_name("LEFT_ELEV_BLUE_COMMANDED_POSITION", 0.);
                self.write_by_name("RIGHT_ELEV_BLUE_COMMANDED_POSITION", 0.);
                self.write_by_name("LEFT_ELEV_GREEN_COMMANDED_POSITION", 0.);
                self.write_by_name("RIGHT_ELEV_YELLOW_COMMANDED_POSITION", 0.);
                self
            }

            fn set_ailerons_left_turn(mut self) -> Self {
                self.write_by_name("LEFT_AIL_BLUE_COMMANDED_POSITION", -25.);
                self.write_by_name("RIGHT_AIL_BLUE_COMMANDED_POSITION", -25.);
                self.write_by_name("LEFT_AIL_GREEN_COMMANDED_POSITION", -25.);
                self.write_by_name("RIGHT_AIL_GREEN_COMMANDED_POSITION", -25.);
                self
            }

            fn set_elac1_actuators_energized(mut self) -> Self {
                self.write_by_name("LEFT_AIL_BLUE_SERVO_SOLENOID_ENERGIZED", 1.);
                self.write_by_name("RIGHT_AIL_BLUE_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("LEFT_AIL_GREEN_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("RIGHT_AIL_GREEN_SERVO_SOLENOID_ENERGIZED", 1.);

                self.write_by_name("LEFT_ELEV_BLUE_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("RIGHT_ELEV_BLUE_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("LEFT_ELEV_GREEN_SERVO_SOLENOID_ENERGIZED", 1.);
                self.write_by_name("RIGHT_ELEV_YELLOW_SERVO_SOLENOID_ENERGIZED", 1.);
                self
            }

            fn _set_elac_actuators_de_energized(mut self) -> Self {
                self.write_by_name("LEFT_AIL_BLUE_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("RIGHT_AIL_BLUE_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("LEFT_AIL_GREEN_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("RIGHT_AIL_GREEN_SERVO_SOLENOID_ENERGIZED", 0.);

                self.write_by_name("LEFT_ELEV_BLUE_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("RIGHT_ELEV_BLUE_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("LEFT_ELEV_GREEN_SERVO_SOLENOID_ENERGIZED", 0.);
                self.write_by_name("RIGHT_ELEV_YELLOW_SERVO_SOLENOID_ENERGIZED", 0.);

                self.write_by_name("LEFT_ELEV_BLUE_COMMANDED_POSITION", 0.);
                self.write_by_name("RIGHT_ELEV_BLUE_COMMANDED_POSITION", 0.);
                self.write_by_name("LEFT_ELEV_GREEN_COMMANDED_POSITION", 0.);
                self.write_by_name("RIGHT_ELEV_YELLOW_COMMANDED_POSITION", 0.);
                self
            }

            fn set_left_spoiler_out(mut self, panel_id: usize) -> Self {
                self.write_by_name(
                    format!("LEFT_SPOILER_{}_COMMANDED_POSITION", panel_id).as_str(),
                    50.,
                );
                self
            }

            fn set_right_spoiler_out(mut self, panel_id: usize) -> Self {
                self.write_by_name(
                    format!("RIGHT_SPOILER_{}_COMMANDED_POSITION", panel_id).as_str(),
                    50.,
                );
                self
            }

            fn _set_left_spoiler_in(mut self, panel_id: usize) -> Self {
                self.write_by_name(
                    format!("LEFT_SPOILER_{}_COMMANDED_POSITION", panel_id).as_str(),
                    0.,
                );
                self
            }

            fn _set_right_spoiler_in(mut self, panel_id: usize) -> Self {
                self.write_by_name(
                    format!("RIGHT_SPOILER_{}_COMMANDED_POSITION", panel_id).as_str(),
                    0.,
                );
                self
            }

            fn set_right_spoilers_out(mut self) -> Self {
                self = self.set_right_spoiler_out(1);
                self = self.set_right_spoiler_out(2);
                self = self.set_right_spoiler_out(3);
                self = self.set_right_spoiler_out(4);
                self = self.set_right_spoiler_out(5);
                self = self.set_right_spoiler_out(6);
                self = self.set_right_spoiler_out(7);
                self = self.set_right_spoiler_out(8);
                self
            }

            fn set_right_spoilers_in(mut self) -> Self {
                self = self._set_right_spoiler_in(1);
                self = self._set_right_spoiler_in(2);
                self = self._set_right_spoiler_in(3);
                self = self._set_right_spoiler_in(4);
                self = self._set_right_spoiler_in(5);
                self = self._set_right_spoiler_in(6);
                self = self._set_right_spoiler_in(7);
                self = self._set_right_spoiler_in(8);
                self
            }

            fn set_left_spoilers_out(mut self) -> Self {
                self = self.set_left_spoiler_out(1);
                self = self.set_left_spoiler_out(2);
                self = self.set_left_spoiler_out(3);
                self = self.set_left_spoiler_out(4);
                self = self.set_left_spoiler_out(5);
                self = self.set_left_spoiler_out(6);
                self = self.set_left_spoiler_out(7);
                self = self.set_left_spoiler_out(8);
                self
            }

            fn set_left_spoilers_in(mut self) -> Self {
                self = self._set_left_spoiler_in(1);
                self = self._set_left_spoiler_in(2);
                self = self._set_left_spoiler_in(3);
                self = self._set_left_spoiler_in(4);
                self = self._set_left_spoiler_in(5);
                self = self._set_left_spoiler_in(6);
                self = self._set_left_spoiler_in(7);
                self = self._set_left_spoiler_in(8);
                self
            }

            fn set_ailerons_right_turn(mut self) -> Self {
                self.write_by_name("LEFT_AIL_BLUE_COMMANDED_POSITION", 25.);
                self.write_by_name("RIGHT_AIL_BLUE_COMMANDED_POSITION", 25.);
                self.write_by_name("LEFT_AIL_GREEN_COMMANDED_POSITION", 25.);
                self.write_by_name("RIGHT_AIL_GREEN_COMMANDED_POSITION", 25.);
                self
            }

            fn gear_system_state(&self) -> GearSystemState {
                self.query(|a| a.lgcius.active_lgciu().gear_system_state())
            }

            fn _set_elevator_full_up(mut self) -> Self {
                self.write_by_name("LEFT_ELEV_BLUE_COMMANDED_POSITION", -30.);
                self.write_by_name("RIGHT_ELEV_BLUE_COMMANDED_POSITION", -30.);
                self.write_by_name("LEFT_ELEV_GREEN_COMMANDED_POSITION", -30.);
                self.write_by_name("RIGHT_ELEV_YELLOW_COMMANDED_POSITION", -30.);
                self
            }

            fn _set_elevator_full_down(mut self) -> Self {
                self.write_by_name("LEFT_ELEV_BLUE_COMMANDED_POSITION", 17.);
                self.write_by_name("RIGHT_ELEV_BLUE_COMMANDED_POSITION", 17.);
                self.write_by_name("LEFT_ELEV_GREEN_COMMANDED_POSITION", 17.);
                self.write_by_name("RIGHT_ELEV_YELLOW_COMMANDED_POSITION", 17.);
                self
            }

            /// Charges the yellow brake accumulator with the yellow electric pump A, then stops the
            /// pump. The accumulator starts empty in 1 % of the test runs (empty after maintenance,
            /// BrakeAccumulatorCharacteristics): a test that relies on its stored pressure calls this
            /// first, like the A320 test bed.
            fn load_brake_accumulator(mut self) -> Self {
                // Design choice: "charged" is 90 % of the regulated pressure; the accumulator only
                // needs to hold enough for the brake applications of the test.
                let charged_pressure_psi =
                    0.9 * A380HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI;
                let mut number_of_loops = 0;
                while self.get_brake_yellow_accumulator_pressure().get::<psi>()
                    <= charged_pressure_psi
                {
                    self = self
                        .set_yellow_e_pump_a(true)
                        .run_waiting_for(Duration::from_secs(2));
                    number_of_loops += 1;
                    assert_lt!(number_of_loops, 50);
                }

                // Let the yellow electric pump spool down
                self = self
                    .set_yellow_e_pump_a(false)
                    .run_waiting_for(Duration::from_secs(5));

                self
            }

            fn empty_brake_accumulator_using_park_brake(mut self) -> Self {
                self = self
                    .set_park_brake(true)
                    .run_waiting_for(Duration::from_secs(1));

                let mut number_of_loops = 0;
                while self
                    .get_brake_yellow_accumulator_fluid_volume()
                    .get::<gallon>()
                    > 0.001
                {
                    self = self
                        .set_park_brake(false)
                        .run_waiting_for(Duration::from_secs(1))
                        .set_park_brake(true)
                        .run_waiting_for(Duration::from_secs(1));
                    number_of_loops += 1;
                    assert_lt!(number_of_loops, 20);
                }

                self = self
                    .set_park_brake(false)
                    .run_waiting_for(Duration::from_secs(1))
                    .set_park_brake(true)
                    .run_waiting_for(Duration::from_secs(1));

                self
            }

            fn activate_emergency_gear_extension(mut self) -> Self {
                self.write_by_name("LG_GRVTY_SWITCH_POS", 2.);
                self
            }

            fn stow_emergency_gear_extension(mut self) -> Self {
                self.write_by_name("LG_GRVTY_SWITCH_POS", 0.);
                self
            }
        }
        impl TestBed for A380HydraulicsTestBed {
            type Aircraft = A380HydraulicsTestAircraft;

            fn test_bed(&self) -> &SimulationTestBed<A380HydraulicsTestAircraft> {
                &self.test_bed
            }

            fn test_bed_mut(&mut self) -> &mut SimulationTestBed<A380HydraulicsTestAircraft> {
                &mut self.test_bed
            }
        }

        fn test_bed_on_ground() -> A380HydraulicsTestBed {
            A380HydraulicsTestBed::new_with_start_state(StartState::Apron)
        }

        fn test_bed_in_flight() -> A380HydraulicsTestBed {
            A380HydraulicsTestBed::new_with_start_state(StartState::Cruise)
        }

        fn test_bed_on_ground_with() -> A380HydraulicsTestBed {
            test_bed_on_ground()
        }

        fn test_bed_in_flight_with() -> A380HydraulicsTestBed {
            test_bed_in_flight()
        }

        #[test]
        fn flaps_simvars() {
            let test_bed = test_bed_on_ground_with().run_one_tick();

            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_1_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_2_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_3_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_4_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_5_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_6_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_7_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_8_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_POSITION_PERCENT"));

            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_1_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_2_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_3_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_4_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_5_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_6_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_7_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_8_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_POSITION_PERCENT"));

            assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_1_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_2_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_3_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_POSITION_PERCENT"));

            assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_1_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_2_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_3_POSITION_PERCENT"));
            assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_POSITION_PERCENT"));

            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_1_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_2_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_3_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_4_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_5_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_6_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_7_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_8_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_SLATS_ANGLE"));

            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_1_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_2_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_3_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_4_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_5_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_6_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_7_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_8_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_SLATS_ANGLE"));

            assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_1_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_2_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_3_ANGLE"));
            assert!(test_bed.contains_variable_with_name("LEFT_FLAPS_ANGLE"));

            assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_1_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_2_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_3_ANGLE"));
            assert!(test_bed.contains_variable_with_name("RIGHT_FLAPS_ANGLE"));
        }

        #[test]
        fn outward_left_aileron_panel_responds_only_with_green_pressure_on_outward_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            // Inward actuator on yellow hyds: shall not move
            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Outward)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Outward,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Outward,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn outward_right_aileron_panel_responds_only_with_green_pressure_on_outward_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            // Inward actuator on yellow hyds: shall not move
            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Outward)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Outward,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Outward,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn outward_left_aileron_panel_responds_only_with_yellow_pressure_on_inward_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng3(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            // Outward actuator on green hyds: shall not move
            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Outward)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Outward,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Outward,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn outward_right_aileron_panel_responds_only_with_yellow_pressure_on_inward_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng3(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            // Outward actuator on green hyds: shall not move
            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Outward)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Outward,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Outward,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn middle_right_aileron_panel_responds_only_with_yellow_pressure_on_outward_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Middle,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Middle)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .reset_all_aileron_commands()
                .start_eng3(Ratio::new::<percent>(80.))
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Middle,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Middle,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Middle,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn middle_left_aileron_panel_responds_only_with_yellow_pressure_on_outward_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Middle,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Middle)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .reset_all_aileron_commands()
                .start_eng3(Ratio::new::<percent>(80.))
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Middle,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Middle,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Middle,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn middle_left_aileron_panel_responds_with_no_hyds_on_eha_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .reset_all_aileron_commands()
                .ac_ess_lost()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Middle,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(1));

            // Artificially set plane not on ground to allow EHA activation
            test_bed.set_on_ground(false);

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Middle)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .reset_all_aileron_commands()
                .ac_ess_active()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Middle,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(5));

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Middle,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Middle,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn middle_right_aileron_panel_responds_with_no_hyds_on_eha_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .reset_all_aileron_commands()
                .ac_ess_lost()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Middle,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(1));

            // Artificially set plane not on ground to allow EHA activation
            test_bed.set_on_ground(false);

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Middle)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .reset_all_aileron_commands()
                .ac_ess_active()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Middle,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(5));

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Middle,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Middle,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn inner_right_aileron_panel_responds_only_with_green_pressure_on_outward_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Inward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Inward)
                    .get::<ratio>()
                    < 0.1
            );

            // Outward actuator on green hyds: shall not move
            test_bed = test_bed
                .reset_all_aileron_commands()
                .start_eng1(Ratio::new::<percent>(80.))
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Inward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Inward,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Inward,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn inner_left_aileron_panel_responds_only_with_green_pressure_on_outward_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Inward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Inward)
                    .get::<ratio>()
                    < 0.1
            );

            // Outward actuator on green hyds: shall not move
            test_bed = test_bed
                .reset_all_aileron_commands()
                .start_eng1(Ratio::new::<percent>(80.))
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Inward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Inward,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Inward,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn inner_left_aileron_panel_responds_with_no_hyds_on_eha_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .reset_all_aileron_commands()
                .ac_eha_lost()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Inward,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(1));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Inward)
                    .get::<ratio>()
                    < 0.1
            );

            // Artificially set plane not on ground to allow EHA activation
            test_bed.set_on_ground(false);

            test_bed = test_bed
                .reset_all_aileron_commands()
                .ac_eha_active()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Inward,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(5));

            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Inward,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Inward,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[test]
        fn inner_right_aileron_panel_responds_with_no_hyds_on_eha_jack() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .reset_all_aileron_commands()
                .ac_eha_lost()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Inward,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(1));

            // Artificially set plane not on ground to allow EHA activation
            test_bed.set_on_ground(false);

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Inward)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .reset_all_aileron_commands()
                .ac_eha_active()
                .set_aileron_panel_neutral(
                    ActuatorSide::Right,
                    AileronPanelPosition::Inward,
                    AileronActuatorPosition::Inward,
                )
                .run_waiting_for(Duration::from_secs(5));

            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Inward,)
                    .get::<ratio>()
                    > 0.35
            );
            assert!(
                test_bed
                    .get_right_aileron_panel_position(AileronPanelPosition::Inward,)
                    .get::<ratio>()
                    < 0.55
            );
        }

        #[rstest]
        #[case(2)]
        #[case(4)]
        #[case(6)]
        #[case(8)]
        fn green_right_spoilers_can_deploy_with_green_press(#[case] spoiler_id: usize) {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng3(Ratio::new::<percent>(80.))
                .set_right_spoiler_out(spoiler_id)
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_right_spoiler_position(spoiler_id)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            assert!(
                test_bed
                    .get_right_spoiler_position(spoiler_id)
                    .get::<ratio>()
                    > 0.8
            );
        }

        #[rstest]
        #[case(2)]
        #[case(4)]
        #[case(6)]
        #[case(8)]
        fn green_left_spoilers_can_deploy_with_green_press(#[case] spoiler_id: usize) {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng3(Ratio::new::<percent>(80.))
                .set_left_spoiler_out(spoiler_id)
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_left_spoiler_position(spoiler_id)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            assert!(
                test_bed
                    .get_left_spoiler_position(spoiler_id)
                    .get::<ratio>()
                    > 0.8
            );
        }

        #[rstest]
        #[case(1)]
        #[case(3)]
        #[case(5)]
        #[case(7)]
        fn yellow_right_spoilers_can_deploy_with_green_press(#[case] spoiler_id: usize) {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .set_right_spoiler_out(spoiler_id)
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_right_spoiler_position(spoiler_id)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .start_eng3(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            assert!(
                test_bed
                    .get_right_spoiler_position(spoiler_id)
                    .get::<ratio>()
                    > 0.8
            );
        }

        #[rstest]
        #[case(1)]
        #[case(3)]
        #[case(5)]
        #[case(7)]
        fn yellow_left_spoilers_can_deploy_with_green_press(#[case] spoiler_id: usize) {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .set_left_spoiler_out(spoiler_id)
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert!(
                test_bed
                    .get_left_spoiler_position(spoiler_id)
                    .get::<ratio>()
                    < 0.1
            );

            test_bed = test_bed
                .start_eng3(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            assert!(
                test_bed
                    .get_left_spoiler_position(spoiler_id)
                    .get::<ratio>()
                    > 0.8
            );
        }

        #[test]
        fn spoilers_6_deploys_in_elec_mode() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_left_spoilers_out()
                .set_right_spoilers_out()
                .run_waiting_for(Duration::from_secs(5));

            // Artificially set plane not on ground to allow EHA activation
            test_bed.set_on_ground(false);

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            assert_lt!(
                test_bed._get_mean_right_spoilers_position().get::<ratio>(),
                0.01
            );

            assert_lt!(
                test_bed.get_mean_left_spoilers_position().get::<ratio>(),
                0.01
            );

            test_bed = test_bed
                .ac_ess_active()
                .set_left_spoiler_6_elec_backup_active()
                .run_waiting_for(Duration::from_secs(1));

            assert_gt!(test_bed.get_left_spoiler_position(6).get::<ratio>(), 0.5);
            assert_lt!(test_bed.get_right_spoiler_position(6).get::<ratio>(), 0.1);

            test_bed = test_bed
                .ac_ess_active()
                .set_right_spoiler_6_elec_backup_active()
                .run_waiting_for(Duration::from_secs(1));

            assert_gt!(test_bed.get_left_spoiler_position(6).get::<ratio>(), 0.5);
            assert_gt!(test_bed.get_right_spoiler_position(6).get::<ratio>(), 0.5);
        }

        #[test]
        fn pressure_state_at_init_one_simulation_step() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_lt!(test_bed.green_pressure(), Pressure::new::<psi>(50.));

            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(50.));
        }

        #[test]
        fn pressure_state_after_5s() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_lt!(test_bed.green_pressure(), Pressure::new::<psi>(50.));

            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(50.));
        }

        #[test]
        fn nose_wheel_pin_detection() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            assert!(!test_bed.query(|a| a.is_nws_pin_inserted()));
            assert!(!test_bed.is_nw_disc_memo_shown());

            test_bed = test_bed.set_pushback_state(true).run_one_tick();
            assert!(test_bed.query(|a| a.is_nws_pin_inserted()));
            assert!(test_bed.is_nw_disc_memo_shown());

            test_bed = test_bed
                .set_pushback_state(false)
                .run_waiting_for(Duration::from_secs(1));
            assert!(test_bed.query(|a| a.is_nws_pin_inserted()));
            assert!(test_bed.is_nw_disc_memo_shown());

            test_bed = test_bed.set_pushback_state(false).run_waiting_for(
                PushbackTug::DURATION_AFTER_WHICH_NWS_PIN_IS_REMOVED_AFTER_PUSHBACK,
            );

            assert!(!test_bed.query(|a| a.is_nws_pin_inserted()));
            assert!(!test_bed.is_nw_disc_memo_shown());
        }

        #[test]
        fn green_edp_buildup() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            // Starting eng 1
            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(80.))
                .run_one_tick();

            // ALMOST No pressure
            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_lt!(test_bed.green_pressure(), Pressure::new::<psi>(1000.));

            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(1000.));

            // Waiting for 5s pressure should be at 3000 psi
            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert_gt!(test_bed.green_pressure(), Pressure::new::<psi>(4500.));

            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(50.));

            // Stoping engine, pressure should fall in 20s
            test_bed = test_bed
                .stop_eng1()
                .run_waiting_for(Duration::from_secs(20));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_lt!(test_bed.green_pressure(), Pressure::new::<psi>(1500.));

            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(50.));
        }

        #[test]
        fn green_edp_disconnection() {
            let mut test_bed = test_bed_on_ground_with()
                .start_eng1(Ratio::new::<percent>(80.))
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert_gt!(test_bed.green_pressure(), Pressure::new::<psi>(4500.));

            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(50.));

            test_bed = test_bed
                .set_disconnect_engine_edp(2)
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert_gt!(test_bed.green_pressure(), Pressure::new::<psi>(4500.));

            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(50.));

            test_bed = test_bed
                .set_disconnect_engine_edp(1)
                .run_waiting_for(Duration::from_secs(20));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_lt!(test_bed.green_pressure(), Pressure::new::<psi>(1500.));

            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(50.));
        }

        #[test]
        fn yellow_edp_disconnection() {
            let mut test_bed = test_bed_on_ground_with()
                .start_eng3(Ratio::new::<percent>(80.))
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_lt!(test_bed.green_pressure(), Pressure::new::<psi>(50.));

            assert!(test_bed.is_yellow_pressure_switch_pressurised());
            assert_gt!(test_bed.yellow_pressure(), Pressure::new::<psi>(4500.));

            test_bed = test_bed
                .set_disconnect_engine_edp(4)
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_lt!(test_bed.green_pressure(), Pressure::new::<psi>(50.));

            assert!(test_bed.is_yellow_pressure_switch_pressurised());
            assert_gt!(test_bed.yellow_pressure(), Pressure::new::<psi>(4500.));

            test_bed = test_bed
                .set_disconnect_engine_edp(3)
                .run_waiting_for(Duration::from_secs(20));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_lt!(test_bed.green_pressure(), Pressure::new::<psi>(50.));

            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(1500.));
        }

        /// The engine 3 pump disconnection is supplied by DC 2, the engine 4 one by DC 1.
        #[test]
        fn yellow_edp_disconnection_engine_3_on_dc_2_engine_4_on_dc_1() {
            let mut test_bed = test_bed_on_ground_with()
                .start_eng3(Ratio::new::<percent>(80.))
                .start_eng4(Ratio::new::<percent>(80.))
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            // DC 1 lost: the engine 4 pumps can no longer be disconnected, the engine 3 pumps still can.
            test_bed = test_bed
                .dc_bus_1_lost()
                .set_disconnect_engine_edp(4)
                .run_waiting_for(Duration::from_secs(5));
            assert!(test_bed.query(|a| a
                .hydraulics
                .engine_driven_pump_4a_controller
                .is_input_shaft_connected()));

            test_bed = test_bed
                .set_disconnect_engine_edp(3)
                .run_waiting_for(Duration::from_secs(5));
            assert!(!test_bed.query(|a| a
                .hydraulics
                .engine_driven_pump_3a_controller
                .is_input_shaft_connected()));
        }

        #[test]
        fn edp_disconnection_supply_is_dc_2_for_engines_1_3_and_dc_1_for_2_4() {
            assert_eq!(
                A380EngineDrivenPumpController::disconnection_power_supply(1),
                ElectricalBusType::DirectCurrent(2)
            );
            assert_eq!(
                A380EngineDrivenPumpController::disconnection_power_supply(2),
                ElectricalBusType::DirectCurrent(1)
            );
            assert_eq!(
                A380EngineDrivenPumpController::disconnection_power_supply(3),
                ElectricalBusType::DirectCurrent(2)
            );
            assert_eq!(
                A380EngineDrivenPumpController::disconnection_power_supply(4),
                ElectricalBusType::DirectCurrent(1)
            );
        }

        #[test]
        fn green_edp_no_fault_on_ground_eng_off() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_millis(500));

            // EDP should be commanded on even without engine running
            assert!(test_bed.is_green_edp_commanded_on());
            // EDP should have no fault
            assert!(!test_bed.green_edp_has_fault());
        }

        #[test]
        fn green_edp_fault_not_on_ground_eng_off() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .engines_off()
                .run_one_tick();

            // EDP should be commanded on even without engine running
            assert!(test_bed.is_green_edp_commanded_on());

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            // EDP should have a fault as we are in flight
            assert!(test_bed.green_edp_has_fault());
        }

        #[test]
        fn green_edp_fault_on_ground_eng_starting() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_millis(500));

            // EDP should be commanded on even without engine running
            assert!(test_bed.is_green_edp_commanded_on());
            // EDP should have no fault
            assert!(!test_bed.green_edp_has_fault());

            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(3.))
                .run_one_tick();

            assert!(!test_bed.green_edp_has_fault());

            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(80.))
                .run_one_tick();

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(test_bed.green_edp_has_fault());

            test_bed = test_bed.run_waiting_for(Duration::from_secs(10));

            // When finally pressurised no fault
            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.green_edp_has_fault());
        }

        #[test]
        fn yellow_edp_no_fault_on_ground_eng_off() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_millis(500));

            // EDP should be commanded on even without engine running
            assert!(test_bed.is_yellow_edp_commanded_on());
            // EDP should have no fault
            assert!(!test_bed.yellow_edp_has_fault());
        }

        #[test]
        fn yellow_edp_fault_not_on_ground_eng_off() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .engines_off()
                .run_one_tick();

            // EDP should be commanded on even without engine running
            assert!(test_bed.is_yellow_edp_commanded_on());

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            // EDP should have a fault as we are in flight
            assert!(test_bed.yellow_edp_has_fault());
        }

        #[test]
        fn yellow_epump_press_low_at_pump_on() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            // EDP should not be in fault low when cold start
            assert!(!test_bed.is_yellow_epump_a_press_low());

            // Starting epump
            test_bed = test_bed.set_yellow_e_pump_a(true).run_one_tick();

            // Pump commanded on but pressure couldn't rise enough: we are in fault low
            assert!(test_bed.is_yellow_epump_a_press_low());

            // Waiting for 20s pressure should be at 3000 psi
            test_bed = test_bed.run_waiting_for(Duration::from_secs(20));

            // No more fault LOW expected
            assert!(test_bed.is_yellow_pressure_switch_pressurised());
            assert_gt!(test_bed.yellow_pressure(), Pressure::new::<psi>(2500.));
            assert!(!test_bed.is_yellow_epump_a_press_low());

            // Stoping epump, no fault expected
            test_bed = test_bed
                .set_yellow_e_pump_a(true)
                .run_waiting_for(Duration::from_secs(1));
            assert!(!test_bed.is_yellow_epump_a_press_low());
        }

        /// The pressure of a pump that has just started is not a failure: no ELEC PMP FAULT light while the ELEC PMP
        /// ON pb builds up the pressure, on ground with the engines off.
        #[test]
        fn yellow_elec_pump_no_fault_light_while_pressure_builds_up_at_pump_start() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(10));

            // The reservoir air pressure switches have settled (they start low, a FAULT of its own): no FAULT yet
            assert!(!test_bed.yellow_epump_a_has_fault());

            test_bed = test_bed.set_yellow_e_pump_a(true);

            // 50 ms steps over the spin-up: the pump section pressure switch is still low for about 2 s
            let mut saw_pump_section_pressure_low = false;
            for _ in 0..200 {
                test_bed = test_bed.run_waiting_for(Duration::from_millis(50));
                saw_pump_section_pressure_low |= test_bed.is_yellow_epump_a_press_low();
                assert!(
                    !test_bed.yellow_epump_a_has_fault(),
                    "ELEC PMP FAULT light on during the normal pressure build-up"
                );
            }

            // The start transient was there (the LO PR indication is not delayed) and the pump reached normal pressure
            assert!(saw_pump_section_pressure_low);
            assert!(!test_bed.is_yellow_epump_a_press_low());
            assert_gt!(test_bed.yellow_pressure(), Pressure::new::<psi>(4500.));
        }

        /// A pump pressure below 1 885 PSI that persists lights the FAULT, after the confirmation time. Engine 1 runs
        /// so that the reservoir low level does not light it (that term is for the ground with engines off), only the
        /// pump low pressure does; engine 1 does not inhibit the yellow pumps.
        #[test]
        fn yellow_elec_pump_fault_light_when_pressure_stays_low() {
            let mut test_bed = test_bed_on_ground_with_engine_1_running()
                .set_yellow_e_pump_a(true)
                .run_waiting_for(Duration::from_secs(10));
            assert!(!test_bed.is_yellow_epump_a_press_low());
            assert!(!test_bed.yellow_epump_a_has_fault());

            // The yellow fluid leaks out until the pump cannot hold its pressure any more
            test_bed.fail(FailureType::ReservoirLeak(HydraulicColor::Yellow));
            for _ in 0..6000 {
                if test_bed.is_yellow_epump_a_press_low() {
                    break;
                }
                test_bed = test_bed.run_waiting_for(Duration::from_millis(50));
            }
            assert!(test_bed.is_yellow_epump_a_press_low());

            // Not yet confirmed
            test_bed = test_bed.run_waiting_for(Duration::from_millis(500));
            assert!(test_bed.is_yellow_epump_a_press_low());
            assert!(!test_bed.yellow_epump_a_has_fault());

            // Confirmed
            test_bed = test_bed.run_waiting_for(Duration::from_secs(3));
            assert!(test_bed.is_yellow_epump_a_press_low());
            assert!(test_bed.yellow_epump_a_has_fault());

            // The FAULT light goes off when the crew selects OFF
            test_bed = test_bed
                .set_yellow_e_pump_a_off(true)
                .run_waiting_for(Duration::from_millis(100));
            assert!(!test_bed.yellow_epump_a_has_fault());
        }

        /// Runs the test bed in 50 ms steps, at most `max_time`, until the pressure switch of the pump section
        /// `section` (e.g. "HYD_GREEN_PUMP_1_SECTION") reads not pressurised. Gives the section pressure at that step,
        /// or None if the switch never tripped.
        fn pump_section_pressure_when_switch_trips(
            mut test_bed: A380HydraulicsTestBed,
            section: &str,
            max_time: Duration,
        ) -> Option<Pressure> {
            let step = Duration::from_millis(50);
            let mut elapsed = Duration::ZERO;
            while elapsed < max_time {
                test_bed = test_bed.run_waiting_for(step);
                elapsed += step;
                let pressurised: bool =
                    test_bed.read_by_name(&format!("{}_PRESSURE_SWITCH", section));
                if !pressurised {
                    return Some(test_bed.read_by_name(&format!("{}_PRESSURE", section)));
                }
            }
            None
        }

        /// The engine pump pressure is low below 2 500 PSI. The pump pb-sw is set OFF and the pump section pressure
        /// decays: the switch must not trip before the pressure is under 2 500 PSI.
        #[test]
        fn engine_pump_section_pressure_switch_trips_below_2500_psi() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(15));
            let pressurised: bool =
                test_bed.read_by_name("HYD_GREEN_PUMP_1_SECTION_PRESSURE_SWITCH");
            assert!(pressurised);

            let trip_pressure = pump_section_pressure_when_switch_trips(
                test_bed.set_green_ed_pump(false),
                "HYD_GREEN_PUMP_1_SECTION",
                Duration::from_secs(60),
            )
            .expect("the engine pump pressure switch never tripped");
            assert_lt!(trip_pressure, Pressure::new::<psi>(2520.));
        }

        /// The electric pump pressure is low below 1 885 PSI. The pump is stopped and its section pressure decays: the
        /// switch must not trip before the pressure is under 1 885 PSI.
        #[test]
        fn electric_pump_section_pressure_switch_trips_below_1885_psi() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_yellow_e_pump_a(true)
                .run_waiting_for(Duration::from_secs(20));
            let pressurised: bool =
                test_bed.read_by_name("HYD_YELLOW_PUMP_5_SECTION_PRESSURE_SWITCH");
            assert!(pressurised);

            let trip_pressure = pump_section_pressure_when_switch_trips(
                test_bed.set_yellow_e_pump_a(false),
                "HYD_YELLOW_PUMP_5_SECTION",
                Duration::from_secs(60),
            )
            .expect("the electric pump pressure switch never tripped");
            assert_lt!(trip_pressure, Pressure::new::<psi>(1905.));
        }

        /// The engine pump overheat (case drain above 120 °C) is written for the FWS (HYD SYS OVHT)
        #[test]
        fn engine_pump_overheat_is_written() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));
            let overheat: bool = test_bed.read_by_name("HYD_GREEN_1A_EDPUMP_OVHT");
            assert!(!overheat);

            test_bed.fail(FailureType::EnginePumpOverheat(
                AirbusEngineDrivenPumpId::Edp1a,
            ));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(60));
            let overheat: bool = test_bed.read_by_name("HYD_GREEN_1A_EDPUMP_OVHT");
            assert!(overheat);
        }

        /// The engine pump heat damage (case drain above 140 °C) is written for the FWS (HYD SYS TEMP EXCESS HI): it
        /// follows the overheat only after the pump has stayed hot for minutes
        #[test]
        fn engine_pump_temperature_excess_is_written_after_a_long_overheat() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            test_bed.fail(FailureType::EnginePumpOverheat(
                AirbusEngineDrivenPumpId::Edp1a,
            ));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(60));
            let overheat: bool = test_bed.read_by_name("HYD_GREEN_1A_EDPUMP_OVHT");
            let temp_excess: bool = test_bed.read_by_name("HYD_GREEN_1A_EDPUMP_TEMP_EXCESS");
            assert!(overheat);
            assert!(!temp_excess);

            test_bed = test_bed.run_waiting_for(Duration::from_secs(180));
            let temp_excess: bool = test_bed.read_by_name("HYD_GREEN_1A_EDPUMP_TEMP_EXCESS");
            assert!(temp_excess);
        }

        #[test]
        fn auto_brake_at_gear_retraction() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .set_park_brake(false)
                .run_waiting_for(Duration::from_secs(15));

            // No brake inputs
            test_bed = test_bed
                .set_left_brake(Ratio::new::<percent>(0.))
                .set_right_brake(Ratio::new::<percent>(0.))
                .run_waiting_for(Duration::from_secs(1));

            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );

            // Positive climb, gear up
            test_bed = test_bed
                .set_left_brake(Ratio::new::<percent>(0.))
                .set_right_brake(Ratio::new::<percent>(0.))
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(1));

            // Check auto brake is active
            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(1500.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(1500.)
            );

            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );

            // Check no more autobrakes after 3s
            test_bed = test_bed.run_waiting_for(Duration::from_secs(3));

            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );

            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
        }

        #[test]
        fn brakes_inactive_in_flight() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(10));

            // No brake inputs
            test_bed = test_bed
                .set_left_brake(Ratio::new::<percent>(0.))
                .set_right_brake(Ratio::new::<percent>(0.))
                .run_waiting_for(Duration::from_secs(1));

            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );

            // Now full brakes
            test_bed = test_bed
                .set_left_brake(Ratio::new::<percent>(100.))
                .set_right_brake(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(1));

            // Check no action on brakes
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );

            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
        }

        #[test]
        // Park brake on: the yellow accumulator brakes, and the pedals still brake on green, also once the accumulator
        // is empty
        fn brake_logic_green_backup_emergency() {
            // The test starts with the yellow brake accumulator charged: without
            // load_brake_accumulator it failed in the 1 % of runs where the accumulator starts empty
            // (green brakes then rightly back up the parking brake from the start).
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick()
                .load_brake_accumulator();

            // Setting on ground with yellow side hydraulics off
            // This should prevent yellow accumulator to fill. The yellow electric pumps are only inhibited by
            // engines 3 and 4, so they stay off here.
            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .set_park_brake(true)
                .set_yellow_e_pump_a(false)
                .set_yellow_ed_pump(false)
                .run_waiting_for(Duration::from_secs(15));

            // Braking with the park brake on: the yellow accumulator keeps the park brake pressure
            test_bed = test_bed
                .set_left_brake(Ratio::new::<percent>(100.))
                .set_right_brake(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(1));

            assert_gt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(500.)
            );
            assert_gt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(500.)
            );

            // With no more fluid in yellow accumulator, green should work as emergency
            test_bed = test_bed
                .empty_brake_accumulator_using_park_brake()
                .set_left_brake(Ratio::new::<percent>(100.))
                .set_right_brake(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(1));

            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(1000.)
            );
            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(1000.)
            );
            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
        }

        #[test]
        fn autobrakes_arms_in_flight_lo_to_hi() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(12));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);

            // BTV not programmed cannot arm
            test_bed = test_bed
                .set_autobrake_btv()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);

            test_bed = test_bed
                .set_autobrake_low()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::LOW);

            test_bed = test_bed
                .set_autobrake_l2()
                .run_waiting_for(Duration::from_secs(1));
            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L2);

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);

            test_bed = test_bed
                .set_autobrake_high()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::HIGH);
        }

        #[test]
        // BTV cannot be used with an ECAM alert that impacts the landing performance: the FWS lists BTV in STATUS INOP
        // SYS for ENG 2(3) SHUT DOWN, TWO ENGS OUT and the ENG 2(3) REVERSER failures.
        fn btv_does_not_arm_while_an_ecam_alert_lists_btv_inop() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .set_btv_runway_and_exit()
                .run_waiting_for(Duration::from_secs(12));

            // A runway exit selected, but INOP SYS BTV: BTV does not arm (the next test shows that it arms without it)
            test_bed = test_bed
                .set_fws_btv_inop(true)
                .set_autobrake_btv()
                .run_waiting_for(Duration::from_secs(1));
            assert_ne!(test_bed.autobrake_mode(), A380AutobrakeMode::BTV);
        }

        #[test]
        // When an arming condition is lost the auto-brake reverts to BRK HI
        fn armed_btv_reverts_to_brk_hi_when_an_ecam_alert_lists_btv_inop() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .set_btv_runway_and_exit()
                .run_waiting_for(Duration::from_secs(12));

            test_bed = test_bed
                .set_autobrake_btv()
                .run_waiting_for(Duration::from_secs(1));
            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::BTV);

            test_bed = test_bed
                .set_fws_btv_inop(true)
                .run_waiting_for(Duration::from_secs(1));
            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::HIGH);
        }

        #[test]
        // The 10 s in-flight disarming is for the RTO mode only; a landing mode can be armed in flight and on ground
        fn autobrakes_landing_mode_armed_on_ground_stays_armed_after_take_off() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .start_eng1(Ratio::new::<percent>(60.))
                .start_eng2(Ratio::new::<percent>(60.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_low()
                .run_waiting_for(Duration::from_secs(1));
            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::LOW);

            test_bed = test_bed
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(15));
            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::LOW);
        }

        #[test]
        fn autobrakes_does_not_disarm_if_askid_off_but_sim_not_ready() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .sim_not_ready()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(12));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);

            // sim is not ready --> no disarm
            test_bed = test_bed
                .set_anti_skid(false)
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);

            // sim is now ready --> disarm expected
            test_bed = test_bed.sim_ready().run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
        }

        #[test]
        fn autobrakes_disarms_if_askid_off() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(12));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);

            test_bed = test_bed
                .set_anti_skid(false)
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
        }

        #[test]
        fn autobrakes_rto_wont_arm_in_flight() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(15));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
        }

        #[test]
        fn autobrakes_taxiing_wont_disarm_when_braking() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .start_eng1(Ratio::new::<percent>(60.))
                .start_eng2(Ratio::new::<percent>(60.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed
                .set_right_brake(Ratio::new::<percent>(100.))
                .set_left_brake(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);
        }

        #[test]
        fn autobrakes_activates_on_ground_on_spoiler_deploy() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(100.))
                .set_deploy_ground_spoilers()
                .run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);
            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(1000.)
            );
            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(1000.)
            );

            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
        }

        #[test]
        fn autobrakes_activates_on_ground_and_deactivates_pressing_rto_again() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );

            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );
        }

        #[test]
        fn autobrakes_disengage_on_spoiler_retract() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(100.))
                .set_deploy_ground_spoilers()
                .run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed
                .set_retract_ground_spoilers()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );
        }

        #[test]
        // BRAKES AUTO BRK FAULT: the failed autobrake reports the fault and cannot be armed (STATUS INOP SYS AUTO BRK)
        fn failed_autobrake_reports_fault_and_cannot_be_armed() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));
            let fault_before_failure: bool = test_bed.read_by_name("BRAKES_AUTO_BRK_FAULT");
            assert!(!fault_before_failure);

            test_bed.fail(FailureType::Autobrake);
            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));

            let fault_after_failure: bool = test_bed.read_by_name("BRAKES_AUTO_BRK_FAULT");
            assert!(fault_after_failure);
            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);

            test_bed = test_bed
                .set_autobrake_low()
                .run_waiting_for(Duration::from_secs(1));
            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
        }

        #[test]
        // The RTO mode does not activate below 40 kt
        fn autobrakes_rto_does_not_activate_below_40_knots() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));
            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(30.))
                .set_deploy_ground_spoilers()
                .run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );

            // Above 40 kt the RTO braking activates, and it keeps braking when the speed drops below 40 kt
            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(100.))
                .run_waiting_for(Duration::from_secs(2));
            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(1000.)
            );

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(20.))
                .run_waiting_for(Duration::from_secs(2));
            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(1000.)
            );
        }

        #[test]
        // Should disable with one pedal > 61° over max range of 79.4° thus 77%
        fn autobrakes_rto_disengage_at_77_on_one_pedal_input() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(100.))
                .set_deploy_ground_spoilers()
                .run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);
            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(1000.)
            );
            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(1000.)
            );

            test_bed = test_bed
                .set_left_brake(Ratio::new::<percent>(70.))
                .run_waiting_for(Duration::from_secs(1))
                .set_left_brake(Ratio::new::<percent>(0.))
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);
            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(1000.)
            );
            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(1000.)
            );

            test_bed = test_bed
                .set_left_brake(Ratio::new::<percent>(78.))
                .run_waiting_for(Duration::from_secs(1))
                .set_left_brake(Ratio::new::<percent>(0.))
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );
        }

        #[test]
        // Should disable with one pedals > 42° over max range of 79.4° thus 52%
        fn autobrakes_l3_disengage_at_52_on_one_pedal_input() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);

            test_bed = test_bed
                .set_deploy_ground_spoilers()
                .run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);
            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(1000.)
            );
            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(1000.)
            );

            test_bed = test_bed
                .set_right_brake(Ratio::new::<percent>(50.))
                .run_waiting_for(Duration::from_secs(1))
                .set_right_brake(Ratio::new::<percent>(0.))
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);
            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(1000.)
            );
            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(1000.)
            );

            test_bed = test_bed
                .set_right_brake(Ratio::new::<percent>(55.))
                .run_waiting_for(Duration::from_secs(1))
                .set_right_brake(Ratio::new::<percent>(0.))
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(50.)
            );
        }

        #[test]
        fn autobrakes_rto_disarm_after_10s_in_flight() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed.in_flight().run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed.in_flight().run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
        }

        #[test]
        fn autobrakes_does_not_disarm_after_10s_when_started_in_flight() {
            let mut test_bed = test_bed_in_flight_with()
                .set_cold_dark_inputs()
                .in_flight()
                .run_waiting_for(Duration::from_secs(1));

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);

            test_bed = test_bed.in_flight().run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);

            test_bed = test_bed.in_flight().run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);
        }

        #[test]
        fn autobrakes_disarm_if_no_adirs() {
            let mut test_bed = test_bed_in_flight_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);

            test_bed = test_bed
                .adirs_not_aligned()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
        }

        #[test]
        fn controller_yellow_epump_is_activated_by_overhead_button() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            assert!(!test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()));

            test_bed = test_bed.set_yellow_e_pump_a(true).run_one_tick();

            assert!(test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()));

            test_bed = test_bed.set_yellow_e_pump_a(false).run_one_tick();

            assert!(!test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()));
        }

        #[test]
        fn controller_yellow_epumps_unpowered_cant_command_pumps() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_yellow_e_pump_a(true)
                .set_yellow_e_pump_b(true)
                .run_one_tick();

            assert!(test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()));
            assert!(test_bed.query(|a| a.is_yellow_b_epump_controller_pressurising()));

            test_bed = test_bed.dc_bus_1_lost().run_one_tick();

            assert!(!test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()));
            assert!(!test_bed.query(|a| a.is_yellow_b_epump_controller_pressurising()));
        }

        #[test]
        fn controller_green_epumps_unpowered_cant_command_pumps() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_green_e_pump_a(true)
                .set_green_e_pump_b(true)
                .run_one_tick();

            assert!(test_bed.query(|a| a.is_green_epump_a_controller_pressurising()));
            assert!(test_bed.query(|a| a.is_green_epump_b_controller_pressurising()));

            test_bed = test_bed.dc_bus_2_lost().run_one_tick();

            assert!(!test_bed.query(|a| a.is_green_epump_a_controller_pressurising()));
            assert!(!test_bed.query(|a| a.is_green_epump_b_controller_pressurising()));
        }

        // The electric pumps work on ground only, and the green (yellow) pumps are inhibited as soon as engine 1 or 2
        // (3 or 4) runs.
        #[test]
        fn controller_yellow_epumps_run_with_only_engines_1_and_2_running() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .start_eng2(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            test_bed = test_bed
                .set_yellow_e_pump_a(true)
                .set_yellow_e_pump_b(true)
                .set_green_e_pump_a(true)
                .set_green_e_pump_b(true)
                .run_one_tick();

            assert!(test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()));
            assert!(test_bed.query(|a| a.is_yellow_b_epump_controller_pressurising()));
            assert!(!test_bed.query(|a| a.is_green_epump_a_controller_pressurising()));
            assert!(!test_bed.query(|a| a.is_green_epump_b_controller_pressurising()));
        }

        #[test]
        fn controller_green_epumps_run_with_only_engines_3_and_4_running() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng3(Ratio::new::<percent>(80.))
                .start_eng4(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            test_bed = test_bed
                .set_yellow_e_pump_a(true)
                .set_yellow_e_pump_b(true)
                .set_green_e_pump_a(true)
                .set_green_e_pump_b(true)
                .run_one_tick();

            assert!(test_bed.query(|a| a.is_green_epump_a_controller_pressurising()));
            assert!(test_bed.query(|a| a.is_green_epump_b_controller_pressurising()));
            assert!(!test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()));
            assert!(!test_bed.query(|a| a.is_yellow_b_epump_controller_pressurising()));
        }

        #[test]
        fn controller_epumps_are_inhibited_in_flight() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_yellow_e_pump_a(true)
                .set_green_e_pump_a(true)
                .run_one_tick();

            assert!(test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()));
            assert!(test_bed.query(|a| a.is_green_epump_a_controller_pressurising()));

            test_bed.set_on_ground(false);
            test_bed = test_bed.run_one_tick();

            assert!(!test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()));
            assert!(!test_bed.query(|a| a.is_green_epump_a_controller_pressurising()));
        }

        #[test]
        fn controller_engine_driven_pump1_overhead_button_logic_with_eng_on() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            assert!(test_bed.query(|a| a.is_edp1a_green_pump_controller_pressurising()));

            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(65.))
                .run_one_tick();
            assert!(test_bed.query(|a| a.is_edp1a_green_pump_controller_pressurising()));

            test_bed = test_bed.set_green_ed_pump(false).run_one_tick();
            assert!(!test_bed.query(|a| a.is_edp1a_green_pump_controller_pressurising()));

            test_bed = test_bed.set_green_ed_pump(true).run_one_tick();
            assert!(test_bed.query(|a| a.is_edp1a_green_pump_controller_pressurising()));
        }

        #[test]
        fn controller_engine_driven_pumps_depressurise_during_a_windmilling_start_of_their_engine()
        {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .in_flight()
                .run_one_tick();
            assert!(test_bed.query(|a| a.is_edp1a_green_pump_controller_pressurising()));

            test_bed.write_by_name("ENGINE_1_WINDMILL_START", true);
            test_bed = test_bed.run_one_tick();
            assert!(!test_bed.query(|a| a.is_edp1a_green_pump_controller_pressurising()));
            // the other engines' pumps are not affected
            assert!(test_bed.query(|a| a.is_edp2a_yellow_pump_controller_pressurising()));

            test_bed.write_by_name("ENGINE_1_WINDMILL_START", false);
            test_bed = test_bed.run_one_tick();
            assert!(test_bed.query(|a| a.is_edp1a_green_pump_controller_pressurising()));
        }

        #[test]
        fn controller_engine_driven_pump1_fire_overhead_released_stops_pump() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(65.))
                .start_eng2(Ratio::new::<percent>(65.))
                .run_one_tick();

            assert!(test_bed.query(|a| a.is_edp1a_green_pump_controller_pressurising()));

            test_bed = test_bed.set_eng1_fire_button(true).run_one_tick();
            assert!(!test_bed.query(|a| a.is_edp1a_green_pump_controller_pressurising()));
        }

        #[test]
        fn controller_engine_driven_pump2a_fire_overhead_released_stops_pump() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(65.))
                .start_eng2(Ratio::new::<percent>(65.))
                .run_one_tick();

            assert!(test_bed.query(|a| a.is_edp2a_yellow_pump_controller_pressurising()));

            test_bed = test_bed.set_eng2_fire_button(true).run_one_tick();
            assert!(!test_bed.query(|a| a.is_edp2a_yellow_pump_controller_pressurising()));
        }

        #[test]
        fn yellow_epump_a_unavailable_if_unpowered() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_yellow_e_pump_a(true)
                .run_waiting_for(Duration::from_secs(10));

            // Yellow epump working
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            test_bed = test_bed
                .ac_bus_4_lost()
                .run_waiting_for(Duration::from_secs(25));

            // Yellow A epump still working as plugged on AC3
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            test_bed = test_bed
                .ac_bus_3_lost()
                .run_waiting_for(Duration::from_secs(25));

            // Yellow epump has stopped
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
        }

        #[test]
        fn yellow_epump_b_unavailable_if_unpowered() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_yellow_e_pump_b(true)
                .run_waiting_for(Duration::from_secs(10));

            // Yellow epump working
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            test_bed = test_bed
                .ac_bus_3_lost()
                .run_waiting_for(Duration::from_secs(25));

            // Yellow B epump still working as plugged on AC4
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            test_bed = test_bed
                .ac_bus_4_lost()
                .run_waiting_for(Duration::from_secs(25));

            // Yellow epump has stopped
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
        }

        #[test]
        fn flaps_and_slats_declare_moving() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(5));

            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(80.))
                .start_eng2(Ratio::new::<percent>(80.))
                .start_eng3(Ratio::new::<percent>(80.))
                .start_eng4(Ratio::new::<percent>(80.))
                .set_flaps_handle_position(4)
                .run_waiting_for(Duration::from_secs(5));

            assert!(test_bed.is_flaps_moving());
        }

        #[test]
        fn no_pressure_no_flap_slats() {
            let mut test_bed = test_bed_on_ground_with()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(5));

            test_bed = test_bed
                .set_flaps_handle_position(4)
                .run_waiting_for(Duration::from_secs(10));

            assert_le!(test_bed.get_flaps_left_position_percent(), 1.);
            assert_le!(test_bed.get_flaps_right_position_percent(), 1.);
            assert_le!(test_bed.get_slats_left_position_percent(), 1.);
            assert_le!(test_bed.get_slats_right_position_percent(), 1.);

            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());
        }

        #[test]
        fn flaps_slats_moving() {
            // The actuator flows and dampings are random (linear_actuator.rs): a slow draw can need more than 60 s
            // with GREEN alone, so each step waits, bounded, until the surfaces have stopped
            let surfaces_stopped =
                |bed: &mut A380HydraulicsTestBed| !bed.is_slats_moving() && !bed.is_flaps_moving();
            let mut test_bed = test_bed_on_ground_with()
                .on_the_ground()
                .set_park_brake(true)
                .start_eng1(Ratio::new::<percent>(50.))
                .start_eng2(Ratio::new::<percent>(50.))
                .set_flaps_handle_position(0)
                .run_waiting_for(Duration::from_secs(20));
            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());

            test_bed = test_bed
                .set_flaps_handle_position(1)
                .run_waiting_for(Duration::from_secs(60))
                .run_until(60, "flaps and slats stopped", surfaces_stopped);
            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());

            test_bed = test_bed
                .set_flaps_handle_position(2)
                .run_waiting_for(Duration::from_secs(60))
                .run_until(60, "flaps and slats stopped", surfaces_stopped);
            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());

            test_bed = test_bed
                .set_flaps_handle_position(3)
                .run_waiting_for(Duration::from_secs(60))
                .run_until(60, "flaps and slats stopped", surfaces_stopped);
            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());

            test_bed = test_bed
                .set_flaps_handle_position(4)
                .run_waiting_for(Duration::from_secs(60))
                .run_until(60, "flaps and slats stopped", surfaces_stopped);
            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());

            test_bed = test_bed
                .set_flaps_handle_position(3)
                .run_waiting_for(Duration::from_secs(60))
                .run_until(60, "flaps and slats stopped", surfaces_stopped);
            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());

            test_bed = test_bed
                .set_flaps_handle_position(2)
                .run_waiting_for(Duration::from_secs(60))
                .run_until(60, "flaps and slats stopped", surfaces_stopped);
            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());

            test_bed = test_bed
                .set_flaps_handle_position(1)
                .run_waiting_for(Duration::from_secs(60))
                .run_until(60, "flaps and slats stopped", surfaces_stopped);
            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());

            test_bed = test_bed
                .set_flaps_handle_position(0)
                .run_waiting_for(Duration::from_secs(60))
                .run_until(60, "flaps and slats stopped", surfaces_stopped);
            assert!(!test_bed.is_slats_moving());
            assert!(!test_bed.is_flaps_moving());
        }

        #[test]
        fn flap_full_transition_time_38s() {
            let mut test_bed = test_bed_on_ground_with()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .start_eng2(Ratio::new::<percent>(80.))
                .start_eng3(Ratio::new::<percent>(80.))
                .start_eng4(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            test_bed = test_bed
                .set_flaps_handle_position(4)
                .run_waiting_for(Duration::from_secs(37));

            assert!(test_bed.is_flaps_moving());

            test_bed = test_bed.run_waiting_for(Duration::from_secs(2));
            assert!(!test_bed.is_flaps_moving());

            assert_ge!(test_bed.get_flaps_left_position_percent(), 98.);
            assert_ge!(test_bed.get_flaps_right_position_percent(), 98.);
            assert_ge!(test_bed.get_slats_left_position_percent(), 98.);
            assert_ge!(test_bed.get_slats_right_position_percent(), 98.);
        }

        /// FLAPS_CONF_INDEX values of the SFCC (`FlapsConf as u8`)
        const FLAPS_CONF_INDEX_CONF1: f64 = 1.;
        const FLAPS_CONF_INDEX_CONF1F: f64 = 2.;
        /// SFCC slat/flap system status word bit 18: FLAPS lever in position 1
        const SFCC_STATUS_BIT_LEVER_1: u8 = 18;
        /// SFCC slat/flap system status word bit 26: CONF 1 (flaps auto-retracted, read by the PFD as "1")
        const SFCC_STATUS_BIT_CONF1_FLAPS_RETRACTED: u8 = 26;

        fn assert_surface_angle_near(actual_degrees: f64, expected_degrees: f64) {
            assert!(
                (actual_degrees - expected_degrees).abs() < 0.5,
                "surface angle {actual_degrees:.2} deg, expected {expected_degrees:.2} deg"
            );
        }

        fn assert_conf_1_plus_f(test_bed: &mut A380HydraulicsTestBed) {
            assert_eq!(test_bed.flaps_conf_index(), FLAPS_CONF_INDEX_CONF1F);
            for sfcc_number in 1..=2 {
                let word = test_bed.sfcc_slat_flap_system_status_word(sfcc_number);
                assert!(word.get_bit(SFCC_STATUS_BIT_LEVER_1));
                assert!(!word.get_bit(SFCC_STATUS_BIT_CONF1_FLAPS_RETRACTED));
            }
            // CONF 1+F surfaces: slats 20 deg, flaps 8 deg
            assert_surface_angle_near(test_bed.left_flaps_surface_angle().get::<degree>(), 8.);
            assert_surface_angle_near(test_bed.left_slats_surface_angle().get::<degree>(), 20.);
        }

        fn assert_conf_1(test_bed: &mut A380HydraulicsTestBed) {
            assert_eq!(test_bed.flaps_conf_index(), FLAPS_CONF_INDEX_CONF1);
            for sfcc_number in 1..=2 {
                let word = test_bed.sfcc_slat_flap_system_status_word(sfcc_number);
                assert!(word.get_bit(SFCC_STATUS_BIT_LEVER_1));
                assert!(word.get_bit(SFCC_STATUS_BIT_CONF1_FLAPS_RETRACTED));
            }
            // CONF 1 surfaces: slats stay at 20 deg, flaps fully retracted
            assert_surface_angle_near(test_bed.left_flaps_surface_angle().get::<degree>(), 0.);
            assert_surface_angle_near(test_bed.left_slats_surface_angle().get::<degree>(), 20.);
            // What reaches MSFS: TRAILING EDGE FLAPS (and the MSFS flap index) from this
            // percentage, the 3D flap animation from the FPPU-based animation position.
            assert_le!(test_bed.get_flaps_left_position_percent(), 1.);
            assert_le!(test_bed.get_flaps_right_position_percent(), 1.);
            assert_le!(
                ReadByName::<A380HydraulicsTestBed, f64>::read_by_name(
                    test_bed,
                    "LEFT_FLAPS_ANIMATION_POSITION"
                ),
                1.
            );
        }

        /// In CONF 1+F the auto retraction system (ARS) retracts the flaps to CONF 1 at 212 kt; in CONF 1 the auto
        /// extension system (AES) extends them again below 205 kt.
        /// Whole aircraft: lever 0 -> 1 at the gate, take-off in CONF 1+F, climb through 212 kt (to 240 kt as in the
        /// user report), then back below 205 kt.
        #[test]
        fn flaps_auto_retraction_and_extension_after_a_conf_1_plus_f_takeoff() {
            let mut test_bed = test_bed_on_ground_with()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .start_eng2(Ratio::new::<percent>(80.))
                .start_eng3(Ratio::new::<percent>(80.))
                .start_eng4(Ratio::new::<percent>(80.))
                .set_flaps_handle_position(0)
                .run_waiting_for(Duration::from_secs(10));

            // Lever 1 selected long before the take-off: CONF 1+F on the ground
            test_bed = test_bed
                .set_flaps_handle_position(1)
                .run_waiting_for(Duration::from_secs(60));
            assert_conf_1_plus_f(&mut test_bed);

            // Take-off roll at 170 kt, still on the ground: CONF 1+F
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(170.));
            test_bed = test_bed
                .set_park_brake(false)
                .run_waiting_for(Duration::from_secs(5));
            assert_conf_1_plus_f(&mut test_bed);

            // Lift-off, gear up, initial climb below 205 kt: CONF 1+F
            test_bed.set_on_ground(false);
            test_bed.set_pressure_altitude(Length::new::<foot>(1500.));
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(185.));
            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(20));
            assert_conf_1_plus_f(&mut test_bed);

            // Between the AES (205 kt) and the ARS (212 kt) speeds: no change yet
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(209.));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(20));
            assert_conf_1_plus_f(&mut test_bed);

            // Through 212 kt up to 240 kt: the ARS retracts the flaps -> CONF 1
            test_bed.set_pressure_altitude(Length::new::<foot>(4000.));
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(213.));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(2));
            assert_eq!(test_bed.flaps_conf_index(), FLAPS_CONF_INDEX_CONF1);
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(240.));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(60));
            assert!(!test_bed.is_flaps_moving());
            assert_conf_1(&mut test_bed);

            // Back between 205 and 212 kt: CONF 1 is kept (hysteresis)
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(208.));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(20));
            assert_conf_1(&mut test_bed);

            // Below 205 kt with the lever still at 1: the AES extends the flaps -> CONF 1+F
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(200.));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(60));
            assert!(!test_bed.is_flaps_moving());
            assert_conf_1_plus_f(&mut test_bed);
        }

        /// Flight loaded in the air with the FLAPS lever already at 1 (no lever movement by the
        /// crew): above 212 kt the SFCC must select CONF 1, below 205 kt CONF 1+F
        #[rstest]
        #[case(240., FLAPS_CONF_INDEX_CONF1)]
        #[case(190., FLAPS_CONF_INDEX_CONF1F)]
        fn flaps_lever_1_at_an_in_flight_spawn_follows_ars_and_aes(
            #[case] indicated_airspeed_knots: f64,
            #[case] expected_conf_index: f64,
        ) {
            let mut test_bed = test_bed_in_flight_with().set_flaps_handle_position(1);
            test_bed = test_bed.in_flight();
            test_bed.set_indicated_airspeed(Velocity::new::<knot>(indicated_airspeed_knots));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(60));

            assert_eq!(test_bed.flaps_conf_index(), expected_conf_index);
            if expected_conf_index == FLAPS_CONF_INDEX_CONF1 {
                assert_conf_1(&mut test_bed);
            } else {
                assert_conf_1_plus_f(&mut test_bed);
            }
        }

        #[test]
        fn cargo_door_stays_closed_at_init() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_eq!(test_bed.cargo_fwd_door_position(), 0.);

            test_bed = test_bed.run_waiting_for(Duration::from_secs_f64(15.));

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_eq!(test_bed.cargo_fwd_door_position(), 0.);
        }

        #[test]
        fn cargo_door_unlocks_when_commanded() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_eq!(test_bed.cargo_fwd_door_position(), 0.);

            test_bed = test_bed.run_waiting_for(Duration::from_secs_f64(1.));

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_eq!(test_bed.cargo_fwd_door_position(), 0.);

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(1.));

            assert!(!test_bed.is_cargo_fwd_door_locked_down());
            assert_ge!(test_bed.cargo_fwd_door_position(), 0.);
        }

        #[test]
        fn cargo_door_controller_opens_the_door() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_eq!(test_bed.cargo_fwd_door_position(), 0.);

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(1.));

            assert!(!test_bed.is_cargo_fwd_door_locked_down());

            let current_position_unlocked = test_bed.cargo_fwd_door_position();

            test_bed = test_bed.open_fwd_cargo_door().run_waiting_for(
                HydraulicDoorController::DELAY_UNLOCK_TO_HYDRAULIC_CONTROL + Duration::from_secs(5),
            );

            assert_gt!(
                test_bed.cargo_fwd_door_position(),
                current_position_unlocked
            );

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(30.));

            assert_gt!(test_bed.cargo_fwd_door_position(), 0.85);
        }

        #[test]
        fn cargo_door_opens_fully_and_is_held_open_after_the_green_pumps_stop() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(60.));

            assert!(test_bed.is_cargo_fwd_door_locked_up());
            // FWD_DOOR_CARGO_POSITION is in percent
            assert_gt!(test_bed.cargo_fwd_door_position(), 97.5);

            test_bed = test_bed.run_waiting_for(Duration::from_secs_f64(60.));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_lt!(
                test_bed.green_pressure_auxiliary(),
                Pressure::new::<psi>(3000.)
            );
            assert!(test_bed.is_cargo_fwd_door_locked_up());
            assert!(!test_bed.is_cargo_fwd_door_locked_down());
            assert_gt!(test_bed.cargo_fwd_door_position(), 97.5);

            test_bed = test_bed
                .close_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(60.));

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_le!(test_bed.cargo_fwd_door_position(), 0.);
        }

        #[test]
        fn fwd_cargo_door_controller_opens_fwd_door_only() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_eq!(test_bed.cargo_fwd_door_position(), 0.);
            assert_eq!(test_bed.cargo_aft_door_position(), 0.);

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(30.));

            assert_gt!(test_bed.cargo_fwd_door_position(), 0.85);
            assert_eq!(test_bed.cargo_aft_door_position(), 0.);
        }

        #[test]
        fn cargo_door_controller_closes_the_door() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(30.));

            assert!(!test_bed.is_cargo_fwd_door_locked_down());
            assert_gt!(test_bed.cargo_fwd_door_position(), 0.85);

            test_bed = test_bed
                .close_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(60.));

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_le!(test_bed.cargo_fwd_door_position(), 0.);
        }

        #[test]
        fn cargo_door_controller_closes_the_door_after_green_pump_auto_shutdown() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(30.));

            assert!(!test_bed.is_cargo_fwd_door_locked_down());
            assert_gt!(test_bed.cargo_fwd_door_position(), 0.85);

            test_bed = test_bed.run_waiting_for(Duration::from_secs_f64(30.));

            assert!(!test_bed.is_green_pressure_switch_pressurised());

            test_bed = test_bed
                .close_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs_f64(40.));

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_le!(test_bed.cargo_fwd_door_position(), 0.);
        }

        #[test]
        fn nose_steering_does_not_move_if_yellow_pressure_but_no_engine() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_yellow_e_pump_a(false)
                .run_one_tick();

            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(5.));

            assert_le!(test_bed.nose_steering_position().get::<degree>(), 0.1);
            assert_ge!(test_bed.nose_steering_position().get::<degree>(), -0.1);

            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(-1.))
                .run_waiting_for(Duration::from_secs_f64(10.));

            assert_le!(test_bed.nose_steering_position().get::<degree>(), 0.1);
            assert_ge!(test_bed.nose_steering_position().get::<degree>(), -0.1);
        }

        #[test]
        // The A-SKID sw OFF does not cut off the NWS
        fn nose_steering_still_steers_when_a_skid_off() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_yellow_e_pump_a(false)
                .start_eng1(Ratio::new::<percent>(80.))
                .start_eng2(Ratio::new::<percent>(80.))
                .start_eng3(Ratio::new::<percent>(80.))
                .start_eng4(Ratio::new::<percent>(80.))
                .set_anti_skid(false)
                .run_one_tick();

            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(5.));

            assert_ge!(test_bed.nose_steering_position().get::<degree>(), 40.);
        }

        #[test]
        fn nose_steering_steers() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_yellow_e_pump_a(false)
                .start_eng1(Ratio::new::<percent>(80.))
                .start_eng2(Ratio::new::<percent>(80.))
                .start_eng3(Ratio::new::<percent>(80.))
                .start_eng4(Ratio::new::<percent>(80.))
                .run_one_tick();

            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(5.));

            assert_ge!(test_bed.nose_steering_position().get::<degree>(), 40.);
        }

        #[test]
        fn yellow_epump_has_cavitation_at_low_air_press() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .air_press_nominal()
                .set_yellow_e_pump_a(true)
                .run_waiting_for(Duration::from_secs_f64(10.));

            assert_gt!(test_bed.yellow_pressure().get::<psi>(), 4500.);

            test_bed = test_bed
                .air_press_low()
                .run_waiting_for(Duration::from_secs_f64(10.));

            assert_lt!(test_bed.yellow_pressure().get::<psi>(), 3500.);
        }

        #[test]
        fn ailerons_are_dropped_down_in_cold_and_dark() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            assert_lt!(
                test_bed.get_left_aileron_mean_position().get::<ratio>(),
                0.1
            );
            assert_lt!(
                test_bed.get_right_aileron_mean_position().get::<ratio>(),
                0.1
            );
        }

        #[test]
        fn ailerons_do_not_respond_in_cold_and_dark() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_ailerons_left_turn()
                .run_waiting_for(Duration::from_secs_f64(2.));

            assert_lt!(
                test_bed.get_left_aileron_mean_position().get::<ratio>(),
                0.1
            );
            assert_lt!(
                test_bed.get_right_aileron_mean_position().get::<ratio>(),
                0.1
            );

            test_bed = test_bed
                .set_ailerons_right_turn()
                .run_waiting_for(Duration::from_secs_f64(2.));

            assert_lt!(
                test_bed.get_left_aileron_mean_position().get::<ratio>(),
                0.1
            );
            assert_lt!(
                test_bed.get_right_aileron_mean_position().get::<ratio>(),
                0.1
            );
        }

        #[test]
        fn nose_wheel_steers_with_pushback_tug() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(-5.))
                .run_waiting_for(Duration::from_secs_f64(5.));

            // Has turned fully after 5s
            assert_gt!(test_bed.get_nose_steering_ratio(), Ratio::new::<ratio>(0.9));

            // Going left
            test_bed = test_bed
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(5.))
                .run_waiting_for(Duration::from_secs_f64(5.));

            // Has turned fully left after 5s
            assert_lt!(
                test_bed.get_nose_steering_ratio(),
                Ratio::new::<ratio>(-0.9)
            );
        }

        #[test]
        fn nominal_gear_retraction_extension_cycles_in_flight() {
            let mut test_bed = test_bed_on_ground_with().set_cold_dark_inputs().in_flight();

            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllDownLocked);

            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(25.));
            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllUpLocked);

            test_bed = test_bed
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs_f64(25.));
            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllDownLocked);

            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(25.));
            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllUpLocked);
        }

        #[test]
        fn emergency_gear_extension_release_gear() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(25.));

            assert!(test_bed.is_all_doors_really_up());
            assert!(test_bed.is_all_gears_really_up());
            assert!(test_bed.is_all_auxiliary_gear_door_closed());

            test_bed = test_bed
                .set_green_ed_pump(false)
                .activate_emergency_gear_extension()
                .run_waiting_for(Duration::from_secs_f64(80.));

            assert!(test_bed.is_all_doors_really_down());
            assert!(test_bed.is_all_gears_really_down());

            //Auxiliary cannot open without hyd
            assert!(test_bed.is_all_auxiliary_gear_door_closed());
        }

        /// In flight with the gear down, then the engine pumps of one hydraulic system are disconnected (engines 1+2
        /// for GREEN, 3+4 for YELLOW)
        fn in_flight_gear_down_with_system_lost(system: HydraulicColor) -> A380HydraulicsTestBed {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs_f64(5.));
            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllDownLocked);

            test_bed = match system {
                HydraulicColor::Green => test_bed
                    .set_disconnect_engine_edp(1)
                    .set_disconnect_engine_edp(2),
                _ => test_bed
                    .set_disconnect_engine_edp(3)
                    .set_disconnect_engine_edp(4),
            }
            .run_waiting_for(Duration::from_secs_f64(30.));
            match system {
                HydraulicColor::Green => {
                    assert_lt!(test_bed.green_pressure(), Pressure::new::<psi>(1000.))
                }
                _ => assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(1000.)),
            }
            test_bed
        }

        #[test]
        // YELLOW failed, L/G lever UP: the BLG and the WLG remain extended, the BLG doors closed. Not modelled: the NLG
        // retracts (the common LGCIU moves the gears only when all the doors are open).
        fn gear_retraction_with_yellow_lost_keeps_the_main_gears_extended_and_their_doors_closed() {
            let mut test_bed = in_flight_gear_down_with_system_lost(HydraulicColor::Yellow);

            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(25.));

            assert!(test_bed.get_real_gear_position(GearWheel::LEFT) >= Ratio::new::<ratio>(0.99));
            assert!(test_bed.get_real_gear_position(GearWheel::RIGHT) >= Ratio::new::<ratio>(0.99));
            assert!(
                test_bed.get_real_gear_door_position(GearWheel::LEFT) <= Ratio::new::<ratio>(0.01)
            );
            assert!(
                test_bed.get_real_gear_door_position(GearWheel::RIGHT) <= Ratio::new::<ratio>(0.01)
            );
        }

        #[test]
        // GREEN failed, L/G lever UP: the NLG and the WLG remain extended
        fn gear_retraction_with_green_lost_keeps_the_nose_and_wing_gears_extended() {
            let mut test_bed = in_flight_gear_down_with_system_lost(HydraulicColor::Green);

            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(25.));

            assert!(test_bed.is_all_gears_really_down());
        }

        #[test]
        // HYD G(Y) SYS PRESS LO: the landing gear extends by gravity; the BLG is on YELLOW
        fn gear_extension_with_yellow_lost_needs_gravity_extension_for_the_main_gears() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(25.));
            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllUpLocked);

            test_bed = test_bed
                .set_disconnect_engine_edp(3)
                .set_disconnect_engine_edp(4)
                .run_waiting_for(Duration::from_secs_f64(30.));
            assert_lt!(test_bed.yellow_pressure(), Pressure::new::<psi>(1000.));

            test_bed = test_bed
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs_f64(25.));

            // No normal extension of the main gears (the common LGCIU then keeps the nose gear up too)
            assert!(test_bed.get_real_gear_position(GearWheel::LEFT) <= Ratio::new::<ratio>(0.01));
            assert!(test_bed.get_real_gear_position(GearWheel::RIGHT) <= Ratio::new::<ratio>(0.01));

            test_bed = test_bed
                .activate_emergency_gear_extension()
                .run_waiting_for(Duration::from_secs_f64(80.));
            assert!(test_bed.is_all_gears_really_down());
        }

        #[test]
        // Without failure the last gear downlocks 70 s after the L/G GRVTY sw is set DOWN
        fn gravity_extension_takes_about_70_seconds() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(25.));
            assert!(test_bed.is_all_gears_really_up());

            test_bed = test_bed
                .set_green_ed_pump(false)
                .activate_emergency_gear_extension()
                .run_waiting_for(Duration::from_secs_f64(20.));
            // Steps 1 and 2 only: the doors and the gears are still locked up
            assert!(test_bed.is_all_doors_really_up());
            assert!(test_bed.is_all_gears_really_up());

            test_bed = test_bed.run_waiting_for(Duration::from_secs_f64(40.));
            assert!(test_bed.is_all_doors_really_down());
            assert!(!test_bed.is_all_gears_really_down());

            test_bed = test_bed.run_waiting_for(Duration::from_secs_f64(15.));
            assert!(test_bed.is_all_gears_really_down());
        }

        #[test]
        fn complete_gear_cycle_do_not_change_fluid_volume() {
            // The main gear assemblies take half of their fluid from GREEN and half from YELLOW
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs_f64(5.));

            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllDownLocked);
            assert!(test_bed.is_all_auxiliary_gear_door_opened());

            let initial_fluid_quantity =
                test_bed.get_green_reservoir_volume() + test_bed.get_yellow_reservoir_volume();

            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(20.));
            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllUpLocked);
            assert!(test_bed.is_all_doors_really_up());
            assert!(test_bed.is_all_auxiliary_gear_door_closed());

            let uplocked_fluid_quantity =
                test_bed.get_green_reservoir_volume() + test_bed.get_yellow_reservoir_volume();

            assert_gt!(
                initial_fluid_quantity - uplocked_fluid_quantity,
                Volume::new::<gallon>(1.)
            );
            assert_lt!(
                initial_fluid_quantity - uplocked_fluid_quantity,
                Volume::new::<gallon>(2.)
            );

            test_bed = test_bed
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs_f64(20.));
            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllDownLocked);
            assert!(test_bed.is_all_doors_really_up());
            assert!(test_bed.is_all_auxiliary_gear_door_opened());

            let downlocked_fluid_quantity =
                test_bed.get_green_reservoir_volume() + test_bed.get_yellow_reservoir_volume();
            assert!(
                (initial_fluid_quantity - downlocked_fluid_quantity).abs()
                    < Volume::new::<gallon>(0.01)
            );
        }

        #[test]
        fn reverting_emergency_extension_do_not_change_fluid_volume() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs_f64(5.));

            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllDownLocked);
            assert!(test_bed.is_all_auxiliary_gear_door_opened());

            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(20.));
            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllUpLocked);
            assert!(test_bed.is_all_doors_really_up());
            assert!(test_bed.is_all_auxiliary_gear_door_closed());

            let initial_uplocked_fluid_quantity = test_bed.get_green_reservoir_volume();

            test_bed = test_bed
                .set_gear_lever_down()
                .activate_emergency_gear_extension()
                .run_waiting_for(Duration::from_secs_f64(80.));
            assert!(test_bed.is_all_gears_really_down());
            assert!(test_bed.is_all_doors_really_down());

            test_bed = test_bed
                .stow_emergency_gear_extension()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(20.));
            assert!(test_bed.is_all_gears_really_up());
            assert!(test_bed.is_all_doors_really_up());

            let final_uplocked_fluid_quantity = test_bed.get_green_reservoir_volume();

            assert!(
                (initial_uplocked_fluid_quantity - final_uplocked_fluid_quantity).abs()
                    < Volume::new::<gallon>(0.01)
            );
        }

        #[test]
        fn gear_init_up_if_spawning_in_air() {
            let mut test_bed = test_bed_in_flight_with()
                .set_cold_dark_inputs()
                .in_flight()
                .run_one_tick();

            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllUpLocked);
            assert!(test_bed.is_all_auxiliary_gear_door_closed());
        }

        #[test]
        fn brakes_on_ground_work_after_emergency_extension() {
            let mut test_bed = test_bed_in_flight_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(1.));

            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllUpLocked);

            test_bed = test_bed
                .activate_emergency_gear_extension()
                .run_waiting_for(Duration::from_secs_f64(80.));
            assert!(test_bed.is_all_gears_really_down());
            assert!(test_bed.is_all_doors_really_down());

            test_bed = test_bed
                .on_the_ground_after_touchdown()
                .set_left_brake(Ratio::new::<ratio>(1.))
                .set_right_brake(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(2.));

            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(500.)
            );
            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(500.)
            );
        }

        fn test_bed_on_ground_with_all_engines_running() -> A380HydraulicsTestBed {
            test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick()
                .start_eng1(Ratio::new::<percent>(80.))
                .start_eng2(Ratio::new::<percent>(80.))
                .start_eng3(Ratio::new::<percent>(80.))
                .start_eng4(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(30))
        }

        #[test]
        fn brakes_norm_circuit_leak_drains_green_fluid_only() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            assert!(test_bed.is_green_pressure_switch_pressurised());

            let green_level_before = test_bed.get_green_reservoir_volume();
            let yellow_level_before = test_bed.get_yellow_reservoir_volume();

            test_bed.fail(FailureType::BrakeHydraulicLeak(HydraulicColor::Green));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(10));

            // The leak flows 0.1 gal/s out of the pressurised circuit
            assert_gt!(
                green_level_before - test_bed.get_green_reservoir_volume(),
                Volume::new::<gallon>(0.5)
            );
            assert_lt!(
                (yellow_level_before - test_bed.get_yellow_reservoir_volume()).abs(),
                Volume::new::<gallon>(0.1)
            );
        }

        #[test]
        fn brakes_altn_circuit_leak_drains_yellow_fluid_only() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            let green_level_before = test_bed.get_green_reservoir_volume();
            let yellow_level_before = test_bed.get_yellow_reservoir_volume();

            test_bed.fail(FailureType::BrakeHydraulicLeak(HydraulicColor::Yellow));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(10));

            assert_gt!(
                yellow_level_before - test_bed.get_yellow_reservoir_volume(),
                Volume::new::<gallon>(0.5)
            );
            assert_lt!(
                (green_level_before - test_bed.get_green_reservoir_volume()).abs(),
                Volume::new::<gallon>(0.1)
            );
        }

        #[test]
        fn brakes_altn_accumulator_gas_leak_drops_the_stored_brake_pressure() {
            // Charge the ALTN brake accumulator, then stop the engines so that only the accumulator holds pressure
            let charged_and_isolated = || {
                test_bed_on_ground_with_all_engines_running()
                    .engines_off()
                    .run_waiting_for(Duration::from_secs(30))
            };

            let mut test_bed_without_failure = charged_and_isolated();
            let mut test_bed_with_failure = charged_and_isolated();
            assert!(!test_bed_with_failure.is_yellow_pressure_switch_pressurised());
            assert_gt!(
                test_bed_with_failure.get_brake_yellow_accumulator_fluid_volume(),
                Volume::new::<gallon>(0.01)
            );

            test_bed_with_failure.fail(FailureType::BrakeAccumulatorGasLeak);
            test_bed_without_failure =
                test_bed_without_failure.run_waiting_for(Duration::from_secs(30));
            test_bed_with_failure = test_bed_with_failure.run_waiting_for(Duration::from_secs(30));

            let stored_pressure = test_bed_without_failure.get_brake_yellow_accumulator_pressure();
            assert_gt!(stored_pressure, Pressure::new::<psi>(1500.));
            assert_lt!(
                test_bed_with_failure.get_brake_yellow_accumulator_pressure(),
                stored_pressure / 2.
            );
        }

        /// Full pedal braking for 2 s, park brake off
        fn press_both_brake_pedals(test_bed: A380HydraulicsTestBed) -> A380HydraulicsTestBed {
            test_bed
                .set_park_brake(false)
                .set_left_brake(Ratio::new::<percent>(100.))
                .set_right_brake(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(2))
        }

        fn pedal_braking_mode(test_bed: &mut A380HydraulicsTestBed) -> f64 {
            test_bed.read_by_name("BRAKES_PEDAL_BRAKING_MODE")
        }

        fn nose_wheel_steering_mode(test_bed: &mut A380HydraulicsTestBed) -> f64 {
            test_bed.read_by_name("STEERING_NWS_MODE")
        }

        fn read_bool(test_bed: &mut A380HydraulicsTestBed, name: &str) -> bool {
            test_bed.read_by_name(name)
        }

        #[test]
        // BRAKES NORM BRK FAULT: the pedals brake through the alternate circuit with A-SKID, at full pressure
        fn normal_braking_fault_brakes_on_the_alternate_circuit() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakeNormalBraking);
            test_bed = press_both_brake_pedals(test_bed);

            assert!(read_bool(&mut test_bed, "BRAKES_NORM_BRK_FAULT"));
            assert_eq!(pedal_braking_mode(&mut test_bed), 2.);
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_gt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(2000.)
            );
            assert_gt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(2000.)
            );
        }

        #[test]
        // The EBCU takes over when the normal and the alternate braking fail: no A-SKID, limited pressure; before the
        // take-off the take-off brake law, 1 700 psi
        fn normal_and_alternate_braking_faults_leave_emergency_braking() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakeNormalBraking);
            test_bed.fail(FailureType::BrakeAlternateBraking);
            test_bed = press_both_brake_pedals(test_bed);

            assert_eq!(pedal_braking_mode(&mut test_bed), 3.);
            assert_gt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(1500.)
            );
            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(1800.)
            );
        }

        #[test]
        // Emergency braking is limited to 1 000 psi at landing (landing brake law), and the PARK BRK handle ON reverts
        // to the take-off brake law (1 700 psi)
        fn emergency_braking_uses_landing_law_after_a_flight_until_park_brake_on() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakeNormalBraking);
            test_bed.fail(FailureType::BrakeAlternateBraking);

            test_bed = test_bed
                .in_flight()
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs(5));
            test_bed = test_bed
                .on_the_ground_after_touchdown()
                .run_waiting_for(Duration::from_secs(2));
            test_bed = press_both_brake_pedals(test_bed);

            assert_eq!(pedal_braking_mode(&mut test_bed), 3.);
            assert_gt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(850.)
            );
            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(1100.)
            );

            test_bed = test_bed
                .set_left_brake(Ratio::new::<percent>(0.))
                .set_right_brake(Ratio::new::<percent>(0.))
                .set_park_brake(true)
                .run_waiting_for(Duration::from_secs(3));
            test_bed = press_both_brake_pedals(test_bed);

            assert_gt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(1500.)
            );
            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(1800.)
            );
        }

        #[test]
        // BRAKES PEDAL BRAKING FAULT: no pedal braking, the PARK BRK handle still brakes
        fn all_braking_modes_failed_leave_only_the_parking_brake() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakeNormalBraking);
            test_bed.fail(FailureType::BrakeAlternateBraking);
            test_bed.fail(FailureType::BrakeEmergencyBraking);
            test_bed = press_both_brake_pedals(test_bed);

            assert_eq!(pedal_braking_mode(&mut test_bed), 0.);
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );

            test_bed = test_bed
                .set_park_brake(true)
                .run_waiting_for(Duration::from_secs(3));
            assert_gt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(1500.)
            );
        }

        #[test]
        // BRAKES ALTN BRK FAULT and EMER BRK FAULT keep the normal braking
        fn alternate_and_emergency_braking_faults_keep_normal_braking() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakeAlternateBraking);
            test_bed.fail(FailureType::BrakeEmergencyBraking);
            test_bed = press_both_brake_pedals(test_bed);

            assert!(read_bool(&mut test_bed, "BRAKES_ALTN_BRK_FAULT"));
            assert!(read_bool(&mut test_bed, "BRAKES_EMER_BRK_FAULT"));
            assert_eq!(pedal_braking_mode(&mut test_bed), 1.);
            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(2000.)
            );
        }

        fn braking_force(test_bed: &mut A380HydraulicsTestBed, left_side: bool) -> f64 {
            test_bed.read_by_name(if left_side {
                "BRAKE LEFT FORCE FACTOR"
            } else {
                "BRAKE RIGHT FORCE FACTOR"
            })
        }

        fn read_by_name_f64(test_bed: &mut A380HydraulicsTestBed, name: &str) -> f64 {
            test_bed.read_by_name(name)
        }

        #[test]
        // BRAKES CTL 1(2) FAULT: one BCS failed keeps the normal braking
        fn one_bcs_failed_keeps_normal_braking() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakingControlSystem(2));
            test_bed = press_both_brake_pedals(test_bed);

            assert!(!read_bool(&mut test_bed, "BRAKES_CTL_1_FAULT"));
            assert!(read_bool(&mut test_bed, "BRAKES_CTL_2_FAULT"));
            assert_eq!(pedal_braking_mode(&mut test_bed), 1.);
        }

        #[test]
        // BRAKES A-SKID FAULT ON ALL L/G: BCS 1 and BCS 2 failed leave the emergency braking (EBCU)
        fn both_bcs_failed_leave_emergency_braking() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakingControlSystem(1));
            test_bed.fail(FailureType::BrakingControlSystem(2));
            test_bed = press_both_brake_pedals(test_bed);

            assert_eq!(pedal_braking_mode(&mut test_bed), 3.);
            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(1800.)
            );
        }

        #[test]
        // The anti-skid lost on every gear group (both channels of the three RDCs) is the emergency braking too
        fn anti_skid_lost_on_every_gear_group_leaves_emergency_braking() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            for rdc in 1..=3 {
                for channel in 1..=2 {
                    test_bed.fail(FailureType::BrakeRemoteDataConcentratorChannel(
                        rdc, channel,
                    ));
                }
            }
            test_bed = press_both_brake_pedals(test_bed);

            assert_eq!(
                read_by_name_f64(&mut test_bed, "BRAKES_RDC_CHANNEL_FAULTS"),
                63.
            );
            assert_eq!(pedal_braking_mode(&mut test_bed), 3.);
        }

        #[test]
        // BRAKES A-SKID FAULT ON RIGHT BODY L/G: RDC 2 without both channels, the right body gear brakes in emergency
        // braking (EBCU pressure law) while the other gears keep the normal braking
        fn right_body_gear_without_anti_skid_brakes_less_on_the_right() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakeRemoteDataConcentratorChannel(2, 1));
            test_bed.fail(FailureType::BrakeRemoteDataConcentratorChannel(2, 2));
            test_bed = press_both_brake_pedals(test_bed);

            assert_eq!(
                read_by_name_f64(&mut test_bed, "BRAKES_RDC_CHANNEL_FAULTS"),
                12.
            );
            assert_eq!(pedal_braking_mode(&mut test_bed), 1.);
            let left_force = braking_force(&mut test_bed, true);
            let right_force = braking_force(&mut test_bed, false);
            assert_gt!(left_force, 0.8);
            assert_lt!(right_force, left_force * 0.92);
            assert_gt!(right_force, left_force * 0.7);
        }

        #[test]
        // BRAKES SYS REDUNDANCY LOST: one RDC channel failed keeps the anti-skid of its gear group
        fn one_rdc_channel_failed_keeps_full_braking() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakeRemoteDataConcentratorChannel(1, 1));
            test_bed = press_both_brake_pedals(test_bed);

            assert_eq!(
                read_by_name_f64(&mut test_bed, "BRAKES_RDC_CHANNEL_FAULTS"),
                1.
            );
            assert_gt!(braking_force(&mut test_bed, true), 0.8);
            assert_eq!(
                braking_force(&mut test_bed, true),
                braking_force(&mut test_bed, false)
            );
        }

        #[test]
        // BRAKES RELEASED: the wheel tachometer of brakes 1/2 failed, the BCS releases the pair (left wing gear)
        fn failed_tachometer_releases_its_brake_pair() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakePairTachometer(1));
            test_bed = press_both_brake_pedals(test_bed);

            assert_eq!(read_by_name_f64(&mut test_bed, "BRAKES_RELEASED_PAIRS"), 1.);
            let left_force = braking_force(&mut test_bed, true);
            let right_force = braking_force(&mut test_bed, false);
            assert_gt!(right_force, 0.8);
            assert_lt!(left_force, right_force * 0.8);
        }

        #[test]
        // On a gear group without anti-skid the EBCU brakes the pair of the failed tachometer: no BRAKES RELEASED
        fn failed_tachometer_does_not_release_a_pair_braked_by_the_ebcu() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BrakePairTachometer(1));
            test_bed.fail(FailureType::BrakeRemoteDataConcentratorChannel(1, 1));
            test_bed.fail(FailureType::BrakeRemoteDataConcentratorChannel(1, 2));
            test_bed = press_both_brake_pedals(test_bed);

            assert_eq!(read_by_name_f64(&mut test_bed, "BRAKES_RELEASED_PAIRS"), 0.);
            assert_eq!(
                braking_force(&mut test_bed, true),
                braking_force(&mut test_bed, false)
            );
        }

        #[test]
        // BRAKES RESIDUAL BRAKING: the normal servo valve of brakes 3/4 (right wing gear) leaks without a braking
        // command
        fn leaking_servo_valve_keeps_a_residual_braking_on_its_pair() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running()
                .set_park_brake(false)
                .run_waiting_for(Duration::from_secs(2));
            // Depending on the frame times, a little park brake pressure can stay on both sides after the release
            let left_force_before_leak = braking_force(&mut test_bed, true);
            test_bed.fail(FailureType::BrakePairServoValveLeak(2));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(2));

            assert_eq!(read_by_name_f64(&mut test_bed, "BRAKES_RESIDUAL_PAIRS"), 2.);
            let left_force = braking_force(&mut test_bed, true);
            assert_lt!((left_force - left_force_before_leak).abs(), 0.001);
            assert_gt!(braking_force(&mut test_bed, false) - left_force, 0.05);
        }

        #[test]
        // The park brake applies about 3 600 PSI on the BLG brakes with the accumulators normally filled, the full
        // pressure of the ultimate braking
        fn park_brake_applies_about_3600_psi() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running()
                .set_park_brake(false)
                .run_waiting_for(Duration::from_secs(2));
            assert_lt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(50.)
            );

            test_bed = test_bed.set_park_brake(true).run_until(
                10,
                "park brake pressure built up",
                |bed| bed.get_brake_left_yellow_pressure() > Pressure::new::<psi>(3000.),
            );

            for pressure in [
                test_bed.get_brake_left_yellow_pressure(),
                test_bed.get_brake_right_yellow_pressure(),
            ] {
                assert_gt!(pressure, Pressure::new::<psi>(3500.));
                assert_lt!(pressure, Pressure::new::<psi>(3650.));
            }
        }

        #[test]
        // Full pedal deflection gives the full brake pressure, about 3 600 psi, in normal braking as in alternate
        // braking (the A320 value was 2 538 psi).
        fn full_pedal_normal_braking_applies_about_3600_psi() {
            let mut test_bed =
                press_both_brake_pedals(test_bed_on_ground_with_all_engines_running());

            assert_eq!(pedal_braking_mode(&mut test_bed), 1.);
            for pressure in [
                test_bed.get_brake_left_green_pressure(),
                test_bed.get_brake_right_green_pressure(),
            ] {
                assert_gt!(pressure, Pressure::new::<psi>(3500.));
                assert_lt!(pressure, Pressure::new::<psi>(3650.));
            }
        }

        #[test]
        // The full brake force at the full brake pressure (3 600 psi), a quarter of the pressure gives half the force
        fn brake_force_follows_the_square_root_of_the_full_brake_pressure_ratio() {
            assert_eq!(
                A380BrakingForce::force_from_pressure(Pressure::new::<psi>(3600.)),
                1.
            );
            assert_eq!(
                A380BrakingForce::force_from_pressure(Pressure::new::<psi>(900.)),
                0.5
            );
            assert_eq!(
                A380BrakingForce::force_from_pressure(Pressure::new::<psi>(-10.)),
                0.
            );
        }

        #[test]
        // The triple pressure indicator: green arc 4 872-5 000 psi, amber arc 0-3 840 psi (reinflate the accumulators
        // before towing). One park brake application from a charged accumulator, with no hydraulic pressure, reaches
        // the full pressure (about 3 600 psi) and leaves the accumulator out of the amber arc.
        fn one_park_brake_application_on_a_charged_accumulator_stays_out_of_the_amber_arc() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running()
                .set_park_brake(false)
                .run_waiting_for(Duration::from_secs(2))
                .engines_off()
                .run_waiting_for(Duration::from_secs(30));
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_gt!(
                test_bed.get_brake_yellow_accumulator_pressure(),
                Pressure::new::<psi>(4872.)
            );

            test_bed = test_bed
                .set_park_brake(true)
                .run_waiting_for(Duration::from_secs(5));

            assert_gt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(3500.)
            );
            assert_gt!(
                test_bed.get_brake_yellow_accumulator_pressure(),
                Pressure::new::<psi>(3840.)
            );
        }

        #[test]
        // The pedals still brake on the normal circuit with the park brake on, without PARK BRK OFF: on each gear the
        // highest commanded pressure applies (the A320 model only used it below 507 psi of park brake pressure).
        fn pedals_brake_on_the_normal_circuit_with_the_park_brake_on() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running()
                .set_park_brake(true)
                .run_waiting_for(Duration::from_secs(3));
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );

            test_bed = test_bed
                .set_left_brake(Ratio::new::<percent>(100.))
                .set_right_brake(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(2));

            assert_gt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(3500.)
            );
            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(3500.)
            );
            assert_gt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(3500.)
            );
        }

        /// In flight, gear lever down: the landing gear is extended for the landing
        fn in_flight_gear_down() -> A380HydraulicsTestBed {
            test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(10))
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs(1))
        }

        #[rstest]
        #[case::normal_braking(true)]
        #[case::emergency_braking_a_skid_off(false)]
        // Manual braking is only available on the ground: no pedal braking in flight with the gear down, in normal
        // braking and in emergency braking (A-SKID sw OFF)
        fn pedals_do_not_brake_in_flight_with_the_gear_down(#[case] anti_skid_on: bool) {
            let mut test_bed = in_flight_gear_down()
                .set_anti_skid(anti_skid_on)
                .set_left_brake(Ratio::new::<percent>(100.))
                .set_right_brake(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(2));

            for pressure in [
                test_bed.get_brake_left_green_pressure(),
                test_bed.get_brake_right_green_pressure(),
                test_bed.get_brake_left_yellow_pressure(),
                test_bed.get_brake_right_yellow_pressure(),
            ] {
                assert_lt!(pressure, Pressure::new::<psi>(50.));
            }
        }

        #[test]
        // Manual braking comes back on the ground (touchdown)
        fn pedals_brake_again_after_touchdown() {
            let mut test_bed = in_flight_gear_down()
                .set_left_brake(Ratio::new::<percent>(100.))
                .set_right_brake(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(1))
                .on_the_ground_after_touchdown()
                .run_until(5, "normal brakes pressurised after touchdown", |bed| {
                    bed.get_brake_left_green_pressure() > Pressure::new::<psi>(3000.)
                });

            assert_gt!(
                test_bed.get_brake_right_green_pressure(),
                Pressure::new::<psi>(3000.)
            );
        }

        #[test]
        // The AUTO BRK needs A-SKID, which alternate braking keeps: it arms in alternate braking (BRAKES NORM BRK
        // FAULT)
        fn autobrake_arms_in_alternate_braking() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(12));
            test_bed.fail(FailureType::BrakeNormalBraking);
            test_bed = test_bed.run_waiting_for(Duration::from_secs(1));
            assert_eq!(pedal_braking_mode(&mut test_bed), 2.);

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);
        }

        #[test]
        // A partial A-SKID fault (the wing gears without anti-skid) makes the AUTO BRK inoperative
        fn autobrake_does_not_arm_with_a_gear_group_without_anti_skid() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(12));
            test_bed.fail(FailureType::BrakeRemoteDataConcentratorChannel(1, 1));
            test_bed.fail(FailureType::BrakeRemoteDataConcentratorChannel(1, 2));
            test_bed = test_bed.run_waiting_for(Duration::from_secs(1));
            assert_eq!(pedal_braking_mode(&mut test_bed), 1.);

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
        }

        #[test]
        // Alternate braking keeps A-SKID and AUTO BRK: the autobrake brakes on the alternate circuit when the normal
        // braking is lost
        fn autobrake_brakes_on_the_alternate_circuit_in_alternate_braking() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .on_the_ground()
                .set_park_brake(false)
                .start_eng1(Ratio::new::<percent>(100.))
                .start_eng2(Ratio::new::<percent>(100.))
                .start_eng3(Ratio::new::<percent>(100.))
                .start_eng4(Ratio::new::<percent>(100.))
                .run_waiting_for(Duration::from_secs(10));
            test_bed.fail(FailureType::BrakeNormalBraking);

            test_bed = test_bed
                .set_autobrake_rto()
                .run_waiting_for(Duration::from_secs(1));
            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(100.))
                .set_deploy_ground_spoilers()
                .run_waiting_for(Duration::from_secs(6));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::RTO);
            assert_lt!(
                test_bed.get_brake_left_green_pressure(),
                Pressure::new::<psi>(50.)
            );
            assert_gt!(
                test_bed.get_brake_left_yellow_pressure(),
                Pressure::new::<psi>(1000.)
            );
            assert_gt!(
                test_bed.get_brake_right_yellow_pressure(),
                Pressure::new::<psi>(1000.)
            );
        }

        #[rstest]
        #[case::prims_1_and_2_lost(1, 2)]
        #[case::prims_2_and_3_lost(2, 3)]
        // The basic AUTO BRK needs two PRIMs: they give it the ground spoiler extension command
        fn autobrake_does_not_arm_with_less_than_two_prims(
            #[case] first_lost_prim: usize,
            #[case] second_lost_prim: usize,
        ) {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(12))
                .set_prim_healthy(first_lost_prim, false)
                .set_prim_healthy(second_lost_prim, false)
                .run_waiting_for(Duration::from_secs(1));

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::DISARM);
        }

        #[test]
        // Two PRIMs are enough
        fn autobrake_arms_with_one_prim_lost() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(12))
                .set_prim_healthy(3, false)
                .run_waiting_for(Duration::from_secs(1));

            test_bed = test_bed
                .set_autobrake_l3()
                .run_waiting_for(Duration::from_secs(1));

            assert_eq!(test_bed.autobrake_mode(), A380AutobrakeMode::L3);
        }

        #[test]
        // GREEN supplies the normal NWS. With the engines 1 and 2 only, YELLOW is not pressurised and the nose wheels
        // steer on GREEN.
        fn nose_steering_steers_on_green_with_engines_1_and_2_only() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_yellow_e_pump_a(false)
                .start_eng1(Ratio::new::<percent>(80.))
                .start_eng2(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(10));
            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(5.));

            assert_eq!(nose_wheel_steering_mode(&mut test_bed), 1.);
            assert_ge!(test_bed.nose_steering_position().get::<degree>(), 40.);
        }

        #[test]
        // Without GREEN the alternate NWS takes over at once, at 10 degrees per second at most
        fn nose_steering_reverts_to_alternate_at_10_deg_per_s_without_green() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng3(Ratio::new::<percent>(80.))
                .start_eng4(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(10));
            assert!(!test_bed.is_green_pressure_switch_pressurised());

            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(1.));
            assert_eq!(nose_wheel_steering_mode(&mut test_bed), 2.);
            let after_one_second = test_bed.nose_steering_position().get::<degree>();
            assert_gt!(after_one_second, 5.);
            assert_lt!(after_one_second, 10.5);

            test_bed = test_bed.run_waiting_for(Duration::from_secs_f64(8.));
            assert_ge!(test_bed.nose_steering_position().get::<degree>(), 40.);
        }

        #[test]
        // STEER NORM N/W STEER FAULT: the alternate nose wheel steering is still available
        fn normal_nws_fault_reverts_to_alternate_nws() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::NoseWheelSteeringNormal);
            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(10.));

            assert!(read_bool(&mut test_bed, "STEERING_NORM_NWS_FAULT"));
            assert_eq!(nose_wheel_steering_mode(&mut test_bed), 2.);
            assert_ge!(test_bed.nose_steering_position().get::<degree>(), 40.);
        }

        #[test]
        // STEER N/W STEER FAULT: both NWS modes are failed and the nose landing gear casters
        fn nose_wheels_do_not_steer_with_both_nws_modes_failed() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::NoseWheelSteeringNormal);
            test_bed.fail(FailureType::NoseWheelSteeringAlternate);
            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(5.));

            assert_eq!(nose_wheel_steering_mode(&mut test_bed), 0.);
            assert_lt!(test_bed.nose_steering_position().get::<degree>().abs(), 1.);
        }

        #[test]
        // STEER CTL 1(2) FAULT: the NWS and the BWS are still available; N/W + B/W STEER FAULT: both SCS failed
        fn one_steering_control_system_is_enough_both_failed_lose_the_steering() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::SteeringControlSystem(1));
            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(5.));
            assert!(read_bool(&mut test_bed, "STEERING_SCS_1_FAULT"));
            assert_eq!(nose_wheel_steering_mode(&mut test_bed), 1.);
            assert_ge!(test_bed.nose_steering_position().get::<degree>(), 40.);

            test_bed.fail(FailureType::SteeringControlSystem(2));
            test_bed = test_bed
                .set_tiller_demand(Ratio::new::<ratio>(0.))
                .run_waiting_for(Duration::from_secs_f64(1.))
                .set_tiller_demand(Ratio::new::<ratio>(-1.))
                .run_waiting_for(Duration::from_secs_f64(5.));
            assert_eq!(nose_wheel_steering_mode(&mut test_bed), 0.);
            assert_gt!(test_bed.nose_steering_position().get::<degree>(), 0.);
        }

        #[test]
        // STEER B/W STEER FAULT: the body wheel steering is failed centred and locked
        fn body_wheel_steering_fault_keeps_the_body_wheels_centred() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::BodyWheelSteering);
            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(5.))
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs_f64(10.));

            assert!(read_bool(&mut test_bed, "STEERING_BWS_FAULT"));
            assert_ge!(test_bed.nose_steering_position().get::<degree>(), 40.);
            assert!(!read_bool(&mut test_bed, "STEERING_BWS_NOT_LOCKED"));
            assert_lt!(
                test_bed
                    .get_left_body_steering_steering_ratio()
                    .get::<ratio>()
                    .abs(),
                0.01
            );
            assert_lt!(
                test_bed
                    .get_right_body_steering_steering_ratio()
                    .get::<ratio>()
                    .abs(),
                0.01
            );
        }

        #[test]
        // STEER PEDAL STEER CTL FAULT: the rudder pedals no longer steer, the tillers still do
        fn pedal_steering_control_fault_leaves_only_the_tillers() {
            let mut test_bed = test_bed_on_ground_with_all_engines_running();
            test_bed.fail(FailureType::PedalSteeringControl);
            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(15.))
                .set_rudder_input(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs(10));

            assert!(read_bool(&mut test_bed, "STEERING_PEDAL_CTL_FAULT"));
            assert_lt!(test_bed.nose_steering_position().get::<degree>().abs(), 0.5);

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(5.))
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs(10));
            assert_ge!(test_bed.nose_steering_position().get::<degree>(), 40.);
        }

        #[rstest]
        #[case::body_wheel_steering_lock(
            FailureType::BodyWheelSteeringLock(1),
            "STEERING_BWS_NOT_LOCKED"
        )]
        #[case::uplock_closed(FailureType::GearUplockClosed(2), "LG_UPLOCK_FAULT")]
        #[case::bogie_position(FailureType::GearBogiePosition, "LG_BOGIE_POSITION_FAULT")]
        // A gear out of its retraction configuration does not retract: L/G RETRACTION FAULT, and the LGCIS stay
        // healthy (no L/G CTL FAULT after the 30 s gear transit time)
        fn gears_out_of_retraction_configuration_stay_down(
            #[case] failure: FailureType,
            #[case] fault_variable: &str,
        ) {
            let mut test_bed = in_flight_gear_down().run_waiting_for(Duration::from_secs(20));
            assert!(test_bed.is_all_gears_really_down());

            test_bed.fail(failure);
            test_bed = test_bed.run_one_tick();
            assert!(read_bool(&mut test_bed, fault_variable));

            // The LGCIS never take the lever UP: the doors do not even start to open
            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(3));
            assert!(test_bed.is_all_doors_really_up());

            test_bed = test_bed.run_waiting_for(Duration::from_secs(37));
            assert!(test_bed.is_all_gears_really_down());
            assert!(read_bool(&mut test_bed, "LG_RETRACTION_FAULT"));
            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllDownLocked);
        }

        #[test]
        // L/G RETRACTION FAULT stays with the lever down again; a lever recycle in the retraction configuration
        // retracts the gears and clears it
        fn gears_retract_after_a_lever_recycle_once_back_in_retraction_configuration() {
            let mut test_bed = in_flight_gear_down().run_waiting_for(Duration::from_secs(20));
            test_bed.fail(FailureType::BodyWheelSteeringLock(2));
            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(5))
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs(5));
            assert!(read_bool(&mut test_bed, "LG_RETRACTION_FAULT"));

            test_bed.unfail(FailureType::BodyWheelSteeringLock(2));
            test_bed = test_bed
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs(30));
            assert!(test_bed.is_all_gears_really_up());
            assert!(!read_bool(&mut test_bed, "LG_RETRACTION_FAULT"));
        }

        #[test]
        // L/G GRVTY EXTN FAULT: the LGERS failed its test, the L/G GRVTY sw releases no uplock
        fn failed_gravity_extension_does_not_extend_the_gears() {
            let mut test_bed = test_bed_on_ground_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(25.));
            assert!(test_bed.is_all_gears_really_up());

            test_bed.fail(FailureType::GearGravityExtension);
            test_bed = test_bed
                .set_green_ed_pump(false)
                .activate_emergency_gear_extension()
                .run_waiting_for(Duration::from_secs_f64(80.));

            assert!(read_bool(&mut test_bed, "LG_GRVTY_EXTN_FAULT"));
            assert!(test_bed.is_all_doors_really_up());
            assert!(test_bed.is_all_gears_really_up());
        }

        #[test]
        // STEER N/W STEER ANGLE LIMIT EXCEEDED: a tow turns the nose wheels beyond 73.5 degrees
        fn towing_beyond_the_nose_wheel_angle_limit_is_detected() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(0.5))
                .run_waiting_for(Duration::from_secs(5));
            assert_lt!(
                test_bed.nose_steering_position().get::<degree>().abs(),
                73.5
            );
            assert!(!read_bool(
                &mut test_bed,
                "STEERING_NWS_ANGLE_LIMIT_EXCEEDED"
            ));

            test_bed = test_bed
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(10.))
                .run_waiting_for(Duration::from_secs(5));
            assert_gt!(
                test_bed.nose_steering_position().get::<degree>().abs(),
                73.5
            );
            assert!(read_bool(
                &mut test_bed,
                "STEERING_NWS_ANGLE_LIMIT_EXCEEDED"
            ));
        }

        // The green electric pumps, the only power of the cargo door actuation, are inhibited as soon as engine 1 or 2
        // runs; an inhibited door is isolated from the hydraulics and cannot be opened.
        #[test]
        fn cargo_door_operation_is_inhibited_with_an_engine_running() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(1));

            assert!(!test_bed.is_cargo_door_operation_inhibited());

            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(10));

            assert!(test_bed.is_cargo_door_operation_inhibited());
        }

        #[test]
        fn cargo_door_stays_locked_when_opened_with_an_engine_running() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs(30));

            assert!(test_bed.is_cargo_fwd_door_locked_down());
            assert_eq!(test_bed.cargo_fwd_door_position(), 0.);
        }

        #[test]
        fn cargo_door_opens_once_the_engines_are_stopped_if_still_requested() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs(10));

            assert!(test_bed.is_cargo_fwd_door_locked_down());

            // The inhibition ends only once the engine has spooled down, then the crew delay before hydraulic
            // control is random (normal, 5 s mean, HydraulicDoorController): 60 s covers the slowest draws
            // (with 40 s the door was at 75-84 % in 5 of 20 runs).
            test_bed = test_bed
                .stop_eng1()
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs(60));

            assert!(!test_bed.is_cargo_door_operation_inhibited());
            // FWD_DOOR_CARGO_POSITION is in percent
            assert_gt!(test_bed.cargo_fwd_door_position(), 85.);
        }

        #[test]
        fn cargo_door_holds_its_position_when_an_engine_starts_while_it_moves() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed.open_fwd_cargo_door().run_waiting_for(
                HydraulicDoorController::DELAY_UNLOCK_TO_HYDRAULIC_CONTROL + Duration::from_secs(8),
            );

            // FWD_DOOR_CARGO_POSITION is in percent
            let position_when_engine_starts = test_bed.cargo_fwd_door_position();
            assert_lt!(position_when_engine_starts, 85.);
            assert_gt!(position_when_engine_starts, 2.);

            test_bed = test_bed
                .start_eng1(Ratio::new::<percent>(80.))
                .close_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs(30));

            assert!(!test_bed.is_cargo_fwd_door_locked_down());
            assert_lt!(
                (test_bed.cargo_fwd_door_position() - position_when_engine_starts).abs(),
                2.
            );
        }

        #[test]
        fn green_epump_buildup_auxiliary_section_when_cargo_doors() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            // Waiting for 5s pressure should be at 3000 psi
            test_bed = test_bed.open_fwd_cargo_door().run_waiting_for(
                HydraulicDoorController::DELAY_UNLOCK_TO_HYDRAULIC_CONTROL + Duration::from_secs(5),
            );

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs(5));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_le!(test_bed.green_pressure(), Pressure::new::<psi>(1500.));
            assert_gt!(
                test_bed.green_pressure_auxiliary(),
                Pressure::new::<psi>(2800.)
            );
        }

        /// The yellow electric pumps start automatically when the BWS is required for pushback or towing, and then
        /// pressurize the BWS only.
        #[test]
        fn yellow_epump_buildup_only_bws_section_when_pushback_turns_nose_more_than_20_degrees() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(5.))
                .run_waiting_for(Duration::from_secs(6));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_le!(test_bed.green_pressure(), Pressure::new::<psi>(50.));
            assert_le!(
                test_bed.green_pressure_auxiliary(),
                Pressure::new::<psi>(50.)
            );

            assert!(
                test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising()
                    || a.is_yellow_b_epump_controller_pressurising())
            );
            assert_ge!(
                test_bed.yellow_pressure_auxiliary(),
                Pressure::new::<psi>(2500.)
            );
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_le!(test_bed.yellow_pressure(), Pressure::new::<psi>(500.));
        }

        #[test]
        fn gears_do_not_deploy_with_all_lgciu_failed() {
            let mut test_bed = test_bed_in_flight_with()
                .set_cold_dark_inputs()
                .in_flight()
                .set_gear_lever_up()
                .run_waiting_for(Duration::from_secs_f64(1.));

            assert_eq!(test_bed.gear_system_state(), GearSystemState::AllUpLocked);

            test_bed.fail(FailureType::LgciuPowerSupply(LgciuId::Lgciu1));
            test_bed.fail(FailureType::LgciuPowerSupply(LgciuId::Lgciu2));

            test_bed = test_bed.run_waiting_for(Duration::from_secs_f64(5.));
            assert!(test_bed.is_all_gears_really_up());
            assert!(test_bed.is_all_doors_really_up());

            test_bed = test_bed
                .set_gear_lever_down()
                .run_waiting_for(Duration::from_secs_f64(5.));

            assert!(test_bed.is_all_gears_really_up());
            assert!(test_bed.is_all_doors_really_up());
        }

        #[test]
        fn green_auxiliary_pump_can_buildup_auxiliary_section_when_cargo_doors_but_no_ac() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .ac_bus_1_lost()
                .ac_bus_2_lost()
                .ac_bus_3_lost()
                .ac_bus_4_lost()
                .run_one_tick();

            // Waiting for 5s pressure should not rise due to no pump avail
            test_bed = test_bed.open_fwd_cargo_door().run_waiting_for(
                HydraulicDoorController::DELAY_UNLOCK_TO_HYDRAULIC_CONTROL + Duration::from_secs(5),
            );

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs(160));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_le!(test_bed.green_pressure(), Pressure::new::<psi>(1500.));
            assert_gt!(
                test_bed.green_pressure_auxiliary(),
                Pressure::new::<psi>(500.)
            );

            assert!(test_bed.is_cargo_fwd_door_locked_up());
        }

        #[test]
        fn green_epumps_can_buildup_auxiliary_section_when_cargo_doors_and_ac_available() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .ac_ground_service_lost()
                .run_one_tick();

            // Waiting for 5s pressure should not rise due to no pump avail
            test_bed = test_bed
                .open_fwd_cargo_door()
                .open_aft_cargo_door()
                .run_waiting_for(
                    HydraulicDoorController::DELAY_UNLOCK_TO_HYDRAULIC_CONTROL
                        + Duration::from_secs(5),
                );

            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs(50));

            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert_le!(test_bed.green_pressure(), Pressure::new::<psi>(1500.));
            assert_gt!(
                test_bed.green_pressure_auxiliary(),
                Pressure::new::<psi>(500.)
            );

            assert!(test_bed.is_cargo_fwd_door_locked_up());
            assert!(test_bed.is_cargo_aft_door_locked_up());
        }

        #[test]
        fn pushback_steering_full_left_turns_body_steering() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(5.))
                .run_waiting_for(Duration::from_secs(15));

            // Left BWS should be at max right steer (15°) for left turn
            assert!(
                test_bed
                    .get_left_body_steering_steering_ratio()
                    .get::<ratio>()
                    >= 0.97
            );

            // Right BWS should be at (11°) right steer for left turn
            let expected_right_angle = 11. / 15.;
            assert!(
                test_bed
                    .get_right_body_steering_steering_ratio()
                    .get::<ratio>()
                    < 0.9
            );
            assert!(
                test_bed
                    .get_right_body_steering_steering_ratio()
                    .get::<ratio>()
                    > expected_right_angle - 0.05
            );
        }

        #[test]
        fn pushback_steering_full_right_turns_body_steering() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(-5.))
                .run_waiting_for(Duration::from_secs(15));

            // Right BWS should be at max left steer (15°) for right turn
            assert!(
                test_bed
                    .get_right_body_steering_steering_ratio()
                    .get::<ratio>()
                    <= -0.97
            );

            // Left BWS should be at (11°) left steer for right turn
            let expected_right_angle = -11. / 15.;
            assert!(
                test_bed
                    .get_left_body_steering_steering_ratio()
                    .get::<ratio>()
                    > -0.9
            );
            assert!(
                test_bed
                    .get_left_body_steering_steering_ratio()
                    .get::<ratio>()
                    < expected_right_angle + 0.05
            );
        }

        #[test]
        fn takeoff_mode_limits_nose_steering_to_2_degrees_after_150_knot() {
            let mut test_bed = test_bed_on_ground_with()
                .start_eng1(Ratio::new::<percent>(95.))
                .start_eng2(Ratio::new::<percent>(95.))
                .start_eng3(Ratio::new::<percent>(95.))
                .start_eng4(Ratio::new::<percent>(95.))
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(15.))
                .set_rudder_input(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs(15));

            // Expecting around 6 degrees, so ratio with 0.5 margin should be 5.5/75
            assert_ge!(test_bed.get_nose_steering_ratio().get::<ratio>(), 5.5 / 75.);

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(155.))
                .run_waiting_for(Duration::from_secs(5));

            // Expecting around 2 degrees, so ratio with 0.5 margin should be 2.5/75
            assert_le!(test_bed.get_nose_steering_ratio().get::<ratio>(), 2.5 / 75.);
        }

        #[test]
        fn landing_mode_limits_nose_steering_to_0_degrees_after_150_knot() {
            let mut test_bed = test_bed_on_ground_with()
                .start_eng1(Ratio::new::<percent>(95.))
                .start_eng2(Ratio::new::<percent>(95.))
                .start_eng3(Ratio::new::<percent>(95.))
                .start_eng4(Ratio::new::<percent>(95.))
                .in_flight()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(160.))
                .on_the_ground()
                .set_rudder_input(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs(15));

            // Expecting  0 degrees, so ratio with 0.5 margin should be 0.5/75
            assert_lt!(test_bed.get_nose_steering_ratio().get::<ratio>(), 0.5 / 75.);

            // At lower speed in landing mode should get 6 degrees range
            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(100.))
                .run_waiting_for(Duration::from_secs(5));

            // Expecting around 6 degrees, so ratio with .5 margin should be 5./75
            assert_gt!(test_bed.get_nose_steering_ratio().get::<ratio>(), 5.5 / 75.);
        }

        fn test_bed_on_ground_with_engine_1_running() -> A380HydraulicsTestBed {
            let test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(10));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            test_bed
        }

        fn is_edp_1a_section_pressurised(test_bed: &A380HydraulicsTestBed) -> bool {
            test_bed.query(|a| {
                a.hydraulics.green_circuit.pump_section_switch_pressurised(
                    A380EngineDrivenPumpId::Edp1a.into_pump_section_index(),
                )
            })
        }

        /// The total volume of the reservoir is 31.70 US gal.
        #[test]
        fn reservoir_total_volume_is_31_70_us_gallons() {
            let test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            // The green reservoir starts with 12 US gal of fluid when the gear is down
            let total_volume =
                test_bed.green_reservoir_available_volume() + Volume::new::<gallon>(12.);

            assert!(
                (total_volume.get::<gallon>() - 31.70).abs() < 0.5,
                "reservoir total volume {} US gal",
                total_volume.get::<gallon>()
            );
        }

        /// RSVR LEVEL LO below 2.6 US gal.
        #[test]
        fn reservoir_level_low_below_2_6_us_gallons() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed.fail(FailureType::ReservoirLeak(HydraulicColor::Green));

            test_bed = test_bed.run_until(200, "below 3 US gal", |t| {
                t.get_green_reservoir_volume() < Volume::new::<gallon>(3.)
            });
            assert!(!test_bed.is_green_reservoir_level_low());

            test_bed = test_bed.run_until(200, "below 2.5 US gal", |t| {
                t.get_green_reservoir_volume() < Volume::new::<gallon>(2.5)
            });
            assert!(test_bed.is_green_reservoir_level_low());
        }

        /// ENG PMP pb-sw FAULT with HYD SYS OVHT: it stays on, also with the pb-sw OFF, until the overheat is gone.
        #[test]
        fn eng_pump_fault_on_overheat_and_stays_on_when_off() {
            let mut test_bed = test_bed_on_ground_with_engine_1_running();
            assert!(!test_bed.green_edp_has_fault());

            test_bed.fail(FailureType::EnginePumpOverheat(
                AirbusEngineDrivenPumpId::Edp1a,
            ));
            test_bed = test_bed.run_until(200, "EDP 1A overheating", |t| t.is_edp_1a_overheating());
            assert!(test_bed.green_edp_has_fault());

            test_bed = test_bed
                .set_green_ed_pump(false)
                .run_waiting_for(Duration::from_secs(1));
            assert!(test_bed.is_edp_1a_overheating());
            assert!(test_bed.green_edp_has_fault());
        }

        /// ENG PMP A+B DISC pb FAULT with HYD RSVR LEVEL LO, also once the ENG PMP pb-sw are OFF (the procedure turns
        /// them OFF first).
        #[test]
        fn eng_pumps_disc_fault_on_reservoir_low_level_with_pumps_off() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_green_ed_pump(false)
                .set_green_ed_pump_1b(false)
                .run_one_tick();
            assert!(!test_bed.eng1_pumps_disc_has_fault());

            test_bed.fail(FailureType::ReservoirLeak(HydraulicColor::Green));
            test_bed = test_bed.run_until(200, "green reservoir level low", |t| {
                t.is_green_reservoir_level_low()
            });

            assert!(test_bed.eng1_pumps_disc_has_fault());
        }

        /// ENG PMP A+B DISC pb FAULT with a SYS OVHT whose pump depressurisation failed: the procedure sets the ENG PMP
        /// A and B OFF, and DISC if that did not work.
        #[test]
        fn eng_pumps_disc_fault_on_overheat_only_if_depressurisation_failed() {
            let mut test_bed = test_bed_on_ground_with_engine_1_running();

            test_bed.fail(FailureType::EnginePumpOverheat(
                AirbusEngineDrivenPumpId::Edp1a,
            ));
            test_bed = test_bed.run_until(200, "EDP 1A overheating", |t| t.is_edp_1a_overheating());

            // Pump at AUTO: the crew must first turn it OFF
            assert!(!test_bed.eng1_pumps_disc_has_fault());

            // Turning off is successful: the pump section loses its pressure
            test_bed = test_bed.set_green_ed_pump(false).run_until(
                60,
                "EDP 1A section depressurised",
                |t| !is_edp_1a_section_pressurised(t),
            );
            assert!(test_bed.is_edp_1a_overheating());
            assert!(!test_bed.eng1_pumps_disc_has_fault());
        }

        #[test]
        fn eng_pumps_disc_fault_on_overheat_when_depressurisation_failed() {
            let mut test_bed = test_bed_on_ground_with_engine_1_running();

            test_bed.fail(FailureType::EnginePumpOverheat(
                AirbusEngineDrivenPumpId::Edp1a,
            ));
            test_bed = test_bed.run_until(200, "EDP 1A overheating", |t| t.is_edp_1a_overheating());

            // No power on the pump solenoid: the pump stays pressurised with its pb-sw OFF
            test_bed = test_bed
                .dc_ess_lost()
                .set_green_ed_pump(false)
                .run_waiting_for(Duration::from_secs(5));
            assert!(is_edp_1a_section_pressurised(&test_bed));
            assert!(test_bed.is_edp_1a_overheating());
            assert!(test_bed.eng1_pumps_disc_has_fault());

            // The FAULT light goes off when DISC is selected
            test_bed = test_bed
                .set_disconnect_engine_edp(1)
                .run_waiting_for(Duration::from_secs(1));
            assert!(!test_bed.eng1_pumps_disc_has_fault());
        }

        /// ELEC PMP pb-sw FAULT with HYD G(Y) RSVR LEVEL LO, on the ground with the engines off.
        #[test]
        fn elec_pump_fault_on_reservoir_low_level_only_on_ground_with_engines_off() {
            let mut test_bed = test_bed_in_flight_with()
                .set_cold_dark_inputs()
                .in_flight()
                .run_one_tick();

            test_bed.fail(FailureType::ReservoirLeak(HydraulicColor::Green));
            test_bed = test_bed.run_until(200, "green reservoir level low", |t| {
                t.is_green_reservoir_level_low()
            });
            assert!(!test_bed.green_epump_a_has_fault());

            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed.fail(FailureType::ReservoirLeak(HydraulicColor::Green));
            test_bed = test_bed.run_until(200, "green reservoir level low", |t| {
                t.is_green_reservoir_level_low()
            });
            assert!(test_bed.green_epump_a_has_fault());
        }

        /// ELEC PMP pb-sw FAULT with HYD G(Y) SYS OVHT, on the ground with the engines off.
        #[test]
        fn elec_pump_fault_on_system_overheat_only_on_ground_with_engines_off() {
            let mut test_bed = test_bed_on_ground_with_engine_1_running();

            // The overheating engine pump heats the green fluid
            test_bed.fail(FailureType::EnginePumpOverheat(
                AirbusEngineDrivenPumpId::Edp1a,
            ));
            test_bed = test_bed.run_until(300, "green reservoir overheating", |t| {
                t.is_green_reservoir_overheating()
            });
            test_bed = test_bed.run_waiting_for(Duration::from_secs(30));

            // Engine 1 running: no ELEC PMP FAULT
            assert!(!test_bed.green_epump_b_has_fault());

            test_bed = test_bed
                .engines_off()
                .run_waiting_for(Duration::from_secs(1));
            assert!(test_bed.is_green_reservoir_overheating());
            assert!(test_bed.green_epump_b_has_fault());
        }

        /// The HSMU switches off an overheating electric pump.
        #[test]
        fn hsmu_switches_off_overheated_elec_pump() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_green_e_pump_a(true)
                .run_waiting_for(Duration::from_secs(5));
            assert!(test_bed.query(|a| a.is_green_epump_a_controller_pressurising()));

            test_bed.fail(FailureType::ElecPumpOverheat(AirbusElectricPumpId::GreenA));
            test_bed = test_bed.run_until(200, "green A elec pump overheating", |t| {
                t.is_green_epump_a_overheating()
            });
            test_bed = test_bed.run_one_tick();

            assert!(!test_bed.query(|a| a.is_green_epump_a_controller_pressurising()));
            assert!(test_bed.green_epump_a_has_fault());

            // The FAULT light stays on with the pb-sw OFF while the overheat lasts
            test_bed = test_bed
                .set_green_e_pump_a_off(true)
                .run_waiting_for(Duration::from_secs(1));
            assert!(test_bed.is_green_epump_a_overheating());
            assert!(test_bed.green_epump_a_has_fault());
        }

        /// The green electric pumps started manually power the whole GREEN system except the cargo door actuation.
        #[test]
        fn green_elec_pumps_in_manual_mode_pressurise_system_not_cargo_doors() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_green_e_pump_a(true)
                .set_green_e_pump_b(true)
                .run_waiting_for(Duration::from_secs(5));

            test_bed = test_bed.open_fwd_cargo_door().run_waiting_for(
                HydraulicDoorController::DELAY_UNLOCK_TO_HYDRAULIC_CONTROL + Duration::from_secs(5),
            );
            test_bed = test_bed
                .open_fwd_cargo_door()
                .run_waiting_for(Duration::from_secs(10));

            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert_gt!(test_bed.green_pressure(), Pressure::new::<psi>(2500.));
            assert_lt!(
                test_bed.green_pressure_auxiliary(),
                Pressure::new::<psi>(1000.)
            );
            assert!(!test_bed.is_cargo_fwd_door_locked_up());
        }

        /// In automatic mode the ELEC PMP ON pb is disregarded (per pump). Once the automatic mode ends, the manual mode
        /// pressurises the whole yellow system.
        #[test]
        fn yellow_elec_pump_on_pb_disregarded_while_running_in_auto_mode() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_one_tick();

            test_bed = test_bed
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(5.))
                .run_waiting_for(Duration::from_secs(6));
            assert_gt!(
                test_bed.yellow_pressure_auxiliary(),
                Pressure::new::<psi>(2500.)
            );

            // The auto logic runs one of the two pumps: ON pb pressed on that pump
            let pump_a_runs_in_auto =
                test_bed.query(|a| a.is_yellow_a_epump_controller_pressurising());
            test_bed = if pump_a_runs_in_auto {
                test_bed.set_yellow_e_pump_a(true)
            } else {
                test_bed.set_yellow_e_pump_b(true)
            };
            test_bed = test_bed
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(5.))
                .run_waiting_for(Duration::from_secs(5));
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());
            assert_gt!(
                test_bed.yellow_pressure_auxiliary(),
                Pressure::new::<psi>(2500.)
            );

            // Tug centres the nose wheel (no more BWS demand below 20 degrees), then the pushback ends
            test_bed = test_bed
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(0.))
                .run_until(60, "nose wheel centred", |t| {
                    t.get_nose_steering_ratio().get::<ratio>().abs() < 0.15
                });
            test_bed = test_bed
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(0.))
                .set_pushback_state(false)
                .run_one_tick();

            // The automatic mode stops 30 s after the BWS demand, then the manual mode takes over
            test_bed = test_bed.run_until(90, "yellow system pressurised", |t| {
                t.is_yellow_pressure_switch_pressurised()
            });
            assert_gt!(test_bed.yellow_pressure(), Pressure::new::<psi>(2500.));
        }

        /// The yellow electric pumps started manually power the whole YELLOW system (BWS included).
        #[test]
        fn yellow_elec_pumps_in_manual_mode_pressurise_system_and_bws_on_pushback() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .set_yellow_e_pump_a(true)
                .set_yellow_e_pump_b(true)
                .run_waiting_for(Duration::from_secs(5));

            test_bed = test_bed
                .set_pushback_state(true)
                .set_pushback_angle(AngularVelocity::new::<degree_per_second>(5.))
                .run_waiting_for(Duration::from_secs(15));

            assert!(test_bed.is_yellow_pressure_switch_pressurised());
            assert_gt!(test_bed.yellow_pressure(), Pressure::new::<psi>(2500.));
            assert_ge!(
                test_bed
                    .get_left_body_steering_steering_ratio()
                    .get::<ratio>(),
                0.97
            );
        }

        /// With engines 3 and 4 running the yellow electric pumps are inhibited: the BWS keeps the yellow system
        /// section of the engine pumps when it steers in taxi.
        #[test]
        fn body_wheel_steering_on_yellow_system_with_engines_running() {
            let mut test_bed = test_bed_on_ground_with()
                .start_eng1(Ratio::new::<percent>(95.))
                .start_eng2(Ratio::new::<percent>(95.))
                .start_eng3(Ratio::new::<percent>(95.))
                .start_eng4(Ratio::new::<percent>(95.))
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(10));

            test_bed = test_bed
                .set_ground_speed(Velocity::new::<knot>(5.))
                .set_tiller_demand(Ratio::new::<ratio>(1.))
                .run_waiting_for(Duration::from_secs(15));

            assert!(!test_bed.query(|a| a.hydraulics.is_body_wheel_steering_on_yellow_auxiliary()));
            assert!(test_bed.is_yellow_pressure_switch_pressurised());
            assert_gt!(
                test_bed
                    .get_left_body_steering_steering_ratio()
                    .get::<ratio>()
                    .abs(),
                0.5
            );
        }

        /// The yellow electric pump A alone on ground: the PRIMs engage the yellow servos once the system has been
        /// pressurised for 0.5 s and release them when it is not. All the drooped surfaces then re-centre at once,
        /// while the THS trims and the ALTN brake accumulator recharges. The pressure must level out and reach normal
        /// pressure, not fall under the release threshold and saw-tooth with the servos.
        #[test]
        fn yellow_elec_pump_alone_re_centres_drooped_surfaces_without_pressure_saw_tooth() {
            let step = Duration::from_millis(50);
            let prim_engage_confirmation = Duration::from_millis(500);
            let ths_demand = Angle::new::<degree>(-6.);

            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .run_waiting_for(Duration::from_secs(1));

            // A partly used ALTN brake accumulator, as found after some park brake applications
            for _ in 0..3 {
                test_bed = test_bed
                    .set_park_brake(false)
                    .run_waiting_for(Duration::from_secs(1))
                    .set_park_brake(true)
                    .run_waiting_for(Duration::from_secs(1));
            }

            test_bed = test_bed
                .set_park_brake(false)
                .set_yellow_flight_control_servos_engaged(false, ths_demand)
                .run_waiting_for(Duration::from_secs(10))
                .set_yellow_e_pump_a(true);

            let mut pressurised_for = Duration::ZERO;
            let mut servos_engaged = false;
            let mut has_been_pressurised = false;
            let mut peak_pressure_psi: f64 = 0.;
            let mut largest_drop_psi: f64 = 0.;
            let mut time_since_pump_on = Duration::ZERO;
            let mut time_to_normal_pressure = None;
            while time_since_pump_on < Duration::from_secs(30) {
                test_bed = test_bed.run_waiting_for(step);
                time_since_pump_on += step;

                pressurised_for = if test_bed.is_yellow_pressure_switch_pressurised() {
                    pressurised_for + step
                } else {
                    Duration::ZERO
                };
                let prim_engages = pressurised_for >= prim_engage_confirmation;
                assert!(
                    prim_engages || !servos_engaged,
                    "Yellow servos released {:.2} s after pump on",
                    time_since_pump_on.as_secs_f64()
                );
                servos_engaged = prim_engages;
                test_bed =
                    test_bed.set_yellow_flight_control_servos_engaged(servos_engaged, ths_demand);

                let pressure_psi = test_bed.yellow_pressure().get::<psi>();
                has_been_pressurised |=
                    pressure_psi >= A380HydraulicCircuitFactory::MIN_PRESS_PRESSURISED_HI_HYST;
                if has_been_pressurised {
                    peak_pressure_psi = peak_pressure_psi.max(pressure_psi);
                    largest_drop_psi = largest_drop_psi.max(peak_pressure_psi - pressure_psi);
                }
                if time_to_normal_pressure.is_none() && pressure_psi > 4900. {
                    time_to_normal_pressure = Some(time_since_pump_on);
                }
            }

            assert!(servos_engaged);
            assert_lt!(largest_drop_psi, 800.);
            assert_lt!(time_to_normal_pressure.unwrap(), Duration::from_secs(15));
            assert_gt!(test_bed.yellow_pressure().get::<psi>(), 5000.);
            // Re-centred: 0.4 is the neutral position of the aileron panel, 0 its drooped one
            assert_gt!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Outward)
                    .get::<ratio>(),
                0.35
            );
        }

        fn green_and_yellow_pressurised_test_bed() -> A380HydraulicsTestBed {
            test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .start_eng3(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5))
        }

        #[test]
        fn outer_aileron_with_both_actuators_failed_does_not_follow_its_order() {
            let mut test_bed = green_and_yellow_pressurised_test_bed();
            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::LeftOuterAileron,
                1,
            ));
            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::LeftOuterAileron,
                2,
            ));
            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(2));

            assert_lt!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Outward)
                    .get::<ratio>(),
                0.1
            );
        }

        #[test]
        fn yellow_actuator_takes_over_the_order_of_the_failed_green_outer_aileron_actuator() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng3(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));
            assert!(!test_bed.is_green_pressure_switch_pressurised());
            assert!(test_bed.is_yellow_pressure_switch_pressurised());

            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::LeftOuterAileron,
                1,
            ));
            test_bed = test_bed
                .reset_all_aileron_commands()
                .set_aileron_panel_neutral(
                    ActuatorSide::Left,
                    AileronPanelPosition::Outward,
                    AileronActuatorPosition::Outward,
                )
                .run_waiting_for(Duration::from_secs(2));

            assert_gt!(
                test_bed
                    .get_left_aileron_panel_position(AileronPanelPosition::Outward)
                    .get::<ratio>(),
                0.35
            );
        }

        #[test]
        fn jammed_stabilizer_does_not_follow_its_order() {
            let mut test_bed = green_and_yellow_pressurised_test_bed();
            let initial_deflection_degrees: f64 = test_bed.read_by_name("HYD_FINAL_THS_DEFLECTION");

            test_bed.fail(FailureType::StabilizerJammed);
            test_bed.write_by_name("THS_YELLOW_SERVO_SOLENOID_ENERGIZED", true);
            test_bed.write_by_name("THS_YELLOW_COMMANDED_POSITION", -6.);
            test_bed = test_bed.run_waiting_for(Duration::from_secs(10));

            let deflection_degrees: f64 = test_bed.read_by_name("HYD_FINAL_THS_DEFLECTION");
            assert_lt!((deflection_degrees - initial_deflection_degrees).abs(), 0.1);
        }

        #[test]
        fn yellow_motor_takes_over_the_order_of_the_failed_green_stabilizer_motor() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng3(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));

            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::Stabilizer,
                1,
            ));
            test_bed.write_by_name("THS_GREEN_SERVO_SOLENOID_ENERGIZED", true);
            test_bed.write_by_name("THS_GREEN_COMMANDED_POSITION", -6.);
            test_bed = test_bed.run_waiting_for(Duration::from_secs(20));

            let deflection_degrees: f64 = test_bed.read_by_name("HYD_FINAL_THS_DEFLECTION");
            assert_gt!(deflection_degrees, 5.5);
        }

        #[test]
        fn green_ebha_takes_over_the_order_of_the_failed_yellow_upper_rudder_ebha() {
            let mut test_bed = test_bed_on_ground_with()
                .engines_off()
                .on_the_ground()
                .set_cold_dark_inputs()
                .start_eng1(Ratio::new::<percent>(80.))
                .run_waiting_for(Duration::from_secs(5));
            assert!(test_bed.is_green_pressure_switch_pressurised());
            assert!(!test_bed.is_yellow_pressure_switch_pressurised());

            test_bed.fail(FailureType::FlightControlActuator(
                FlightControlSurface::UpperRudder,
                1,
            ));
            test_bed.write_by_name(
                "UPPER_RUDDER_YELLOW_EBHA_HYDRAULIC_MODE_SOLENOID_ENERGIZED",
                true,
            );
            test_bed.write_by_name("UPPER_RUDDER_YELLOW_EBHA_COMMANDED_POSITION", 10.);
            test_bed = test_bed.run_waiting_for(Duration::from_secs(5));

            // 10 deg of rudder is at 1/3 of the rudder travel, 0.5 is the neutral position
            let position: f64 = test_bed.read_by_name("HYD_UPPER_RUD_DEFLECTION");
            assert_lt!(position, 0.36);
        }
    }
}
