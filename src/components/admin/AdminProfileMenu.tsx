import { useState, useEffect } from "react";
import { LogOut, Settings, Key, Phone, User, X, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AdminProfileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  adminUser: any;
  currentUser: any;
  isOwner: boolean;
}

type ActivePanel = 'menu' | 'settings' | 'password';

export function AdminProfileMenu({ isOpen, onClose, onLogout, adminUser, currentUser, isOwner }: AdminProfileMenuProps) {
  const [activePanel, setActivePanel] = useState<ActivePanel>('menu');
  const [displayName, setDisplayName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (isOpen && adminUser) {
      setDisplayName(adminUser.display_name || '');
      setWhatsappNumber((adminUser as any).whatsapp_number || '');
      setActivePanel('menu');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, adminUser]);

  if (!isOpen) return null;

  const handleSaveSettings = async () => {
    if (!adminUser?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('admin_users')
        .update({
          display_name: displayName.trim(),
          whatsapp_number: whatsappNumber.trim() || null,
        } as any)
        .eq('id', adminUser.id);

      if (error) throw error;
      toast.success('Settings saved successfully');
      setActivePanel('menu');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setResetting(true);
    try {
      // Admin password change goes through dedicated RPC (admin sessions are decoupled from auth.users)
      const { error } = await supabase.rpc('admin_change_own_password' as any, {
        p_admin_user_id: adminUser.id,
        p_new_password: newPassword,
      });
      if (error) throw error;
      toast.success('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
      setActivePanel('menu');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setResetting(false);
    }
  };

  const userEmail = adminUser?.email || currentUser?.email || '';
  const userName = adminUser?.display_name || currentUser?.profile?.display_name || 'Admin';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 z-50 w-full max-w-sm h-full bg-slate-900 border-l border-slate-700/50 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-slate-700/50 bg-gradient-to-r from-purple-900/40 to-slate-900">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">
              {activePanel === 'menu' && 'Profile'}
              {activePanel === 'settings' && 'Settings'}
              {activePanel === 'password' && 'Change Password'}
            </h2>
            <Button variant="ghost" size="icon" onClick={activePanel === 'menu' ? onClose : () => setActivePanel('menu')} className="text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {activePanel === 'menu' && (
            <div className="flex items-center gap-3">
              <Avatar className="w-14 h-14 border-2 border-purple-400/50 ring-2 ring-purple-400/20">
                <AvatarImage src={currentUser?.profile?.avatar_url} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 text-white text-xl font-bold">
                  {userName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold truncate">{userName}</p>
                <p className="text-slate-400 text-sm truncate">{userEmail}</p>
                <p className={cn("text-xs font-medium mt-0.5", isOwner ? "text-amber-400" : "text-blue-400")}>
                  {isOwner ? "👑 Owner" : "🛡️ Sub-Admin"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          {activePanel === 'menu' && (
            <div className="space-y-1">
              <button
                onClick={() => setActivePanel('settings')}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-slate-800 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Settings</p>
                  <p className="text-slate-500 text-xs">Name, WhatsApp Number</p>
                </div>
              </button>

              <button
                onClick={() => setActivePanel('password')}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-slate-800 transition-colors text-left group"
              >
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Key className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Change Password</p>
                  <p className="text-slate-500 text-xs">Update your login password</p>
                </div>
              </button>

              <div className="pt-3 mt-3 border-t border-slate-700/50">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl hover:bg-red-500/10 transition-colors text-left group"
                >
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                    <LogOut className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-red-400 font-medium">Logout</p>
                    <p className="text-slate-500 text-xs">Sign out from admin panel</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {activePanel === 'settings' && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-slate-300">Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-green-400" />
                  WhatsApp Number
                </Label>
                <Input
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="e.g. 8801712345678"
                  className="bg-slate-800 border-slate-700 text-white"
                />
                <p className="text-xs text-slate-500">
                  Used for password reset via WhatsApp OTP. Include country code without +
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Email (read-only)</Label>
                <Input
                  value={userEmail}
                  disabled
                  className="bg-slate-800/50 border-slate-700 text-slate-400"
                />
              </div>

              <Button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}

          {activePanel === 'password' && (
            <div className="space-y-5">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-amber-400 text-xs">
                  Set a new password for your admin account. You'll use this with your email to login.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">New Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="bg-slate-800 border-slate-700 text-white pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Confirm Password</Label>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>

              <Button
                onClick={handlePasswordReset}
                disabled={resetting || !newPassword || !confirmPassword}
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
              >
                <Key className="w-4 h-4 mr-2" />
                {resetting ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
