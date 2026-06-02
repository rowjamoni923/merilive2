import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

// Fallback local images in case DB is empty
import stepWelcome from '@/assets/onboarding/step-welcome.webp';
import stepLivestream from '@/assets/onboarding/step-livestream.webp';
import stepParty from '@/assets/onboarding/step-party.webp';
import stepVideocall from '@/assets/onboarding/step-videocall.webp';
import stepBonus from '@/assets/onboarding/step-bonus.webp';

interface OnboardingStep {
  image: string;
  title: string;
  description: string;
  gradient: string;
}

const FALLBACK_STEPS: OnboardingStep[] = [
  { image: stepWelcome, title: 'Welcome to meriLIVE!', description: 'Your new social entertainment hub. Meet amazing people, watch live streams, and have fun!', gradient: 'from-primary to-accent' },
  { image: stepLivestream, title: 'Watch Live Streams', description: 'Discover talented hosts going live 24/7. Send gifts, chat, and make their day!', gradient: 'from-pink-500 to-rose-500' },
  { image: stepParty, title: 'Join Party Rooms', description: 'Audio & video party rooms where you can hang out, sing karaoke, and play games!', gradient: 'from-blue-500 to-cyan-500' },
  { image: stepVideocall, title: 'Private Video Calls', description: 'Connect 1-on-1 with hosts through private video calls. It\'s fun and personal!', gradient: 'from-red-500 to-orange-500' },
  { image: stepBonus, title: 'You Got Free Diamonds!', description: 'We\'ve given you welcome bonus Diamonds to get started. Explore and enjoy!', gradient: 'from-amber-500 to-yellow-500' },
];

const WelcomeOnboarding = () => {
  const [show, setShow] = useState(false);
  const [steps, setSteps] = useState<OnboardingStep[]>(FALLBACK_STEPS);
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('meri_onboarding_seen');
    if (hasSeenOnboarding) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    supabase
      .from('onboarding_slides')
      .select('image_url, title, description, gradient')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data && data.length > 0) {
          setSteps(
            data
              .filter((s) => s.image_url && s.title)
              .map((s) => ({
                image: s.image_url as string,
                title: s.title as string,
                description: s.description || '',
                gradient: s.gradient || 'from-primary to-accent',
              })),
          );
        }
        // Fallback steps remain if fetch failed or returned empty.
        timer = setTimeout(() => {
          if (!cancelled) setShow(true);
        }, 1500);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleComplete = () => {
    localStorage.setItem('meri_onboarding_seen', 'true');
    setShow(false);
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  if (!show) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 16 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-sm bg-card rounded-3xl overflow-hidden border border-border"
          style={{ boxShadow: '0 30px 60px -20px rgba(15,23,42,0.35), 0 12px 24px -12px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)' }}
        >
          {/* Skip button */}
          {!isLast && (
            <button
              onClick={handleSkip}
              aria-label="Skip onboarding"
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/95 hover:bg-background text-foreground transition-all hover:-translate-y-0.5"
              style={{ boxShadow: '0 6px 14px -4px rgba(15,23,42,0.25), inset 0 1px 0 rgba(255,255,255,0.8)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Step content */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              initial={{ x: direction * 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -direction * 100, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              {/* Real illustration image */}
              <div className="w-full aspect-square overflow-hidden relative">
                <img
                  src={step.image}
                  alt={step.title}
                  className="w-full h-full object-cover"
                  draggable={false}/>
                {/* subtle bottom fade for text legibility */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
              </div>

              {/* Text content */}
              <div className="px-6 pt-5 pb-2">
                <h2 className="text-xl font-bold text-center text-foreground mb-2 tracking-tight">
                  {step.title}
                </h2>
                <p className="text-sm text-center text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 py-4">
            {steps.map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  width: i === currentStep ? 26 : 8,
                  backgroundColor: i === currentStep ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
                }}
                className="h-2 rounded-full"
                transition={{ duration: 0.3 }}
                style={i === currentStep ? { boxShadow: '0 2px 8px -2px hsl(var(--primary) / 0.55)' } : undefined}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between p-4 pt-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            <Button
              onClick={handleNext}
              size="sm"
              className={`bg-gradient-to-r ${step.gradient} text-white border-0 px-6 font-semibold rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]`}
              style={{ boxShadow: '0 10px 24px -8px rgba(15,23,42,0.35), inset 0 1px 0 rgba(255,255,255,0.25)' }}
            >
              {isLast ? (
                <>🚀 Let's Go!</>
              ) : (
                <>
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default WelcomeOnboarding;
