export enum DcElectricalBus {
  Dc1 = 'DC_1',
  Dc2 = 'DC_2',
  DcEss = 'DC_ESS',
  DcEssInFlight = '108PH',
}

export enum AcElectricalBus {
  Ac1 = 'AC_1',
  Ac2 = 'AC_2',
  Ac3 = 'AC_3',
  Ac4 = 'AC_4',
  /**
   * The A380 AC ESS busbar (400XP). The A380 electrical system publishes it as AC_ESS_SHED: the bus names come from
   * the A320, where AC_ESS is the A380 AC EMER busbar (491XP), see a380_systems electrical/alternating_current.rs.
   */
  AcEss = 'AC_ESS_SHED',
  /** The A380 AC EMER busbar (491XP), published as AC_ESS (see AcEss). */
  AcEmer = 'AC_ESS',
}
