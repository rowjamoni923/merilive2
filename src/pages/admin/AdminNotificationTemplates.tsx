import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { SmartImage } from "@/components/ui/smart-image";
import { 
  ArrowLeft, 
  Bell, 
  Save,
  Loader2,
  Edit3,
  Eye,
  MessageSquare,
  AlertCircle,
  Info,
  ImageIcon,
  Send,
  Sparkles,
  Wand2,
  Copy,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface NotificationTemplate {
  id: string;
  template_key: string;
  title_template: string;
  message_template: string;
  description: string | null;
  category?: string | null;
  icon_emoji?: string | null;
  image_url?: string | null;
  updated_at: string;
}

const AdminNotificationTemplates = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Edit dialog
  const [editDialog, setEditDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [editForm, setEditForm] = useState({
    title_template: "",
    message_template: "",
    description: "",
    icon_emoji: "",
    image_url: ""
  });

  // Preview dialog
  const [previewDialog, setPreviewDialog] = useState(false);
  const [previewContent, setPreviewContent] = useState({ title: "", message: "", image_url: "", icon_emoji: "" });
  const [broadcastingKey, setBroadcastingKey] = useState<string | null>(null);

  const premiumIcons = [
    { label: 'Face Verification', url: '/images/premium-notifications/face-verification-3d.png' },
    { label: 'Recharge Mega', url: '/images/premium-notifications/recharge-mega-3d.png' },
    { label: 'VIP Crown', url: '/images/premium-notifications/vip-crown-3d.png' },
    { label: 'Referral Gift', url: '/images/premium-notifications/referral-gift-3d.png' },
    { label: 'Live Reward', url: '/images/premium-notifications/live-reward-3d.png' },
  ];

  const eventBanners = [
    { title: 'Recharge Mega Offer', url: '/images/premium-events/recharge-mega-offer.png' },
    { title: 'VIP Launch', url: '/images/premium-events/vip-launch.png' },
    { title: 'Weekly Tournament', url: '/images/premium-events/weekly-tournament.png' },
    { title: 'Eid Special', url: '/images/premium-events/eid-special.png' },
    { title: 'New Year Event', url: '/images/premium-events/new-year-event.png' },
  ];

  // AI Banner Generator presets - grouped by category, click to auto-generate premium 3D banner
  const eventGroups: { group: string; items: string[] }[] = [
    { group: '💎 Recharge & Diamonds', items: ['Recharge Mega Offer', 'Double Diamond Bonus', 'Flash Recharge Sale', 'Diamond Rush Weekend', 'First Recharge Gift', 'Weekend Top-Up Bonus', 'VIP Recharge Pack'] },
    { group: '👑 VIP & Noble', items: ['VIP Launch', 'Noble Coronation', 'Royal Membership Sale', 'Crown Upgrade Event', 'VIP Exclusive Gala', 'Noble Anniversary'] },
    { group: '🎤 Live & Host', items: ['Host Of The Week', 'Golden Hour 3x Earnings', 'Live Battle Royale', 'PK Championship', 'New Host Welcome Bonus', '5-Hour Live Milestone', 'Top Streamer Awards', 'Weekly Streaming Bonus'] },
    { group: '🎁 Gifts & Earnings', items: ['Gift Storm Event', 'Double Beans Weekend', 'Lucky Gift Lottery', 'Mega Gift Carnival', 'Gifter Of The Month', 'Charm Leaderboard Final'] },
    { group: '🏆 Tournament & PK', items: ['Weekly Tournament', 'Monthly Championship', 'Season Grand Finale', 'Wealth Ranking Battle', 'Game Leaderboard Showdown'] },
    { group: '🎊 Festivals & Holidays', items: ['Eid Special', 'Ramadan Kareem', 'Diwali Lights', 'Christmas Gala', 'New Year Event', 'Holi Color Fest', 'Chinese New Year', 'Thanksgiving Bonus', 'Valentine Special', 'Summer Carnival'] },
    { group: '👥 Referral & Growth', items: ['Referral Mania', 'Invite & Earn Bonus', 'Friend Reward Weekend', 'Top Inviter Awards'] },
    { group: '🎂 User Moments', items: ['Birthday Bash', 'Anniversary Celebration', 'Welcome Bonus', 'Level Up Reward', 'Daily Check-in Mega'] },
    { group: '🏢 Agency & Helper', items: ['Agency Champions', 'Top Agency Of The Week', 'Helper Recharge Bonanza', 'Agency Recruitment Drive'] },
  ];
  const eventPresets: string[] = eventGroups.flatMap((g) => g.items);

  // Banner size presets — must match supabase/functions/generate-event-banner/index.ts
  const BANNER_SIZES: { key: string; label: string; w: number; h: number }[] = [
    { key: 'banner_16_9_1920', label: 'Hero Banner · 1920×1080 (16:9)', w: 1920, h: 1080 },
    { key: 'banner_16_9_1280', label: 'Standard Banner · 1280×720 (16:9)', w: 1280, h: 720 },
    { key: 'square_1080',      label: 'Square · 1080×1080 (1:1)', w: 1080, h: 1080 },
    { key: 'story_1080',       label: 'Story / Reel · 1080×1920 (9:16)', w: 1080, h: 1920 },
    { key: 'portrait_4_5',     label: 'Portrait · 1080×1350 (4:5)', w: 1080, h: 1350 },
    { key: 'wide_3_2',         label: 'Wide · 1500×1000 (3:2)', w: 1500, h: 1000 },
    { key: 'push_thumb',       label: 'Push Thumbnail · 512×512 (1:1)', w: 512, h: 512 },
  ];

  const [aiCustomEvent, setAiCustomEvent] = useState('');
  const [aiSizeKey, setAiSizeKey] = useState<string>('banner_16_9_1920');
  const [aiGenerating, setAiGenerating] = useState<string | null>(null);
  const [aiBanners, setAiBanners] = useState<{ eventName: string; url: string; sizeLabel: string; w: number; h: number }[]>([]);

  const generateAiBanner = async (eventName: string) => {
    if (!eventName.trim()) return;
    setAiGenerating(eventName);
    try {
      const { data, error } = await supabase.functions.invoke('generate-event-banner', {
        body: { eventName, sizeKey: aiSizeKey }
      });
      if (error) throw error;
      if (!data?.url) throw new Error('No URL returned');
      const size = data.size || BANNER_SIZES.find(s => s.key === aiSizeKey)!;
      setAiBanners(prev => [{
        eventName,
        url: data.url,
        sizeLabel: size.label || `${size.width}×${size.height}`,
        w: size.width ?? size.w,
        h: size.height ?? size.h,
      }, ...prev].slice(0, 30));
      toast({ title: 'Banner generated', description: `Premium 3D banner ready · ${size.width ?? size.w}×${size.height ?? size.h}` });
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e?.message || 'AI generation error', variant: 'destructive' });
    } finally {
      setAiGenerating(null);
    }
  };

  const copyBannerUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Copied', description: 'Banner URL copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const downloadBanner = async (eventName: string, url: string, w: number, h: number) => {
    try {
      const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)}-${w}x${h}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (e: any) {
      toast({ title: 'Download failed', description: e?.message || 'Could not download banner', variant: 'destructive' });
    }
  };

  useAdminRealtime(['notification_templates'], () => fetchTemplates());

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("notification_templates")
        .select("*")
        .order("template_key");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (template: NotificationTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      title_template: template.title_template,
      message_template: template.message_template,
      description: template.description || "",
      icon_emoji: template.icon_emoji || "",
      image_url: template.image_url || ""
    });
    setEditDialog(true);
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate) return;

    setSaving(true);
    try {
      console.log('[AdminNotificationTemplates] Saving template:', selectedTemplate.id, editForm);
      
      const { data, error } = await supabase
        .from("notification_templates")
        .update({
          title_template: editForm.title_template,
          message_template: editForm.message_template,
          description: editForm.description || null,
          icon_emoji: editForm.icon_emoji || null,
          image_url: editForm.image_url || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", selectedTemplate.id)
        .select();

      if (error) {
        console.error('[AdminNotificationTemplates] Update error:', error);
        recordAdminError({ kind: "rpc", label: "AdminNotificationTemplates.handleSaveTemplate", message: formatAdminError(error) });
        throw error;
      }

      console.log('[AdminNotificationTemplates] Template updated successfully:', data);

      toast({
        title: "Success!",
        description: "Template updated successfully",
      });

      setEditDialog(false);
      await fetchTemplates();
    } catch (error: any) {
      console.error('[AdminNotificationTemplates] Error:', error);
      recordAdminError({ kind: "rpc", label: "AdminNotificationTemplates.handleSaveTemplate", message: formatAdminError(error) });
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const previewTemplate = (template: NotificationTemplate) => {
    // Replace placeholders with example values
    let title = template.title_template;
    let message = template.message_template;

    const exampleValues: Record<string, string> = {
      "{{code}}": "123456",
      "{{agency_name}}": "Demo Agency",
      "{{agency_code}}": "AGDEMO01",
      "{{display_name}}": "John Doe",
      "{{user_name}}": "john_doe"
    };

    for (const [placeholder, value] of Object.entries(exampleValues)) {
      title = title.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
      message = message.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    setPreviewContent({ title, message, image_url: template.image_url || '', icon_emoji: template.icon_emoji || '' });
    setPreviewDialog(true);
  };

  const getTemplateIcon = (key: string) => {
    switch (key) {
      case 'agency_verification_code':
        return '🔐';
      case 'agency_created':
        return '🎉';
      case 'welcome_message':
        return '👋';
      default:
        return key.includes('recharge') ? '💎' : key.includes('vip') ? '👑' : key.includes('face') ? '🛡️' : key.includes('referral') || key.includes('invite') ? '🎁' : key.includes('live') ? '🔥' : '📢';
    }
  };

  const sendTemplateBroadcast = async (template: NotificationTemplate) => {
    setBroadcastingKey(template.template_key);
    try {
      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          target: 'all',
          title: template.title_template,
          body: template.message_template,
          imageUrl: template.image_url || undefined,
          type: 'broadcast',
          data: {
            template_key: template.template_key,
            icon_emoji: template.icon_emoji || getTemplateIcon(template.template_key),
            image_url: template.image_url || '',
            action_url: '/chat?tab=notifications',
            persist_fallback: 'false'
          }
        }
      });
      if (error) throw error;
      toast({ title: 'Broadcast sent', description: 'Premium push notification has been sent to active devices.' });
    } catch (error: any) {
      toast({ title: 'Send failed', description: error.message || 'Could not send broadcast', variant: 'destructive' });
    } finally {
      setBroadcastingKey(null);
    }
  };

  const getTemplateLabel = (key: string) => {
    switch (key) {
      case 'agency_verification_code':
        return 'Agency Verification';
      case 'agency_created':
        return 'Agency Created';
      case 'welcome_message':
        return 'Welcome Message';
      default:
        return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  };

  if (loading) {
    return (
      <div className="admin-pro-shell admin-content min-h-[60vh] flex items-center justify-center p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="admin-pro-shell admin-content -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate('/admin')}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">
            Notification Templates
          </h1>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mx-4 mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-300 font-medium">Variable Usage</p>
            <p className="text-xs text-blue-400/80 mt-1">
              Use {"{{variable_name}}"} format to add dynamic values to templates.
              <br />
              Example: {"{{code}}"}, {"{{agency_name}}"}, {"{{display_name}}"}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 grid gap-4 lg:grid-cols-2">
        <Card className="bg-white border-slate-300 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-amber-300" /> Premium 3D PNG Icons</CardTitle>
            <CardDescription className="text-slate-900/50">5 industry-standard PNG icons for push + in-app notifications.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-5 gap-3">
            {premiumIcons.map((icon) => (
              <div key={icon.url} className="rounded-xl bg-white/[0.04] border border-white/10 p-2 text-center">
                <SmartImage src={icon.url} alt={icon.label} className="w-full aspect-square object-contain" />
                <p className="mt-1 text-[10px] text-slate-900/70 truncate">{icon.label}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-300 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-blue-300" /> Premium Event Banners</CardTitle>
            <CardDescription className="text-slate-900/50">5 universal event banners ready for campaigns and notification images.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {eventBanners.map((banner) => (
              <div key={banner.url} className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.04]">
                <SmartImage src={banner.url} alt={banner.title} className="w-full aspect-[4/1.8] object-cover" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* AI Banner Generator */}
      <div className="p-4">
        <Card className="bg-gradient-to-br from-indigo-900/40 via-purple-900/30 to-amber-900/20 border-amber-400/20 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-amber-300" /> AI Banner Generator
              <Badge className="ml-2 bg-amber-500/20 text-amber-200 border-amber-400/30">Nano Banana 3D</Badge>
            </CardTitle>
            <CardDescription className="text-slate-900/60">
              Click any event name below to auto-generate a premium 3D luxury banner. Or type your own event name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Size selector */}
            <div>
              <Label className="text-slate-700 text-xs uppercase tracking-wider mb-1.5 block">Banner Size</Label>
              <div className="flex flex-wrap gap-1.5">
                {BANNER_SIZES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setAiSizeKey(s.key)}
                    className={`px-3 py-1.5 text-[11px] rounded-lg border transition ${
                      aiSizeKey === s.key
                        ? 'bg-amber-400/20 border-amber-300/70 text-amber-100'
                        : 'bg-white/[0.04] border-white/15 text-slate-900/70 hover:bg-white/[0.08]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-900/40 mt-1.5">Selected size is pixel-exact — AI render is cover-cropped to {BANNER_SIZES.find(s => s.key === aiSizeKey)?.w}×{BANNER_SIZES.find(s => s.key === aiSizeKey)?.h}.</p>
            </div>

            {/* Custom event input */}
            <div className="flex gap-2">
              <Input
                value={aiCustomEvent}
                onChange={(e) => setAiCustomEvent(e.target.value)}
                placeholder="Type any event name (e.g. New Year Mega Bash)..."
                className="bg-white/5 border-white/15 text-slate-900 placeholder:text-slate-900/40"
                onKeyDown={(e) => { if (e.key === 'Enter' && aiCustomEvent.trim()) generateAiBanner(aiCustomEvent.trim()); }}
              />
              <Button
                onClick={() => aiCustomEvent.trim() && generateAiBanner(aiCustomEvent.trim())}
                disabled={!aiCustomEvent.trim() || !!aiGenerating}
                className="bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white"
              >
                {aiGenerating === aiCustomEvent.trim() ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
                Generate
              </Button>
            </div>

            {/* Event preset chips - grouped by category */}
            <div className="space-y-3">
              <p className="text-xs text-slate-900/50">Tap any event below — premium 3D luxury banner generates instantly at the selected size. Unlimited generations.</p>
              {eventGroups.map((group) => (
                <div key={group.group}>
                  <p className="text-[11px] uppercase tracking-wider text-amber-300/70 font-semibold mb-1.5">{group.group}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((evt) => (
                      <button
                        key={evt}
                        onClick={() => generateAiBanner(evt)}
                        disabled={!!aiGenerating}
                        className="px-3 py-1.5 text-xs rounded-full border border-amber-300/30 bg-white/[0.04] text-amber-100 hover:bg-amber-400/15 hover:border-amber-300/60 transition disabled:opacity-50"
                      >
                        {aiGenerating === evt ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : <Sparkles className="w-3 h-3 inline mr-1" />}
                        {evt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>


            {/* Generated banners gallery */}
            {aiBanners.length > 0 && (
              <div>
                <p className="text-xs text-slate-900/50 mb-2">Generated banners ({aiBanners.length}):</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {aiBanners.map((b) => (
                    <div key={b.url} className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
                      <SmartImage src={b.url} alt={b.eventName} className="w-full object-cover" style={{ aspectRatio: `${b.w} / ${b.h}` }} />
                      <div className="p-2 flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-900/90 truncate">{b.eventName}</p>
                          <p className="text-[10px] text-slate-900/50">{b.w}×{b.h}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => copyBannerUrl(b.url)} className="h-7 px-2 text-slate-900/70 hover:text-slate-900" title="Copy URL">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => downloadBanner(b.eventName, b.url, b.w, b.h)} className="h-7 px-2 text-slate-900/70 hover:text-slate-900" title="Download PNG">
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>


      {/* Templates List */}
      <div className="p-4 space-y-4">
        {templates.map((template) => (
          <Card key={template.id} className="overflow-hidden bg-white border-slate-300">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {template.image_url ? (
                      <SmartImage src={template.image_url} alt={getTemplateLabel(template.template_key)} className="w-11 h-11 rounded-xl object-cover bg-white/10" />
                    ) : (
                      <span className="text-2xl">{template.icon_emoji || getTemplateIcon(template.template_key)}</span>
                    )}
                  <div>
                    <CardTitle className="text-base text-slate-900">
                      {getTemplateLabel(template.template_key)}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5 text-slate-900/50">
                      {template.description || template.template_key}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs text-slate-900/60 border-white/20">
                  {template.template_key}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="bg-white/5 rounded-lg p-3 mb-4 border border-white/10">
                <p className="font-medium text-sm mb-1 text-slate-900/90">{template.title_template}</p>
                <p className="text-xs text-slate-900/50 line-clamp-2">{template.message_template}</p>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewTemplate(template)}
                  className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Preview
                </Button>
                <Button
                  size="sm"
                  onClick={() => openEditDialog(template)}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Edit3 className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  onClick={() => sendTemplateBroadcast(template)}
                  disabled={broadcastingKey === template.template_key}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950"
                >
                  {broadcastingKey === template.template_key ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-white border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Edit3 className="w-5 h-5 text-purple-400" />
              Edit Template
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Template Key</Label>
              <Input
                value={selectedTemplate?.template_key || ""}
                disabled
                className="mt-1.5 bg-white border-slate-300 text-slate-900/60"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Description</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description of this template"
                className="mt-1.5 bg-white border-slate-300 text-slate-900 placeholder:text-slate-900/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium text-slate-700">Unicode Emoji</Label>
                <Input
                  value={editForm.icon_emoji}
                  onChange={(e) => setEditForm(prev => ({ ...prev, icon_emoji: e.target.value }))}
                  placeholder="💎"
                  className="mt-1.5 bg-white border-slate-300 text-slate-900 placeholder:text-slate-900/30"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Image URL</Label>
                <Input
                  value={editForm.image_url}
                  onChange={(e) => setEditForm(prev => ({ ...prev, image_url: e.target.value }))}
                  placeholder="Pick below or paste URL"
                  className="mt-1.5 bg-white border-slate-300 text-slate-900 placeholder:text-slate-900/30"
                />
              </div>
            </div>

            {/* Visual Icon Picker */}
            <div>
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-300" /> Pick Premium 3D Icon
              </Label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {premiumIcons.map((icon) => {
                  const active = editForm.image_url === icon.url;
                  return (
                    <button
                      type="button"
                      key={icon.url}
                      onClick={() => setEditForm(prev => ({ ...prev, image_url: icon.url }))}
                      className={`rounded-lg p-1.5 border text-center transition ${active ? 'border-amber-400 bg-amber-400/10 ring-2 ring-amber-400/40' : 'border-white/10 bg-white/[0.04] hover:border-white/30'}`}
                      title={icon.label}
                    >
                      <SmartImage src={icon.url} alt={icon.label} className="w-full aspect-square object-contain" />
                      <p className="mt-1 text-[9px] text-slate-900/70 truncate">{icon.label}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visual Banner Picker */}
            <div>
              <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-300" /> Pick Event Banner
              </Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {eventBanners.map((banner) => {
                  const active = editForm.image_url === banner.url;
                  return (
                    <button
                      type="button"
                      key={banner.url}
                      onClick={() => setEditForm(prev => ({ ...prev, image_url: banner.url }))}
                      className={`rounded-lg overflow-hidden border transition text-left ${active ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-white/10 hover:border-white/30'}`}
                      title={banner.title}
                    >
                      <SmartImage src={banner.url} alt={banner.title} className="w-full aspect-[4/1.8] object-cover" />
                      <p className="px-2 py-1 text-[10px] text-slate-900/70 truncate bg-white/[0.04]">{banner.title}</p>
                    </button>
                  );
                })}
              </div>
              {editForm.image_url && (
                <button
                  type="button"
                  onClick={() => setEditForm(prev => ({ ...prev, image_url: '' }))}
                  className="mt-2 text-xs text-slate-900/50 hover:text-slate-700 underline"
                >
                  Clear image (use emoji only)
                </button>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Title Template *</Label>
              <Input
                value={editForm.title_template}
                onChange={(e) => setEditForm(prev => ({ ...prev, title_template: e.target.value }))}
                placeholder="Notification title"
                className="mt-1.5 bg-white border-slate-300 text-slate-900 placeholder:text-slate-900/30"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Message Template *</Label>
              <Textarea
                value={editForm.message_template}
                onChange={(e) => setEditForm(prev => ({ ...prev, message_template: e.target.value }))}
                placeholder="Notification message"
                className="mt-1.5 min-h-[150px] bg-white border-slate-300 text-slate-900 placeholder:text-slate-900/30"
              />
              <p className="text-xs text-slate-900/40 mt-1">
                Variables: {"{{code}}"}, {"{{agency_name}}"}, {"{{agency_code}}"}, {"{{display_name}}"}
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditDialog(false)}
                className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={saving || !editForm.title_template || !editForm.message_template}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="max-w-sm bg-white border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <MessageSquare className="w-5 h-5 text-purple-400" />
              Preview
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/20">
              <div className="flex items-start gap-3">
                {previewContent.image_url ? (
                  <SmartImage src={previewContent.image_url} alt="Notification preview" className="w-12 h-12 rounded-xl object-cover bg-white/10" />
                ) : (
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center text-white">
                    {previewContent.icon_emoji || <Bell className="w-5 h-5" />}
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-sm text-slate-900">{previewContent.title}</p>
                  <p className="text-xs text-slate-900/60 mt-1 whitespace-pre-wrap">
                    {previewContent.message}
                  </p>
                  <p className="text-xs text-slate-900/30 mt-2">Just now</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminNotificationTemplates;
