import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const algoData = JSON.parse(readFileSync(join(__dirname, 'algo.json')));
const coopData = JSON.parse(readFileSync(join(__dirname, 'coop.json')));

export function priceAt(targetTimestamp) {
  const coopCandle = coopData.find(({timestamp: ts}) => ts > targetTimestamp);
  const algoCandle = algoData.find(({timestamp: ts}) => ts > targetTimestamp);

  const coop = (coopCandle.open + coopCandle.close) / 2;
  const coopTs = coopCandle.timestamp;
  const algo = (algoCandle.open + algoCandle.close) / 2;
  const algoTs = algoCandle.timestamp;

  return { coop, coopTs, algo, algoTs };
}
