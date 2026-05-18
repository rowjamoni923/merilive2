import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Plus, Edit2, Trash2, Save, X, Star, Video, Clock, Users, Gift, MessageCircle, Flame, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface DailyTask {
  id: string;
  title: string;
  description: string;
  task_type: string;
  requirement_type: string;
  requirement_value: number;
  reward_beans: number;
  reward_coins: number;
  icon_name: string;
  icon_color: string;
  display_order: number;
  is_active: boolean;
  target_audience: string;
  duration_hours: number;
}

interface BonusSettings {
  id: string;
  beans_per_hour: number;
  max_hours_per_day: number;
  eligible_days: number;
  target_minutes: number;
  daily_reset_offset_minutes: number;
  is_active: boolean;
}

const iconOptions = [
  { value: 'video', label: 'Video', icon: Video },
  { value: 'clock', label: 'Clock', icon: Clock },
  { value: 'users', label: 'Users', icon: Users },
  { value: 'gift', label: 'Gift', icon: Gift },
  { value: 'message-circle', label: 'Message', icon: MessageCircle },
  { value: 'star', label: 'Star', icon: Star },
];

const requirementTypes = [
  { value: 'first_live', label: 'First Live' },
  { value: 'live_minutes', label: 'Live Minutes' },
  { value: 'viewers', label: 'Viewers Count' },
  { value: 'first_gift', label: 'First Gift' },
  { value: 'messages_sent', label: 'Messages Sent' },
  { value: 'gifts_received', label: 'Gifts Received' },
  { value: 'followers', label: 'Followers' },
];

