pub mod predictive;
pub mod read_slot;
mod runtime;
pub mod terrain_grid;
#[cfg(test)]
mod test;

use crate::{
    failures::{Failure, FailureType},
    navigation::{
        adirs::{AirDataReferenceBus, InertialReferenceBus},
        ils::InstrumentLandingSystemBus,
        radio_altimeter::RadioAltimeter,
    },
    shared::{random_from_range, ConsumePower, ElectricalBusType, ElectricalBuses},
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
    surveillance::egpws::predictive::{
        PredictiveAlertOutputs, PredictiveOutputs, TerrainAheadMessage, ThreatAreas,
    },
    surveillance::{
        egpws::runtime::{
            AuralWarning, EnhancedGroundProximityWarningComputerRuntime, FlightPhase,
        },
        taws::{
            TerrainAwarenessWarningSystemBusOutput, TerrainAwarenessWarningSystemBusOutputs,
            TerrainAwarenessWarningSystemDiscreteInputs,
            TerrainAwarenessWarningSystemDiscreteOutput,
            TerrainAwarenessWarningSystemDiscreteOutputs,
        },
    },
};
pub use runtime::PredictiveFunctionsStatus;
use std::time::Duration;
use uom::si::{f64::Power, power::watt};

pub trait EgpwsElectricalHarness {
    fn discrete_inputs(&self) -> &TerrainAwarenessWarningSystemDiscreteInputs;
}

#[derive(Default, Clone, Copy, Debug)]
pub struct EnhancedGroundProximityWarningComputerPinProgramming {
    pub audio_declutter_disable: bool,
}

pub struct EnhancedGroundProximityWarningComputer {
    failure: Failure,

    // Power
    powered_by: ElectricalBusType,
    is_powered: bool,

    /// How long the computer can tolerate a power loss and continue functioning.
    power_holdover: Duration,

    /// How long the computer has been unpowered for.
    unpowered_for: Duration,

    /// How long the self checks take for runtimes running on this computer.
    self_check_time: Duration,

    runtime: Option<EnhancedGroundProximityWarningComputerRuntime>,

    discrete_output_data: TerrainAwarenessWarningSystemDiscreteOutputs,
    bus_output_data: TerrainAwarenessWarningSystemBusOutputs,

    /// The program pins of the aircraft wiring, given to every runtime started
    pin_programming: EnhancedGroundProximityWarningComputerPinProgramming,

    /// What the predictive terrain functions report. Kept here because the runtime is lost with the power.
    predictive_functions: PredictiveFunctionsStatus,
    predictive_alerts: PredictiveAlertOutputs,

    /// NVM data
    on_ground: bool,
    flight_phase: FlightPhase,

    terr_fault_id: VariableIdentifier,
    sys_fault_id: VariableIdentifier,

    warning_light_on_id: VariableIdentifier,
    alert_light_on_id: VariableIdentifier,

    aural_output_id: VariableIdentifier,
    terrain_test_pattern_id: VariableIdentifier,
    terr_ahead_id: VariableIdentifier,
    obst_ahead_id: VariableIdentifier,
    terr_area_ref_lat_id: VariableIdentifier,
    terr_area_ref_lon_id: VariableIdentifier,
    terr_area_ids: [VariableIdentifier; ThreatAreas::SLOTS],
}

impl EnhancedGroundProximityWarningComputer {
    const MINIMUM_STARTUP_TIME_MILLIS: Duration = Duration::from_millis(18_000);
    const MAXIMUM_STARTUP_TIME_MILLIS: Duration = Duration::from_millis(20_000);
    const MINIMUM_POWER_HOLDOVER: Duration = Duration::from_millis(200);
    const MAXIMUM_POWER_HOLDOVER: Duration = Duration::from_millis(300);

    const TERR_FAULT_KEY: &str = "GPWS_TERR_FAULT";
    const SYS_FAULT_KEY: &str = "GPWS_SYS_FAULT";
    const WARNING_LIGHT_ON_KEY: &str = "GPWS_WARNING_LIGHT_ON";
    const ALERT_LIGHT_ON_KEY: &str = "GPWS_ALERT_LIGHT_ON";
    const AURAL_OUTPUT_KEY: &str = "GPWS_AURAL_OUTPUT";
    /// The self-test shows the terrain test pattern (TERR TST on the ND)
    const TERRAIN_TEST_PATTERN_KEY: &str = "GPWS_TERR_TEST_PATTERN";
    /// The TERR AHEAD message of the NDs: 0 none, 1 caution (amber), 2 warning (red)
    const TERR_AHEAD_KEY: &str = "GPWS_TERR_AHEAD";
    /// The ND message is about an obstacle (OBST AHEAD instead of TERR AHEAD): 0 or 1
    const OBST_AHEAD_KEY: &str = "GPWS_OBST_AHEAD";
    /// The threat areas for the NDs (see ThreatAreas): the cell of the aircraft and the slots of runs
    const TERR_AREA_REF_LAT_KEY: &str = "GPWS_TERR_AREA_REF_LAT";
    const TERR_AREA_REF_LON_KEY: &str = "GPWS_TERR_AREA_REF_LON";

