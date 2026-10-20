// Server-only boundaries. Enabling env flags cannot turn on live services in this release.
import { AppError, verifyMembership } from './domain.js';
export const integrationStatus={mode:'test',zoho:'disconnected',stripe:'simulated',liveEnabled:false};
export async function membershipLookup(id){return verifyMembership(id);}
export async function createStripeCheckout(){throw new AppError('Live Stripe Checkout is disabled pending approval and reviewed implementation.',503);}
export async function receiveStripeWebhook(){throw new AppError('Stripe webhooks are disabled. Simulated payments never become real payments.',503);}
export async function lookupZohoBiginContact(){throw new AppError('Live Zoho Bigin access is disabled pending approval and field mapping.',503);}
