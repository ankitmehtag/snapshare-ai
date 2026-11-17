// Public API of the audit module (ARCHITECTURE §4: other modules import only this file).
import type { ClientSession } from 'mongoose';
import { auditRepo, type AuditEntry } from './repositories/audit.repo.js';

export type { AuditEntry };

/** Records a sensitive action (SECURITY §6). Pass the session to join a transaction. */
export function recordAudit(entry: AuditEntry, session?: ClientSession): Promise<void> {
  return auditRepo.insert(entry, session);
}

export const listAuditForActor = auditRepo.listForActor;

export const listAuditForScope = auditRepo.listForScope;