    pub fn new(context: &mut InitContext, powered_by: ElectricalBusType) -> Self {
        Self::new_with_pin_programming(
            context,
            powered_by,
            EnhancedGroundProximityWarningComputerPinProgramming::default(),
        )
    }

    /// A computer with the program pins of the aircraft wiring (lamp format, audio declutter).
    pub fn new_with_pin_programming(
        context: &mut InitContext,
        powered_by: ElectricalBusType,
        pin_programming: EnhancedGroundProximityWarningComputerPinProgramming,
    ) -> Self {
        let is_powered = context.has_engines_running();
        let on_ground = context.is_on_ground();
        Self {
            powered_by,
            is_powered: false,
            power_holdover: Duration::from_secs_f64(random_from_range(
                Self::MINIMUM_POWER_HOLDOVER.as_secs_f64(),
                Self::MAXIMUM_POWER_HOLDOVER.as_secs_f64(),
            )),
            unpowered_for: if is_powered {
                Duration::ZERO
            } else {
                Self::MAXIMUM_POWER_HOLDOVER
            },
            self_check_time: Duration::from_secs_f64(random_from_range(
                Self::MINIMUM_STARTUP_TIME_MILLIS.as_secs_f64(),
                Self::MAXIMUM_STARTUP_TIME_MILLIS.as_secs_f64(),
            )),

            runtime: if is_powered {
                Some(EnhancedGroundProximityWarningComputerRuntime::new_running(
                    on_ground,
                    if on_ground {
                        FlightPhase::Takeoff
                    } else {
                        FlightPhase::Approach
                    },
                    pin_programming,
                ))
            } else {
                None
            },
            failure: Failure::new(FailureType::EnhancedGroundProximityWarningSystemComputer),

            discrete_output_data: TerrainAwarenessWarningSystemDiscreteOutputs::default(),
            bus_output_data: TerrainAwarenessWarningSystemBusOutputs::default(),
            pin_programming,
            predictive_functions: PredictiveFunctionsStatus::default(),
            predictive_alerts: PredictiveAlertOutputs::default(),

            on_ground,
            flight_phase: if on_ground {
                FlightPhase::Takeoff
            } else {
                FlightPhase::Approach
            },
            terr_fault_id: context.get_identifier(Self::TERR_FAULT_KEY.to_owned()),
            sys_fault_id: context.get_identifier(Self::SYS_FAULT_KEY.to_owned()),

            warning_light_on_id: context.get_identifier(Self::WARNING_LIGHT_ON_KEY.to_owned()),
            alert_light_on_id: context.get_identifier(Self::ALERT_LIGHT_ON_KEY.to_owned()),

            aural_output_id: context.get_identifier(Self::AURAL_OUTPUT_KEY.to_owned()),
            terrain_test_pattern_id: context
                .get_identifier(Self::TERRAIN_TEST_PATTERN_KEY.to_owned()),
            terr_ahead_id: context.get_identifier(Self::TERR_AHEAD_KEY.to_owned()),
            obst_ahead_id: context.get_identifier(Self::OBST_AHEAD_KEY.to_owned()),
            terr_area_ref_lat_id: context.get_identifier(Self::TERR_AREA_REF_LAT_KEY.to_owned()),
            terr_area_ref_lon_id: context.get_identifier(Self::TERR_AREA_REF_LON_KEY.to_owned()),
            terr_area_ids: std::array::from_fn(|slot| {
                context.get_identifier(format!("GPWS_TERR_AREA_{slot}"))
            }),
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        electrical_harness: &impl EgpwsElectricalHarness,
        ra1: &impl RadioAltimeter,
        ra2: &impl RadioAltimeter,
        adr: &impl AirDataReferenceBus,
        ir: &impl InertialReferenceBus,
        ils: &impl InstrumentLandingSystemBus,
    ) {
        if self.is_powered {
            self.unpowered_for = Duration::ZERO;
        } else {
            self.unpowered_for += context.delta();
        }

        // Check if the internal state (runtime) is lost because either the unit failed, or the
        // power holdover has been exceed
        if self.failure.is_active() || !self.is_powered_with_holdover() {
            // Throw away the simulated software runtime, but first save to NVM
            if let Some(runtime) = self.runtime.take() {
                self.on_ground = runtime.get_on_ground();
                self.flight_phase = runtime.get_flight_phase();
            }

            // Set outputs to default failure state
            self.discrete_output_data = TerrainAwarenessWarningSystemDiscreteOutputs::default();
            // These discretes default to grounded when the EGPWS is unpowered or experienced a catastrophic failure
            self.discrete_output_data.gpws_inop = true;
            self.discrete_output_data.terrain_inop = true;
            self.discrete_output_data.terrain_not_available = true;
            self.bus_output_data = TerrainAwarenessWarningSystemBusOutputs::default();
        } else if self.is_powered {
            // As long as we're powered, we can proceed normally. If not, we can't run the runtime, but
            // it's state will be frozen and if power is restored soon enough, we can proceed
            // immediately without waiting for the runtime to start up again.

            // Either initialize and run or continue running the existing runtime
            let runtime = self.runtime.get_or_insert_with(|| {
                EnhancedGroundProximityWarningComputerRuntime::new(
                    self.self_check_time,
                    self.on_ground,
                    self.flight_phase,
                    self.pin_programming,
                )
            });
            runtime.set_predictive_functions_status(self.predictive_functions);
            runtime.set_predictive_alerts(self.predictive_alerts);
            runtime.update(
                context,
                electrical_harness.discrete_inputs(),
                ra1,
                ra2,
                adr,
                ir,
                ils,
            );
            runtime.set_outputs(&mut self.discrete_output_data, &mut self.bus_output_data);
        }
    }

    /// Reports whether the predictive terrain functions are operative. While they are, mode 2 is inhibited.
    pub fn set_predictive_functions_status(&mut self, status: PredictiveFunctionsStatus) {
        self.predictive_functions = status;
    }

    /// Gives the computer what the predictive terrain functions (terrain ahead alerting and terrain clearance floor)
    /// worked out: whether they are operative, and their alerts.
    pub fn set_predictive_outputs(&mut self, outputs: PredictiveOutputs) {
        self.predictive_functions = outputs.functions;
        self.predictive_alerts = outputs.alerts;
    }

    pub fn is_powered_with_holdover(&self) -> bool {
        self.unpowered_for <= self.power_holdover
    }

    pub fn has_failed(&self) -> bool {
        self.failure.is_active()
    }

    pub fn pin_programming(&self) -> EnhancedGroundProximityWarningComputerPinProgramming {
        self.pin_programming
    }
}

impl TerrainAwarenessWarningSystemBusOutput for EnhancedGroundProximityWarningComputer {
    fn bus_outputs(&self) -> &TerrainAwarenessWarningSystemBusOutputs {
        &self.bus_output_data
    }
}

impl TerrainAwarenessWarningSystemDiscreteOutput for EnhancedGroundProximityWarningComputer {
    fn discrete_outputs(&self) -> &TerrainAwarenessWarningSystemDiscreteOutputs {
        &self.discrete_output_data
    }
}

impl SimulationElement for EnhancedGroundProximityWarningComputer {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.failure.accept(visitor);

