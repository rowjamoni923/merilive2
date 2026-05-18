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

interface BonusHourRow {
  id: string;
  hour_number: number;
  target_minutes: number;
  bonus_beans: number;
  beans_per_hour: number;
}

interface BonusGlobals {
  max_hours_per_day: number;
  eligible_days: number;
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

  const [bonusHourRows, setBonusHourRows] = useState<BonusHourRow[]>([]);
  const [bonusGlobals, setBonusGlobals] = useState<BonusGlobals | null>(null);
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
        .order('hour_number', { ascending: true });

      if (error) throw error;
      const rows = ((data || []) as any[]).filter((r) => r.hour_number != null);
      setBonusHourRows(
        rows.map((r) => ({
          id: r.id,
          hour_number: Number(r.hour_number),
          target_minutes: Number(r.target_minutes) || 60,
          bonus_beans: Number(r.bonus_beans) || 0,
          beans_per_hour: Number(r.beans_per_hour) || 0,
        }))
      );
      const first = rows[0];
      if (first) {
        setBonusGlobals({
          max_hours_per_day: Number(first.max_hours_per_day) || rows.length,
          eligible_days: Number(first.eligible_days) || 1,
          daily_reset_offset_minutes: Number(first.daily_reset_offset_minutes) || 0,
          is_active: !!first.is_active,
        });
      }
    } catch (error) {
      console.error('Error fetching bonus settings:', error);
      recordAdminError({ kind: "rpc", label: "AdminTasksSettings.fetchBonusSettings", message: formatAdminError(error) });
    }
  };

  const updateHourRow = (id: string, patch: Partial<BonusHourRow>) => {
    setBonusHourRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const saveBonusSettings = async () => {
    if (!bonusGlobals || bonusHourRows.length === 0) return;
    setSavingBonus(true);
    try {
      // Sync ALL hour rows in parallel — shared globals applied to every row, per-row target_minutes/bonus_beans preserved
      const results = await Promise.all(
        bonusHourRows.map((row) =>
          supabase
            .from('new_host_live_bonus_settings' as any)
            .update({
              target_minutes: Math.max(1, Math.min(60, Number(row.target_minutes) || 60)),
              bonus_beans: Math.max(0, Number(row.bonus_beans) || 0),
              beans_per_hour: Math.max(0, Number(row.bonus_beans) || 0),
              max_hours_per_day: Math.max(1, Number(bonusGlobals.max_hours_per_day) || 1),
              eligible_days: Math.max(1, Number(bonusGlobals.eligible_days) || 1),
              daily_reset_offset_minutes: Math.max(0, Math.min(1440, Number(bonusGlobals.daily_reset_offset_minutes) || 0)),
              is_active: !!bonusGlobals.is_active,
            })
            .eq('id', row.id)
        )
      );
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
      toast.success(`Saved ${bonusHourRows.length} hour rows`);
      fetchBonusSettings();
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
      {bonusGlobals && bonusHourRows.length > 0 && (
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
                checked={bonusGlobals.is_active}
                onCheckedChange={(checked) => setBonusGlobals({ ...bonusGlobals, is_active: checked })}
              />
              <Label className="font-medium">{bonusGlobals.is_active ? '✅ Active' : '❌ Inactive'} (applies to all hours)</Label>
            </div>

            {/* Shared globals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">Max Hours/Day</Label>
                <Input
                  type="number"
                  min={1}
                  value={bonusGlobals.max_hours_per_day}
                  onChange={(e) => setBonusGlobals({ ...bonusGlobals, max_hours_per_day: parseInt(e.target.value) || 1 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Eligible Days</Label>
                <Input
                  type="number"
                  min={1}
                  value={bonusGlobals.eligible_days}
                  onChange={(e) => setBonusGlobals({ ...bonusGlobals, eligible_days: parseInt(e.target.value) || 1 })}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  First {bonusGlobals.eligible_days} days after verification
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Daily Reset Offset (min from BST midnight)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  value={bonusGlobals.daily_reset_offset_minutes}
                  onChange={(e) => setBonusGlobals({ ...bonusGlobals, daily_reset_offset_minutes: parseInt(e.target.value) || 0 })}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  0 = midnight BST. 1830 = 6:30 PM BST.
                </p>
              </div>
            </div>

            {/* Per-hour rows */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Per-Hour Configuration ({bonusHourRows.length} hour slots)</Label>
              <div className="rounded-xl border border-purple-200 overflow-hidden bg-background/60">
                <table className="w-full text-sm">
                  <thead className="bg-purple-100/80 text-purple-900">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold w-20">Hour</th>
                      <th className="text-left px-3 py-2 font-semibold">Target Minutes</th>
                      <th className="text-left px-3 py-2 font-semibold">Bonus Beans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bonusHourRows.map((row) => (
                      <tr key={row.id} className="border-t border-purple-100">
                        <td className="px-3 py-2 font-semibold text-purple-700">Hour {row.hour_number}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={1}
                            max={60}
                            value={row.target_minutes}
                            onChange={(e) => updateHourRow(row.id, { target_minutes: parseInt(e.target.value) || 60 })}
                            className="h-8"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            value={row.bonus_beans}
                            onChange={(e) => {
                              const v = parseInt(e.target.value) || 0;
                              updateHourRow(row.id, { bonus_beans: v, beans_per_hour: v });
                            }}
                            className="h-8"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-purple-100/60 border border-purple-200">
              <p className="text-xs text-purple-700">
                📌 <strong>Summary:</strong> {bonusHourRows.length} hour slots, total daily max = {bonusHourRows.reduce((sum, r) => sum + (r.bonus_beans || 0), 0).toLocaleString()} beans · capped at {bonusGlobals.max_hours_per_day} hours/day · for first {bonusGlobals.eligible_days} days after verification.
              </p>
            </div>

            <Button
              onClick={saveBonusSettings}
              disabled={savingBonus}
              className="bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              {savingBonus ? `Saving ${bonusHourRows.length} rows...` : `Save All (${bonusHourRows.length} hour rows)`}
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
