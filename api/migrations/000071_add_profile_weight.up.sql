ALTER TABLE profiles ADD COLUMN weight DECIMAL(3,2) NOT NULL DEFAULT 0;

-- Profiles with global_admin role → weight 4
UPDATE profiles SET weight = 4.00
WHERE id IN (
    SELECT pra.profile_id FROM profile_role_assignments pra
    JOIN roles r ON r.id = pra.role_id
    WHERE r.code = 'global_admin' AND pra.active = true
);

-- Profiles with cuenta_servicio role → weight 3
UPDATE profiles SET weight = 3.00
WHERE id IN (
    SELECT pra.profile_id FROM profile_role_assignments pra
    JOIN roles r ON r.id = pra.role_id
    WHERE r.code = 'cuenta_servicio' AND pra.active = true
);

-- Profiles with client role → weight 2
UPDATE profiles SET weight = 2.00
WHERE id IN (
    SELECT pra.profile_id FROM profile_role_assignments pra
    JOIN roles r ON r.id = pra.role_id
    WHERE r.code = 'client' AND pra.active = true
);
