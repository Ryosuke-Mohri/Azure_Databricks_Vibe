-- @param areas STRING
-- @param genders STRING
-- @param carlife STRING
-- @param cosmo STRING
-- @param join_from DATE
-- @param join_to DATE
SELECT
  COUNT(*) AS total_count,
  COUNT_IF(
    (:areas = '' OR array_contains(split(:areas, ','), area))
    AND (:genders = '' OR array_contains(split(:genders, ','), gender))
    AND (:carlife = '' OR carlife_square_member = CAST(:carlife AS BOOLEAN))
    AND (:cosmo = '' OR cosmo_card_holder = CAST(:cosmo AS BOOLEAN))
    AND join_date >= CAST(:join_from AS DATE)
    AND join_date <= CAST(:join_to AS DATE)
  ) AS filtered_count
FROM training.dsg_vibe.customers
