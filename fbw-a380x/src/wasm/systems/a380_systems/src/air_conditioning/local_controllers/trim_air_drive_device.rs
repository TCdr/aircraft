use std::time::Duration;

use systems::{
    air_conditioning::{
        acs_controller::{TrimAirPressureRegulatingValveController, TrimAirValveController},
        AirConditioningOverheadShared, Channel, DuctTemperature, OperatingChannel,
        TrimAirControllers, TrimAirSystem, ZoneType,
    },
    failures::FailureType,
    pneumatic::PneumaticValveSignal,
    shared::{
        ControllerSignal, ElectricalBusType, EngineStartState, PackFlowValveState, PneumaticBleed,
    },
    simulation::{
        InitContext, SimulationElement, SimulationElementVisitor, SimulatorWriter, UpdateContext,
        VariableIdentifier, Write,
    },
};
use uom::si::{f64::*, ratio::percent, thermodynamic_temperature::degree_celsius};

#[derive(Debug)]
enum TaddFault {
    OneChannelFault,
    BothChannelsFault,
}

/// The hot-air valve (HOT AIR 1 or 2) that feeds the trim air valve of a zone.
///
/// A380 FCOM DSC-21-10-10-20 (a380_fcom.txt:5338-5339): four hot-air manifolds, each hot-air valve feeds two of
/// them. Which zones hang on which manifold is only given by the COND DUCT OVHT procedure (a380_fcom.txt:132599-132623):
/// a cockpit duct overheat asks for HOT AIR 2 OFF and a forward cargo duct overheat for HOT AIR 1 OFF, while for a cabin
/// duct "the hot-air valve that must be closed depends on the affected cabin duct" (a380_fcom.txt:132612).
/// Design choice (no source): the main deck zones are fed by HOT AIR 1 (with the forward cargo below them), the upper
/// deck zones by HOT AIR 2 (with the cockpit). The bulk cargo has no trim air valve on the aircraft (electric heater,
/// a380_fcom.txt:5489-5501); its model trim air valve is put on HOT AIR 1.
pub fn hot_air_valve_feeding_zone(zone: ZoneType) -> usize {
    match zone {
        ZoneType::Cockpit => 2,
        ZoneType::Cabin(number) if number >= 20 => 2,
        ZoneType::Cabin(_) => 1,
        ZoneType::Cargo(_) => 1,
    }
}

/// The zones whose trim air duct the temperature controller monitors: the cockpit, the cabin zones and the forward
/// cargo. The bulk cargo duct is heated electrically and has its own duct overheat alert (COND BULK CARGO DUCT OVHT).
fn zone_has_trim_air_duct_monitoring(zone: ZoneType) -> bool {
    !matches!(zone, ZoneType::Cargo(2))
}

pub trait TaddShared {
    fn hot_air_is_enabled(&self, hot_air_id: usize) -> bool;
    fn trim_air_pressure_regulating_valve_is_open(&self, taprv_id: usize) -> bool;
    /// The duct of the zone (index in the zone list) is overheated (above 70 deg C, latched until it cools down and
    /// the HOT AIR pb of the zone is set OFF)
    fn duct_overheat(&self, zone_index: usize) -> bool;
    /// The trim air valve of the zone (index in the zone list) does not follow its command (jammed)
    fn trim_air_valve_fault(&self, zone_index: usize) -> bool;
}

pub struct TrimAirDriveDevice<const ZONES: usize, const ENGINES: usize> {
    tadd_channel_1_failure_id: VariableIdentifier,
    tadd_channel_2_failure_id: VariableIdentifier,
    duct_overheat_id: [VariableIdentifier; ZONES],
    trim_air_valve_fault_id: [VariableIdentifier; ZONES],

    zones: [ZoneType; ZONES],
    duct_overheat: [bool; ZONES],
    duct_overheat_timer: [Duration; ZONES],
    trim_air_valve_fault: [bool; ZONES],
    trim_air_valve_disagree_timer: [Duration; ZONES],
    // Position of each jammed trim air valve when it was found jammed: the fault clears once the valve moves again
    trim_air_valve_jammed_position: [Ratio; ZONES],

