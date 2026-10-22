// Public forms accept live submissions; payment providers remain disconnected.
import { AppError } from './domain.js';
export const integrationStatus={mode:'live',zoho:'membership_read_only',stripe:'disabled',liveEnabled:true};

export async function createStripeCheckout(){throw new AppError('Live Stripe Checkout is disabled pending approval and reviewed implementation.',503);}
export async function receiveStripeWebhook(){throw new AppError('Stripe webhooks are disabled. Simulated payments never become real payments.',503);}
export async function lookupZohoBiginContact(){throw new AppError('Live Zoho Bigin access is disabled pending approval and field mapping.',503);}
