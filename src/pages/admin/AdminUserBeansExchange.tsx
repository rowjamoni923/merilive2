 import { useState, useEffect } from "react";
 import useAdminRealtime from "@/hooks/useAdminRealtime";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Label } from "@/components/ui/label";
 import { Switch } from "@/components/ui/switch";
 import { Badge } from "@/components/ui/badge";
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
 import { supabase } from "@/integrations/supabase/client";
 import { useToast } from "@/hooks/use-toast";
 import { Coins, Gem, Plus, Trash2, Edit2, ArrowRight, Save, RefreshCw } from "lucide-react";
 
 interface ExchangeTier {
   id: string;
   beans_amount: number;
   diamonds_reward: number;
   display_order: number;
   is_active: boolean;
 }
 
 export default function AdminUserBeansExchange() {
   const { toast } = useToast();
   const [tiers, setTiers] = useState<ExchangeTier[]>([]);
   const [loading, setLoading] = useState(false);
   const [showAddModal, setShowAddModal] = useState(false);
   const [editingTier, setEditingTier] = useState<ExchangeTier | null>(null);
   const [formData, setFormData] = useState({ beans_amount: "", diamonds_reward: "", display_order: "0" });
   const [saving, setSaving] = useState(false);

   useAdminRealtime(['user_beans_exchange_tiers'], () => fetchTiers());
 
   const fetchTiers = async () => {
     const { data, error } = await supabase
       .from('user_beans_exchange_tiers')
       .select('*')
       .order('display_order', { ascending: true });
     
     if (data) setTiers(data);
     setLoading(false);
   };
 
   const handleSave = async () => {
     if (!formData.beans_amount || !formData.diamonds_reward) {
       toast({ title: "Please fill all fields", variant: "destructive" });
       return;
     }
 
     setSaving(true);
     try {
       if (editingTier) {
         const { error } = await supabase
           .from('user_beans_exchange_tiers')
           .update({
             beans_amount: parseInt(formData.beans_amount),
             diamonds_reward: parseInt(formData.diamonds_reward),
             display_order: parseInt(formData.display_order),
             updated_at: new Date().toISOString()
           })
           .eq('id', editingTier.id);
         
         if (error) throw error;
         toast({ title: "Tier updated successfully" });
       } else {
         const { error } = await supabase
           .from('user_beans_exchange_tiers')
           .insert({
             beans_amount: parseInt(formData.beans_amount),
             diamonds_reward: parseInt(formData.diamonds_reward),
             display_order: parseInt(formData.display_order)
           });
         
         if (error) throw error;
         toast({ title: "Tier added successfully" });
       }
 
       setShowAddModal(false);
       setEditingTier(null);
       setFormData({ beans_amount: "", diamonds_reward: "", display_order: "0" });
     } catch (error: any) {
       toast({ title: "Error", description: error.message, variant: "destructive" });
     } finally {
       setSaving(false);
     }
   };
 
   const handleDelete = async (id: string) => {
     if (!confirm("Are you sure you want to delete this tier?")) return;
     
     const { error } = await supabase
       .from('user_beans_exchange_tiers')
       .delete()
       .eq('id', id);
     
     if (error) {
       toast({ title: "Delete failed", description: error.message, variant: "destructive" });
     } else {
       toast({ title: "Tier deleted" });
     }
   };
 
   const handleToggleActive = async (tier: ExchangeTier) => {
     const { error } = await supabase
       .from('user_beans_exchange_tiers')
       .update({ is_active: !tier.is_active, updated_at: new Date().toISOString() })
       .eq('id', tier.id);
     
     if (error) {
       toast({ title: "Update failed", variant: "destructive" });
     }
   };
 
   const openEditModal = (tier: ExchangeTier) => {
     setEditingTier(tier);
     setFormData({
       beans_amount: tier.beans_amount.toString(),
       diamonds_reward: tier.diamonds_reward.toString(),
       display_order: tier.display_order.toString()
     });
     setShowAddModal(true);
   };
 
   const openAddModal = () => {
     setEditingTier(null);
     setFormData({ beans_amount: "", diamonds_reward: "", display_order: (tiers.length + 1).toString() });
     setShowAddModal(true);
   };
 
   return (
     <div className="p-4 space-y-4">
       {/* Header */}
       <div className="flex items-center justify-between">
         <div className="flex items-center gap-3">
           <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
             <Coins className="w-5 h-5 text-white" />
           </div>
           <div>
             <h2 className="text-lg font-bold text-white">User Beans Exchange Rates</h2>
             <p className="text-slate-400 text-xs">Set exchange rates for regular users (non-hosts, non-agency)</p>
           </div>
         </div>
         
         <div className="flex gap-2">
           <Button 
             variant="outline" 
             size="sm" 
             onClick={fetchTiers}
             className="border-slate-600"
           >
             <RefreshCw className="w-4 h-4" />
           </Button>
           <Button 
             onClick={openAddModal}
             className="bg-gradient-to-r from-amber-500 to-orange-500"
           >
             <Plus className="w-4 h-4 mr-1" />
             Add Tier
           </Button>
         </div>
       </div>
 
       {/* Info Card */}
       <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30">
         <CardContent className="p-4">
           <p className="text-amber-200 text-sm">
             <strong>ℹ️ Note:</strong> These exchange rates apply only to regular users who are NOT hosts and NOT agency owners. 
             They can exchange their beans (earned from gifts) to diamonds (My Diamond Balance).
           </p>
         </CardContent>
       </Card>
 
       {/* Tiers List */}
       {loading ? (
         <div className="flex items-center justify-center py-12">
           <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
         </div>
       ) : tiers.length === 0 ? (
         <Card className="bg-slate-900/50 border-slate-800">
           <CardContent className="p-8 text-center">
             <Coins className="w-12 h-12 text-slate-600 mx-auto mb-3" />
             <p className="text-slate-400">No exchange tiers configured</p>
             <Button onClick={openAddModal} className="mt-4 bg-amber-500">
               <Plus className="w-4 h-4 mr-1" /> Add First Tier
             </Button>
           </CardContent>
         </Card>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
           {tiers.map((tier) => (
             <Card 
               key={tier.id} 
               className={`bg-slate-900/50 border-slate-800 ${!tier.is_active ? 'opacity-50' : ''}`}
             >
               <CardContent className="p-4 space-y-4">
                 <div className="flex items-center justify-between">
                   <Badge variant={tier.is_active ? "default" : "secondary"}>
                     {tier.is_active ? "Active" : "Inactive"}
                   </Badge>
                   <span className="text-slate-500 text-xs">Order: {tier.display_order}</span>
                 </div>
                 
                 <div className="text-center space-y-2 py-4">
                   <div className="flex items-center justify-center gap-2">
                     <Coins className="w-6 h-6 text-amber-400" />
                     <span className="text-amber-400 font-bold text-2xl">{tier.beans_amount.toLocaleString()}</span>
                   </div>
                   
                   <ArrowRight className="w-5 h-5 text-slate-500 mx-auto" />
                   
                   <div className="flex items-center justify-center gap-2">
                     <Gem className="w-6 h-6 text-cyan-400" />
                     <span className="text-cyan-400 font-bold text-2xl">{tier.diamonds_reward.toLocaleString()}</span>
                   </div>
                 </div>
                 
                 <div className="flex items-center justify-between pt-2 border-t border-slate-700">
                   <Switch
                     checked={tier.is_active}
                     onCheckedChange={() => handleToggleActive(tier)}
                   />
                   <div className="flex gap-1">
                     <Button 
                       size="sm" 
                       variant="ghost" 
                       onClick={() => openEditModal(tier)}
                       className="text-blue-400 hover:bg-blue-500/20"
                     >
                       <Edit2 className="w-4 h-4" />
                     </Button>
                     <Button 
                       size="sm" 
                       variant="ghost" 
                       onClick={() => handleDelete(tier.id)}
                       className="text-red-400 hover:bg-red-500/20"
                     >
                       <Trash2 className="w-4 h-4" />
                     </Button>
                   </div>
                 </div>
               </CardContent>
             </Card>
           ))}
         </div>
       )}
 
       {/* Add/Edit Modal */}
       <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
         <DialogContent className="bg-slate-900 border-slate-700">
           <DialogHeader>
             <DialogTitle className="text-white">
               {editingTier ? "Edit Exchange Tier" : "Add Exchange Tier"}
             </DialogTitle>
           </DialogHeader>
           
           <div className="space-y-4 py-4">
             <div className="space-y-2">
               <Label className="text-white">Beans Amount</Label>
               <div className="relative">
                 <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400" />
                 <Input
                   type="number"
                   placeholder="e.g., 10000"
                   value={formData.beans_amount}
                   onChange={(e) => setFormData({ ...formData, beans_amount: e.target.value })}
                   className="pl-10 bg-slate-800 border-slate-600 text-white"
                 />
               </div>
             </div>
             
             <div className="space-y-2">
               <Label className="text-white">Diamonds Reward</Label>
               <div className="relative">
                 <Gem className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400" />
                 <Input
                   type="number"
                   placeholder="e.g., 1000"
                   value={formData.diamonds_reward}
                   onChange={(e) => setFormData({ ...formData, diamonds_reward: e.target.value })}
                   className="pl-10 bg-slate-800 border-slate-600 text-white"
                 />
               </div>
             </div>
             
             <div className="space-y-2">
               <Label className="text-white">Display Order</Label>
               <Input
                 type="number"
                 value={formData.display_order}
                 onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
                 className="bg-slate-800 border-slate-600 text-white"
               />
             </div>
           </div>
           
           <DialogFooter>
             <Button variant="ghost" onClick={() => setShowAddModal(false)}>
               Cancel
             </Button>
             <Button 
               onClick={handleSave} 
               disabled={saving}
               className="bg-gradient-to-r from-amber-500 to-orange-500"
             >
               {saving ? (
                 <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
               ) : (
                 <>
                   <Save className="w-4 h-4 mr-1" />
                   {editingTier ? "Update" : "Add"} Tier
                 </>
               )}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </div>
   );
 }