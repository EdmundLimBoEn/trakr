import type { ClaimRecord, EquipmentRecord, IssueRecord } from './types';
import { isOverdue } from './types';

export type EquipmentState = 'available' | 'checked-out' | 'overdue' | 'retired';
export type LiveEquipment = Pick<EquipmentRecord, 'equipmentId' | 'name' | 'internalSerial' | 'activeTagId' | 'status' | 'enrolledAt' | 'updatedAt'>;
export type LiveClaim = Pick<ClaimRecord, 'claimId' | 'equipmentId' | 'status' | 'condition' | 'checkedOutAt' | 'returnedAt'>;
export type LiveIssue = Pick<IssueRecord, 'issueId' | 'equipmentId' | 'status' | 'reportedAt' | 'resolvedAt'>;

export function publicRecords(equipment: EquipmentRecord[], claims: ClaimRecord[], issues: IssueRecord[]) {
  return {
    equipment: equipment.map(({ equipmentId, name, internalSerial, activeTagId, status, enrolledAt, updatedAt }): LiveEquipment => ({ equipmentId, name, internalSerial, activeTagId, status, enrolledAt, updatedAt })),
    claims: claims.map(({ claimId, equipmentId, status, condition, checkedOutAt, returnedAt }): LiveClaim => ({ claimId, equipmentId, status, condition, checkedOutAt, returnedAt })),
    issues: issues.map(({ issueId, equipmentId, status, reportedAt, resolvedAt }): LiveIssue => ({ issueId, equipmentId, status, reportedAt, resolvedAt })),
  };
}

export interface LiveSnapshot {
  projectId: string;
  readAt: string;
  equipment: LiveEquipment[];
  claims: LiveClaim[];
  issues: LiveIssue[];
}

export function equipmentState(equipment: LiveEquipment, claims: LiveClaim[], now: Date): EquipmentState {
  if (equipment.status === 'retired') return 'retired';
  const active = claims.filter(c => c.equipmentId === equipment.equipmentId && c.status === 'active');
  if (active.some(c => isOverdue(c.checkedOutAt, now))) return 'overdue';
  return active.length ? 'checked-out' : 'available';
}

export const STATE_LABELS: Record<EquipmentState, string> = {
  available: 'Available', 'checked-out': 'Checked out', overdue: 'Overdue', retired: 'Retired',
};
