-- @param area STRING
-- @param gender STRING
-- @param carlife STRING
-- @param cosmo STRING
-- @param name_search STRING
SELECT
  customer_id,
  last_name,
  first_name,
  birthdate,
  gender,
  area,
  join_date,
  carlife_square_member,
  cosmo_card_holder
FROM training.dsg_vibe.customers
WHERE (:area = '' OR area = :area)
  AND (:gender = '' OR gender = :gender)
  AND (:carlife = 'all' OR CAST(carlife_square_member AS STRING) = :carlife)
  AND (:cosmo = 'all' OR CAST(cosmo_card_holder AS STRING) = :cosmo)
  AND (
    :name_search = ''
    OR LOWER(last_name) LIKE LOWER(CONCAT('%', :name_search, '%'))
    OR LOWER(first_name) LIKE LOWER(CONCAT('%', :name_search, '%'))
    OR LOWER(customer_id) LIKE LOWER(CONCAT('%', :name_search, '%'))
  )
ORDER BY customer_id
