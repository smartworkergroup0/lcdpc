DELETE FROM role_resources WHERE resource_id IN (
    SELECT id FROM resources WHERE code IN ('dashboard:admin-panel:view', 'dashboard:operation-panel:view')
);

DELETE FROM resources WHERE code IN ('dashboard:admin-panel:view', 'dashboard:operation-panel:view');
