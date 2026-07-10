INSERT INTO measurement_unit_classifications (id, name, code)
VALUES (gen_random_uuid(), 'Empaque', 'packaging');

UPDATE measurement_units
SET classification_id = (SELECT id FROM measurement_unit_classifications WHERE code = 'packaging')
WHERE code IN ('box', 'sack', 'pack');
