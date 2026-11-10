/** Stripe uses ch_ for card charges and py_ for some non-card charges. */
export const validStripeChargeId=(value:unknown):value is string=>typeof value==='string'&&/^(?:ch|py)_[A-Za-z0-9]+$/.test(value);
