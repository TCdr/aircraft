use nalgebra::Vector3;

use std::time::Duration;

use uom::si::{
    angle::degree,
    angular_velocity::radian_per_second,
    f64::*,
    length::meter,
    mass::kilogram,
    pressure::psi,
    ratio::{percent, ratio},
    volume::{gallon, liter},
    volume_rate::gallon_per_second,
};

use systems::{
    hydraulic::{
        aerodynamic_model::AerodynamicModel,
        cargo_doors::CargoDoor,
        flap_slat::{SecondarySurface, SecondarySurfaceSide, SecondarySurfaceType},
        landing_gear::HydraulicGearSystem,
        linear_actuator::{
            BoundedLinearLength, HydraulicLinearActuatorAssembly,
            LinearActuatedRigidBodyOnHingeAxis, LinearActuator, LinearActuatorCharacteristics,
        },
        HydraulicCircuit, PressureSwitch, PressureSwitchType, PriorityValve, Reservoir,
    },
    shared::{random_from_range, GearWheel, HydraulicColor},
    simulation::{InitContext, StartState},
};

use super::{
    ActuatorSide, AileronAssembly, ElevatorAssembly, RudderAssembly, SpoilerElement, SpoilerGroup,
};

pub(super) struct A320HydraulicReservoirFactory {}
impl A320HydraulicReservoirFactory {
    pub(super) fn new_green_reservoir(context: &mut InitContext) -> Reservoir {
        let reservoir_offset_when_gear_up = if context.start_gear_down() {
            Volume::new::<gallon>(0.)
        } else {
            Volume::new::<gallon>(-1.3)
        };

        Reservoir::new(
            context,
            HydraulicColor::Green,
            Volume::new::<liter>(23.),
            Volume::new::<liter>(18.),
            Volume::new::<gallon>(3.6) + reservoir_offset_when_gear_up,
            vec![PressureSwitch::new(
                Pressure::new::<psi>(25.),
                Pressure::new::<psi>(22.),
                PressureSwitchType::Relative,
            )],
            Volume::new::<liter>(3.),
        )
    }

    pub(super) fn new_blue_reservoir(context: &mut InitContext) -> Reservoir {
        Reservoir::new(
            context,
            HydraulicColor::Blue,
            Volume::new::<liter>(10.),
            Volume::new::<liter>(8.),
            Volume::new::<gallon>(1.56),
            vec![PressureSwitch::new(
                Pressure::new::<psi>(25.),
                Pressure::new::<psi>(22.),
                PressureSwitchType::Relative,
            )],
            Volume::new::<liter>(2.),
        )
    }

    pub(super) fn new_yellow_reservoir(
        context: &mut InitContext,
        fluid_volume_in_brake_accumulator: Volume,
    ) -> Reservoir {
        Reservoir::new(
            context,
            HydraulicColor::Yellow,
            Volume::new::<liter>(20.),
            Volume::new::<liter>(18.),
            Volume::new::<gallon>(3.8) - fluid_volume_in_brake_accumulator,
            vec![PressureSwitch::new(
                Pressure::new::<psi>(25.),
                Pressure::new::<psi>(22.),
                PressureSwitchType::Relative,
            )],
            Volume::new::<liter>(3.),
        )
    }
}

pub struct A320HydraulicCircuitFactory {}
impl A320HydraulicCircuitFactory {
    pub(super) const MIN_PRESS_EDP_SECTION_LO_HYST: f64 = 1740.0;
    pub(super) const MIN_PRESS_EDP_SECTION_HI_HYST: f64 = 2200.0;
    pub(super) const MIN_PRESS_BLUE_ELEC_PUMP_SECTION_LO_HYST: f64 = 1450.0;
    pub(super) const MIN_PRESS_BLUE_ELEC_PUMP_SECTION_HI_HYST: f64 = 1750.0;
    pub(super) const MIN_PRESS_PRESSURISED_LO_HYST: f64 = 1450.0;
    pub(super) const MIN_PRESS_PRESSURISED_HI_HYST: f64 = 1750.0;

