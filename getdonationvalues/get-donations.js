import algosdk from 'algosdk';
import { crv } from '../constants.js';
import { queryIndexer, die } from '../util.js';
import { priceAt } from '../trackprices/priceat.js';

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
        console.error('Skipping aid', assetId, 'from id', id);
        return;
    }
    usd *= amount;
    txn.usdValue = usd;
    return { sender, id, ts, assetId, amount, usd, };
  }).filter(Boolean);
}

const donations = await getDonations();
let totals = 0;
const donors = Object.entries(
  donations.reduce((donors, { sender, usd, id }) => {
    const d = donors[sender] = donors[sender] ?? { usd: 0, ids: [] };
    d.usd += usd;
    totals += usd;
    d.ids.push(id);
    return donors;
  }, {})
).sort(([_, { usd: a }], [__, { usd: b }]) => a < b ? 1 : -1)
  .map(x => {
    x[1].perc = x[1].usd / totals * 100;
    return x;
  });

console.log(JSON.stringify(donors, 0, 2));
