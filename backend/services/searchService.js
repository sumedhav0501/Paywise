// const redis = require('../utils/redisClient');
const { index } = require('../utils/meilisearchClient');

async function searchVehicles(query,carLimit=500) {

  // console.log(process.env.MEILI_MASTER_KEY);
  // const cacheKey = `search:${query.toLowerCase()}`;
  // const cached = await redis.get(cacheKey);
  // if (cached) return JSON.parse(cached);


  const results = await index.search(query, {
    limit: carLimit,
    offset:0,
    attributesToHighlight: ['fullName'],
  });

  // await redis.set(cacheKey, JSON.stringify(results), 'EX', 3600);
  return results;
}

module.exports = { searchVehicles };
