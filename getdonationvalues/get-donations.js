import algosdk from 'algosdk';
import { crv } from '../constants.js';
import { queryIndexer, die } from '../util.js';
import { priceAt } from '../trackprices/priceat.js';
import { writeFileSync } from 'fs';

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
        usd = '???';
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

const donations = await getDonations();
writeFileSync('donations.csv', toCSV(donations));

let totals = 0;
const donors = Object.entries(
    donations.reduce((donors, { sender, usd, id }) => {
      const d = donors[sender] = donors[sender] ?? { usd: 0, ids: [] };
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
    return { donor: x[0], usd_value: x[1].usd, perc: x[1].usd / totals * 100, ids: x[1].ids }
  });

writeFileSync('donors.csv', toCSV(donors));

function toCSV(data) {
  const header = Object.keys(data[0]).join(',');
  const rows = data.map(row => Object.values(row).join(','));
  return [header, ...rows].join('\n');
}
