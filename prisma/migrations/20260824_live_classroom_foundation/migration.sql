// Live Classroom Foundation — Phase 1
// جدول القاعات + ربط الجلسات الموجودة بها + حالة الجلسة

CREATE TABLE "classrooms" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT,
    "yearId" TEXT,
    "subjectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "classrooms_teacherId_idx" ON "classrooms"("teacherId");

ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LiveSession: ربط اختياري بالقاعة + حالة الجلسة
ALTER TABLE "live_sessions" ADD COLUMN "classroomId" TEXT;
ALTER TABLE "live_sessions" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'scheduled';

CREATE INDEX "live_sessions_classroomId_idx" ON "live_sessions"("classroomId");

ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