    pub(super) const YELLOW_GREEN_BLUE_PUMPS_INDEXES: usize = 0;

    pub(super) const HYDRAULIC_TARGET_PRESSURE_PSI: f64 = 3000.;

    pub(super) const PRIORITY_VALVE_PRESSURE_CUTOFF_PSI: f64 = 1842.;
    pub(super) const PRIORITY_VALVE_PRESSURE_OPENED_PSI: f64 = 2300.;

    // Nitrogen PSI precharge pressure
    pub(super) const ACCUMULATOR_GAS_PRE_CHARGE_PSI: f64 = 1885.0;
    pub(super) const ACCUMULATOR_MAX_VOLUME_GALLONS: f64 = 0.264;

    pub fn new_green_circuit(context: &mut InitContext) -> HydraulicCircuit {
        let reservoir = A320HydraulicReservoirFactory::new_green_reservoir(context);
        HydraulicCircuit::new(
            context,
            HydraulicColor::Green,
            1,
            Ratio::new::<percent>(100.),
            Volume::new::<gallon>(10.),
            reservoir,
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_HI_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_EDP_SECTION_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_EDP_SECTION_HI_HYST),
            true,
            false,
            false,
            Pressure::new::<psi>(Self::HYDRAULIC_TARGET_PRESSURE_PSI),
            PriorityValve::new(
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_CUTOFF_PSI),
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_OPENED_PSI),
            ),
            Pressure::new::<psi>(Self::ACCUMULATOR_GAS_PRE_CHARGE_PSI),
            Volume::new::<gallon>(Self::ACCUMULATOR_MAX_VOLUME_GALLONS),
        )
    }

    pub fn new_blue_circuit(context: &mut InitContext) -> HydraulicCircuit {
        let reservoir = A320HydraulicReservoirFactory::new_blue_reservoir(context);
        HydraulicCircuit::new(
            context,
            HydraulicColor::Blue,
            1,
            Ratio::new::<percent>(100.),
            Volume::new::<gallon>(8.),
            reservoir,
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_HI_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_BLUE_ELEC_PUMP_SECTION_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_BLUE_ELEC_PUMP_SECTION_HI_HYST),
            false,
            false,
            false,
            Pressure::new::<psi>(Self::HYDRAULIC_TARGET_PRESSURE_PSI),
            PriorityValve::new(
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_CUTOFF_PSI),
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_OPENED_PSI),
            ),
            Pressure::new::<psi>(Self::ACCUMULATOR_GAS_PRE_CHARGE_PSI),
            Volume::new::<gallon>(Self::ACCUMULATOR_MAX_VOLUME_GALLONS),
        )
    }

    pub fn new_yellow_circuit(
        context: &mut InitContext,
        fluid_volume_in_brake_accumulator: Volume,
    ) -> HydraulicCircuit {
        let reservoir = A320HydraulicReservoirFactory::new_yellow_reservoir(
            context,
            fluid_volume_in_brake_accumulator,
        );
        HydraulicCircuit::new(
            context,
            HydraulicColor::Yellow,
            1,
            Ratio::new::<percent>(100.),
            Volume::new::<gallon>(10.),
            reservoir,
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_PRESSURISED_HI_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_EDP_SECTION_LO_HYST),
            Pressure::new::<psi>(Self::MIN_PRESS_EDP_SECTION_HI_HYST),
            false,
            true,
            false,
            Pressure::new::<psi>(Self::HYDRAULIC_TARGET_PRESSURE_PSI),
            PriorityValve::new(
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_CUTOFF_PSI),
                Pressure::new::<psi>(Self::PRIORITY_VALVE_PRESSURE_OPENED_PSI),
            ),
            Pressure::new::<psi>(Self::ACCUMULATOR_GAS_PRE_CHARGE_PSI),
            Volume::new::<gallon>(Self::ACCUMULATOR_MAX_VOLUME_GALLONS),
        )
    }
}

pub(super) struct A320CargoDoorFactory {}
impl A320CargoDoorFactory {
    pub(super) const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 0.05;
    pub(super) const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 5.;
    pub(super) const FLOW_CONTROL_FORCE_GAIN: f64 = 200000.;