    active_channel: OperatingChannel,
    stand_by_channel: OperatingChannel,
    hot_air_is_enabled: [bool; 2],
    hot_air_is_open: [bool; 2],
    taprv_open_disagrees: [bool; 2],
    taprv_open_timer: [Duration; 2],
    taprv_closed_disagrees: [bool; 2],
    taprv_closed_timer: [Duration; 2],
    taprv_controllers: [TrimAirPressureRegulatingValveController; 2],
    trim_air_valve_controllers: [TrimAirValveController; ZONES],

    fault: Option<TaddFault>,
}

impl<const ZONES: usize, const ENGINES: usize> TrimAirDriveDevice<ZONES, ENGINES> {
    const TAPRV_OPEN_COMMAND_DISAGREE_TIMER: f64 = 30.; // seconds
    const TAPRV_CLOSE_COMMAND_DISAGREE_TIMER: f64 = 14.; // seconds
    const TIMER_RESET: f64 = 1.2; // seconds

    // A380 FCOM PRO-ABN-ECAM-10-21-10 COND DUCT OVHT (a380_fcom.txt:132573): "There is a duct overheat, when the air
    // temperature inside the applicable duct exceeds 70 deg C". DSC-21-10-20 HOT AIR pb (a380_fcom.txt:5644-5645): the
    // FAULT light goes off when the temperature decreases below 70 deg C and the HOT AIR pb is set to OFF.
    const DUCT_OVERHEAT_LIMIT_DEG_C: f64 = 70.;
    // Design choice: the duct temperature must stay above the limit this long before the overheat is declared, as the
    // other monitors of this controller confirm their disagreements (TIMER_RESET).
    const DUCT_OVERHEAT_CONFIRMATION_TIME: f64 = 1.2; // seconds

    // Design choice (the FCOM gives no detection logic): a trim air valve is jammed when its position stays this far
    // from the controller command for this long. The valves travel fully in 5 s, so a healthy valve never disagrees
    // that long.
    const TRIM_AIR_VALVE_DISAGREE_LIMIT_PERCENT: f64 = 10.;
    const TRIM_AIR_VALVE_DISAGREE_TIME: f64 = 10.; // seconds

    // A jammed valve does not move at all: once it moves again it follows its commands, and the fault clears
    const TRIM_AIR_VALVE_MOVING_AGAIN_PERCENT: f64 = 1.;

