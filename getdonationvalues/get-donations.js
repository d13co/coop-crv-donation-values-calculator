import algosdk from 'algosdk';
import { crv } from '../constants.js';
import { queryIndexer, die, lookupNFD } from '../util.js';
import { priceAt } from '../trackprices/priceat.js';
import { readFileSync, writeFileSync } from 'fs';

const server = "https://mainnet-idx.algonode.cloud";
const port = 443;
const indexer = new algosdk.Indexer("", server, port);

export const getDonations  = async () => {
  const queryObj = indexer.searchForTransactions()
    .address(crv)
    .addressRole('receiver')
    .limit(10_000);
  const donations = await queryIndexer(queryObj, 5000);
  return donations.map(txn => {
    const {
      "payment-transaction": ptxn,
      "asset-transfer-transaction": atxn,
      "round-time": ts,
      id,
      sender,
    } = txn;

    if (!atxn && !ptxn)
      return;

    const assetId = ptxn ? 0 : atxn['asset-id'];
    let amount = ptxn?.amount ?? atxn?.amount;
    if (!amount) {
      return;
    }
    amount /= 1_000_000;
    const { coop, algo, coopTs, algoTs } = priceAt(ts);
    if (ts - coopTs > 900) {
      die({ ts, algoTs, id });
    }
    if (ts - algoTs > 900) {
      die({ ts, algoTs, id });
    }
    let usd;
    switch(assetId) {
      case 0:
        usd = algo;
        break;
      case 796425061:
        usd = coop;
        break;
      case 31566704:
        usd = 1;
        break;
      default:
        usd = getLPDonationAtTime(assetId, ts, id);
    }
    const assetPriceAtTime = usd;
    if (typeof usd === "number") {
      usd *= amount;
      txn.usdValue = usd;
    } else {
      txn.usdValue = '??? TODO';
    }
    return { sender, id, ts, date: new Date(ts * 1000).toISOString(), assetId, amount, usd, assetPriceAtTime };
  }).filter(Boolean);
}

function getLPDonationAtTime(aid, ts, id) {
  try {
    const circulatingData = JSON.parse(readFileSync(`../lps/LP-${aid}.json`));
    let lastTS;
    for(const [t, circulating] of Object.entries(circulatingData)) {
      if (Number(t) > ts) {
        break;
      }
      lastTS = Number(t);
    }
    const circulating = circulatingData[lastTS];
    const { ts: lpTS, mid: [algoInPool, coopInPool] } = getLPDataNear(aid, ts);
    const { coop, algo, coopTs, algoTs } = priceAt(ts);
    const algoValue = algoInPool * algo / 1_000_000;
    const coopValue = coopInPool * coop / 1_000_000;
    const lpValue = algoValue + coopValue;
    const singleValue = lpValue / circulating;
    if (id === "WLHONCY6YF5N2DZYE5QB2HBJRIWNYEGFGKEWARIMGJE4HFC6BTEQ") {
      console.log({
        targetTs: new Date(ts * 1000),
        lpTokenTs: new Date(lastTS * 1000),
        lpDataTs: new Date(lpTS * 1000),
        ts,
        lpTokenUnix: lastTS,
        lpDataUnix: lpTS,
      });
      debugger;
    }
    return singleValue;
  } catch(e) {
    console.error(e);
    debugger;
  }
}

const swapsFile = {};

function makeMid(row) {
  const { ts, high: [hA, hB], low: [lA, lB] } = row;
  return { ts, mid: [(hA + lA) / 2, (hB + lB) / 2] };
}

function getLPDataNear(aid, ts) {
  if (!swapsFile[aid]) {
    const filename = `../lps/swaps-${aid}.jsons`;
    console.error('loading', filename);
    swapsFile[aid] = readFileSync(filename).toString().split('\n')
      .filter(Boolean)
      .map(s => JSON.parse(s));
    console.error('loaded', filename);
  }
  let lastEntry;
  for(const entry of swapsFile[aid]) {
    const { ts: entryTs } = entry;
    if (entryTs > ts) {
      return makeMid(lastEntry ?? entry);
    }
    lastEntry = entry;
  }
  return makeMid(lastEntry);
}

let donations = await getDonations();
const senders = [...new Set(donations.map(({sender}) => sender))];
const nfds = await lookupNFD(senders);
donations = donations.map(donation => {
  const nfd = nfds[donation.sender] ?? '';
  return {
    nfd,
    ...donation,
  }
});

writeFileSync('donations.csv', toCSV(donations));

let totals = 0;
const donors = Object.entries(
    donations.reduce((donors, { sender, usd, id }) => {
      const d = donors[sender] = donors[sender] ?? { nfd: '', usd: 0, ids: [] };
      if (nfds[sender])
        d.nfd = nfds[sender];
      if (typeof usd === "number") {
        d.usd += usd;
        totals += usd;
      }
      d.ids.push(id);
      return donors;
    }, {})
  )
  .sort(([_, { usd: a }], [__, { usd: b }]) => a < b ? 1 : -1)
  .map(x => {
    return { nfd: x[1].nfd, donor: x[0], usd_value: x[1].usd, perc: x[1].usd / totals * 100, ids: x[1].ids }
  });

writeFileSync('donors.csv', toCSV(donors));

function toCSV(data) {
  const headers = new Set();
  for(const row of data) {
    for(const key of Object.keys(row)) {
      headers.add(key);
    }
  }
  const header = [...headers];
  const rows = data.map(row => Object.values(row).join(','));
  return [header, ...rows].join('\n');
}
