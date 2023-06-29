import { readFileSync, writeFileSync } from 'fs';
import algosdk from 'algosdk';

// tinyman
// node pool.js 1002541853 IUUZ66NGBEKKTZ2RW7CAUOGEIBOFTYNUNMMEUSS3K5CSJAMGDY747F5KIA 1103395709

// pact
// node pool.js 1103395819

const token = "";
const server = "https://mainnet-idx.algonode.cloud";
const port = 443;

const client = new algosdk.Indexer(token, server, port);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const assetCache = {};
async function getAssetInfo(assetId) {
  assetId = Number(assetId);
  if (assetCache[assetId])
    return assetCache[assetId]; 
  const data = await algod.getAssetByID(assetId).do();
  assetCache[assetId] = data.params;
  return assetCache[assetId];
}

async function lookup({ query, attempts = 1, callback, old_err, nn }) {
  if (nn)
    query = query.nextToken(nn);
  let res;
  const start = Date.now();
  try {
    res = await query.do();
  } catch(e) {
    const message = e.response?.body?.message ?? e.response?.body ?? e.message;
    const sleepfor = Math.pow(attempts, 2) * 2000;
    console.error(message);
    console.error('sleeping for', sleepfor/1000);
    await sleep(sleepfor);
    if (attempts > 4 && e.message == old_err) {
      console.error('too many errors, quiting');
      return;
    }
    return lookup({ query, attempts: attempts+1, old_err: e.message, nn, callback });
  }
  const elapsed = Math.floor((Date.now() - start) / 1000);
  const data = res.transactions ?? res.transaction;
  if (callback)
    callback(data);
  let round1, round2;
  if (res.transactions?.length) {
    round1 = res.transactions[0]['confirmed-round'];
    const lastIdx = res.transactions.length - 1;
    round2 = res.transactions[lastIdx]['confirmed-round'];
  }
  // console.error(res['next-token'], res.transactions?.length, round1, round2, `${elapsed}s.`);
  if (res['next-token']) {
    nn = res['next-token'];
    await sleep(1500);
    const next = await lookup({ query, attempts: 1, callback, nn });
    return [...res.transactions, ...next];
  }
  return res.transactions ?? data ?? [];
}

let [appID, appAddress, LPID] = process.argv.slice(2);

if (!appID) {
  console.log('Expected: <asa ID>');
  process.exit(1);
}

appID = Number(appID);

if (!appAddress) {
  appAddress = algosdk.getApplicationAddress(appID);
}

const algod = new algosdk.Algodv2('ZmJ9Q2u4tbs9xUb480bhkTJ4A94C9gKQ5lUzEiI5', "http://10.114.0.55", 4000);

if (!LPID) {
  const status = await algod.accountInformation(appAddress).do();
  LPID = status['created-assets'][0].index;
} else {
  LPID = Number(LPID);
}

const { decimals: decimalsLP } = await getAssetInfo(LPID);

// track:
//   LP tokens in circulation
//   [timestamp]: LP_in_circulation
const lp_state = { };

const lpTxns = await lookup({
  query: client.searchForTransactions()
    .address(appAddress)
    .assetID(LPID),
});

lpTxns.reverse();

let last_balance = 0;
for(const txn of lpTxns) {
  const rtxn = findATxn(txn, LPID);
  if (!rtxn) {
    continue;
  } else {
    const { "round-time": rt, } = txn;
    const { "asset-transfer-transaction": atxn } = rtxn;
    let { amount, receiver } = atxn;
    amount /= 10 ** decimalsLP
    if (receiver === appAddress) {
      amount = 0 - amount;
    }
    last_balance += amount;
    lp_state[rt] = last_balance;
  }
}

writeFileSync(`LP-${LPID}.json`, JSON.stringify(lp_state, 0, 2));

function findATxn(txn, id) {
  const { "asset-transfer-transaction": atxn, "inner-txns": itxns } = txn;
  if (atxn && atxn['asset-id'] === id)
    return txn;
  return itxns?.find(itxn => findATxn(itxn, id));
}

// track:
//   A/B balances
//   [timestamp]: { A, B }
const states = {};

async function proc(txns) {
  for(const txn of txns) {
    const {
      id,
      sender,
      "global-state-delta": gsd,
      "round-time": ts,
      "inner-txns": itxns,
      "confirmed-round": rnd,
    } = txn;
    let { A, B, asset_1_reserves, asset_2_reserves, asset_1_protocol_fees } = findParseState(txn, appID) ?? {};
    if (is(A) && is(B))  {
      states[ts] = { A, B };
    }
    if (is(asset_1_reserves) && is(asset_2_reserves) && is(asset_1_protocol_fees)) {
      A = asset_1_reserves - asset_1_protocol_fees;
      B = asset_2_reserves;
      if (A<B) {
        [A,B] = [B,A];
      }
      console.log(new Date(ts * 1000), A, B, B/A);
      states[ts] = { A, B };
    }
    debugger;
  }
}

function findParseState(txn, appID) {
  const {
    "application-transaction": atxn,
    "inner-txns": itxns,
    "global-state-delta": gsd,
    "local-state-delta": lsd,
  } = txn;
    
  if (atxn && atxn['application-id'] === appID && lsd) {
    const sd = lsd.filter(({ address: a }) => appAddress === a);
    if (sd.length) {
      return parseState(sd.flatMap(s => s.delta));
    }
  }
  if (atxn && atxn['application-id'] === appID && gsd) {
    return parseState(gsd);
  }
  const i = itxns?.map(itxn => findParseState(itxn, appID)).filter(Boolean);
  if (i?.length) {
    if (i.length > 1) {
      debugger;
    }
    return i[0];
  }
  // check if apptxn[appid] = appid
  // else return itxn.some(apptxn[appid] == appID
}

function parseState(gsd) {
  const obj = {};
  for(const { key, value: { uint } } of gsd) {
    const strKey = Buffer.from(key, 'base64').toString();
    obj[strKey] = uint;
  }
  return obj;
}

await lookup({
  query: client.searchForTransactions().address(appAddress).applicationID(appID).limit(5000), 
  callback: proc,
});

writeFileSync(`app-${appID}.json`, JSON.stringify(states, 0, 2));

function is(val) {
  return val !== undefined;
}
