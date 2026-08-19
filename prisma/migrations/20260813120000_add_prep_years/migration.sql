-- إزاحة سنوات المرحلة الثانوية لتلي المرحلة الإعدادية
UPDATE "years" SET "order" = 4 WHERE "id" = 'year-1';
UPDATE "years" SET "order" = 5 WHERE "id" = 'year-2';
UPDATE "years" SET "order" = 6 WHERE "id" = 'year-3';

-- المرحلة الإعدادية
INSERT INTO "years" ("id", "name", "order", "isActive", "createdAt")
VALUES ('year-pre-1', 'الصف الأول الإعدادي', 1, 1, CURRENT_TIMESTAMP),
       ('year-pre-2', 'الصف الثاني الإعدادي', 2, 1, CURRENT_TIMESTAMP),
       ('year-pre-3', 'الصف الثالث الإعدادي', 3, 1, CURRENT_TIMESTAMP);
