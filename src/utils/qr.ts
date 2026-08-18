import qrcode from 'qrcode-terminal';
import chalk from 'chalk';

export function renderTerminalQR(url: string, title = 'Scan with Phone to Pay / Test'): void {
  console.log(chalk.cyan.bold(`\n📱 ${title}:`));
  qrcode.generate(url, { small: true }, (qr) => {
    console.log(qr);
  });
}