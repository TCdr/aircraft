// Note: Fuel system for now is still handled in MSFS. This is used for calculating fuel-related factors.

use apu_fuel_feed::ApuFuelFeed;
use apu_lp_valve::ApuLpFuelValve;
use engine_lp_valve::EngineLpFuelValve;
use fuel_recirculation::FuelRecirculation;
use fuel_temperature::{
    idg_return_is_active, vertical_speed_ft_per_min, FuelTemperature, IdgReturnConditions,
};
use gravity_feed::{GravityFeed, WingPumpsRunning};
use nalgebra::Vector3;
use systems::{
    engine::Engine,
    fuel::{FuelCG, FuelInfo, FuelPayload, FuelPump, FuelPumpProperties, FuelSystem},
    shared::{ElectricalBusType, EngineFirePushButtons},
    simulation::{InitContext, SimulationElement, SimulationElementVisitor, UpdateContext},
};
use uom::si::{f64::*, mass::kilogram, thermodynamic_temperature::degree_celsius};

mod apu_fuel_feed;
mod apu_lp_valve;
mod engine_lp_valve;
mod fuel_recirculation;
mod fuel_temperature;
mod gravity_feed;
#[cfg(test)]
mod test;

#[allow(dead_code)]
pub trait FuelLevel {
    fn left_inner_tank_has_fuel(&self) -> bool;
    fn right_inner_tank_has_fuel(&self) -> bool;
    fn left_outer_tank_has_fuel(&self) -> bool;
    fn right_outer_tank_has_fuel(&self) -> bool;
    fn center_tank_has_fuel(&self) -> bool;
}

#[derive(Clone, Copy)]
pub enum A320FuelTankType {
    Center,
    LeftInner,
    LeftOuter,
    RightInner,
    RightOuter,
}

impl From<A320FuelTankType> for usize {
    fn from(value: A320FuelTankType) -> Self {
        value as usize
    }
}

pub struct A320Fuel {
    fuel_system: FuelSystem<5, 5>,
    engine_lp_valves: [EngineLpFuelValve; 2],
    gravity_feed: GravityFeed,
    apu_lp_valve: ApuLpFuelValve,
    apu_fuel_feed: ApuFuelFeed,
    fuel_temperature: FuelTemperature,
    fuel_recirculation: FuelRecirculation,
}
impl A320Fuel {
    /// The wing tank pumps in FUEL_PUMPS: left pumps 1 and 2, right pumps 1 and 2.
    const LEFT_WING_PUMPS: [usize; 2] = [0, 1];
    const RIGHT_WING_PUMPS: [usize; 2] = [2, 3];
    /// The APU fuel pump in FUEL_PUMPS
    const APU_FUEL_PUMP: usize = 4;

    pub const A320_FUEL: [FuelInfo<'static>; 5] = [
        FuelInfo {
            fuel_tank_id: "FUEL TANK CENTER QUANTITY",
            position: (-4.5, 0., 1.),
            total_capacity_gallons: 2179.,
        },
        FuelInfo {
            fuel_tank_id: "FUEL TANK LEFT MAIN QUANTITY",
            position: (-8., -13., 2.),
            total_capacity_gallons: 1816.,
        },
        FuelInfo {
            fuel_tank_id: "FUEL TANK LEFT AUX QUANTITY",
            position: (-16.9, -27., 3.),
            total_capacity_gallons: 228.,
        },
        FuelInfo {
            fuel_tank_id: "FUEL TANK RIGHT MAIN QUANTITY",
            position: (-8., 13., 2.),
            total_capacity_gallons: 1816.,
        },
        FuelInfo {
            fuel_tank_id: "FUEL TANK RIGHT AUX QUANTITY",
            position: (-16.9, 27., 3.),
            total_capacity_gallons: 228.,
        },
    ];

