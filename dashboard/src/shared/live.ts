import type { ClaimRecord, EquipmentRecord, IssueRecord } from './types';
import { isOverdue } from './types';

export type EquipmentState = 'available' | 'checked-out' | 'overdue' | 'retired';
export interface LiveSnapshot {
  projectId: string;
  readAt: string;
  equipment: EquipmentRecord[];
  claims: ClaimRecord[];
  issues: IssueRecord[];
}

export function equipmentState(equipment: EquipmentRecord, claims: ClaimRecord[], now: Date): EquipmentState {
  if (equipment.status === 'retired') return 'retired';
  const active = claims.filter(c => c.equipmentId === equipment.equipmentId && c.status === 'active');
  if (active.some(c => isOverdue(c.checkedOutAt, now))) return 'overdue';
  return active.length ? 'checked-out' : 'available';
}

export const STATE_LABELS: Record<EquipmentState, string> = {
  available: 'Available', 'checked-out': 'Checked out', overdue: 'Overdue', retired: 'Retired',
};
