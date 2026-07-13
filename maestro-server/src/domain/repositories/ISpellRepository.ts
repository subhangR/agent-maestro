import { Spell } from '../../types';

export interface ISpellRepository {
  findAll(): Promise<Spell[]>;
  findById(id: string): Promise<Spell | null>;
  create(spell: Spell): Promise<Spell>;
  update(id: string, data: Partial<Spell>): Promise<Spell>;
  delete(id: string): Promise<void>;
  initialize(): Promise<void>;
}
