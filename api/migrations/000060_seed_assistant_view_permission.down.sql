DELETE FROM role_resources WHERE role_id IN (
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222'
) AND resource_id IN (SELECT id FROM resources WHERE code = 'assistant:view');

DELETE FROM resources WHERE code = 'assistant:view';
