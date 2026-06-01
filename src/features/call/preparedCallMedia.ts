interface PreparedCallMedia {
  callId: string;
  stream: MediaStream;
  preparedAt: number;
}

const PREPARED_CALL_TTL_MS = 90_000;

let preparedCallMedia: PreparedCallMedia | null = null;

const isUsable = (stream: MediaStream | null | undefined) =>
  !!stream && stream.getTracks().some((track) => track.readyState === 'live');

export const setPreparedCallMediaStream = (callId: string | null | undefined, stream: MediaStream | null) => {
  if (!callId || !isUsable(stream)) return;
  preparedCallMedia = { callId, stream: stream!, preparedAt: Date.now() };
};

export const consumePreparedCallMediaStream = (callId: string | null | undefined): MediaStream | null => {
  const prepared = preparedCallMedia;
  if (!prepared || !callId || prepared.callId !== callId) return null;
  preparedCallMedia = null;
  if (Date.now() - prepared.preparedAt > PREPARED_CALL_TTL_MS) return null;
  if (!isUsable(prepared.stream)) return null;
  return prepared.stream;
};

export const clearPreparedCallMediaStream = (callId?: string | null, options?: { stopTracks?: boolean }) => {
  const prepared = preparedCallMedia;
  if (!prepared) return;
  if (callId && prepared.callId !== callId) return;
  preparedCallMedia = null;
  if (options?.stopTracks) {
    prepared.stream.getTracks().forEach((track) => track.stop());
  }
};