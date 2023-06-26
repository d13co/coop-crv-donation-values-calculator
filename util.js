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


