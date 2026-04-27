// Stub — real implementation lands in the billing commit.
export const handleStripeWebhook = async () => {
  const err = new Error('Stripe webhook handler is not yet implemented in this build');
  err.status = 501;
  throw err;
};
