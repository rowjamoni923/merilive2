import { useEffect, useState } from "react";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { ADMIN_REALTIME_EVENT, type AdminTableUpdateEvent } from "@/hooks/useAdminRealtime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Check, X, RefreshCw, Shield, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PendingDevice {
  id: string;
  admin_user_id: string;
  admin_email: string;
  admin_display_name: string | null;
  admin_role: string;
  device_fingerprint: string;
  device_name: string | null;
  device_info: any;
  ip_address: string | null;
  user_agent: string | null;
  status: string;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  last_used_at: string | null;
}

export default function AdminDeviceApprovals() {
  const session = getAdminSession();
  const [devices, setDevices] = useState<PendingDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);

  const isOwner = !!session?.is_owner;

  const load = async () => {
    if (!session?.admin_id) return;
    setLoading(true);
    try {
      const { data, error } = await adminSupabase.rpc('admin_list_pending_devices' as any, {
        _owner_admin_id: session.admin_id,
      });
      if (error) throw error;
      setDevices((data as any) || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    if (!session?.admin_id) return;
    const handleDeviceSync = (event: Event) => {
      const detail = (event as CustomEvent<AdminTableUpdateEvent>).detail;
      if (detail?.table === 'admin_allowed_devices') load();
    };
    window.addEventListener(ADMIN_REALTIME_EVENT, handleDeviceSync);

    return () => { window.removeEventListener(ADMIN_REALTIME_EVENT, handleDeviceSync); };
  }, [session?.admin_id]);

  const approve = async (id: string) => {
    if (!session?.admin_id) return;
    setActioning(id);
    try {
      const { data, error } = await adminSupabase.rpc('admin_approve_device' as any, {
        _device_id: id,
        _owner_admin_id: session.admin_id,
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Failed');
      toast.success('Device approved ✅');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to approve');
    } finally {
      setActioning(null);
    }
  };

  const revoke = async (id: string, isPending: boolean) => {
    if (!session?.admin_id) return;
    const reason = window.prompt(isPending ? 'Reason for rejection (optional)' : 'Reason for revoking access (optional)');
    if (reason === null) return; // user cancelled
    setActioning(id);
    try {
      const { data, error } = await adminSupabase.rpc('admin_revoke_device' as any, {
        _device_id: id,
        _owner_admin_id: session.admin_id,
        _reason: reason || null,
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Failed');
      toast.success(isPending ? 'Device rejected' : 'Device access revoked');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setActioning(null);
    }
  };

  if (!isOwner) {
    return (
      <div className="p-6">
        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader>
            <CardTitle className="text-red-400">Owner Only</CardTitle>
            <CardDescription>Only the Owner can approve admin device access.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const pending = devices.filter(d => d.status === 'pending');
  const approved = devices.filter(d => d.status === 'approved');
  const blocked = devices.filter(d => d.status === 'rejected' || d.status === 'revoked');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-violet-400" />
            Device Approvals
          </h1>
          <p className="text-sm text-slate-400 mt-1">Approve sub-admin devices to grant admin panel access</p>
        </div>
        <Button onClick={load} variant="outline" size="sm" className="bg-slate-800 border-slate-700 text-white">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Pending */}
      <Card className="bg-slate-900/50 border-amber-500/20">
        <CardHeader>
          <CardTitle className="text-amber-400 flex items-center gap-2">
            <Clock className="w-5 h-5" /> Pending ({pending.length})
          </CardTitle>
          <CardDescription>Sub-admins waiting for your approval</CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No pending requests</p>
          ) : (
            <div className="space-y-3">
              {pending.map(d => (
                <div key={d.id} className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/50 border border-amber-500/20">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{d.admin_display_name || d.admin_email}</p>
                      <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">{d.admin_role}</Badge>
                    </div>
                    <p className="text-sm text-slate-400">{d.admin_email}</p>
                    <p className="text-xs text-slate-500 mt-1 truncate">📱 {d.device_name || 'Unknown device'}</p>
                    {d.ip_address && <p className="text-xs text-slate-500">🌐 IP: {d.ip_address}</p>}
                    <p className="text-xs text-slate-500">Requested: {format(new Date(d.requested_at), 'MMM d, yyyy HH:mm')}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => approve(d.id)} disabled={actioning === d.id} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Check className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button onClick={() => revoke(d.id, true)} disabled={actioning === d.id} size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                      <X className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approved */}
      <Card className="bg-slate-900/50 border-emerald-500/20">
        <CardHeader>
          <CardTitle className="text-emerald-400 flex items-center gap-2">
            <Check className="w-5 h-5" /> Approved ({approved.length})
          </CardTitle>
          <CardDescription>Devices with active admin panel access</CardDescription>
        </CardHeader>
        <CardContent>
          {approved.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No approved devices</p>
          ) : (
            <div className="space-y-2">
              {approved.map(d => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-white/5">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{d.admin_display_name || d.admin_email}</p>
                    <p className="text-xs text-slate-500 truncate">{d.device_name} · {d.admin_email}</p>
                    {d.last_used_at && <p className="text-xs text-slate-500">Last active: {format(new Date(d.last_used_at), 'MMM d HH:mm')}</p>}
                  </div>
                  {d.admin_role !== 'owner' && (
                    <Button onClick={() => revoke(d.id, false)} disabled={actioning === d.id} size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blocked */}
      {blocked.length > 0 && (
        <Card className="bg-slate-900/50 border-red-500/20">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <X className="w-5 h-5" /> Rejected / Revoked ({blocked.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {blocked.map(d => (
                <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-white/5">
                  <Smartphone className="w-5 h-5 text-red-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{d.admin_display_name || d.admin_email}</p>
                    <p className="text-xs text-slate-500 truncate">{d.device_name} · {d.status}</p>
                  </div>
                  <Button onClick={() => approve(d.id)} disabled={actioning === d.id} size="sm" variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                    Re-approve
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