    pub fn new(
        context: &mut InitContext,
        powered_by: [ElectricalBusType; 2],
        zones: &[ZoneType; ZONES],
    ) -> Self {
        Self {
            tadd_channel_1_failure_id: context
                .get_identifier("COND_TADD_CHANNEL_1_FAILURE".to_owned()),
            tadd_channel_2_failure_id: context
                .get_identifier("COND_TADD_CHANNEL_2_FAILURE".to_owned()),
            duct_overheat_id: zones
                .map(|zone| context.get_identifier(format!("COND_{}_DUCT_OVHT", zone))),
            trim_air_valve_fault_id: zones
                .map(|zone| context.get_identifier(format!("COND_{}_TRIM_AIR_VALVE_FAULT", zone))),

            zones: *zones,
            duct_overheat: [false; ZONES],
            duct_overheat_timer: [Duration::ZERO; ZONES],
            trim_air_valve_fault: [false; ZONES],
            trim_air_valve_disagree_timer: [Duration::ZERO; ZONES],
            trim_air_valve_jammed_position: [Ratio::default(); ZONES],

            active_channel: OperatingChannel::new(
                1,
                Some(FailureType::Tadd(Channel::ChannelOne)),
                &[powered_by[0]],
            ),
            stand_by_channel: OperatingChannel::new(
                2,
                Some(FailureType::Tadd(Channel::ChannelTwo)),
                &[powered_by[1]],
            ),
            hot_air_is_enabled: [false; 2],
            hot_air_is_open: [false; 2],
            taprv_open_disagrees: [false; 2],
            taprv_open_timer: [Duration::ZERO; 2],
            taprv_closed_disagrees: [false; 2],
            taprv_closed_timer: [Duration::ZERO; 2],
            taprv_controllers: [TrimAirPressureRegulatingValveController::new(); 2],
            trim_air_valve_controllers: [TrimAirValveController::new(); ZONES],

            fault: None,
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        acs_overhead: &impl AirConditioningOverheadShared,
        duct_demand_temperature: &impl DuctTemperature,
        duct_temperature: &impl DuctTemperature,
        pneumatic: &(impl EngineStartState + PackFlowValveState + PneumaticBleed),
        should_close_taprv: [bool; 2],
        trim_air_system: &TrimAirSystem<ZONES, ENGINES>,
    ) {
        self.fault_determination();

        self.hot_air_is_enabled = [1, 2].map(|id| {
            self.trim_air_pressure_regulating_valve_status_determination(
                acs_overhead,
                should_close_taprv[id - 1],
                id,
                pneumatic,
            )
        });

        self.taprv_controllers
            .iter_mut()
            .enumerate()
            .for_each(|(id, controller)| controller.update(self.hot_air_is_enabled[id]));

        self.hot_air_is_open =
            [1, 2].map(|id| trim_air_system.trim_air_pressure_regulating_valve_is_open(id));

        self.taprv_open_disagrees =
            [1, 2].map(|hot_air_id| self.taprv_open_command_disagree_monitor(context, hot_air_id));
        self.taprv_closed_disagrees = [1, 2]
            .map(|hot_air_id| self.taprv_closed_command_disagree_monitor(context, hot_air_id));

        if !matches!(self.fault, Some(TaddFault::BothChannelsFault))
            && !self.active_channel.has_fault()
        {
            let duct_temperatures = duct_temperature.duct_temperature();
            let duct_demand_temperatures = duct_demand_temperature.duct_demand_temperature();
            for (id, tav_controller) in self.trim_air_valve_controllers.iter_mut().enumerate() {
                // A trim air valve only gets hot air while the hot-air valve of its manifolds is open
                let feeding_hot_air_is_open =
                    self.hot_air_is_open[hot_air_valve_feeding_zone(self.zones[id]) - 1];
                tav_controller.update(
                    context,
                    feeding_hot_air_is_open,
                    duct_temperatures[id],
                    duct_demand_temperatures[id],
                )
            }

            let trim_air_valve_positions = trim_air_system.trim_air_valves_open_amount();
            for id in 0..ZONES {
                if zone_has_trim_air_duct_monitoring(self.zones[id]) {
                    self.duct_overheat[id] = self.duct_overheat_monitor(
                        context,
                        acs_overhead,
                        id,
                        duct_temperatures[id],
                    );
                    self.trim_air_valve_fault[id] =
                        self.trim_air_valve_jam_monitor(context, id, trim_air_valve_positions[id]);
                }
            }
        } else {
            // With both channels lost nothing monitors the ducts and the valves (COND TEMP CTL FAULT)
            self.duct_overheat = [false; ZONES];
            self.duct_overheat_timer = [Duration::ZERO; ZONES];
            self.trim_air_valve_fault = [false; ZONES];
            self.trim_air_valve_disagree_timer = [Duration::ZERO; ZONES];
        }
    }

    /// Duct overheat of one zone: set when the duct stays above 70 deg C, reset when it is back below 70 deg C with
    /// the HOT AIR pb of the zone set OFF (a380_fcom.txt:132573, 5644-5645).
    fn duct_overheat_monitor(
        &mut self,
        context: &UpdateContext,
        acs_overhead: &impl AirConditioningOverheadShared,
        zone_index: usize,
        duct_temperature: ThermodynamicTemperature,
    ) -> bool {
        let is_overheated = self.duct_overheat[zone_index];
        if duct_temperature
            > ThermodynamicTemperature::new::<degree_celsius>(Self::DUCT_OVERHEAT_LIMIT_DEG_C)
        {
            self.duct_overheat_timer[zone_index] += context.delta();
            is_overheated
                || self.duct_overheat_timer[zone_index]
                    > Duration::from_secs_f64(Self::DUCT_OVERHEAT_CONFIRMATION_TIME)
        } else {
            self.duct_overheat_timer[zone_index] = Duration::ZERO;
            let hot_air_pb_is_on = acs_overhead
                .hot_air_pushbutton_is_on(hot_air_valve_feeding_zone(self.zones[zone_index]));
            is_overheated && hot_air_pb_is_on
        }
    }

    /// Jammed trim air valve of one zone: its position stays away from the command of its controller.
    fn trim_air_valve_jam_monitor(
        &mut self,
        context: &UpdateContext,
        zone_index: usize,
        valve_position: Ratio,
    ) -> bool {
        if self.trim_air_valve_fault[zone_index] {
            let moved_since_jammed =
                (valve_position - self.trim_air_valve_jammed_position[zone_index]).abs()
                    > Ratio::new::<percent>(Self::TRIM_AIR_VALVE_MOVING_AGAIN_PERCENT);
            if moved_since_jammed {
                self.trim_air_valve_disagree_timer[zone_index] = Duration::ZERO;
            }
            return !moved_since_jammed;
        }

        let commanded_position = self.trim_air_valve_controllers[zone_index]
            .signal()
            .map(|signal| signal.target_open_amount())
            .unwrap_or_default();
        if (commanded_position - valve_position).abs()
            > Ratio::new::<percent>(Self::TRIM_AIR_VALVE_DISAGREE_LIMIT_PERCENT)
        {
            self.trim_air_valve_disagree_timer[zone_index] += context.delta();
            if self.trim_air_valve_disagree_timer[zone_index]
                > Duration::from_secs_f64(Self::TRIM_AIR_VALVE_DISAGREE_TIME)
            {
                self.trim_air_valve_jammed_position[zone_index] = valve_position;
                return true;
            }
        } else {
            self.trim_air_valve_disagree_timer[zone_index] = Duration::ZERO;
        }
        false
    }

    /// The HOT AIR 1(2) pb FAULT light: an overheat is detected in a duct fed by that hot-air valve
    /// (A380 FCOM DSC-21-10-20 HOT AIR pb, a380_fcom.txt:5636-5645)
    pub fn hot_air_pushbutton_has_fault(&self, hot_air_id: usize) -> bool {
        (0..ZONES).any(|id| {
            self.duct_overheat[id] && hot_air_valve_feeding_zone(self.zones[id]) == hot_air_id
        })
    }

    fn fault_determination(&mut self) {
        self.active_channel.update_fault();
        self.stand_by_channel.update_fault();

        self.fault = match (
            self.active_channel.has_fault(),
            self.stand_by_channel.has_fault(),
        ) {
            (true, true) => Some(TaddFault::BothChannelsFault),
            (false, false) => None,
            (ac, _) => {
                if ac {
                    self.switch_active_channel();
                }
                Some(TaddFault::OneChannelFault)
            }
        };
    }

    fn switch_active_channel(&mut self) {
        std::mem::swap(&mut self.stand_by_channel, &mut self.active_channel);
    }

    fn trim_air_pressure_regulating_valve_status_determination(
        &self,
        acs_overhead: &impl AirConditioningOverheadShared,
        should_close_taprv: bool,
        hot_air_id: usize,
        pneumatic: &impl PackFlowValveState,
    ) -> bool {
        acs_overhead.hot_air_pushbutton_is_on(hot_air_id)
            && !self.active_channel.has_fault()
            && (pneumatic.pack_flow_valve_is_open(1) || pneumatic.pack_flow_valve_is_open(2))
            && !should_close_taprv
        // No automatic closure on a duct overheat or a jammed trim air valve: the A380 FCOM has the crew set the HOT
        // AIR pb OFF in COND DUCT OVHT (a380_fcom.txt:132599-132623), and a jammed trim air valve leaves both
        // hot-air valves regulating (DSC-21-10-30, a380_fcom.txt:6104-6133).
    }

    fn taprv_open_command_disagree_monitor(
        &mut self,
        context: &UpdateContext,
        hot_air_id: usize,
    ) -> bool {
        let index = hot_air_id - 1;
        if !self.hot_air_is_enabled[index] {
            false
        } else if !self.hot_air_is_open[index] && !self.taprv_open_disagrees[index] {
            if self.taprv_open_timer[index]
                > Duration::from_secs_f64(Self::TAPRV_OPEN_COMMAND_DISAGREE_TIMER)
            {
                self.taprv_open_timer[index] = Duration::default();
                true
            } else {
                self.taprv_open_timer[index] += context.delta();
                false
            }
        } else if self.hot_air_is_open[index] && self.taprv_open_disagrees[index] {
            if self.taprv_open_timer[index] > Duration::from_secs_f64(Self::TIMER_RESET) {
                self.taprv_open_timer[index] = Duration::default();
                false
            } else {
                self.taprv_open_timer[index] += context.delta();
                true
            }
        } else {
            self.taprv_open_disagrees[index]
        }
    }

    fn taprv_closed_command_disagree_monitor(
        &mut self,
        context: &UpdateContext,
        hot_air_id: usize,
    ) -> bool {
        let index = hot_air_id - 1;
        if self.hot_air_is_enabled[index] {
            false
        } else if self.hot_air_is_open[index] && !self.taprv_closed_disagrees[index] {
            if self.taprv_closed_timer[index]
                > Duration::from_secs_f64(Self::TAPRV_CLOSE_COMMAND_DISAGREE_TIMER)
            {
                self.taprv_closed_timer[index] = Duration::default();
                true
            } else {
                self.taprv_closed_timer[index] += context.delta();
                false
            }
        } else if !self.hot_air_is_open[index] && self.taprv_closed_disagrees[index] {
            if self.taprv_closed_timer[index] > Duration::from_secs_f64(Self::TIMER_RESET) {
                self.taprv_closed_timer[index] = Duration::default();
                false
            } else {
                self.taprv_closed_timer[index] += context.delta();
                true
            }
        } else {
            self.taprv_closed_disagrees[index]
        }
    }

    pub fn taprv_disagree_status_monitor(&self, hot_air_id: usize) -> bool {
        self.taprv_open_disagrees[hot_air_id - 1] || self.taprv_closed_disagrees[hot_air_id - 1]
    }

    pub fn taprv_controller(&self) -> [TrimAirPressureRegulatingValveController; 2] {
        self.taprv_controllers
    }
}

impl<const ZONES: usize, const ENGINES: usize> TaddShared for TrimAirDriveDevice<ZONES, ENGINES> {
    fn hot_air_is_enabled(&self, hot_air_id: usize) -> bool {
        self.hot_air_is_enabled[hot_air_id - 1]
    }
    fn trim_air_pressure_regulating_valve_is_open(&self, taprv_id: usize) -> bool {
        self.hot_air_is_open[taprv_id - 1]
    }
    fn duct_overheat(&self, zone_index: usize) -> bool {
        self.duct_overheat[zone_index]
    }
    fn trim_air_valve_fault(&self, zone_index: usize) -> bool {
        self.trim_air_valve_fault[zone_index]
    }
}

impl<const ZONES: usize, const ENGINES: usize> TrimAirControllers
    for TrimAirDriveDevice<ZONES, ENGINES>
{
    fn trim_air_valve_controllers(&self, zone_id: usize) -> TrimAirValveController {
        self.trim_air_valve_controllers[zone_id]
    }
}

impl<const ZONES: usize, const ENGINES: usize> SimulationElement
    for TrimAirDriveDevice<ZONES, ENGINES>
{
    fn write(&self, writer: &mut SimulatorWriter) {
        let (channel_1_failure, channel_2_failure) = match self.fault {
            None => (false, false),
            Some(TaddFault::OneChannelFault) => (
                self.stand_by_channel.id() == Channel::ChannelOne,
                self.stand_by_channel.id() == Channel::ChannelTwo,
            ),
            Some(TaddFault::BothChannelsFault) => (true, true),
        };
        writer.write(&self.tadd_channel_1_failure_id, channel_1_failure);
        writer.write(&self.tadd_channel_2_failure_id, channel_2_failure);

        // Per zone OVHT and trim air valve marks of the COND SD page (DSC-21-10-20, a380_fcom.txt:5906-5910, 6018-6022)
        for id in 0..ZONES {
            writer.write(&self.duct_overheat_id[id], self.duct_overheat[id]);
            writer.write(
                &self.trim_air_valve_fault_id[id],
                self.trim_air_valve_fault[id],
            );
        }
    }

    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.active_channel.accept(visitor);
        self.stand_by_channel.accept(visitor);

        visitor.visit(self);
    }
}
