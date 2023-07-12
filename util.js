import fetch from 'node-fetch';
import promilol from 'promilol';

export function die(...args) {
  console.error(...args);
  process.exit(1);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const queryIndexer = async (queryObj, limit = 5000, nextToken, attempts = 1) => {
  if (nextToken) {
    queryObj.nextToken(nextToken);
  }
  if (!queryObj.query.limit && queryObj.limit) {
    queryObj.limit(limit);
  }
  // console.log("index query", JSON.stringify(queryObj.query), `nT=${nextToken}, attempts=${attempts}`);
  const initQueryObj = { ...queryObj };
  try {
    const res = await queryObj.do();
    const dataKey = ['transactions', 'assets', 'balances']
      .flatMap(s => {
        return [s, s.slice(0, s.length - 1)];
      })
      .find(key => {
        return !!res[key];
      });
    if (!dataKey) {
      console.error('No data key found in indexer results');
      return [];
    }
    const data = res[dataKey];
    if (res['next-token']) {
      await sleep(500);
      if (attempts > 3)
        limit *= 2;
      const finalData = [...data, ...await queryIndexer(queryObj, limit, res['next-token'], 1)];
      // console.log('ret', finalData.length);
      return finalData;
    }
    return data;
  } catch(e) {
    const message = e.response?.body?.message ?? e.response?.body ?? e.message;
    console.error(`Error while querying indexer, attempt ${attempts}: ${e.message}`, e);
    if (attempts < MAX_ATTEMPTS) {
      if (attempts > 2) {
        limit /= 2;
      }
      attempts++;
      if (queryObj.limit)
        queryObj.limit(limit);
      await sleep(Math.pow(attempts, 2) * 500);
      return queryIndexer(queryObj, limit, nextToken, attempts);
    } else {
      console.error(`Too many failures querying indexer`);
      throw e;
    }
  }
}

export const NFDCache = {};

// cachedLookupNFD
//  NFDCache -> promise || result
//  addresses -> NFDCache -> [existing, new]
//  if [new] -> NFDCache += promise
//  await Promise.all(values(NFDCache[addresses]))

export async function lookupNFD(addresses) {
  addresses = Array.isArray(addresses) ? addresses : [addresses];
  const New = []
  for(const address of addresses) {
    if (NFDCache[address] === undefined) {
      New.push(address);
    }
  }
  if (New.length) {
    const asyncRes = _lookupNFD(New);
    for(const N of New) {
      NFDCache[N] = asyncRes.then((data) => {
        return data[N];
      });
    }
  }
  const resultsE = Object.entries(NFDCache).filter(([key]) => addresses.includes(key));
  const results = {};
  for(const [resKey, resValue] of resultsE) {
    NFDCache[resKey] = results[resKey] = await resValue;
  }
  return results;
}

async function _lookupNFD(address) {
  // TODO cache not existing
  // TODO debounce / join requests
  let addresses = Array.isArray(address) ? address : [address];
  const results = Object.fromEntries(addresses.map(address => ([address, null])));
  const chunks = chunk(addresses, 20);
  await promilol(chunks, async chunk => {
    if (!chunk.length)
      return;
    const query = chunk.join('&address=');
    // console.log("Querying", ...chunk);
    const url = `https://api.nf.domains/nfd/address?address=${query}&view=thumbnail`;
    let text;
    try {
      const resp = await fetch(url);
      text = await resp.text();
      let json;
      if (!text.length) {
        return;
      }
      json = JSON.parse(text);
      for(const { name, caAlgo } of json) {
        const matches = caAlgo?.filter(caAlgo => chunk.includes(caAlgo));
        if (!matches)
          continue;
        for(const addr of matches) {
          results[addr] = name;
        }
      }
    } catch(e) {
      console.log('NFDomains lookup', e, text);
      return;
    }
  }, { concurrency: 4 });
  return results;
}

function chunk(elems, num=20) {
  return elems.reduce((out, cur) => {
    let last = out[out.length - 1];
    if (last.length == num) {
      out.push([]);
      last = out[out.length -1];
    }
    last.push(cur);
    return out;
  }, [[]]);
}