    pub(super) fn a320_cargo_door_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        LinearActuator::new(
            context,
            bounded_linear_length,
            2,
            Length::new::<meter>(0.04422),
            Length::new::<meter>(0.03366),
            VolumeRate::new::<gallon_per_second>(0.01),
            600000.,
            15000.,
            500.,
            1000000.,
            Duration::from_millis(100),
            [1., 1., 1., 1., 1., 1.],
            [1., 1., 1., 1., 1., 1.],
            [0., 0.2, 0.21, 0.79, 0.8, 1.],
            Self::FLOW_CONTROL_PROPORTIONAL_GAIN,
            Self::FLOW_CONTROL_INTEGRAL_GAIN,
            Self::FLOW_CONTROL_FORCE_GAIN,
            false,
            false,
            None,
            None,
            Pressure::new::<psi>(A320HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    /// Builds a cargo door body for A320 Neo
    pub(super) fn a320_cargo_door_body(is_locked: bool) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(100. / 1000., 1855. / 1000., 2025. / 1000.);
        let cg_offset = Vector3::new(0., -size[1] / 2., 0.);

        let control_arm = Vector3::new(-0.1597, -0.1614, 0.);
        let anchor = Vector3::new(-0.7596, -0.086, 0.);
        let axis_direction = Vector3::new(0., 0., 1.);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(130.),
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
    pub(super) fn a320_cargo_door_assembly(
        context: &mut InitContext,
    ) -> HydraulicLinearActuatorAssembly<1> {
        let cargo_door_body = Self::a320_cargo_door_body(true);
        let cargo_door_actuator = Self::a320_cargo_door_actuator(context, &cargo_door_body);
        HydraulicLinearActuatorAssembly::new([cargo_door_actuator], cargo_door_body)
    }

    pub(super) fn new_a320_cargo_door(context: &mut InitContext, id: &str) -> CargoDoor {
        let assembly = Self::a320_cargo_door_assembly(context);
        CargoDoor::new(
            context,
            id,
            assembly,
            Self::new_a320_cargo_door_aero_model(),
        )
    }

    pub(super) fn new_a320_cargo_door_aero_model() -> AerodynamicModel {
        let body = Self::a320_cargo_door_body(false);
        AerodynamicModel::new(
            &body,
            Some(Vector3::new(1., 0., 0.)),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(1., 0., 0.)),
            Ratio::new::<ratio>(1.),
        )
    }
}

pub(super) struct A320AileronFactory {}
impl A320AileronFactory {
    pub(super) const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 0.25;
    pub(super) const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 3.;
    pub(super) const FLOW_CONTROL_FORCE_GAIN: f64 = 450000.;

    pub(super) const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 3500000.;
    pub(super) const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 1.;

    pub(super) fn a320_aileron_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        let actuator_characteristics = LinearActuatorCharacteristics::new(
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING / 3.,
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING,
            VolumeRate::new::<gallon_per_second>(0.055),
            Ratio::new::<percent>(Self::MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        // Aileron actuator real data:
        // Max force of 4700DaN @ 3000psi. Max flow 3.302 US gal/min thus 0.055033333 gal/s
        // This gives a 0.00227225 squared meter of piston surface
        // This gives piston diameter of 0.0537878 meters
        // We use 0 as rod diameter as this is a symmetrical actuator so same surface each side
        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.0537878),
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
            false,
            false,
            None,
            None,
            Pressure::new::<psi>(A320HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    /// Builds an aileron control surface body for A320 Neo
    pub(super) fn a320_aileron_body(init_drooped_down: bool) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(3.325, 0.16, 0.58);

        // CG at half the size
        let cg_offset = Vector3::new(0., 0., -0.5 * size[2]);
        let aero_center = Vector3::new(0., 0., -0.4 * size[2]);

        let control_arm = Vector3::new(0., -0.0525, 0.);
        let anchor = Vector3::new(0., -0.0525, 0.33);

        let init_position = if init_drooped_down {
            Angle::new::<degree>(-25.)
        } else {
            Angle::new::<degree>(0.)
        };

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(24.65),
            size,
            cg_offset,
            aero_center,
            control_arm,
            anchor,
            Angle::new::<degree>(-25.),
            Angle::new::<degree>(50.),
            init_position,
            1.,
            false,
            Vector3::new(1., 0., 0.),
        )
    }

