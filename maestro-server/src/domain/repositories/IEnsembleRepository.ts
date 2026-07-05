import { Ensemble } from '../../types';

/**
 * Persistence interface for the Ensemble entity (multi-session coordination unit).
 * Implementations should survive server restart — ensembles are long-lived collaborations.
 */
export interface IEnsembleRepository {
  initialize(): Promise<void>;
  findAll(): Promise<Ensemble[]>;
  findById(id: string): Promise<Ensemble | null>;
  findByMemberSessionId(sessionId: string): Promise<Ensemble[]>;
  create(ensemble: Ensemble): Promise<Ensemble>;
  update(id: string, data: Partial<Ensemble>): Promise<Ensemble>;
  delete(id: string): Promise<void>;
}
