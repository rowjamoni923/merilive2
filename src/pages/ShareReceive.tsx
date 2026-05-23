import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sharing, type SharedPayload } from '@/plugins/Sharing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, MessageSquare, Megaphone, Send } from 'lucide-react';

/**
 * Pkg214 — Share Target landing.
 * Opened automatically when another app shares text/image/video into MeriLive.
 */
export default function ShareReceive() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<SharedPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Sharing.consumeIncoming().then((p) => {
      if (cancelled) return;
      setPayload(p);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const hasImages = (payload?.uris?.length ?? 0) > 0 && payload?.mime?.startsWith('image');
  const hasVideo = (payload?.uris?.length ?? 0) > 0 && payload?.mime?.startsWith('video');
  const text = payload?.text || payload?.subject || '';

  const goChat = () => {
    sessionStorage.setItem('pkg214_shared_payload', JSON.stringify(payload || {}));
    navigate('/chat');
  };
  const goFeed = () => {
    sessionStorage.setItem('pkg214_shared_payload', JSON.stringify(payload || {}));
    navigate('/feed?compose=1');
  };

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
            {(hasImages || hasVideo) && (
              <div className="flex flex-wrap gap-2">
                {payload.uris?.map((u, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-xs text-muted-foreground"
                  >
                    <Send className="w-3 h-3" />
                    {hasVideo ? 'Video' : 'Image'} attachment
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="space-y-3">
            <Button className="w-full justify-start" size="lg" onClick={goChat}>
              <MessageSquare className="w-5 h-5 mr-3" />
              Send in chat
            </Button>
            <Button
              className="w-full justify-start"
              size="lg"
              variant="secondary"
              onClick={goFeed}
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