    /// Builds an aileron assembly consisting of the aileron physical rigid body and two hydraulic actuators connected
    /// to it
    pub(super) fn a320_aileron_assembly(
        context: &mut InitContext,
        init_drooped_down: bool,
    ) -> HydraulicLinearActuatorAssembly<2> {
        let aileron_body = Self::a320_aileron_body(init_drooped_down);

        let aileron_actuator_outward = Self::a320_aileron_actuator(context, &aileron_body);
        let aileron_actuator_inward = Self::a320_aileron_actuator(context, &aileron_body);

        HydraulicLinearActuatorAssembly::new(
            [aileron_actuator_outward, aileron_actuator_inward],
            aileron_body,
        )
    }

    pub(super) fn new_aileron(context: &mut InitContext, id: ActuatorSide) -> AileronAssembly {
        let init_drooped_down = !context.is_in_flight();
        let assembly = Self::a320_aileron_assembly(context, init_drooped_down);
        AileronAssembly::new(context, id, assembly, Self::new_a320_aileron_aero_model())
    }

    pub(super) fn new_a320_aileron_aero_model() -> AerodynamicModel {
        let body = Self::a320_aileron_body(true);

        // Aerodynamic object has a little rotation from horizontal direction so that at X°
        // of wing AOA the aileron gets some X°+Y° AOA as the overwing pressure sucks the aileron up
        AerodynamicModel::new(
            &body,
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., 0.208, 0.978)),
            Some(Vector3::new(0., 0.978, -0.208)),
            Ratio::new::<ratio>(1.),
        )
    }
}

pub(super) struct A320SpoilerFactory {}
impl A320SpoilerFactory {
    pub(super) const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 0.15;
    pub(super) const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 2.;
    pub(super) const FLOW_CONTROL_FORCE_GAIN: f64 = 450000.;

    pub(super) const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 400000.;

    pub(super) const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 3.;

    pub(super) fn a320_spoiler_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        let actuator_characteristics = LinearActuatorCharacteristics::new(
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING / 5.,
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING,
            VolumeRate::new::<gallon_per_second>(0.03),
            Ratio::new::<percent>(Self::MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.03),
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
            false,
            true,
            Some((
                AngularVelocity::new::<radian_per_second>(-10000.),
                AngularVelocity::new::<radian_per_second>(0.),
            )),
            None,
            Pressure::new::<psi>(A320HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    /// Builds a spoiler control surface body for A320 Neo
    pub(super) fn a320_spoiler_body() -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(1.785, 0.1, 0.685);
        let cg_offset = Vector3::new(0., 0., -0.5 * size[2]);
        let aero_center = Vector3::new(0., 0., -0.4 * size[2]);

        let control_arm = Vector3::new(0., -0.067 * size[2], -0.26 * size[2]);
        let anchor = Vector3::new(0., -0.26 * size[2], 0.26 * size[2]);

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(16.),
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
    pub(super) fn a320_spoiler_assembly(
        context: &mut InitContext,
    ) -> HydraulicLinearActuatorAssembly<1> {
        let spoiler_body = Self::a320_spoiler_body();

        let spoiler_actuator = Self::a320_spoiler_actuator(context, &spoiler_body);

        HydraulicLinearActuatorAssembly::new([spoiler_actuator], spoiler_body)
    }

    pub(super) fn new_a320_spoiler_group(
        context: &mut InitContext,
        id: ActuatorSide,
    ) -> SpoilerGroup {
        let spoiler_1 = Self::new_a320_spoiler_element(context, id, 1);
        let spoiler_2 = Self::new_a320_spoiler_element(context, id, 2);
        let spoiler_3 = Self::new_a320_spoiler_element(context, id, 3);
        let spoiler_4 = Self::new_a320_spoiler_element(context, id, 4);
        let spoiler_5 = Self::new_a320_spoiler_element(context, id, 5);

        match id {
            ActuatorSide::Left => SpoilerGroup::new(
                context,
                "LEFT",
                [spoiler_1, spoiler_2, spoiler_3, spoiler_4, spoiler_5],
            ),
            ActuatorSide::Right => SpoilerGroup::new(
                context,
                "RIGHT",
                [spoiler_1, spoiler_2, spoiler_3, spoiler_4, spoiler_5],
            ),
        }
    }

    pub(super) fn new_a320_spoiler_element(
        context: &mut InitContext,
        id: ActuatorSide,
        id_number: usize,
    ) -> SpoilerElement {
        let assembly = Self::a320_spoiler_assembly(context);
        SpoilerElement::new(
            context,
            id,
            id_number,
            assembly,
            Self::new_a320_spoiler_aero_model(),
        )
    }

    pub(super) fn new_a320_spoiler_aero_model() -> AerodynamicModel {
        let body = Self::a320_spoiler_body();

        // Lift vector and normal are rotated 10° to acount for air supposedly following
        // wing profile that is 10° from horizontal
        // It means that with headwind and spoiler retracted (-10°), spoiler generates no lift
        AerodynamicModel::new(
            &body,
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., -0.174, 0.985)),
            Some(Vector3::new(0., 0.985, 0.174)),
            Ratio::new::<ratio>(1.),
        )
    }
}

