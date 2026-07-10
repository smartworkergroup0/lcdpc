INSERT INTO measurement_unit_classifications (id, name, code)
VALUES (gen_random_uuid(), 'Generico', 'generic')
ON CONFLICT (code) DO NOTHING;
