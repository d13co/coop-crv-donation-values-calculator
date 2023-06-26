import fetch from 'node-fetch';
import { writeFileSync } from 'fs';

async function getCandles(aid=796425061, start=1687239900, end=null, c='USD') {
  let url = `https://vestige.fi/api/candles?a=${aid}&b=15&s=${start}`;
  if (end)
    url += `&e=${end}`;
  if (c !== 'ALGO')
    url += `&c=${c}`;
  const resp = await fetch(url, {
      "credentials": "include",
      "headers": {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/114.0",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.5",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "Authorization": "1gTM2gTOwEjM"
      },
      "referrer": "https://vestige.fi/asset/796425061",
      "method": "GET",
      "mode": "cors"
  });
  const data = await resp.json();
  for(const elem of data) {
    elem.date = new Date(elem.timestamp * 1000).toISOString();
  }
  return data;
}

async function getAlgo(start, end) {
  const usdc = await getCandles(31566704, start, end, 'ALGO');
  const fields = ['open','low','high','close'];
  for(const elem of usdc)
    for(const field of fields)
      elem[field] = 1/elem[field];
  return usdc;
}

const aid = process.argv[2];
const start = 1684523700;

const algoPrices = await getAlgo(start);
const coopPrices = await getCandles(aid, start);

const firstTimestamp = algoPrices[0].date;
const lastTimestamp = algoPrices[algoPrices.length - 1].date;
console.log('Algo prices from', firstTimestamp, 'until', lastTimestamp);

const firstTimestamp2 = coopPrices[0].date;
const lastTimestamp2 = coopPrices[coopPrices.length - 1].date;
console.log('Coop prices from', firstTimestamp2, 'until', lastTimestamp2);

writeFileSync('coop.json', JSON.stringify(coopPrices, 0, 2));
writeFileSync('algo.json', JSON.stringify(algoPrices, 0, 2));
