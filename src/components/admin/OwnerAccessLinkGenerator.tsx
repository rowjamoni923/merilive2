import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Crown,
  Copy,
  Check,
  Link as LinkIcon,
  Shield,
  Eye,
  EyeOff,
  Smartphone,
  Monitor,
  Users,
  Settings,
  AlertTriangle,
  Trash2,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PRODUCTION_DOMAIN } from "@/utils/shareLinks";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";

interface OwnerRow {
  email: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
}

export default function OwnerAccessLinkGenerator() {
  const session = getAdminSession();
  const [copiedOwner, setCopiedOwner] = useState(false);
  const [copiedSubAdmin, setCopiedSubAdmin] = useState(false);
  const [showOwnerSecret, setShowOwnerSecret] = useState(false);
  const [showSubAdminSecret, setShowSubAdminSecret] = useState(false);
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [subAdminToken, setSubAdminToken] = useState<string | null>(null);
  const [tokenYear, setTokenYear] = useState<number>(new Date().getFullYear());
  const [loadingTokens, setLoadingTokens] = useState(true);

  // Owner whitelist management
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchTokens = async () => {
    try {
      const { data, error } = await adminSupabase.functions.invoke('get-admin-tokens', {
        body: { admin_id: session?.admin_id },
      });
      if (!error && data) {
        setOwnerToken(data.owner_token || null);
        setSubAdminToken(data.subadmin_token || null);
        if (data.year) setTokenYear(data.year);
      }
    } catch (err) {
      console.error('Failed to fetch admin tokens:', err);
    } finally {
      setLoadingTokens(false);
    }
  };

  const fetchOwners = async () => {
    if (!session?.is_owner) return;
    try {
      const { data, error } = await adminSupabase.rpc('admin_list_owners' as any, {
        _admin_id: session.admin_id,
      });
      if (!error && Array.isArray(data)) setOwners(data as OwnerRow[]);
    } catch (err) {
      console.error('Failed to fetch owners:', err);
    }
  };

  useEffect(() => {
    fetchTokens();
    fetchOwners();
  }, []);

  const ownerAccessLink = ownerToken ? `${PRODUCTION_DOMAIN}/admin/auth?access=${ownerToken}` : '';
  const subAdminAccessLink = subAdminToken ? `${PRODUCTION_DOMAIN}/admin/auth?access=${subAdminToken}` : '';

  const copy = async (text: string, kind: 'owner' | 'sub') => {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === 'owner') {
        setCopiedOwner(true);
        setTimeout(() => setCopiedOwner(false), 2000);
      } else {
        setCopiedSubAdmin(true);
        setTimeout(() => setCopiedSubAdmin(false), 2000);
      }
      toast.success("Link copied!");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleAddOwner = async () => {
    if (!session?.is_owner) return;
    const email = newOwnerEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Enter a valid email');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await adminSupabase.rpc('admin_add_owner' as any, {
        _admin_id: session.admin_id,
        _new_email: email,
        _display_name: newOwnerName.trim() || null,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Failed');
      toast.success(`Owner added: ${email}`);
      setNewOwnerEmail('');
      setNewOwnerName('');
      await fetchOwners();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add owner');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveOwner = async (email: string) => {
    if (!session?.is_owner) return;
    if (!confirm(`Remove ${email} from owners?`)) return;
    setBusy(true);
    try {
      const { data, error } = await adminSupabase.rpc('admin_remove_owner' as any, {
        _admin_id: session.admin_id,
        _target_email: email,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Failed');
      toast.success('Owner removed');
      await fetchOwners();
    } catch (err: any) {
      toast.error(err?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const maskToken = (token: string | null) => {
    if (!token) return 'Not generated';
    return token.replace(/-([a-f0-9]{8})$/, '-••••••••');
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="owner" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="owner" className="flex items-center gap-2">
            <Crown className="w-4 h-4" />
            Owner
          </TabsTrigger>
          <TabsTrigger value="subadmin" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Sub-Admin
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Manage Owners
          </TabsTrigger>
        </TabsList>

        {/* Owner Access Tab */}
        <TabsContent value="owner" className="space-y-4 mt-4">
          <Card className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 border-amber-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Crown className="w-6 h-6 text-amber-400" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                    Owner Royal Link
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                      <Sparkles className="w-3 h-3 mr-1" />
                      {tokenYear} Edition
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Auto-rotates each year. No device approval required.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Owner Royal URL</Label>
                <div className="relative">
                  <Input
                    value={loadingTokens ? 'Loading...' : showOwnerSecret ? ownerAccessLink : `${PRODUCTION_DOMAIN}/admin/auth?access=${maskToken(ownerToken)}`}
                    readOnly
                    className="pr-20 font-mono text-xs"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setShowOwnerSecret(!showOwnerSecret)}
                      className="h-7 w-7 p-0">
                      {showOwnerSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => copy(ownerAccessLink, 'owner')}
                      className="h-7 w-7 p-0">
                      {copiedOwner ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                {ownerToken && (
                  <p className="text-[10px] text-amber-300/70 mt-1.5 font-mono">
                    Token: <span className="font-bold">{showOwnerSecret ? ownerToken : maskToken(ownerToken)}</span>
                  </p>
                )}
              </div>

              <div className="bg-accent/30 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Owner Privileges
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5 text-green-400" /><span>Any device</span></div>
                  <div className="flex items-center gap-2"><Monitor className="w-3.5 h-3.5 text-green-400" /><span>No approval needed</span></div>
                  <div className="flex items-center gap-2"><Crown className="w-3.5 h-3.5 text-amber-400" /><span>Full A-to-Z control</span></div>
                  <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-blue-400" /><span>Manage sub-admins</span></div>
                </div>
              </div>

              <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3 text-xs text-violet-300">
                🔒 <strong>Hidden by design:</strong> Without this exact token, the admin panel does not exist on this site — visitors only see the public blog.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sub-Admin Tab */}
        <TabsContent value="subadmin" className="space-y-4 mt-4">
          <Card className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-purple-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-purple-400" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                    Sub-Admin Onyx Link
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                      <Sparkles className="w-3 h-3 mr-1" />
                      {tokenYear} Edition
                    </Badge>
                  </CardTitle>
                  <CardDescription>Login page access — owner approval mandatory.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Sub-Admin Onyx URL</Label>
                <div className="relative">
                  <Input
                    value={loadingTokens ? 'Loading...' : showSubAdminSecret ? subAdminAccessLink : `${PRODUCTION_DOMAIN}/admin/auth?access=${maskToken(subAdminToken)}`}
                    readOnly
                    className="pr-20 font-mono text-xs"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => setShowSubAdminSecret(!showSubAdminSecret)}
                      className="h-7 w-7 p-0">
                      {showSubAdminSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button type="button" variant="ghost" size="sm"
                      onClick={() => copy(subAdminAccessLink, 'sub')}
                      className="h-7 w-7 p-0">
                      {copiedSubAdmin ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                {subAdminToken && (
                  <p className="text-[10px] text-purple-300/70 mt-1.5 font-mono">
                    Token: <span className="font-bold">{showSubAdminSecret ? subAdminToken : maskToken(subAdminToken)}</span>
                  </p>
                )}
              </div>

              <div className="bg-accent/30 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  Sub-Admin Workflow
                </h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Provides access only to the login page</li>
                  <li>• Account must be created by an Owner first</li>
                  <li>• First-time device requires Owner approval</li>
                  <li>• Limited to assigned sections only</li>
                </ul>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="text-xs text-yellow-400">
                  ⚠️ Per-sub-admin links with pre-filled email are auto-generated when you create them in <strong>Sub-Admins → Add</strong>.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manage Owners Tab */}
        <TabsContent value="manage" className="space-y-4 mt-4">
          <Card className="bg-gradient-to-r from-slate-600/20 to-gray-600/20 border-slate-500/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                Owner Whitelist
              </CardTitle>
              <CardDescription>
                Only emails on this list can be owners. Anyone else trying to sign up as owner is blocked.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!session?.is_owner && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-300">
                  Only Owners can manage the owner whitelist.
                </div>
              )}

              {session?.is_owner && (
                <>
                  <div className="space-y-3 rounded-lg border border-amber-500/20 p-3 bg-amber-500/5">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Plus className="w-4 h-4" /> Add new Owner
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="email@example.com"
                        value={newOwnerEmail}
                        onChange={(e) => setNewOwnerEmail(e.target.value)}
                        type="email"
                      />
                      <Input
                        placeholder="Display name (optional)"
                        value={newOwnerName}
                        onChange={(e) => setNewOwnerName(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleAddOwner} disabled={busy || !newOwnerEmail} className="bg-amber-600 hover:bg-amber-700">
                      <Plus className="w-4 h-4 mr-2" /> Add to Whitelist
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Active Owners ({owners.filter(o => o.is_active).length})</h4>
                    {owners.length === 0 && (
                      <p className="text-xs text-muted-foreground">Loading...</p>
                    )}
                    {owners.map((o) => (
                      <div key={o.email} className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-white/5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Crown className="w-3.5 h-3.5 text-amber-400" />
                            <span className="text-sm font-medium truncate">{o.email}</span>
                            {!o.is_active && <Badge variant="outline" className="text-xs">Disabled</Badge>}
                          </div>
                          {o.display_name && <p className="text-xs text-muted-foreground mt-0.5">{o.display_name}</p>}
                        </div>
                        {o.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveOwner(o.email)}
                            disabled={busy || owners.filter(x => x.is_active).length <= 1}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                    🛡️ <strong>Enforcement:</strong> Even if a database row is manipulated, a trigger blocks any non-whitelisted email from holding the owner role.
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-violet-300">
            <strong>Hidden Admin:</strong> The admin panel is invisible without these exact tokens. Tokens automatically rotate each calendar year — share the new ones securely after Jan 1st each year.
          </p>
        </div>
      </div>
    </div>
  );
}
