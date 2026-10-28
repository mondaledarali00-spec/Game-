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
  version: '1.1.0',
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
  /* ---- Direct UPI collection ----------------------------------------
     Payments go straight to this UPI ID (your own bank account, 0% fee).
     NOTE: a UPI ID is public information (it is printed on every QR), but it
     is baked into the APK — change it here and rebuild if it ever changes.
     You can also override it at runtime from your server (/api/upi/config). */
  merchant: {
    upiId: '8089274532@axl',
    payeeName: 'GymFlow',
    merchantCode: '7994'
  },
  supportEmail: 'support@example.com',
  // Set to true only for demos: unlocks the in-app "simulate payment" button.
  demoMode: true
};
