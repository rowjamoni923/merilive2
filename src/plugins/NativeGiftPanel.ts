import { registerPlugin } from '@capacitor/core';

export interface GiftItem {
  id: string;
  name: string;
  coins: number;
  icon_url?: string | null;
  category: string;
}

export interface CategoryItem {
  id: string;
  name: string;
}

export interface NativeGiftPanelPlugin {
  open(options: { 
    gifts: GiftItem[]; 
    categories: CategoryItem[];
    balance: number;
  }): Promise<void>;
  updateBalance(options: { balance: number }): Promise<void>;
  close(): Promise<void>;
  
  addListener(eventName: 'gift:select', listenerFunc: (data: { id: string }) => void): Promise<any>;
  addListener(eventName: 'gift:send', listenerFunc: (data: { id: string, count: number }) => void): Promise<any>;
  addListener(eventName: 'gift:recharge', listenerFunc: () => void): Promise<any>;
}

const NativeGiftPanel = registerPlugin<NativeGiftPanelPlugin>('NativeGiftPanel');

export default NativeGiftPanel;
