-- @param refresh STRING
SELECT
  id,
  name,
  filters,
  created_at
FROM training.dsg_vibe.saved_filters
WHERE :refresh = :refresh
ORDER BY created_at DESC
