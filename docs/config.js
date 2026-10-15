/**
 * Sonar Math MVP: Cloud & Deployment Configuration
 * 
 * To connect your centralized cloud database:
 * 1. Create a free project at https://supabase.com
 * 2. Run the migration SQL in supabase/migrations/20261015000001_coppa_vault_and_telemetry.sql
 * 3. Copy your Project URL and anon public key from Project Settings -> API
 * 4. Paste them below.
 */

window.SONAR_CONFIG = {
  // Remote Supabase Cloud Database (Leave empty for local-only / IndexedDB mode)
  supabaseUrl: '',      // e.g. 'https://xxxxxxxxxxxxxxxxxxxx.supabase.co'
  supabaseAnonKey: '',  // e.g. 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

  // Access Control Passcode (Protects test from unauthorized public access)
  betaPasscode: 'math',

  // Administrator Portal Passcode
  adminPasscode: 'l33t',

  // Enable automatic offline cache & retry
  enableOfflineCache: true,
};
