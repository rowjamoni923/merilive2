// Chat/Messaging Feature Module
// Direct messages, chat gifts, media uploads

// Pages
export { default as ChatPage } from '@/pages/Chat';

// Components
// ChatGiftPanel removed 2026-07-02 — use canonical GiftPanel from '@/features/shared/gifting'
export { EmojiPicker } from '@/components/chat/EmojiPicker';
export { default as GiftEmojiAnimation } from '@/components/chat/GiftEmojiAnimation';
export { MediaUploader } from '@/components/chat/MediaUploader';

// Hooks
export { useDebouncedSearch } from '@/hooks/useDebouncedSearch';

