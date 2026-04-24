/**
 * ADMIN-ONLY Supabase Client
 * 
 * This client is COMPLETELY isolated from the user app's Supabase client:
 * - Uses a separate localStorage key (`merilive-admin-auth`)
 * - Does NOT persist auth in the same place as the user app
 * - Admin authentication is custom (admin_authenticate RPC), NOT via auth.users
 * 
 * The user app login/logout will NEVER affect admin panel session and vice-versa.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ayjdlvuurscxucatbbah.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc";

// Custom storage adapter scoped to admin panel — uses a different key prefix
// so it never collides with the regular user-app supabase client.
const ADMIN_STORAGE_PREFIX = 'merilive-admin-sb-';

const adminStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ADMIN_STORAGE_PREFIX + key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADMIN_STORAGE_PREFIX + key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ADMIN_STORAGE_PREFIX + key);
  },
};

/**
 * adminSupabase: dedicated Supabase client for admin panel.
 * Use this for ALL admin panel database queries that require RPC access.
 * Does NOT share session with the user app.
 */
export const adminSupabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: adminStorage,
    storageKey: 'admin-session',
    persistSession: false, // We manage admin session manually via adminSession.ts
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
