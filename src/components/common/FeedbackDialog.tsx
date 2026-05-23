/**
 * Pkg255 — Feedback dialog (shake-to-feedback target).
 *
 * Opens on shake (Android) or programmatically via openFeedbackDialog().
 * Captures: message, category, route, platform, app version, UA.
 */
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import {
  subscribeFeedbackOpen,
  useShakeToFeedback,
  type FeedbackTrigger,
} from '@/hooks/useShakeToFeedback';

type Category = 'general' | 'bug' | 'idea' | 'complaint';

export default function FeedbackDialog() {
  // Start native shake listener (no-op on web)
  useShakeToFeedback();

  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<FeedbackTrigger>('menu');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState<Category>('general');
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();

  useEffect(() => {
    return subscribeFeedbackOpen((t) => {
      setTrigger(t);
      setMessage('');
      setCategory(t === 'shake' ? 'bug' : 'general');
      setOpen(true);
    });
  }, []);

  const onSubmit = async () => {
    const msg = message.trim();
    if (msg.length < 3) {
      toast.error('Please write a few more words');
      return;
    }
    setSubmitting(true);
    try {
      let appVersion: string | undefined;
      try {
        if (Capacitor.getPlatform() !== 'web') {
          const info = await CapApp.getInfo();
          appVersion = `${info.version} (${info.build})`;
        }
      } catch {}

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        toast.error('Please sign in to send feedback');
        setSubmitting(false);
        return;
      }

      const { error } = await (supabase as any).from('user_feedback').insert({
        user_id: userId,
        message: msg,
        category,
        app_version: appVersion ?? null,
        platform: Capacitor.getPlatform(),
        route: location.pathname + location.search,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        device_info: {
          trigger,
          lang: typeof navigator !== 'undefined' ? navigator.language : null,
          screen:
            typeof window !== 'undefined'
              ? { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }
              : null,
        },
      });
      if (error) throw error;
      toast.success('Thanks for the feedback!');
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not send feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {trigger === 'shake' ? 'Found a problem?' : 'Send feedback'}
          </DialogTitle>
          <DialogDescription>
            {trigger === 'shake'
              ? 'We detected a shake. Tell us what just went wrong — your message goes straight to the team.'
              : 'Bugs, ideas, complaints — anything helps. We read every message.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="fb-cat">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger id="fb-cat"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="bug">Bug / problem</SelectItem>
                <SelectItem value="idea">Idea / suggestion</SelectItem>
                <SelectItem value="complaint">Complaint</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fb-msg">Your feedback</Label>
            <Textarea
              id="fb-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what happened or what you'd like to see…"
              rows={5}
              maxLength={4000}
              autoFocus
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/4000
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || message.trim().length < 3}>
            {submitting ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