pub(super) struct A320ElevatorFactory {}
impl A320ElevatorFactory {
    pub(super) const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 1.;
    pub(super) const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 5.;
    pub(super) const FLOW_CONTROL_FORCE_GAIN: f64 = 450000.;

    pub(super) const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 15000000.;
    pub(super) const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 1.;

    pub(super) fn a320_elevator_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        let actuator_characteristics = LinearActuatorCharacteristics::new(
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING / 5.,
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING,
            VolumeRate::new::<gallon_per_second>(0.029),
            Ratio::new::<percent>(Self::MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.0407),
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
            false,
            false,
            None,
            None,
            Pressure::new::<psi>(A320HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    /// Builds an aileron control surface body for A320 Neo
    pub(super) fn a320_elevator_body(
        init_drooped_down: bool,
    ) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(6., 0.405, 1.125);
        let cg_offset = Vector3::new(0., 0., -0.5 * size[2]);
        let aero_center = Vector3::new(0., 0., -0.3 * size[2]);

        let control_arm = Vector3::new(0., -0.091, 0.);
        let anchor = Vector3::new(0., -0.091, 0.41);

        let init_position = if init_drooped_down {
            Angle::new::<degree>(-11.5)
        } else {
            Angle::new::<degree>(0.)
        };

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(58.6),
            size,
            cg_offset,
            aero_center,
            control_arm,
            anchor,
            Angle::new::<degree>(-11.5),
            Angle::new::<degree>(27.5),
            init_position,
            100.,
            false,
            Vector3::new(1., 0., 0.),
        )
    }

    /// Builds an aileron assembly consisting of the aileron physical rigid body and two hydraulic actuators connected
    /// to it
    pub(super) fn a320_elevator_assembly(
        context: &mut InitContext,
        init_drooped_down: bool,
    ) -> HydraulicLinearActuatorAssembly<2> {
        let elevator_body = Self::a320_elevator_body(init_drooped_down);

        let elevator_actuator_outboard = Self::a320_elevator_actuator(context, &elevator_body);
        let elevator_actuator_inbord = Self::a320_elevator_actuator(context, &elevator_body);

        HydraulicLinearActuatorAssembly::new(
            [elevator_actuator_outboard, elevator_actuator_inbord],
            elevator_body,
        )
    }

    pub(super) fn new_elevator(context: &mut InitContext, id: ActuatorSide) -> ElevatorAssembly {
        let init_drooped_down = !context.is_in_flight();
        let assembly = Self::a320_elevator_assembly(context, init_drooped_down);
        ElevatorAssembly::new(context, id, assembly, Self::new_a320_elevator_aero_model())
    }

