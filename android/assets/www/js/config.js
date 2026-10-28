/* Runtime configuration for GymFlow.
   ------------------------------------------------------------------
   apiBase : base URL of the GymFlow backend (the YouPI PG merchant
             bridge in backend/server.mjs). Leave it empty ("") when the
             app is served by that backend (same origin).
             For the APK you should point it at your deployed backend,
             e.g. 'https://gymflow.mydomain.com'.
             Users can also override it inside Settings -> Cloud server,
             which is stored on the device.
   plans   : what the Pro unlock costs. Keep these in sync with
             backend/config/plans.json.
   ------------------------------------------------------------------ */
window.GYMFLOW_CONFIG = {
  appName: 'GymFlow',
  version: '1.0.0',
  apiBase: '',
  currency: 'INR',
  plans: [
    {
      id: 'pro_lifetime',
      label: 'Pro Lifetime',
      amount: '149.00',
      badge: 'Best value',
      period: 'one-time',
      features: ['No ads, ever', 'All 4 training programs', 'Progress charts + PR tracking', 'Cloud backup', 'Support a solo dev']
    },
    {
      id: 'pro_year',
      label: 'Pro — 1 Year',
      amount: '79.00',
      badge: '',
      period: 'per year',
      features: ['No ads, ever', 'All training programs', 'Progress charts + PR tracking', 'Cloud backup']
    }
  ],
  supportEmail: 'support@example.com',
  // Set to true only for demos: unlocks the in-app "simulate payment" button.
  demoMode: true
};
