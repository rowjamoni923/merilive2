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
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { PRODUCTION_DOMAIN } from "@/utils/shareLinks";
import { supabase } from "@/integrations/supabase/client";

export default function OwnerAccessLinkGenerator() {
  const [copiedOwner, setCopiedOwner] = useState(false);
  const [copiedSubAdmin, setCopiedSubAdmin] = useState(false);
  const [showOwnerSecret, setShowOwnerSecret] = useState(false);
  const [showSubAdminSecret, setShowSubAdminSecret] = useState(false);
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [subAdminToken, setSubAdminToken] = useState<string | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(true);

  // Fetch tokens from server (admin-only edge function)
  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-admin-tokens', {
          body: {}
        });
        if (!error && data) {
          setOwnerToken(data.owner_token || null);
          setSubAdminToken(data.subadmin_token || null);
        }
      } catch (err) {
        console.error('Failed to fetch admin tokens:', err);
      } finally {
        setLoadingTokens(false);
      }
    };
    fetchTokens();
  }, []);

  // Generate the access links
  const ownerAccessLink = ownerToken ? `${PRODUCTION_DOMAIN}/admin/auth?access=${ownerToken}` : '';
  const subAdminAccessLink = subAdminToken ? `${PRODUCTION_DOMAIN}/admin/auth?access=${subAdminToken}` : '';

  const copyOwnerLink = async () => {
    try {
      await navigator.clipboard.writeText(ownerAccessLink);
      setCopiedOwner(true);
      toast.success("Owner link copied!");
      setTimeout(() => setCopiedOwner(false), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const copySubAdminLink = async () => {
    try {
      await navigator.clipboard.writeText(subAdminAccessLink);
      setCopiedSubAdmin(true);
      toast.success("Sub-Admin link copied!");
      setTimeout(() => setCopiedSubAdmin(false), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const copyOwnerFullCredentials = async () => {
    const fullText = `🔐 MeriLive Admin Panel - Owner Access

📱 Access Link:
${ownerAccessLink}

⚠️ Security Notes:
• This link provides full Owner access to the Admin Panel
• Works on any device without additional approval
• Keep this link secure and don't share with others
• For sub-admins, create separate accounts with limited permissions

🖥️ Access from any device:
• Mobile, Desktop, or Tablet
• No device registration required for Owner
• Full control over all admin features`;

    try {
      await navigator.clipboard.writeText(fullText);
      setCopiedOwner(true);
      toast.success("Full credentials copied!");
      setTimeout(() => setCopiedOwner(false), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
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
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Config
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
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Owner Access Link
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                      Full Access
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Full access from any device
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Link Display */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Owner Access URL</Label>
                <div className="relative">
                  <Input 
                    value={loadingTokens ? 'Loading...' : showOwnerSecret ? ownerAccessLink : ownerAccessLink.replace(ownerToken || '', '••••••••••••••••••••')}
                    readOnly
                    className="pr-20 font-mono text-xs"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowOwnerSecret(!showOwnerSecret)}
                      className="h-7 w-7 p-0"
                    >
                      {showOwnerSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={copyOwnerLink}
                      className="h-7 w-7 p-0"
                    >
                      {copiedOwner ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Copy Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={copyOwnerLink} variant="outline" className="w-full">
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Link Only
                </Button>
                <Button onClick={copyOwnerFullCredentials} className="w-full bg-amber-600 hover:bg-amber-700">
                  <Copy className="w-4 h-4 mr-2" />
                  Full Details
                </Button>
              </div>

              {/* Features */}
              <div className="bg-accent/30 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Owner Privileges
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-green-400" />
                    <span>Access from any device</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5 text-green-400" />
                    <span>No device approval needed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    <span>Full admin control</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    <span>Sub-Admin management</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sub-Admin Access Tab */}
        <TabsContent value="subadmin" className="space-y-4 mt-4">
          <Card className="bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-purple-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Sub-Admin Access Link
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                      Limited Access
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Login page access for Sub-Admins
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Link Display */}
              <div>
                <Label className="text-sm text-muted-foreground mb-2 block">Sub-Admin Access URL</Label>
                <div className="relative">
                  <Input 
                    value={loadingTokens ? 'Loading...' : showSubAdminSecret ? subAdminAccessLink : subAdminAccessLink.replace(subAdminToken || '', '••••••••••••••••••••••')}
                    readOnly
                    className="pr-20 font-mono text-xs"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSubAdminSecret(!showSubAdminSecret)}
                      className="h-7 w-7 p-0"
                    >
                      {showSubAdminSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={copySubAdminLink}
                      className="h-7 w-7 p-0"
                    >
                      {copiedSubAdmin ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Copy Button */}
              <Button onClick={copySubAdminLink} variant="outline" className="w-full">
                <Copy className="w-4 h-4 mr-2" />
                Copy Sub-Admin Link
              </Button>

              {/* Info */}
              <div className="bg-accent/30 rounded-lg p-4 space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  Sub-Admin Features
                </h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• This link only provides access to the login page</li>
                  <li>• Sub-Admin account must be created first</li>
                  <li>• Device approval will be required</li>
                  <li>• Only specific section access will be granted</li>
                </ul>
              </div>

              {/* Warning */}
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="text-xs text-yellow-400">
                  ⚠️ <strong>Note:</strong> When Sub-Admins are created, separate links will be auto-generated 
                  with their email pre-configured.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card className="bg-gradient-to-r from-slate-600/20 to-gray-600/20 border-slate-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-500/20 flex items-center justify-center">
                  <Settings className="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Secret Token Configuration
                    <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                      Server-Side
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Tokens are server-secured — change them in Lovable Cloud Secrets
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Config Display */}
              <div className="bg-accent/30 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-medium">Current Configuration</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-background/50 rounded">
                    <span className="text-sm text-muted-foreground">Owner Token:</span>
                    <code className="text-xs font-mono text-amber-400">{loadingTokens ? '...' : ownerToken ? '••••••' : 'Not set'}</code>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-background/50 rounded">
                    <span className="text-sm text-muted-foreground">Sub-Admin Token:</span>
                    <code className="text-xs font-mono text-purple-400">{loadingTokens ? '...' : subAdminToken ? '••••••' : 'Not set'}</code>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs text-blue-400">
                  ℹ️ <strong>To change tokens:</strong> Ask the developer to edit the code and change 
                  the CURRENT_YEAR variable (e.g., 2027, 2028). 
                  This will auto-update everywhere.
                </p>
              </div>

              {/* Security Info */}
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-400">
                    <strong>Security Note:</strong> Changing the Token Year won't invalidate old links 
                    (Legacy Support enabled). However, new links will always use the new token.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
