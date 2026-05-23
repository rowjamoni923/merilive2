import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sharing, type SharedPayload } from '@/plugins/Sharing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, MessageSquare, Megaphone, Loader2, FileImage, FileVideo } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UploadedMedia {
  url: string;
  mime: string;
  name: string;
}

/**
 * Pkg214 + 214b — Share Target landing.
 * Auto-uploads shared images/videos to chat-media bucket then hands URLs
 * to /chat or /feed via sessionStorage.
 */
export default function ShareReceive() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedMedia[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await Sharing.consumeIncoming();
      if (cancelled) return;
      setPayload(p);
      setLoading(false);

      if (p?.uris?.length) {
        setUploading(true);
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            toast.error('Please sign in first');
            return;
          }
          const results: UploadedMedia[] = [];
          for (const uri of p.uris) {
            const blobInfo = await Sharing.readUriAsBlob(uri);
            if (!blobInfo) continue;
            const ext = blobInfo.name.split('.').pop() || 'bin';
            const path = `${user.id}/share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error } = await supabase.storage
              .from('chat-media')
              .upload(path, blobInfo.blob, { contentType: blobInfo.mime, upsert: false });
            if (error) {
              console.error('[Pkg214b] upload failed', error);
              continue;
            }
            const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
            results.push({ url: urlData.publicUrl, mime: blobInfo.mime, name: blobInfo.name });
          }
          if (!cancelled) setUploaded(results);
          if (results.length === 0 && p.uris.length > 0) {
            toast.error('Upload failed');
          }
        } finally {
          if (!cancelled) setUploading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const text = payload?.text || payload?.subject || '';
  const hasAnyMedia = uploaded.length > 0;

  const stash = () => {
    sessionStorage.setItem('pkg214_shared_payload', JSON.stringify({
      text,
      media: uploaded,
      mime: payload?.mime,
    }));
  };

  const goChat = () => { stash(); navigate('/chat'); };
  const goFeed = () => { stash(); navigate('/feed?compose=1'); };

  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      <header className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">Share to MeriLive</h1>
      </header>

      {loading ? (
        <p className="text-muted-foreground">Loading shared content…</p>
      ) : !payload ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">No shared content found.</p>
          <Button className="mt-4" onClick={() => navigate('/')}>Go Home</Button>
        </Card>
      ) : (
        <>
          <Card className="p-4 mb-6 space-y-3">
            {text && (
              <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
            )}

            {payload.uris && payload.uris.length > 0 && (
              <div className="space-y-2">
                {uploading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading {payload.uris.length} file{payload.uris.length > 1 ? 's' : ''}…
                  </div>
                ) : hasAnyMedia ? (
                  <div className="grid grid-cols-3 gap-2">
                    {uploaded.map((m, i) => (
                      <div key={i} className="aspect-square rounded-md overflow-hidden bg-muted relative">
                        {m.mime.startsWith('image') ? (
                          <img src={m.url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                            {m.mime.startsWith('video') ? <FileVideo className="w-6 h-6" /> : <FileImage className="w-6 h-6" />}
                            <span className="text-[10px] mt-1 truncate w-full text-center px-1">{m.name}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-destructive">No files uploaded.</p>
                )}
              </div>
            )}
          </Card>

          <div className="space-y-3">
            <Button
              className="w-full justify-start"
              size="lg"
              onClick={goChat}
              disabled={uploading}
            >
              <MessageSquare className="w-5 h-5 mr-3" />
              Send in chat
            </Button>
            <Button
              className="w-full justify-start"
              size="lg"
              variant="secondary"
              onClick={goFeed}
              disabled={uploading}
            >
              <Megaphone className="w-5 h-5 mr-3" />
              Post to feed
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
