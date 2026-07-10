UPDATE measurement_units
SET classification_id = (SELECT id FROM measurement_unit_classifications WHERE code = 'unit')
WHERE classification_id = (SELECT id FROM measurement_unit_classifications WHERE code = 'packaging');

DELETE FROM measurement_unit_classifications WHERE code = 'packaging';
