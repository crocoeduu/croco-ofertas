import 'server-only';
import { AppError } from './errors';
import { reportDatabaseError } from './database-diagnostics';
export function storageError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  reportDatabaseError(error);
  return new AppError('STORAGE_ERROR');
}
