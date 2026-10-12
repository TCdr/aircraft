export interface GenericTcasEvents {
  tcasTaOnly: boolean;
  tcasFault: boolean;
  tcasMode: number;
  /** TCAS advisory state (L:A32NX_TCAS_STATE): 0 none, 1 TA, 2 RA */
  tcasState: number;
  /** Own aircraft on ground, for the TCAS ND setting messages */
  tcasAircraftOnGround: boolean;
}
