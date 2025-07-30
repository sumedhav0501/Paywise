const { MeiliSearch } = require('meilisearch');

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
  apiKey: process.env.MEILI_MASTER_KEY,
});
console.log("master key ",process.env.MEILI_MASTER_KEY);
const index = client.index('vehicles');

module.exports = { client, index };
