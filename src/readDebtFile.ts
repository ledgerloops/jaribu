import { createInterface } from 'readline';
import { createReadStream } from 'fs';
const DEBTCSV = `./debt.csv`;

export type DebtGraph = { [from: string]: { [to: string]: number } };
export async function getDebtGraph(): Promise<DebtGraph> {
  const ret: DebtGraph = {};
  const lineReader = createInterface({
    input: createReadStream(DEBTCSV),
  });

  lineReader.on('line', function (line) {
    const [from, to, amountStr] = line.split(' ');
    if (typeof ret[from] === 'undefined') {
      ret[from] = {};
    }
    if (typeof ret[from][to] === 'undefined') {
      ret[from][to] = 0;
    }
    ret[from][to] += parseInt(amountStr);
  });

  return new Promise((resolve) => {
    lineReader.on('close', () => {
      resolve(ret);
    });
  });
}