    // TODO: connect MSFS fuel pumps to power logic
    const FUEL_PUMPS: [(usize, FuelPumpProperties); 5] = [
        // Left main tank pump 1
        (
            2,
            FuelPumpProperties {
                powered_by: ElectricalBusType::Virtual("FUEL_PUMP_1_SUPPLY"),
                consumption_current_ampere: 8.,
            },
        ),
        // Left main tank pump 2
        (
            5,
            FuelPumpProperties {
                powered_by: ElectricalBusType::Virtual("FUEL_PUMP_2_SUPPLY"),
                consumption_current_ampere: 8.,
            },
        ),
        // Right main tank pump 1
        (
            3,
            FuelPumpProperties {
                powered_by: ElectricalBusType::Virtual("FUEL_PUMP_1_SUPPLY"),
                consumption_current_ampere: 8.,
            },
        ),
        // Right main tank pump 2
        (
            6,
            FuelPumpProperties {
                powered_by: ElectricalBusType::Virtual("FUEL_PUMP_2_SUPPLY"),
                consumption_current_ampere: 8.,
            },
        ),
        // APU fuel pump
        (
            7,
            FuelPumpProperties {
                powered_by: ElectricalBusType::Virtual("FUEL_PUMP_APU_SUPPLY"),
                consumption_current_ampere: 1.,
            },
        ),
    ];

    pub fn new(context: &mut InitContext) -> Self {
        let fuel_tanks = Self::A320_FUEL.map(|f| f.into_fuel_tank(context, false));
        let fuel_pumps =
            Self::FUEL_PUMPS.map(|(id, properties)| FuelPump::new(context, id, properties));
        A320Fuel {
            fuel_system: FuelSystem::new(context, fuel_tanks, fuel_pumps),
            engine_lp_valves: [1, 2].map(|number| EngineLpFuelValve::new(context, number)),
            gravity_feed: GravityFeed::new(context),
            apu_lp_valve: ApuLpFuelValve::new(context),
            apu_fuel_feed: ApuFuelFeed::new(context),
            fuel_temperature: FuelTemperature::new(context),
            fuel_recirculation: FuelRecirculation::new(context),
        }
    }

    pub fn update(
        &mut self,
        context: &UpdateContext,
        engine_fire_push_buttons: &impl EngineFirePushButtons,
        engines: [&impl Engine; 2],
    ) {
        for lp_valve in &mut self.engine_lp_valves {
            lp_valve.update(context, engine_fire_push_buttons);
        }

        let pumps = WingPumpsRunning {
            left: Self::LEFT_WING_PUMPS.map(|pump| self.fuel_system.is_fuel_pump_running(pump)),
            right: Self::RIGHT_WING_PUMPS.map(|pump| self.fuel_system.is_fuel_pump_running(pump)),
        };
        self.gravity_feed.update(context, pumps);
        self.apu_lp_valve.update(context);
        // The left fuel feed line supplies the APU (apu_fuel_feed.rs)
        let left_tank_pump_delivers = Self::LEFT_WING_PUMPS.iter().any(|&pump| {
            self.fuel_system.is_fuel_pump_running(pump)
                && self.fuel_system.is_fuel_pump_powered(pump)
        });
        self.apu_fuel_feed.update(
            context,
            left_tank_pump_delivers,
            self.fuel_system.is_fuel_pump_powered(Self::APU_FUEL_PUMP),
        );
        self.update_fuel_temperature(context, engines);
    }

    fn update_fuel_temperature(&mut self, context: &UpdateContext, engines: [&impl Engine; 2]) {
        let quantities_kg = [
            A320FuelTankType::Center,
            A320FuelTankType::LeftInner,
            A320FuelTankType::LeftOuter,
            A320FuelTankType::RightInner,
            A320FuelTankType::RightOuter,
        ]
        .map(|tank| self.fuel_system.tank_mass(tank.into()).get::<kilogram>());
        let wing_tanks = [
            (A320FuelTankType::LeftInner, A320FuelTankType::LeftOuter),
            (A320FuelTankType::RightInner, A320FuelTankType::RightOuter),
        ];
        let mut idg_return_active = [false; 2];
        let mut return_temperature_celsius = [0.; 2];
        for (side, (inner, outer)) in wing_tanks.into_iter().enumerate() {
            let cell_temperature = |tank: A320FuelTankType| {
                self.fuel_temperature
                    .temperature(tank)
                    .get::<degree_celsius>()
            };
            idg_return_active[side] = idg_return_is_active(IdgReturnConditions {
                engine_running: engines[side].is_above_minimum_idle(),
                on_ground: context.is_on_ground(),
                vertical_speed_ft_per_min: vertical_speed_ft_per_min(context),
                wing_tank_kg: quantities_kg[usize::from(inner)] + quantities_kg[usize::from(outer)],
                gravity_fed: self.gravity_feed.is_gravity_fed(side + 1),
                wing_tank_temperature_celsius: cell_temperature(inner).max(cell_temperature(outer)),
            });
            return_temperature_celsius[side] =
                self.fuel_temperature.idg_return_temperature_celsius(side);
        }
        let idg_return_flow_kg_per_hour =
            self.fuel_recirculation
                .update(engines, idg_return_active, return_temperature_celsius);
        self.fuel_temperature
            .update(context, quantities_kg, idg_return_flow_kg_per_hour);
    }

