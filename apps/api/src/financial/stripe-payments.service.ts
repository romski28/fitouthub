import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripePaymentsService {
  private readonly stripe: Stripe | null;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    this.stripe = secretKey
      ? new Stripe(secretKey)
      : null;
  }

  isConfigured() {
    return Boolean(this.stripe);
  }

  getWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET || '';
  }

  createCheckoutSession(params: Stripe.Checkout.SessionCreateParams) {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }
    return this.stripe.checkout.sessions.create(params);
  }

  constructWebhookEvent(payload: Buffer, signature: string) {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const webhookSecret = this.getWebhookSecret();
    if (!webhookSecret) {
      throw new Error('Stripe webhook secret is not configured');
    }

    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
