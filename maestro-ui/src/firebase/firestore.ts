import { getFirestore, Firestore } from 'firebase/firestore';
import { getFirebaseApp } from './config';

let db: Firestore | null = null;

export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseApp());
  return db;
}
