// 'free' = geen (actief) abonnement, 'pro' = betaald of in proefperiode
var TIERS = {
  free: { label: 'Geen abonnement', maxSearches: 0,  intervalSec: 900, platforms: ['marktplaats', 'vinted', 'ebay'] },
  pro:  { label: 'Pro',             maxSearches: 25, intervalSec: 30,  platforms: ['marktplaats', 'vinted', 'ebay'] }
};

var PLANS = {
  week:  { label: 'Per week',  price: '€4,99',  envKey: 'STRIPE_PRICE_WEEKLY' },
  month: { label: 'Per maand', price: '€14,99', envKey: 'STRIPE_PRICE_MONTHLY' }
};

var TRIAL_DAYS = 2;
var ALL_PLATFORMS = ['marktplaats', 'vinted', 'ebay'];

module.exports = { TIERS: TIERS, PLANS: PLANS, TRIAL_DAYS: TRIAL_DAYS, ALL_PLATFORMS: ALL_PLATFORMS };
