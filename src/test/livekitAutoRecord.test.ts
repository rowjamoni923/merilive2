// Pkg129: Auto-record preference client unit tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getUserMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: () => getUserMock() },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const isEnabledMock = vi.fn();
vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: (...args: unknown[]) => isEnabledMock(...args),
}));

import {
  getAutoRecordPreference,
  setAutoRecordPreference,
} from '@/lib/livekitAutoRecord';

function profilesSelect(returnValue: { data: unknown; error: unknown }) {
  fromMock.mockReturnValueOnce({
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve(returnValue) }),
    }),
  });
}

function profilesUpdate(returnValue: { error: unknown }) {
  fromMock.mockReturnValueOnce({
    update: () => ({ eq: () => Promise.resolve(returnValue) }),
  });
}

describe('Pkg129 auto-record preference', () => {
  beforeEach(() => {
    getUserMock.mockReset();
    fromMock.mockReset();
    isEnabledMock.mockReset();
  });

  it('getAutoRecordPreference returns not_authenticated when no user', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const r = await getAutoRecordPreference();
    expect(r).toEqual({ success: false, error: 'not_authenticated' });
  });

  it('getAutoRecordPreference returns enabled from profile row', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    profilesSelect({ data: { auto_record_live: true }, error: null });
    const r = await getAutoRecordPreference();
    expect(r).toEqual({ success: true, enabled: true });
  });

  it('getAutoRecordPreference defaults to false when column null', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    profilesSelect({ data: { auto_record_live: null }, error: null });
    const r = await getAutoRecordPreference();
    expect(r).toEqual({ success: true, enabled: false });
  });

  it('setAutoRecordPreference rejects when kill-switch OFF', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    isEnabledMock.mockResolvedValue(false);
    const r = await setAutoRecordPreference(true);
    expect(r).toEqual({ success: false, error: 'auto_record_disabled' });
  });

  it('setAutoRecordPreference happy path with kill-switch ON', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    isEnabledMock.mockResolvedValue(true);
    profilesUpdate({ error: null });
    const r = await setAutoRecordPreference(true);
    expect(r).toEqual({ success: true, enabled: true });
  });

  it('setAutoRecordPreference(false) skips kill-switch check', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    profilesUpdate({ error: null });
    const r = await setAutoRecordPreference(false);
    expect(r).toEqual({ success: true, enabled: false });
    expect(isEnabledMock).not.toHaveBeenCalled();
  });

  it('setAutoRecordPreference surfaces DB error', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    isEnabledMock.mockResolvedValue(true);
    profilesUpdate({ error: { message: 'rls_blocked' } });
    const r = await setAutoRecordPreference(true);
    expect(r).toEqual({ success: false, error: 'rls_blocked' });
  });

  it('ignoreKillSwitch lets enabled=true through without flag check', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } } });
    profilesUpdate({ error: null });
    const r = await setAutoRecordPreference(true, { ignoreKillSwitch: true });
    expect(r).toEqual({ success: true, enabled: true });
    expect(isEnabledMock).not.toHaveBeenCalled();
  });
});
