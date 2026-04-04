import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  Smartphone, 
  Monitor, 
  Tablet, 
  Check, 
  X, 
  Clock, 
  Shield,
  RefreshCw,
  ChevronLeft,
  User,
  Calendar,
  Globe,
  Trash2,
  Ban,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DeviceRecord {
  id: string;
  admin_user_id: string;
  device_fingerprint: string;
  device_name: string | null;
  device_info: any;
  ip_address: string | null;
  user_agent: string | null;
  status: 'pending' | 'approved' | 'blocked';
  approved_by: string | null;
  approved_at: string | null;
  last_used_at: string | null;
  created_at: string;
  notes: string | null;
  admin_user?: {
    display_name: string | null;
    email: string;
    role: string;
  };
}

export default function AdminDeviceManagement() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'block' | 'delete' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'blocked'>('all');

  useAdminRealtime(['admin_allowed_devices'], () => checkOwnerAndFetchDevices());

  const checkOwnerAndFetchDevices = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/admin/auth');
        return;
      }

      const { data: adminUser } = await supabase
        .from('admin_users')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (adminUser?.role !== 'owner') {
        toast.error('Only owner can access device management');
        navigate('/admin');
        return;
      }

      setIsOwner(true);
      await fetchDevices();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_allowed_devices')
        .select(`
          *,
          admin_user:admin_users!admin_allowed_devices_admin_user_id_fkey (
            display_name,
            email,
            role
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDevices(data || []);
    } catch (error) {
      console.error('Error fetching devices:', error);
      toast.error('Failed to load devices');
    }
  };

  const handleDeviceAction = async () => {
    if (!selectedDevice || !actionType) return;

    setActionLoading(true);
    try {
      if (actionType === 'delete') {
        const { error } = await supabase
          .from('admin_allowed_devices')
          .delete()
          .eq('id', selectedDevice.id);

        if (error) throw error;
        toast.success('Device deleted successfully');
      } else {
        const newStatus = actionType === 'approve' ? 'approved' : 'blocked';
        const { error } = await supabase.rpc('update_admin_device_status', {
          _device_id: selectedDevice.id,
          _new_status: newStatus,
          _notes: null
        });

        if (error) throw error;
        toast.success(actionType === 'approve' ? 'Device approved successfully' : 'Device blocked successfully');
      }

      await fetchDevices();
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || 'Action failed');
    } finally {
      setActionLoading(false);
      setSelectedDevice(null);
      setActionType(null);
    }
  };

  const getDeviceIcon = (deviceInfo: any, userAgent: string | null) => {
    const ua = userAgent?.toLowerCase() || '';
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return <Smartphone className="w-5 h-5" />;
    }
    if (ua.includes('tablet') || ua.includes('ipad')) {
      return <Tablet className="w-5 h-5" />;
    }
    return <Monitor className="w-5 h-5" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        );
      case 'blocked':
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
            <Ban className="w-3 h-3 mr-1" />
            Blocked
          </Badge>
        );
      default:
        return (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const filteredDevices = devices.filter(device => {
    if (filter === 'all') return true;
    return device.status === filter;
  });

  const pendingCount = devices.filter(d => d.status === 'pending').length;
  const approvedCount = devices.filter(d => d.status === 'approved').length;
  const blockedCount = devices.filter(d => d.status === 'blocked').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/admin')}
              className="text-white/60 hover:text-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Shield className="w-6 h-6 text-primary" />
                Device Management
              </h1>
              <p className="text-white/60 text-sm">
                Manage devices with access to the admin panel
              </p>
            </div>
          </div>
          
          <Button
            onClick={fetchDevices}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card 
            className={`bg-slate-800/50 border-white/10 cursor-pointer transition-all ${filter === 'all' ? 'ring-2 ring-primary' : 'hover:bg-slate-800'}`}
            onClick={() => setFilter('all')}
          >
            <CardContent className="p-4">
              <div className="text-3xl font-bold text-white">{devices.length}</div>
              <div className="text-white/60 text-sm">Total Devices</div>
            </CardContent>
          </Card>
          
          <Card 
            className={`bg-slate-800/50 border-white/10 cursor-pointer transition-all ${filter === 'pending' ? 'ring-2 ring-amber-500' : 'hover:bg-slate-800'}`}
            onClick={() => setFilter('pending')}
          >
            <CardContent className="p-4">
              <div className="text-3xl font-bold text-amber-400">{pendingCount}</div>
              <div className="text-white/60 text-sm">Pending</div>
            </CardContent>
          </Card>
          
          <Card 
            className={`bg-slate-800/50 border-white/10 cursor-pointer transition-all ${filter === 'approved' ? 'ring-2 ring-green-500' : 'hover:bg-slate-800'}`}
            onClick={() => setFilter('approved')}
          >
            <CardContent className="p-4">
              <div className="text-3xl font-bold text-green-400">{approvedCount}</div>
              <div className="text-white/60 text-sm">Approved</div>
            </CardContent>
          </Card>
          
          <Card 
            className={`bg-slate-800/50 border-white/10 cursor-pointer transition-all ${filter === 'blocked' ? 'ring-2 ring-red-500' : 'hover:bg-slate-800'}`}
            onClick={() => setFilter('blocked')}
          >
            <CardContent className="p-4">
              <div className="text-3xl font-bold text-red-400">{blockedCount}</div>
              <div className="text-white/60 text-sm">Blocked</div>
            </CardContent>
          </Card>
        </div>

        {/* Device List */}
        <div className="space-y-4">
          <AnimatePresence>
            {filteredDevices.length === 0 ? (
              <Card className="bg-slate-800/50 border-white/10">
                <CardContent className="p-8 text-center">
                  <Smartphone className="w-12 h-12 text-white/30 mx-auto mb-3" />
                  <p className="text-white/60">No devices found</p>
                </CardContent>
              </Card>
            ) : (
              filteredDevices.map((device, index) => (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="bg-slate-800/50 border-white/10 hover:bg-slate-800 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          {/* Device Icon */}
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            device.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                            device.status === 'blocked' ? 'bg-red-500/20 text-red-400' :
                            'bg-amber-500/20 text-amber-400'
                          }`}>
                            {getDeviceIcon(device.device_info, device.user_agent)}
                          </div>
                          
                          {/* Device Info */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-white font-semibold">
                                {device.device_name || 'Unknown Device'}
                              </h3>
                              {getStatusBadge(device.status)}
                            </div>
                            
                            {/* Admin User */}
                            <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
                              <User className="w-3.5 h-3.5" />
                              <span>{device.admin_user?.display_name || device.admin_user?.email}</span>
                              <Badge variant="outline" className="text-xs">
                                {device.admin_user?.role}
                              </Badge>
                            </div>
                            
                            {/* Details */}
                            <div className="flex flex-wrap gap-4 text-xs text-white/50">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  Registered: {new Date(device.created_at).toLocaleDateString('en-US')}
                                </span>
                              </div>
                              {device.last_used_at && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>
                                    Last Used: {new Date(device.last_used_at).toLocaleDateString('en-US')}
                                  </span>
                                </div>
                              )}
                              {device.device_info?.screenResolution && (
                                <div className="flex items-center gap-1">
                                  <Monitor className="w-3 h-3" />
                                  <span>{device.device_info.screenResolution}</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Fingerprint */}
                            <div className="mt-2 text-xs font-mono text-white/30 truncate max-w-xs">
                              ID: {device.device_fingerprint}
                            </div>
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {device.status === 'pending' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedDevice(device);
                                setActionType('approve');
                              }}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                          )}
                          
                          {device.status !== 'blocked' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedDevice(device);
                                setActionType('block');
                              }}
                              className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                            >
                              <Ban className="w-4 h-4 mr-1" />
                              Block
                            </Button>
                          )}
                          
                          {device.status === 'blocked' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedDevice(device);
                                setActionType('approve');
                              }}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Unblock
                            </Button>
                          )}
                          
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedDevice(device);
                              setActionType('delete');
                            }}
                            className="text-red-400 hover:bg-red-500/20"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!selectedDevice && !!actionType} onOpenChange={() => {
        setSelectedDevice(null);
        setActionType(null);
      }}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              {actionType === 'approve' && 'Approve Device'}
              {actionType === 'block' && 'Block Device'}
              {actionType === 'delete' && 'Delete Device'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              {actionType === 'approve' && (
                <>
                  Approving <strong className="text-white">{selectedDevice?.device_name}</strong> will grant{' '}
                  <strong className="text-white">{selectedDevice?.admin_user?.display_name || selectedDevice?.admin_user?.email}</strong>{' '}
                  access to the admin panel from this device.
                </>
              )}
              {actionType === 'block' && (
                <>
                  Blocking <strong className="text-white">{selectedDevice?.device_name}</strong> will revoke admin panel access from this device.
                </>
              )}
              {actionType === 'delete' && (
                <>
                  The device record for <strong className="text-white">{selectedDevice?.device_name}</strong> will be permanently deleted.
                  A new registration will be required upon next login.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeviceAction}
              disabled={actionLoading}
              className={
                actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                actionType === 'block' ? 'bg-amber-600 hover:bg-amber-700' :
                'bg-red-600 hover:bg-red-700'
              }
            >
              {actionLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {actionType === 'approve' && 'Approve'}
              {actionType === 'block' && 'Block'}
              {actionType === 'delete' && 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