    /// The APU gets fuel: the left inner tank has fuel, the APU LP valve is not jammed closed and a left tank pump or
    /// the APU fuel pump pressurises the feed line (apu_fuel_feed.rs).
    pub fn apu_has_fuel(&self) -> bool {
        self.left_inner_tank_has_fuel_remaining()
            && !self.apu_lp_valve.blocks_apu_fuel()
            && self.apu_fuel_feed.has_pressure()
    }

    #[cfg(test)]
    pub fn apu_fuel_pump_runs(&self) -> bool {
        self.apu_fuel_feed.apu_fuel_pump_runs()
    }

    /// The engine has no fuel: its LP fuel valve is closed and the fuel downstream of it is burned,
    /// or it was fed by gravity above the gravity feed ceiling (gravity_feed.rs).
    pub fn engine_is_starved(&self, engine_number: usize) -> bool {
        self.engine_lp_valves[engine_number - 1].engine_is_starved()
            || self.gravity_feed.engine_is_starved(engine_number)
    }

    pub fn left_inner_tank_has_fuel_remaining(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::LeftInner.into())
    }

    #[allow(dead_code)]
    fn center_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::Center.into())
    }

    #[allow(dead_code)]
    fn left_inner_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::LeftInner.into())
    }

    #[allow(dead_code)]
    fn left_outer_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::LeftOuter.into())
    }

    #[allow(dead_code)]
    fn right_inner_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::RightInner.into())
    }

    #[allow(dead_code)]
    fn right_outer_tank_has_fuel(&self) -> bool {
        self.fuel_system
            .tank_has_fuel(A320FuelTankType::RightOuter.into())
    }

    fn fore_aft_center_of_gravity(&self) -> f64 {
        self.center_of_gravity().x
    }

    fn total_load(&self) -> Mass {
        self.fuel_system.total_load()
    }

    fn center_of_gravity(&self) -> Vector3<f64> {
        self.fuel_system.center_of_gravity()
    }
}
impl FuelLevel for A320Fuel {
    fn left_inner_tank_has_fuel(&self) -> bool {
        self.left_inner_tank_has_fuel()
    }
    fn right_inner_tank_has_fuel(&self) -> bool {
        self.right_inner_tank_has_fuel()
    }
    fn left_outer_tank_has_fuel(&self) -> bool {
        self.left_outer_tank_has_fuel()
    }
    fn right_outer_tank_has_fuel(&self) -> bool {
        self.right_outer_tank_has_fuel()
    }
    fn center_tank_has_fuel(&self) -> bool {
        self.center_tank_has_fuel()
    }
}
impl FuelPayload for A320Fuel {
    fn total_load(&self) -> Mass {
        self.total_load()
    }
    fn fore_aft_center_of_gravity(&self) -> f64 {
        self.fore_aft_center_of_gravity()
    }
}
impl FuelCG for A320Fuel {
    fn center_of_gravity(&self) -> Vector3<f64> {
        self.center_of_gravity()
    }
}
impl SimulationElement for A320Fuel {
    fn accept<T: SimulationElementVisitor>(&mut self, visitor: &mut T) {
        self.fuel_system.accept(visitor);
        for lp_valve in &mut self.engine_lp_valves {
            lp_valve.accept(visitor);
        }
        self.gravity_feed.accept(visitor);
        self.apu_lp_valve.accept(visitor);
        self.apu_fuel_feed.accept(visitor);
        self.fuel_temperature.accept(visitor);
        self.fuel_recirculation.accept(visitor);
        visitor.visit(self);
    }
}
