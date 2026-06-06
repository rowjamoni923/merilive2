import { useState, useEffect, useCallback } from 'react';
import NativeGiftPanel, { GiftItem } from '@/plugins/NativeGiftPanel';
import { getNativeFlags } from '@/utils/nativeFlags';

export const useNativeGiftPanel = (
  isOpen: boolean,
  onClose: () => void,
  onSend: (giftId: string, count: number) => void,
  onRecharge: () => void,
  gifts: GiftItem[],
  balance: number
) => {
  const flags = getNativeFlags();
  const giftPanelNative = flags.giftPanelNative;

  useEffect(() => {
    if (!giftPanelNative || !isOpen) {
      if (!isOpen) NativeGiftPanel.close().catch(() => {});
      return;
    }

    const categories = [
      { id: 'all', name: 'All' },
      { id: 'lucky', name: 'Lucky' },
      { id: 'vip', name: 'VIP' }
    ];

    const setup = async () => {
      try {
        await NativeGiftPanel.open({
          gifts,
          categories,
          balance
        });

        const selectSub = await NativeGiftPanel.addListener('gift:select', (data) => {
          console.log('Native gift selected:', data.id);
        });

        const sendSub = await NativeGiftPanel.addListener('gift:send', (data) => {
          onSend(data.id, data.count);
        });

        const rechargeSub = await NativeGiftPanel.addListener('gift:recharge', () => {
          onRecharge();
        });

        return () => {
          selectSub.remove();
          sendSub.remove();
          rechargeSub.remove();
          NativeGiftPanel.close();
        };
      } catch (err) {
        console.error('Failed to open native gift panel:', err);
        onClose(); // Fallback to web
      }
    };

    const cleanupPromise = setup();
    return () => {
      cleanupPromise.then(cleanup => cleanup?.());
    };
  }, [isOpen, giftPanelNative, gifts, balance, onSend, onRecharge, onClose]);

  useEffect(() => {
    if (giftPanelNative && isOpen) {
      NativeGiftPanel.updateBalance({ balance }).catch(() => {});
    }
  }, [balance, giftPanelNative, isOpen]);

  return { isNative: giftPanelNative };
};
