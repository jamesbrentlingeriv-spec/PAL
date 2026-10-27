import Dexie, { type Table } from 'dexie';
import { PALLensDesign } from '../types/pal';
import { SEED_PAL_LENSES } from '../data/seedLenses';

export class PALScopeDB extends Dexie {
  lenses!: Table<PALLensDesign, string>;

  constructor() {
    super('PALScopeDatabase');
    this.version(1).stores({
      lenses: 'id, brand, designName, temporalSymbolCategory, fittingCrossDropMm, minFittingHeightMm, isCustom'
    });
  }
}

export const db = new PALScopeDB();

export async function initializePALDatabase(): Promise<PALLensDesign[]> {
  try {
    const existingCount = await db.lenses.count();
    if (existingCount === 0) {
      await db.lenses.bulkPut(SEED_PAL_LENSES);
    } else {
      // Ensure all seed lenses are up to date while preserving custom lenses
      const existingIds = new Set(await db.lenses.toCollection().primaryKeys());
      const missingSeeds = SEED_PAL_LENSES.filter((seed) => !existingIds.has(seed.id));
      if (missingSeeds.length > 0) {
        await db.lenses.bulkPut(missingSeeds);
      }
    }
    const allLenses = await db.lenses.toArray();
    return allLenses.sort((a, b) => {
      if (a.isCustom && !b.isCustom) return -1;
      if (!a.isCustom && b.isCustom) return 1;
      return `${a.brand} ${a.designName}`.localeCompare(`${b.brand} ${b.designName}`);
    });
  } catch (err) {
    console.warn('IndexedDB unavailable or restricted; falling back to in-memory seed database:', err);
    return [...SEED_PAL_LENSES];
  }
}

export async function saveCustomLensDesign(lens: PALLensDesign): Promise<PALLensDesign[]> {
  try {
    await db.lenses.put({
      ...lens,
      isCustom: true,
      createdAt: Date.now()
    });
  } catch (err) {
    console.error('Error saving custom lens to IndexedDB:', err);
  }
  return initializePALDatabase();
}

export async function deleteCustomLensDesign(id: string): Promise<PALLensDesign[]> {
  try {
    await db.lenses.delete(id);
  } catch (err) {
    console.error('Error deleting custom lens from IndexedDB:', err);
  }
  return initializePALDatabase();
}
