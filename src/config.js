window.APP_CONFIG = {
  sharedState: {
    // Leave enabled as false to keep data private to each browser.
    // Turn this to true after you add your own Supabase details below.
    enabled: false,

    // Shared state uses a single Supabase row so everyone sees the same pairings.
    provider: 'supabase',
    supabaseUrl: '',
    supabaseAnonKey: '',
    table: 'buddy_programme_states',
    rowId: 'cloud-ai-buddy-programme',

    // How often the page checks for updates made by other people.
    pollIntervalMs: 15000,
  },
};
