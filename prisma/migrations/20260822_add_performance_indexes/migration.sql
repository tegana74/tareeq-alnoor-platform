-- Performance indexes for Tareeq Alnoor Platform
-- Phase 4: Database Index Audit

-- Auth & Session (hot path - every request)
CREATE INDEX IF NOT EXISTS "login_attempts_phone_success_createdat_idx" ON "login_attempts" ("phone", "success", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "otp_codes_phone_purpose_createdat_idx" ON "otp_codes" ("phone", "purpose", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("userId");

-- Notifications (header badge count on every render + notification list)
CREATE INDEX IF NOT EXISTS "notifications_user_id_isread_idx" ON "notifications" ("userId", "isRead");
CREATE INDEX IF NOT EXISTS "notifications_user_id_createdat_idx" ON "notifications" ("userId", "createdAt" DESC);

-- Invoice (wallet page, admin dashboard, payment review)
CREATE INDEX IF NOT EXISTS "invoices_user_id_createdat_idx" ON "invoices" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "invoices_status_createdat_idx" ON "invoices" ("status", "createdAt" DESC);

-- Wallet transactions (wallet page)
CREATE INDEX IF NOT EXISTS "wallet_transactions_user_id_createdat_idx" ON "wallet_transactions" ("userId", "createdAt" DESC);

-- Exam attempts (results page, profile stats, grading)
CREATE INDEX IF NOT EXISTS "exam_attempts_user_id_createdat_idx" ON "exam_attempts" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "exam_attempts_exam_id_idx" ON "exam_attempts" ("examId");

-- Exam answers (save/finish during exams, result rendering)
CREATE INDEX IF NOT EXISTS "exam_answers_attempt_id_idx" ON "exam_answers" ("attemptId");

-- Questions (questions per exam)
CREATE INDEX IF NOT EXISTS "questions_exam_id_idx" ON "questions" ("examId");

-- Sections, Videos, Books, Exams (content per course/section)
CREATE INDEX IF NOT EXISTS "sections_course_id_idx" ON "sections" ("courseId");
CREATE INDEX IF NOT EXISTS "videos_section_id_idx" ON "videos" ("sectionId");
CREATE INDEX IF NOT EXISTS "books_section_id_idx" ON "books" ("sectionId");
CREATE INDEX IF NOT EXISTS "exams_section_id_idx" ON "exams" ("sectionId");

-- Course catalog (browse + filters)
CREATE INDEX IF NOT EXISTS "courses_isactive_order_idx" ON "courses" ("isActive", "order");
CREATE INDEX IF NOT EXISTS "courses_year_id_idx" ON "courses" ("yearId");
CREATE INDEX IF NOT EXISTS "courses_subject_id_idx" ON "courses" ("subjectId");
CREATE INDEX IF NOT EXISTS "courses_teacher_id_idx" ON "courses" ("teacherId");

-- Bookmarks (bookmarks page)
CREATE INDEX IF NOT EXISTS "bookmarks_user_id_idx" ON "bookmarks" ("userId");

-- Live sessions (live listing, teacher courses)
CREATE INDEX IF NOT EXISTS "live_sessions_startat_idx" ON "live_sessions" ("startAt" DESC);
CREATE INDEX IF NOT EXISTS "live_sessions_teacher_id_idx" ON "live_sessions" ("teacherId");
CREATE INDEX IF NOT EXISTS "live_sessions_course_id_idx" ON "live_sessions" ("courseId");

-- Session bookings (capacity count in booking transaction)
CREATE INDEX IF NOT EXISTS "session_bookings_session_id_status_idx" ON "session_bookings" ("sessionId", "status");

-- Users (admin queries)
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" ("role");
CREATE INDEX IF NOT EXISTS "users_year_id_idx" ON "users" ("yearId");

-- Question bank (bank management)
CREATE INDEX IF NOT EXISTS "bank_chapters_subject_id_idx" ON "bank_chapters" ("subjectId");
CREATE INDEX IF NOT EXISTS "bank_questions_chapter_id_idx" ON "bank_questions" ("chapterId");

-- Appeals (student appeals page)
CREATE INDEX IF NOT EXISTS "appeals_user_id_idx" ON "appeals" ("userId");
