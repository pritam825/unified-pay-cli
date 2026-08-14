import Conf from 'conf';

export const configStore = new Conf({
  projectName: 'pay-cli',
  schema: {
    stripeApiKey: { type: 'string' },
    razorpayKeyId: { type: 'string' },
    razorpayKeySecret: { type: 'string' },
  },
});