    pub(super) fn new_a320_elevator_aero_model() -> AerodynamicModel {
        let body = Self::a320_elevator_body(true);
        AerodynamicModel::new(
            &body,
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(0., 1., 0.)),
            Ratio::new::<ratio>(0.8),
        )
    }
}

pub(super) struct A320RudderFactory {}
impl A320RudderFactory {
    pub(super) const FLOW_CONTROL_PROPORTIONAL_GAIN: f64 = 1.5;
    pub(super) const FLOW_CONTROL_INTEGRAL_GAIN: f64 = 2.;
    pub(super) const FLOW_CONTROL_FORCE_GAIN: f64 = 350000.;

    pub(super) const MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING: f64 = 1000000.;
    pub(super) const MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT: f64 = 1.;

    pub(super) fn a320_rudder_actuator(
        context: &mut InitContext,
        bounded_linear_length: &impl BoundedLinearLength,
    ) -> LinearActuator {
        let actuator_characteristics = LinearActuatorCharacteristics::new(
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING / 4.,
            Self::MAX_DAMPING_CONSTANT_FOR_SLOW_DAMPING,
            VolumeRate::new::<gallon_per_second>(0.0792),
            Ratio::new::<percent>(Self::MAX_FLOW_PRECISION_PER_ACTUATOR_PERCENT),
        );

        LinearActuator::new(
            context,
            bounded_linear_length,
            1,
            Length::new::<meter>(0.06),
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
            false,
            false,
            None,
            None,
            Pressure::new::<psi>(A320HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    /// Builds an aileron control surface body for A320 Neo
    pub(super) fn a320_rudder_body(init_at_center: bool) -> LinearActuatedRigidBodyOnHingeAxis {
        let size = Vector3::new(0.42, 6.65, 1.8);
        let cg_offset = Vector3::new(0., 0.5 * size[1], -0.5 * size[2]);
        let aero_center = Vector3::new(0., 0.5 * size[1], -0.3 * size[2]);

        let control_arm = Vector3::new(-0.144, 0., 0.);
        let anchor = Vector3::new(-0.144, 0., 0.50);

        let randomized_init_position_angle_degree = if init_at_center {
            0.
        } else {
            random_from_range(-15., 15.)
        };

        LinearActuatedRigidBodyOnHingeAxis::new(
            Mass::new::<kilogram>(95.),
            size,
            cg_offset,
            aero_center,
            control_arm,
            anchor,
            Angle::new::<degree>(-25.),
            Angle::new::<degree>(50.),
            Angle::new::<degree>(randomized_init_position_angle_degree),
            100.,
            false,
            Vector3::new(0., 1., 0.),
        )
    }

    /// Builds an aileron assembly consisting of the aileron physical rigid body and two hydraulic actuators connected
    /// to it
    pub(super) fn a320_rudder_assembly(
        context: &mut InitContext,
        init_at_center: bool,
    ) -> HydraulicLinearActuatorAssembly<3> {
        let rudder_body = Self::a320_rudder_body(init_at_center);

        let rudder_actuator_green = Self::a320_rudder_actuator(context, &rudder_body);
        let rudder_actuator_blue = Self::a320_rudder_actuator(context, &rudder_body);
        let rudder_actuator_yellow = Self::a320_rudder_actuator(context, &rudder_body);

        HydraulicLinearActuatorAssembly::new(
            [
                rudder_actuator_green,
                rudder_actuator_blue,
                rudder_actuator_yellow,
            ],
            rudder_body,
        )
    }

    pub(super) fn new_rudder(context: &mut InitContext) -> RudderAssembly {
        let init_at_center = context.start_state() == StartState::Taxi
            || context.start_state() == StartState::Runway
            || context.is_in_flight();

        let assembly = Self::a320_rudder_assembly(context, init_at_center);
        RudderAssembly::new(context, assembly, Self::new_a320_rudder_aero_model())
    }

    pub(super) fn new_a320_rudder_aero_model() -> AerodynamicModel {
        let body = Self::a320_rudder_body(true);
        AerodynamicModel::new(
            &body,
            Some(Vector3::new(1., 0., 0.)),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(1., 0., 0.)),
            Ratio::new::<ratio>(0.4),
        )
    }
}

pub(super) struct A320FlapsFactory {}
impl A320FlapsFactory {
    pub(super) fn a320_flaps_factory(
        context: &mut InitContext,
        side: SecondarySurfaceSide,
    ) -> SecondarySurface {
        // 1 is inboard. 2 is outboard.
        SecondarySurface::new(context, side, SecondarySurfaceType::Flaps, 2)
    }
}

pub(super) struct A320SlatsFactory {}
impl A320SlatsFactory {
    pub(super) fn a320_slats_factory(
        context: &mut InitContext,
        side: SecondarySurfaceSide,
    ) -> SecondarySurface {
        // 1 is most inboard. 5 is most outboard.
        SecondarySurface::new(context, side, SecondarySurfaceType::Slats, 5)
    }
}

pub(super) struct A320GearDoorFactory {}
impl A320GearDoorFactory {
    pub(super) fn a320_nose_gear_door_aerodynamics() -> AerodynamicModel {
        // Faking the single door by only considering right door aerodynamics.
        // Will work with headwind, but will cause strange behaviour with massive crosswind.
        AerodynamicModel::new(
            &Self::a320_nose_gear_door_body(),
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., -0.2, 1.)),
            Some(Vector3::new(0., -1., -0.2)),
            Ratio::new::<ratio>(0.7),
        )
    }

