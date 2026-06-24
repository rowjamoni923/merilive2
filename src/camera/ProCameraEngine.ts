/**
 * ProCameraEngine — lightweight JS camera family arbiter.
 *
 * Native Android also has CameraOwnership, but React must prevent obvious
 * cross-screen conflicts before a plugin opens CameraX. Face Verification is a
 * separate native CameraX owner; Live / Party / Private Call are streaming
 * owners. Those two families must never be active at the same time.
 */

export type ProCameraOwner =
  | 'live-stream'
  | 'private-call'
  | 'video-party'
  | 'game-party'
  | 'face-verify';

type CameraFamily = 'streaming' | 'verification';

const ownerFamily = (owner: ProCameraOwner): CameraFamily => (
  owner === 'face-verify' ? 'verification' : 'streaming'
);

const refs = new Map<ProCameraOwner, number>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const activeOwners = (): ProCameraOwner[] => (
  Array.from(refs.entries())
    .filter(([, count]) => count > 0)
    .map(([owner]) => owner)
);

export class CameraConflictError extends Error {
  public readonly currentFamily: CameraFamily | null;
  public readonly currentOwners: ProCameraOwner[];
  constructor(public readonly requested: ProCameraOwner, owners: ProCameraOwner[] = activeOwners()) {
    const family = owners[0] ? ownerFamily(owners[0]) : null;
    super(`Camera busy — ${family === 'streaming' ? 'live, party, or call' : 'face verification'} is using the camera.`);
    this.name = 'CameraConflictError';
    this.currentFamily = family;
    this.currentOwners = owners;
  }
}

export function acquire(owner: ProCameraOwner): void {
  const owners = activeOwners();
  const requestedFamily = ownerFamily(owner);
  const conflictingOwners = owners.filter((activeOwner) => ownerFamily(activeOwner) !== requestedFamily);
  if (conflictingOwners.length > 0) {
    throw new CameraConflictError(owner, conflictingOwners);
  }
  refs.set(owner, (refs.get(owner) ?? 0) + 1);
  emit();
}

export function release(owner: ProCameraOwner): void {
  const next = (refs.get(owner) ?? 0) - 1;
  if (next > 0) refs.set(owner, next);
  else refs.delete(owner);
  emit();
}

export function forceRelease(): void {
  refs.clear();
  emit();
}

export function currentOwners(): ProCameraOwner[] { return activeOwners(); }

export function currentFamily(): CameraFamily | null {
  const owners = activeOwners();
  return owners[0] ? ownerFamily(owners[0]) : null;
}

export function isHeldBy(owner: ProCameraOwner): boolean { return (refs.get(owner) ?? 0) > 0; }

export function totalRefs(): number {
  return Array.from(refs.values()).reduce((sum, count) => sum + count, 0);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const ProCameraEngine = {
  acquire,
  release,
  forceRelease,
  currentOwners,
  currentFamily,
  isHeldBy,
  totalRefs,
  subscribe,
};

export default ProCameraEngine;
