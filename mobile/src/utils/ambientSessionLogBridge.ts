/**
 * Survives AmbientScreen remounts so chunk/task updates still attach to the
 * same row while global `isListening` stays true.
 */
let activeAmbientSessionLogId: string | null = null;

export function setAmbientSessionLogId(id: string | null) {
  activeAmbientSessionLogId = id;
}

export function getAmbientSessionLogId(): string | null {
  return activeAmbientSessionLogId;
}
