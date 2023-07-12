import fetch from 'node-fetch';
import { readFileSync, writeFileSync } from 'fs';

async function getCandles(aid=796425061, start=1687239900, end=null, c='USD') {
  let url = `https://vestige.fi/api/candles?a=${aid}&b=15&s=${start}`;
  if (end)
    url += `&e=${end}`;
  if (c !== 'ALGO')
    url += `&c=${c}`;
  console.error(url);
  try {
    const resp = await fetch(url, {
        "credentials": "include",
        "headers": {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.5",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
          "Authorization": "zUDO4QTMxEjM"
        },
        "referrer": "https://vestige.fi/asset/796425061",
        "method": "GET",
        "mode": "cors"
      });
    const text = await resp.text();
    const data = JSON.parse(text);
    for(const elem of data) {
      elem.date = new Date(elem.timestamp * 1000).toISOString();
    }
    return data;
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

async function getAlgo(start, end) {
  const usdc = await getCandles(31566704, start, end, 'ALGO');
  const fields = ['open','low','high','close'];
  for(const elem of usdc)
    for(const field of fields)
      elem[field] = 1/elem[field];
  return usdc;
}

function merge(old, neww) {
  const getTimestamp = (arr, ts) => arr.find(({timestamp}) => timestamp === ts);
  const finall = [];
  for(const o of old) {
    const { timestamp } = o;
    const isInNew = getTimestamp(neww, timestamp);
    finall.push(isInNew ?? o);
  }
  for(const n of neww) {
    const { timestamp } = n;
    const exists = getTimestamp(finall, timestamp);
    if (!exists)
      finall.push(n);
  }
  return finall;
}

const aid = 796425061;
const start = 1684523700;

const coopExisting = JSON.parse(readFileSync('coop.json'));
const algoExisting = JSON.parse(readFileSync('algo.json'));

const coopStart = coopExisting[coopExisting.length - 1].timestamp;
const algoStart = algoExisting[coopExisting.length - 1].timestamp;

console.error('seam coop', coopStart);
console.error('seam algo', algoStart);
const coopPrices = await getCandles(aid, coopStart);
const finalCoopPrices = merge(coopExisting, coopPrices);

const algoPrices = await getAlgo(algoStart);
const finalAlgoPrices = merge(algoExisting, algoPrices);

const firstTimestamp = algoPrices[0].date;
const lastTimestamp = algoPrices[algoPrices.length - 1].date;
console.log('Algo prices from', firstTimestamp, 'until', lastTimestamp);

const firstTimestamp2 = coopPrices[0].date;
const lastTimestamp2 = coopPrices[coopPrices.length - 1].date;
console.log('Coop prices from', firstTimestamp2, 'until', lastTimestamp2);

writeFileSync('coop.json', JSON.stringify(finalCoopPrices, 0, 2));
writeFileSync('algo.json', JSON.stringify(finalAlgoPrices, 0, 2));
