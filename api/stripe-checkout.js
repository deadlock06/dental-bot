// Lazy-init: Stripe is initialised on first use so the module can be
// required before dotenv has run (e.g., in test scripts).
let _stripe = null;
function getStripe() {
  if (!_stripe) {
    const Stripe = require('stripe');
    _stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

const PLANS = {
  awareness: {
    amount: 8000,
    name: 'Awareness',
    description_en: 'AI Reception for solo clinics',
    description_ar: 'استقبال ذكي للعيادات الفردية'
  },
  system: {
    amount: 13300,
    name: 'System',
    description_en: 'Full AI + Growth + Dashboard',
    description_ar: 'النظام الكامل + النمو + لوحة التحكم'
  }
};

async function createCheckoutSession(clinicName, ownerEmail, plan = 'system', lang = 'en') {
  const planData = PLANS[plan] || PLANS.system;

  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Qudozen ${planData.name}`,
          description: planData[`description_${lang}`] || planData.description_en
        },
        unit_amount: planData.amount,
        recurring: { interval: 'month' }
      },
      quantity: 1
    }],
    phone_number_collection: { enabled: true },
    mode: 'subscription',
    success_url: `https://qudozen.com/onboarding?session_id={CHECKOUT_SESSION_ID}&clinic=${encodeURIComponent(clinicName)}&plan=${plan}`,
    cancel_url: `https://qudozen.com/?clinic=${encodeURIComponent(clinicName)}&status=cancelled`,
    customer_email: ownerEmail,
    metadata: { clinic_name: clinicName, plan, lang }
  });


  return { url: session.url, session_id: session.id };
}

async function createSetupIntent(clinicName) {
  const customer = await getStripe().customers.create({ name: clinicName });
  const setupIntent = await getStripe().setupIntents.create({
    customer: customer.id,
    usage: 'off_session'
  });
  return { client_secret: setupIntent.client_secret, customer_id: customer.id };
}

module.exports = { createCheckoutSession, createSetupIntent, PLANS };
