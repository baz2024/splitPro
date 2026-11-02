import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Both values are public by design (the anon/publishable key only allows what RLS permits).
// Never put the service_role key here.
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://lfmhkxsjyvqlswmnppad.supabase.co';
// Public anon key (role=anon), the same one the web app ships. EAS env can override it.
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbWhreHNqeXZxbHN3bW5wcGFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0Njk0ODIsImV4cCI6MjEwOTA0NTQ4Mn0.bUeKYZiQHftSXilZwpgrzv9ls5ClBTc34GisVXVowrA';

export const isSupabaseConfigured = '' !== SUPABASE_ANON_KEY;

// createClient throws on an empty key, so fall back to a placeholder and guard calls with
// isSupabaseConfigured instead of crashing at import time.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || 'missing-anon-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Only refresh tokens while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if ('active' === state) {
    supabase.auth.startAutoRefresh().catch(() => undefined);
  } else {
    supabase.auth.stopAutoRefresh().catch(() => undefined);
  }
});
