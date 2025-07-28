const { searchVehicles } = require('../services/searchService');

const handleSearch = async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ message: 'Missing query' });

  try {
    const results = await searchVehicles(q);
    res.json(results);
  } catch (err) {
    console.error('[SearchController] Error:', err.message);
    res.status(500).json({ message: 'Search failed' });
  }
};

module.exports = { handleSearch };
