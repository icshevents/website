// Server-only preparation. These functions do not contact a provider.
import { AppError } from './domain.js';
export function prepareFestivalBiginMapping(registration){return {
 mode:'test',enabled:false,
 matching:{email:registration.personal.email,phone:registration.personal.phone,identityVerified:false,requiresVerifiedIdentifier:true,createDuplicateContacts:false},
 eventRegistration:{externalId:registration.id,eventKey:'harrow-food-festival-2026',reference:registration.reference,activities:registration.involvement},
 contactMutation:{membershipStatus:false,paymentStatus:false},
 futureCommunications:{optedIn:registration.acknowledgements.marketing,history:registration.consentHistory}
};}
export function prepareFestivalDonationIntent(registration){if(registration.donation?.type!=='money')throw new AppError('This registration has no monetary donation pledge.');return {enabled:false,mode:'test',registrationId:registration.id,idempotencyKey:'festival-donation-'+registration.id,currency:'gbp',amount:registration.donation.amountPence,source:'server_validated_stored_pledge',status:'pledged_not_paid'};}
export async function syncFestivalWithBigin(){throw new AppError('Live festival CRM writes are disabled pending approval and reviewed contact matching.',503);}
export async function createFestivalStripeCheckout(){throw new AppError('Live donation Checkout is disabled pending approval and signed-webhook implementation.',503);}
export async function sendFestivalEmail(){throw new AppError('Live festival email delivery and campaigns are disabled. Use the email preview.',503);}