        visitor.visit(self);
    }

    fn receive_power(&mut self, buses: &impl ElectricalBuses) {
        self.is_powered = buses.is_powered(self.powered_by);
    }

    fn write(&self, writer: &mut SimulatorWriter) {
        writer.write(&self.terr_fault_id, self.discrete_output_data.terrain_inop);
        writer.write(&self.sys_fault_id, self.discrete_output_data.gpws_inop);

        writer.write(
            &self.alert_light_on_id,
            self.discrete_output_data.alert_lamp,
        );
        writer.write(
            &self.warning_light_on_id,
            self.discrete_output_data.warning_lamp,
        );
        writer.write(
            &self.aural_output_id,
            self.runtime
                .as_ref()
                .map_or(AuralWarning::None, |r| r.get_aural_output()) as u8,
        );
        writer.write(
            &self.terrain_test_pattern_id,
            self.runtime
                .as_ref()
                .is_some_and(|r| r.is_terrain_test_pattern_active()),
        );
        writer.write(
            &self.terr_ahead_id,
            self.runtime
                .as_ref()
                .map_or(TerrainAheadMessage::None, |r| r.get_terrain_ahead_message())
                as u8,
        );
        writer.write(
            &self.obst_ahead_id,
            self.runtime
                .as_ref()
                .is_some_and(|r| r.get_obstacle_ahead_message()),
        );
        let threat_areas = self
            .runtime
            .as_ref()
            .map_or(ThreatAreas::default(), |r| r.get_threat_areas());
        writer.write(
            &self.terr_area_ref_lat_id,
            threat_areas.reference.latitude_index as f64,
        );
        writer.write(
            &self.terr_area_ref_lon_id,
            threat_areas.reference.longitude_index as f64,
        );
        for (id, slot) in self.terr_area_ids.iter().zip(threat_areas.slots) {
            writer.write(id, slot);
        }
    }

    fn consume_power<T: ConsumePower>(&mut self, _: &UpdateContext, consumption: &mut T) {
        if !self.has_failed() {
            consumption.consume_from_bus(self.powered_by, Power::new::<watt>(15.))
        }
    }
}
