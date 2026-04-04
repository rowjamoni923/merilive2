import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Smartphone, 
  Monitor, 
  Tablet, 
  Check, 
  Ban,
  Clock,
  RefreshCw,
  User,
  Calendar,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Shield
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

export default function DeviceApprovalSection() {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'block' | 'delete' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'blocked'>('pending');

  useEffect(() => {
    fetchDevices();
  }, []);

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
      setDevices((data || []) as unknown as DeviceRecord[]);
    } catch (error) {
      console.error('Error fetching devices:', error);
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
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
        toast.success('Device deleted');
      } else {
        const newStatus = actionType === 'approve' ? 'approved' : 'blocked';
        const { error } = await supabase.rpc('update_admin_device_status', {
          _device_id: selectedDevice.id,
          _new_status: newStatus,
          _notes: null
        });

        if (error) throw error;
        toast.success(actionType === 'approve' ? 'Device approved' : 'Device blocked');
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
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-gradient-to-r from-orange-600/20 to-red-600/20 border-orange-500/20">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Device Approval</CardTitle>
                <CardDescription>Manage sub-admin device access</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchDevices}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Filter Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card 
          className={`cursor-pointer transition-all ${filter === 'all' ? 'ring-2 ring-primary' : 'hover:bg-accent/50'}`}
          onClick={() => setFilter('all')}
        >
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{devices.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all ${filter === 'pending' ? 'ring-2 ring-amber-500' : 'hover:bg-accent/50'}`}
          onClick={() => setFilter('pending')}
        >
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all ${filter === 'approved' ? 'ring-2 ring-green-500' : 'hover:bg-accent/50'}`}
          onClick={() => setFilter('approved')}
        >
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-400">{approvedCount}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        
        <Card 
          className={`cursor-pointer transition-all ${filter === 'blocked' ? 'ring-2 ring-red-500' : 'hover:bg-accent/50'}`}
          onClick={() => setFilter('blocked')}
        >
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-400">{blockedCount}</p>
            <p className="text-xs text-muted-foreground">Blocked</p>
          </CardContent>
        </Card>
      </div>

      {/* Device List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredDevices.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Smartphone className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No devices found</p>
              </CardContent>
            </Card>
          ) : (
            filteredDevices.map((device, index) => (
              <motion.div
                key={device.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: index * 0.03 }}
              >
                <Card className="hover:bg-accent/30 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        {/* Device Icon */}
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          device.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                          device.status === 'blocked' ? 'bg-red-500/20 text-red-400' :
                          'bg-amber-500/20 text-amber-400'
                        }`}>
                          {getDeviceIcon(device.device_info, device.user_agent)}
                        </div>
                        
                        {/* Device Info */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-sm">
                              {device.device_name || 'Unknown Device'}
                            </h3>
                            {getStatusBadge(device.status)}
                          </div>
                          
                          {/* Admin User */}
                          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                            <User className="w-3 h-3" />
                            <span>{device.admin_user?.display_name || device.admin_user?.email}</span>
                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                              {device.admin_user?.role}
                            </Badge>
                          </div>
                          
                          {/* Details */}
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground/70">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>
                                {new Date(device.created_at).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                            </div>
                            {device.ip_address && (
                              <span className="font-mono">{device.ip_address}</span>
                            )}
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
                            className="bg-green-600 hover:bg-green-700 h-8"
                          >
                            <Check className="w-3 h-3 mr-1" />
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
                            className="border-red-500/30 text-red-400 hover:bg-red-500/20 h-8"
                          >
                            <Ban className="w-3 h-3 mr-1" />
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
                            className="bg-green-600 hover:bg-green-700 h-8"
                          >
                            <Check className="w-3 h-3 mr-1" />
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
                          className="text-red-400 hover:bg-red-500/20 h-8 w-8 p-0"
                        >
                          <Trash2 className="w-3 h-3" />
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

      {/* Confirmation Dialog */}
      <AlertDialog open={!!selectedDevice && !!actionType} onOpenChange={() => {
        setSelectedDevice(null);
        setActionType(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {actionType === 'approve' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
              {actionType === 'block' && <Ban className="w-5 h-5 text-red-500" />}
              {actionType === 'delete' && <AlertTriangle className="w-5 h-5 text-amber-500" />}
              {actionType === 'approve' && 'Approve Device'}
              {actionType === 'block' && 'Block Device'}
              {actionType === 'delete' && 'Delete Device'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'approve' && 'This device will be able to access the admin panel.'}
              {actionType === 'block' && 'This device will no longer be able to access the admin panel.'}
              {actionType === 'delete' && 'This will permanently remove the device record. The user will need to re-register.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeviceAction}
              disabled={actionLoading}
              className={
                actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                actionType === 'delete' ? 'bg-red-600 hover:bg-red-700' :
                ''
              }
            >
              {actionLoading ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
