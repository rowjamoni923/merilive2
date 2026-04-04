import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Gift, Sparkles, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useParcels, UserParcel } from '@/hooks/useParcels';
import ParcelCard from '@/components/parcels/ParcelCard';
import ParcelDetailSheet from '@/components/parcels/ParcelDetailSheet';

export default function Parcels() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string>();
  const [selectedParcel, setSelectedParcel] = useState<UserParcel | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);

  const { parcels, isLoading, claimParcel, isClaiming } = useParcels(userId);

  const standardParcels = parcels.filter(p => p.parcel_templates.parcel_type === 'standard');
  const specialParcels = parcels.filter(p => p.parcel_templates.parcel_type !== 'standard');

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gradient-to-b from-[#1a0e2e] to-background border-b border-white/5">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)} className="text-white/70 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-bold text-foreground">My Parcels</h1>
          </div>
          <span className="ml-auto text-xs text-muted-foreground bg-white/5 px-2 py-1 rounded-full">
            {parcels.length} available
          </span>
        </div>

        {/* Floating particles decoration */}
        <div className="relative h-1 overflow-hidden">
          <motion.div
            animate={{ x: ['-100%', '100%'] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-60">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
            <Package className="w-8 h-8 text-purple-400" />
          </motion.div>
        </div>
      ) : parcels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 gap-3 px-6">
          <Gift className="w-16 h-16 text-white/10" />
          <p className="text-muted-foreground text-center">No parcels available right now. Keep using the app to earn rewards!</p>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-6">
          {/* Special Parcels (Mega, Surprise, Lucky Spin) */}
          {specialParcels.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Special Parcels</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {specialParcels.map((parcel, i) => (
                  <ParcelCard key={parcel.id} parcel={parcel} index={i} onClick={setSelectedParcel} />
                ))}
              </div>
            </div>
          )}

          {/* Standard Parcels */}
          {standardParcels.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Gift className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-purple-400 uppercase tracking-wider">Reward Parcels</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {standardParcels.map((parcel, i) => (
                  <ParcelCard key={parcel.id} parcel={parcel} index={i} onClick={setSelectedParcel} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Sheet */}
      <ParcelDetailSheet
        parcel={selectedParcel}
        isOpen={!!selectedParcel}
        onClose={() => setSelectedParcel(null)}
        onClaim={claimParcel}
        isClaiming={isClaiming}
      />
    </div>
  );
}
