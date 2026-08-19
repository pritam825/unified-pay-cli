import ora from 'ora';
import { PaymentProvider } from '../types/interface/PaymentProvider.js';

export async function pollPaymentStatus(
  client: PaymentProvider,
  linkId: string,
  timeoutSeconds: number = 300,
  intervalSeconds: number = 5
): Promise<{ status: string; paid: boolean }> {
  const spinner = ora('Waiting for customer payment...').start();
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < timeoutSeconds) {
    try {
      const txns = await client.listTransactions(10);
      const match = txns.find((t) => t.id === linkId || t.status === 'captured');

      if (match && ['captured', 'paid', 'succeeded'].includes(match.status.toLowerCase())) {
        spinner.succeed(`Payment received! Amount: ${(match.amount / 100).toFixed(2)} ${match.currency}`);
        return { status: match.status, paid: true };
      }
    } catch {
      // Ignore intermediate poll network glitches
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }

  spinner.warn('Payment polling timed out (customer did not complete in time).');
  return { status: 'timed_out', paid: false };
}