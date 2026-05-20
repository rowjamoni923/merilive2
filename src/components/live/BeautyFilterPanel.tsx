/**
 * BeautyFilterPanel v7.0 — MediaPipe AI Beauty Studio (Beauty Only)
 * 
 * ✅ All platforms: Google MediaPipe Face Landmarker (478 3D landmarks)
 * ✅ 100% Free — No license key required — Apache 2.0
 * ✅ Professional skin smoothing, whitening, face reshape, lip color
 * ✅ Stickers moved to separate StickerPanel component
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Sun, Droplets, Heart, Contrast, Palette, Flame, Eye, Moon, Zap, CircleDot, Flower2, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setBeautyParams, setBeautyEnabled, mapUIToParams, isBeautyEnabled } from '@/services/mediapipeBeautyProcessor';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

const isNativeAndroid = isNativeAndroidApp();

export interface BeautySettings {
  // Skin
  smoothness: number;
  whitening: number;
  redness: number;
  sharpness: number;
  // Effects
  glow: number;
  warmth: number;
  eyeBright: number;
  skinTone: number;
  // Face Reshape
  faceSlim: number;
  chinSlim: number;
  eyeEnlarge: number;
  noseNarrow: number;
  lipColor: number;
}

export const DEFAULT_BEAUTY: BeautySettings = {
  smoothness: 0, whitening: 0, redness: 0, sharpness: 0,
  glow: 0, warmth: 0, eyeBright: 0, skinTone: 50,
  faceSlim: 0, chinSlim: 0, eyeEnlarge: 0, noseNarrow: 0, lipColor: 0,
};

interface BeautyPreset {
  id: string;
  label: string;
  icon: React.ReactNode;
  settings: BeautySettings;
}

const PRESETS: BeautyPreset[] = [
  {
    id: 'natural', label: 'Natural', icon: <Sparkles className="w-4 h-4" />,
    settings: { smoothness: 35, whitening: 20, redness: 10, sharpness: 15, glow: 10, warmth: 10, eyeBright: 15, skinTone: 55, faceSlim: 15, chinSlim: 10, eyeEnlarge: 10, noseNarrow: 5, lipColor: 10 },
  },
  {
    id: 'fair', label: 'Fair Skin', icon: <Sun className="w-4 h-4" />,
    settings: { smoothness: 50, whitening: 65, redness: 0, sharpness: 10, glow: 20, warmth: 0, eyeBright: 25, skinTone: 40, faceSlim: 20, chinSlim: 15, eyeEnlarge: 15, noseNarrow: 10, lipColor: 5 },
  },
  {
    id: 'glow', label: 'Glow', icon: <Droplets className="w-4 h-4" />,
    settings: { smoothness: 40, whitening: 30, redness: 15, sharpness: 20, glow: 55, warmth: 15, eyeBright: 20, skinTone: 55, faceSlim: 10, chinSlim: 5, eyeEnlarge: 20, noseNarrow: 5, lipColor: 15 },
  },
  {
    id: 'lovely', label: 'Lovely', icon: <Heart className="w-4 h-4" />,
    settings: { smoothness: 60, whitening: 45, redness: 30, sharpness: 5, glow: 30, warmth: 20, eyeBright: 30, skinTone: 60, faceSlim: 25, chinSlim: 20, eyeEnlarge: 25, noseNarrow: 15, lipColor: 30 },
  },
  {
    id: 'glamour', label: 'Glamour', icon: <Star className="w-4 h-4" />,
    settings: { smoothness: 55, whitening: 40, redness: 20, sharpness: 30, glow: 40, warmth: 10, eyeBright: 35, skinTone: 50, faceSlim: 30, chinSlim: 25, eyeEnlarge: 30, noseNarrow: 20, lipColor: 25 },
  },
  {
    id: 'warm', label: 'Warm', icon: <Flame className="w-4 h-4" />,
    settings: { smoothness: 30, whitening: 10, redness: 25, sharpness: 15, glow: 15, warmth: 55, eyeBright: 10, skinTone: 70, faceSlim: 10, chinSlim: 5, eyeEnlarge: 10, noseNarrow: 5, lipColor: 20 },
  },
  {
    id: 'cool', label: 'Cool', icon: <Moon className="w-4 h-4" />,
    settings: { smoothness: 35, whitening: 40, redness: 0, sharpness: 25, glow: 10, warmth: 0, eyeBright: 20, skinTone: 30, faceSlim: 15, chinSlim: 10, eyeEnlarge: 15, noseNarrow: 10, lipColor: 5 },
  },
  {
    id: 'hd', label: 'HD Sharp', icon: <Contrast className="w-4 h-4" />,
    settings: { smoothness: 20, whitening: 15, redness: 5, sharpness: 60, glow: 5, warmth: 5, eyeBright: 15, skinTone: 50, faceSlim: 5, chinSlim: 0, eyeEnlarge: 5, noseNarrow: 0, lipColor: 0 },
  },
];

type BeautyTab = 'skin' | 'reshape' | 'effects';

interface SliderControlProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon: React.ReactNode;
  color?: string;
}

function SliderControl({ label, value, onChange, icon, color = 'from-pink-500 to-purple-500' }: SliderControlProps) {
  return (
    <div className="flex items-center gap-3 px-4">
      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-white/60">{label}</span>
          <span className="text-xs text-white/65 tabular-nums">{value}%</span>
        </div>
        <div className="relative w-full h-2 bg-white/10 rounded-full">
          <div
            className={`absolute top-0 left-0 h-full rounded-full bg-gradient-to-r ${color}`}
            style={{ width: `${value}%` }}
          />
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg border-2 border-white/50 pointer-events-none"
            style={{ left: `calc(${value}% - 8px)` }}
          />
        </div>
      </div>
    </div>
  );
}

interface BeautyFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BeautySettings;
  enabled: boolean;
  onSettingsChange: (settings: BeautySettings) => void;
  onEnabledChange: (enabled: boolean) => void;
}

export function BeautyFilterPanel({
  isOpen,
  onClose,
  settings,
  enabled,
  onSettingsChange,
  onEnabledChange,
}: BeautyFilterPanelProps) {
  const [activePreset, setActivePreset] = useState<string | null>('natural');
  const [activeTab, setActiveTab] = useState<BeautyTab>('skin');

  const applyPreset = (preset: BeautyPreset) => {
    setActivePreset(preset.id);
    onSettingsChange(preset.settings);
    onEnabledChange(true);
    setBeautyEnabled(true);
    setBeautyParams(mapUIToParams(preset.settings));
  };

  const resetAll = () => {
    setActivePreset(null);
    onSettingsChange(DEFAULT_BEAUTY);
    onEnabledChange(false);
    setBeautyEnabled(false);
  };

  const updateSetting = (key: keyof BeautySettings, value: number) => {
    setActivePreset(null);
    const newSettings = { ...settings, [key]: value };
    onSettingsChange(newSettings);
    if (!enabled && value > 0) onEnabledChange(true);
    setBeautyEnabled(true);
    setBeautyParams(mapUIToParams(newSettings));
  };

  const tabs: { key: BeautyTab; label: string; icon: React.ReactNode }[] = [
    { key: 'skin', label: 'Skin', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { key: 'reshape', label: 'Reshape', icon: <CircleDot className="w-3.5 h-3.5" /> },
    { key: 'effects', label: 'Effects', icon: <Zap className="w-3.5 h-3.5" /> },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55]"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="fixed bottom-0 left-0 right-0 z-[60] bg-black/95 backdrop-blur-xl rounded-t-3xl pb-safe max-h-[80vh] overflow-hidden"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-400" />
                <span className="text-white font-semibold text-base">Beauty Studio</span>
                {enabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-medium">ON</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={resetAll}
                  className="text-xs text-white/70 hover:text-white/80 transition-colors px-2 py-1"
                >
                  Reset
                </button>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white/70" />
                </button>
              </div>
            </div>

            {/* Presets Row — only show for beauty tabs */}
            {(
              <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
                <button
                  onClick={resetAll}
                  className={cn(
                    'shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                    !enabled ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70'
                  )}
                >
                  Off
                </button>
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                      activePreset === preset.id && enabled
                        ? 'bg-gradient-to-r from-pink-500/80 to-purple-500/80 text-white shadow-lg shadow-pink-500/20'
                        : 'bg-white/5 text-white/70 hover:bg-white/10'
                    )}
                  >
                    {preset.icon}
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Tab Switcher */}
            <div className="flex gap-1 mx-4 mb-3 p-1 rounded-xl bg-white/5">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all',
                    activeTab === tab.key
                      ? 'bg-gradient-to-r from-pink-500/70 to-purple-500/70 text-white shadow-sm'
                      : 'text-white/65 hover:text-white/60'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="overflow-y-auto max-h-[45vh] pb-6">
              <AnimatePresence mode="wait">
                {activeTab === 'skin' && (
                  <motion.div key="skin" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
                    <SliderControl label="Smoothness" value={settings.smoothness} onChange={(v) => updateSetting('smoothness', v)} icon={<Sparkles className="w-4 h-4" />} color="from-pink-400 to-rose-500" />
                    <SliderControl label="Whitening" value={settings.whitening} onChange={(v) => updateSetting('whitening', v)} icon={<Sun className="w-4 h-4" />} color="from-yellow-300 to-amber-400" />
                    <SliderControl label="Redness" value={settings.redness} onChange={(v) => updateSetting('redness', v)} icon={<Heart className="w-4 h-4" />} color="from-red-400 to-pink-500" />
                    <SliderControl label="Sharpness" value={settings.sharpness} onChange={(v) => updateSetting('sharpness', v)} icon={<Contrast className="w-4 h-4" />} color="from-blue-400 to-cyan-500" />
                    <SliderControl label="Skin Tone" value={settings.skinTone} onChange={(v) => updateSetting('skinTone', v)} icon={<Palette className="w-4 h-4" />} color="from-amber-300 to-orange-500" />
                  </motion.div>
                )}

                {activeTab === 'reshape' && (
                  <motion.div key="reshape" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
                    <SliderControl label="Face Slim" value={settings.faceSlim} onChange={(v) => updateSetting('faceSlim', v)} icon={<CircleDot className="w-4 h-4" />} color="from-violet-400 to-purple-500" />
                    <SliderControl label="Chin Slim" value={settings.chinSlim} onChange={(v) => updateSetting('chinSlim', v)} icon={<CircleDot className="w-4 h-4" />} color="from-fuchsia-400 to-pink-500" />
                    <SliderControl label="Eye Enlarge" value={settings.eyeEnlarge} onChange={(v) => updateSetting('eyeEnlarge', v)} icon={<Eye className="w-4 h-4" />} color="from-emerald-400 to-teal-500" />
                    <SliderControl label="Nose Narrow" value={settings.noseNarrow} onChange={(v) => updateSetting('noseNarrow', v)} icon={<CircleDot className="w-4 h-4" />} color="from-sky-400 to-blue-500" />
                    <SliderControl label="Lip Color" value={settings.lipColor} onChange={(v) => updateSetting('lipColor', v)} icon={<Flower2 className="w-4 h-4" />} color="from-rose-400 to-red-500" />
                    <div className="mx-4 mt-2 p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                      <p className="text-purple-300 text-[10px] text-center">✨ Face reshape powered by Google MediaPipe AI (Free)</p>
                    </div>
                  </motion.div>
                )}

                {activeTab === 'effects' && (
                  <motion.div key="effects" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-3">
                    <SliderControl label="Glow" value={settings.glow} onChange={(v) => updateSetting('glow', v)} icon={<Droplets className="w-4 h-4" />} color="from-purple-400 to-pink-400" />
                    <SliderControl label="Warmth" value={settings.warmth} onChange={(v) => updateSetting('warmth', v)} icon={<Flame className="w-4 h-4" />} color="from-orange-400 to-red-400" />
                    <SliderControl label="Eye Bright" value={settings.eyeBright} onChange={(v) => updateSetting('eyeBright', v)} icon={<Eye className="w-4 h-4" />} color="from-emerald-400 to-teal-500" />
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Generate CSS filter string from beauty settings.
 */
export function generateBeautyCSS(enabled: boolean, settings: BeautySettings): string {
  if (!enabled) return '';

  const filters: string[] = [];
  if (settings.smoothness > 0) filters.push(`blur(${settings.smoothness * 0.02}px)`);
  if (settings.whitening > 0) filters.push(`brightness(${1 + settings.whitening * 0.004})`);
  if (settings.sharpness > 0) filters.push(`contrast(${1 + settings.sharpness * 0.003})`);
  if (settings.glow > 0) filters.push(`brightness(${1 + settings.glow * 0.003})`);
  if (settings.warmth > 0) filters.push(`sepia(${settings.warmth * 0.003})`);

  const satBase = 1;
  const redBoost = settings.redness * 0.004;
  const toneShift = (settings.skinTone - 50) * 0.005;
  const finalSat = satBase + redBoost + toneShift;
  if (Math.abs(finalSat - 1) > 0.01) filters.push(`saturate(${finalSat})`);

  const hueShift = (settings.skinTone - 50) * 0.3;
  if (Math.abs(hueShift) > 0.5) filters.push(`hue-rotate(${hueShift}deg)`);

  return filters.length ? filters.join(' ') : '';
}