const AdminTasksSettings = () => {
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<DailyTask>>({
    title: '',
    description: '',
    task_type: 'daily',
    requirement_type: 'first_live',
    requirement_value: 1,
    reward_beans: 50,
    reward_coins: 10,
    icon_name: 'star',
    icon_color: '#FFB800',
    display_order: 0,
    is_active: true,
    target_audience: 'all',
    duration_hours: 24
  });

  const [bonusSettings, setBonusSettings] = useState<BonusSettings | null>(null);
  const [savingBonus, setSavingBonus] = useState(false);

  useEffect(() => {
    fetchTasks();
    fetchBonusSettings();
  }, []);

  useAdminRealtime(['daily_tasks'], () => { fetchTasks(); fetchBonusSettings(); });

  const fetchBonusSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('new_host_live_bonus_settings' as any)
        .select('*')
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setBonusSettings(data as any);
      }
    } catch (error) {
      console.error('Error fetching bonus settings:', error);
      recordAdminError({ kind: "rpc", label: "AdminTasksSettings.fetchBonusSettings", message: formatAdminError(error) });
    }
  };

  const saveBonusSettings = async () => {
    if (!bonusSettings) return;
    setSavingBonus(true);
    try {
      const { error } = await supabase
        .from('new_host_live_bonus_settings' as any)
        .update({
          beans_per_hour: bonusSettings.beans_per_hour,
          max_hours_per_day: bonusSettings.max_hours_per_day,
          eligible_days: bonusSettings.eligible_days,
          is_active: bonusSettings.is_active,
        })
        .eq('id', bonusSettings.id);

      if (error) throw error;
      toast.success('New host bonus settings updated');
    } catch (error) {
      console.error('Error saving bonus settings:', error);
      recordAdminError({ kind: "rpc", label: "AdminTasksSettings.saveBonusSettings", message: formatAdminError(error) });
      toast.error('Failed to save settings');
    } finally {
      setSavingBonus(false);
    }
  };

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('*')
        .order('display_order');

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      recordAdminError({ kind: "rpc", label: "AdminTasksSettings.fetchTasks", message: formatAdminError(error) });
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingTask) {
        const { error: updateError } = await supabase
          .from('daily_tasks')
          .update(formData)
          .eq('id', editingTask.id);

        if (updateError) throw updateError;
        toast.success('Task updated');
      } else {
        const insertData = {
          title: formData.title || '',
          description: formData.description || '',
          task_type: formData.task_type || 'daily',
          requirement_type: formData.requirement_type || 'first_live',
          requirement_value: formData.requirement_value || 1,
          reward_beans: formData.reward_beans || 0,
          reward_coins: formData.reward_coins || 0,
          icon_name: formData.icon_name || 'star',
          icon_color: formData.icon_color || '#FFB800',
          display_order: formData.display_order || 0,
          is_active: formData.is_active ?? true,
          target_audience: formData.target_audience || 'all',
          duration_hours: formData.duration_hours || 24
        };
        const { error: insertError } = await supabase
          .from('daily_tasks')
          .insert([insertData]);

        if (insertError) throw insertError;
        toast.success('New task created');
      }

      setIsDialogOpen(false);
      setEditingTask(null);
      resetForm();
      fetchTasks();
    } catch (err) {
      console.error('Error saving task:', err);
      recordAdminError({ kind: "rpc", label: "AdminTasksSettings.insertData", message: formatAdminError(err) });
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;

    try {
      const { error } = await supabase
        .from('daily_tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Task deleted');
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      recordAdminError({ kind: "rpc", label: "AdminTasksSettings.handleDelete", message: formatAdminError(error) });
      toast.error('Failed to delete');
    }
  };

  const handleEdit = (task: DailyTask) => {
    setEditingTask(task);
    setFormData(task);
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      task_type: 'daily',
      requirement_type: 'first_live',
      requirement_value: 1,
      reward_beans: 50,
      reward_coins: 10,
      icon_name: 'star',
      icon_color: '#FFB800',
      display_order: tasks.length,
      is_active: true,
      target_audience: 'all',
      duration_hours: 24
    });
  };

  const toggleActive = async (task: DailyTask) => {
    try {
      const { error } = await supabase
        .from('daily_tasks')
        .update({ is_active: !task.is_active })
        .eq('id', task.id);

      if (error) throw error;
      fetchTasks();
    } catch (error) {
      console.error('Error toggling task:', error);
      recordAdminError({ kind: "rpc", label: "AdminTasksSettings.toggleActive", message: formatAdminError(error) });
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* New Host Live Bonus Settings */}
      {bonusSettings && (
        <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-fuchsia-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flame className="w-5 h-5 text-fuchsia-500" />
              🔥 New Host Live Bonus Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <Switch
                checked={bonusSettings.is_active}
                onCheckedChange={(checked) => setBonusSettings({ ...bonusSettings, is_active: checked })}
              />
              <Label className="font-medium">{bonusSettings.is_active ? '✅ Active' : '❌ Inactive'}</Label>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">Beans Per Hour</Label>
                <Input
                  type="number"
                  value={bonusSettings.beans_per_hour}
                  onChange={(e) => setBonusSettings({ ...bonusSettings, beans_per_hour: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Daily max: {((bonusSettings.beans_per_hour ?? 0) * (bonusSettings.max_hours_per_day ?? 0)).toLocaleString()} beans
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Max Hours/Day</Label>
                <Input
                  type="number"
                  value={bonusSettings.max_hours_per_day}
                  onChange={(e) => setBonusSettings({ ...bonusSettings, max_hours_per_day: parseInt(e.target.value) || 1 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Eligible Days</Label>
                <Input
                  type="number"
                  value={bonusSettings.eligible_days}
                  onChange={(e) => setBonusSettings({ ...bonusSettings, eligible_days: parseInt(e.target.value) || 1 })}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  First {bonusSettings.eligible_days} days after verification
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-purple-100/60 border border-purple-200">
              <p className="text-xs text-purple-700">
                📌 <strong>Summary:</strong> New verified hosts earn {(bonusSettings.beans_per_hour ?? 0).toLocaleString()} beans/hour for the first {bonusSettings.eligible_days ?? 0} days (max {bonusSettings.max_hours_per_day ?? 0} hours/day = {((bonusSettings.beans_per_hour ?? 0) * (bonusSettings.max_hours_per_day ?? 0)).toLocaleString()} beans)
              </p>
            </div>

            <Button
              onClick={saveBonusSettings}
              disabled={savingBonus}
              className="bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {savingBonus ? 'Saving...' : 'Save Bonus Settings'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Daily Tasks */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Task Settings</h1>
          <p className="text-muted-foreground">Manage daily tasks</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingTask(null); resetForm(); }}>
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={formData.title || ''}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Task name"
                />
              </div>

              <div>
                <Label>Description</Label>
                <Input
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Task description"
                />
              </div>

              <div>
                <Label>Requirement Type</Label>
                <Select
                  value={formData.requirement_type}
                  onValueChange={(value) => setFormData({ ...formData, requirement_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requirementTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Requirement Value</Label>
                <Input
                  type="number"
                  value={formData.requirement_value || 1}
                  onChange={(e) => setFormData({ ...formData, requirement_value: parseInt(e.target.value) })}
                />
              </div>

              <div>
                <Label>⏱️ Task Duration (Hours)</Label>
                <Input
                  type="number"
                  min={1}
                  max={720}
                  value={formData.duration_hours || 24}
                  onChange={(e) => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 24 })}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {(formData.duration_hours || 24) >= 24 
                    ? `${Math.floor((formData.duration_hours || 24) / 24)} days ${(formData.duration_hours || 24) % 24} hours` 
                    : `${formData.duration_hours || 24} hours`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Beans Reward</Label>
                  <Input
                    type="number"
                    value={formData.reward_beans || 0}
                    onChange={(e) => setFormData({ ...formData, reward_beans: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>💎 Diamonds Reward</Label>
                  <Input
                    type="number"
                    value={formData.reward_coins || 0}
                    onChange={(e) => setFormData({ ...formData, reward_coins: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div>
                <Label>🎯 Target Audience</Label>
                <Select
                  value={formData.target_audience || 'all'}
                  onValueChange={(value) => setFormData({ ...formData, target_audience: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">👥 Everyone (User + Host)</SelectItem>
                    <SelectItem value="host">🎤 Host Only</SelectItem>
                    <SelectItem value="user">👤 User Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={(formData as any).show_in_live ?? false}
                  onCheckedChange={(checked) => setFormData({ ...formData, show_in_live: checked } as any)}
                />
                <Label>📺 Show in Live</Label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Icon</Label>
                  <Select
                    value={formData.icon_name}
                    onValueChange={(value) => setFormData({ ...formData, icon_name: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {iconOptions.map((icon) => (
                        <SelectItem key={icon.value} value={icon.value}>
                          {icon.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Icon Color</Label>
                  <Input
                    type="color"
                    value={formData.icon_color || '#FFB800'}
                    onChange={(e) => setFormData({ ...formData, icon_color: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Display Order</Label>
                <Input
                  type="number"
                  value={formData.display_order || 0}
                  onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Active</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} className="flex-1">
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tasks List */}
      <div className="grid gap-4">
        {tasks.map((task) => {
          const IconComponent = iconOptions.find(i => i.value === task.icon_name)?.icon || Star;
          
          return (
            <Card key={task.id} className={!task.is_active ? 'opacity-50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${task.icon_color}20` }}
                  >
                    <IconComponent className="w-6 h-6" style={{ color: task.icon_color }} />
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="font-semibold">{task.title}</h3>
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                        +{task.reward_beans} Beans
                      </span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        +{task.reward_coins} 💎 Diamonds
                      </span>
                      {(task as any).show_in_live && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          📺 Live
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        (task as any).target_audience === 'host' 
                          ? 'bg-fuchsia-100 text-fuchsia-700' 
                          : (task as any).target_audience === 'user' 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {(task as any).target_audience === 'host' ? '🎤 Host' : (task as any).target_audience === 'user' ? '👤 User' : '👥 All'}
                      </span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {task.requirement_type}: {task.requirement_value}
                      </span>
                      <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded">
                        ⏱️ {(task as any).duration_hours >= 24 
                          ? `${Math.floor((task as any).duration_hours / 24)}d` 
                          : `${(task as any).duration_hours}h`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={task.is_active}
                      onCheckedChange={() => toggleActive(task)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(task)}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(task.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {tasks.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No tasks found. Create a new task.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminTasksSettings;
