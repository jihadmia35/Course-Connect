-- Browser clients use Next.js server operations only. No public Data API policies.
ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Faculty" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Semester" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CourseSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeachingAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SectionSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MessengerGroupLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroupReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RateLimitBucket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppSettings" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "Department", "Faculty", "Course", "Semester", "CourseSection", "TeachingAssignment", "SectionSchedule", "MessengerGroupLink", "GroupReport", "AdminUser", "ImportHistory", "RateLimitBucket", "AppSettings" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
CREATE UNIQUE INDEX "Semester_one_active" ON "Semester" ("isActive") WHERE "isActive" = true;
ALTER TABLE "Course" ADD CONSTRAINT "Course_credits_check" CHECK (credits >= 0 AND credits <= 30);
ALTER TABLE "CourseSection" ADD CONSTRAINT "CourseSection_seats_check" CHECK ("availableSeats" IS NULL OR "availableSeats" >= 0);
ALTER TABLE "SectionSchedule" ADD CONSTRAINT "SectionSchedule_day_check" CHECK (day IN ('SUN','MON','TUE','WED','THU','FRI','SAT'));
ALTER TABLE "SectionSchedule" ADD CONSTRAINT "SectionSchedule_time_check" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" > "startTime");
ALTER TABLE "MessengerGroupLink" ADD CONSTRAINT "MessengerGroupLink_https_check" CHECK ("normalizedUrl" ~ '^https://(m[.]me/j/|messenger[.]com/join/)[A-Za-z0-9_-]+$' AND length(split_part("normalizedUrl", '/', 5)) BETWEEN 6 AND 256 AND url = "normalizedUrl");
ALTER TABLE "GroupReport" ADD CONSTRAINT "GroupReport_reason_check" CHECK (reason IN ('Broken invite','Wrong section','Spam or abuse'));
