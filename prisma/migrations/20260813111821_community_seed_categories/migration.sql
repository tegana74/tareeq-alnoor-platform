-- Seed community categories
INSERT INTO "community_categories" ("id", "name", "description", "icon", "order", "isActive", "createdAt") VALUES
  ('cat-questions', 'أسئلة واستفسارات', 'اطرح سؤالاً عن المنهج أو المذاكرة واحصل على إجابات من زملائك والمعلمين', 'question', 1, 1, CURRENT_TIMESTAMP),
  ('cat-discussions', 'نقاشات ومواضيع', 'تبادل الآراء والأفكار حول المواد والمنهج', 'chat', 2, 1, CURRENT_TIMESTAMP),
  ('cat-reviews', 'مراجعات وتقييمات', 'شارك ملخصات ومراجعات وأساليب مذاكرة مجربة', 'book', 3, 1, CURRENT_TIMESTAMP),
  ('cat-announcements', 'إعلانات', 'إعلانات المنصة والعروض والجلسات القادمة', 'megaphone', 4, 1, CURRENT_TIMESTAMP);