    pub(super) fn a320_left_gear_door_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a320_left_gear_door_body(),
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., -0.1, 1.)),
            Some(Vector3::new(0., 1., 0.1)),
            Ratio::new::<ratio>(0.7),
        )
    }

    pub(super) fn a320_right_gear_door_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a320_right_gear_door_body(),
            Some(Vector3::new(0., 1., 0.)),
            Some(Vector3::new(0., -0.1, 1.)),
            Some(Vector3::new(0., 1., 0.1)),
            Ratio::new::<ratio>(0.7),
        )
    }

    pub(super) fn a320_nose_gear_door_actuator(
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
            Pressure::new::<psi>(A320HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    pub(super) fn a320_main_gear_door_actuator(
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
            Pressure::new::<psi>(A320HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    pub(super) fn a320_left_gear_door_body() -> LinearActuatedRigidBodyOnHingeAxis {
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

    pub(super) fn a320_right_gear_door_body() -> LinearActuatedRigidBodyOnHingeAxis {
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

    pub(super) fn a320_nose_gear_door_body() -> LinearActuatedRigidBodyOnHingeAxis {
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

    pub(super) fn a320_gear_door_assembly(
        context: &mut InitContext,
        wheel_id: GearWheel,
    ) -> HydraulicLinearActuatorAssembly<1> {
        let gear_door_body = match wheel_id {
            GearWheel::NOSE => Self::a320_nose_gear_door_body(),
            GearWheel::LEFT => Self::a320_left_gear_door_body(),
            GearWheel::RIGHT => Self::a320_right_gear_door_body(),
            GearWheel::WINGLEFT | GearWheel::WINGRIGHT => panic!("No wing bogey on 32NX"),
        };
        let gear_door_actuator = match wheel_id {
            GearWheel::NOSE => Self::a320_nose_gear_door_actuator(context, &gear_door_body),
            GearWheel::LEFT | GearWheel::RIGHT => {
                Self::a320_main_gear_door_actuator(context, &gear_door_body)
            }
            GearWheel::WINGLEFT | GearWheel::WINGRIGHT => panic!("No wing bogey on 32NX"),
        };

        HydraulicLinearActuatorAssembly::new([gear_door_actuator], gear_door_body)
    }
}

pub(super) struct A320GearFactory {}
impl A320GearFactory {
    pub(super) fn a320_nose_gear_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a320_nose_gear_body(true),
            Some(Vector3::new(0., 0., 1.)),
            None,
            None,
            Ratio::new::<ratio>(0.25),
        )
    }

    pub(super) fn a320_right_gear_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a320_right_gear_body(true),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(0.3, 0., 1.)),
            Some(Vector3::new(1., 0., -0.3)),
            Ratio::new::<ratio>(0.7),
        )
    }

    pub(super) fn a320_left_gear_aerodynamics() -> AerodynamicModel {
        AerodynamicModel::new(
            &Self::a320_left_gear_body(true),
            Some(Vector3::new(0., 0., 1.)),
            Some(Vector3::new(-0.3, 0., 1.)),
            Some(Vector3::new(-1., 0., -0.3)),
            Ratio::new::<ratio>(0.7),
        )
    }

    pub(super) fn a320_nose_gear_actuator(
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
            Pressure::new::<psi>(A320HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    pub(super) fn a320_main_gear_actuator(
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
            Pressure::new::<psi>(A320HydraulicCircuitFactory::HYDRAULIC_TARGET_PRESSURE_PSI),
        )
    }

    pub(super) fn a320_left_gear_body(init_downlocked: bool) -> LinearActuatedRigidBodyOnHingeAxis {
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

    pub(super) fn a320_right_gear_body(
        init_downlocked: bool,
    ) -> LinearActuatedRigidBodyOnHingeAxis {
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

    pub(super) fn a320_nose_gear_body(init_downlocked: bool) -> LinearActuatedRigidBodyOnHingeAxis {
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

    pub(super) fn a320_gear_assembly(
        context: &mut InitContext,
        wheel_id: GearWheel,
        init_downlocked: bool,
    ) -> HydraulicLinearActuatorAssembly<1> {
        let gear_body = match wheel_id {
            GearWheel::NOSE => Self::a320_nose_gear_body(init_downlocked),

            GearWheel::LEFT => Self::a320_left_gear_body(init_downlocked),

            GearWheel::RIGHT => Self::a320_right_gear_body(init_downlocked),

            GearWheel::WINGLEFT | GearWheel::WINGRIGHT => panic!("No wing bogey on 32NX"),
        };

        let gear_actuator = match wheel_id {
            GearWheel::NOSE => Self::a320_nose_gear_actuator(context, &gear_body),

            GearWheel::LEFT | GearWheel::RIGHT => {
                Self::a320_main_gear_actuator(context, &gear_body)
            }

            GearWheel::WINGLEFT | GearWheel::WINGRIGHT => panic!("No wing bogey on 32NX"),
        };

        HydraulicLinearActuatorAssembly::new([gear_actuator], gear_body)
    }
}

pub(super) struct A320GearSystemFactory {}
impl A320GearSystemFactory {
    pub(super) fn a320_gear_system(context: &mut InitContext) -> HydraulicGearSystem {
        let init_downlocked = context.start_gear_down();

        let nose_door = A320GearDoorFactory::a320_gear_door_assembly(context, GearWheel::NOSE);
        let left_door = A320GearDoorFactory::a320_gear_door_assembly(context, GearWheel::LEFT);
        let right_door = A320GearDoorFactory::a320_gear_door_assembly(context, GearWheel::RIGHT);

        let nose_gear =
            A320GearFactory::a320_gear_assembly(context, GearWheel::NOSE, init_downlocked);
        let left_gear =
            A320GearFactory::a320_gear_assembly(context, GearWheel::LEFT, init_downlocked);
        let right_gear =
            A320GearFactory::a320_gear_assembly(context, GearWheel::RIGHT, init_downlocked);

        HydraulicGearSystem::new(
            context,
            nose_door,
            left_door,
            right_door,
            nose_gear,
            left_gear,
            right_gear,
            A320GearDoorFactory::a320_left_gear_door_aerodynamics(),
            A320GearDoorFactory::a320_right_gear_door_aerodynamics(),
            A320GearDoorFactory::a320_nose_gear_door_aerodynamics(),
            A320GearFactory::a320_left_gear_aerodynamics(),
            A320GearFactory::a320_right_gear_aerodynamics(),
            A320GearFactory::a320_nose_gear_aerodynamics(),
        )
    }
}
