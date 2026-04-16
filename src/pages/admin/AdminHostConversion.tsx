import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { User, UserCheck, MessageCircle, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";

import { adminSendNotification } from "@/utils/adminNotification";

interface ConversionRequest {
  id: string;
  user_id: string;
  message: string;
  status: string;
  admin_response: string | null;
  created_at: string;
  profile?: {
    display_name: string;
    avatar_url: string;
    app_uid: string;
    gender: string;
    is_host: boolean;
  };
}

const AdminHostConversion = () => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ConversionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [responseText, setResponseText] = useState<Record<string, string>>({});

  useAdminRealtime(['host_conversion_requests'], () => loadRequests());

  const loadRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('host_conversion_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Batch fetch all profiles in one query
      const userIds = [...new Set((data || []).map((r: any) => r.user_id).filter(Boolean))];
      const { data: profiles } = userIds.length > 0 ? await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, app_uid, gender, is_host')
        .in('id', userIds) : { data: [] };
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      const withProfiles = (data || []).map((req: any) => ({
        ...req,
        profile: profileMap.get(req.user_id) || null,
      }));

      setRequests(withProfiles);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async (req: ConversionRequest, toHost: boolean) => {
    setProcessing(req.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Convert user gender and host status
      const { error: rpcError } = await supabase.rpc('admin_update_user_gender', {
        _user_id: req.user_id,
        _gender: toHost ? 'female' : 'male',
      });

      if (rpcError) throw rpcError;

      // Update request status
      await supabase
        .from('host_conversion_requests')
        .update({
          status: 'approved',
          admin_response: responseText[req.id] || (toHost ? 'Converted to Host' : 'Converted to User'),
          admin_id: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.id);

      // Send notification
      await adminSendNotification(
        req.user_id,
        toHost ? '🎤 Host Account Activated!' : '👤 Converted to User',
        toHost ? 'Congratulations! You have been converted to a Host. Start going live now!' : 'Your account has been converted to User mode.',
        'system'
      );

      toast({ title: "✅ Converted!", description: `User ${toHost ? 'converted to Host' : 'converted to User'}` });
      loadRequests();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (req: ConversionRequest) => {
    setProcessing(req.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase
        .from('host_conversion_requests')
        .update({
          status: 'rejected',
          admin_response: responseText[req.id] || 'Request rejected',
          admin_id: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.id);

      await adminSendNotification(req.user_id, '❌ Conversion Request Rejected', responseText[req.id] || 'Your host conversion request has been rejected.', 'system');

      toast({ title: "Rejected" });
      loadRequests();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Host Conversion Requests</h1>
          <p className="text-sm text-muted-foreground">
            Users requesting Host/User conversion • {pendingCount} pending
          </p>
        </div>
        <Button onClick={loadRequests} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : requests.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No conversion requests yet</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <Card key={req.id} className={req.status === 'pending' ? 'border-amber-500/50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={req.profile?.avatar_url} />
                    <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-foreground">{req.profile?.display_name || 'Unknown'}</p>
                      <Badge variant="outline" className="text-xs">{req.profile?.app_uid}</Badge>
                      <Badge className={req.profile?.is_host ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'}>
                        {req.profile?.is_host ? '🎤 Host' : '👤 User'} • {req.profile?.gender || 'unknown'}
                      </Badge>
                      <Badge className={
                        req.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                        req.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                        'bg-red-500/20 text-red-400'
                      }>
                        {req.status}
                      </Badge>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-3 mb-3">
                      <div className="flex items-start gap-2">
                        <MessageCircle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-sm text-foreground">{req.message}</p>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground mb-3">
                      {format(new Date(req.created_at), 'MMM d, yyyy HH:mm')}
                    </p>

                    {req.status === 'pending' && (
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Admin response (optional)..."
                          value={responseText[req.id] || ''}
                          onChange={(e) => setResponseText(prev => ({ ...prev, [req.id]: e.target.value }))}
                          rows={2}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleConvert(req, true)}
                            disabled={processing === req.id}
                            className="bg-pink-500 hover:bg-pink-600"
                          >
                            {processing === req.id ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserCheck className="w-4 h-4 mr-1" />}
                            🎤 Convert to Host
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleConvert(req, false)}
                            disabled={processing === req.id}
                            className="bg-blue-500 hover:bg-blue-600"
                          >
                            👤 Convert to User
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleReject(req)}
                            disabled={processing === req.id}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    )}

                    {req.admin_response && req.status !== 'pending' && (
                      <p className="text-xs text-muted-foreground mt-2">Admin: {req.admin_response}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminHostConversion;
