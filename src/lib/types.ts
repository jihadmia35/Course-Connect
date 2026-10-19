export type Meeting = { day: string; startTime: string; endTime: string; room: string };
export type SourceRow = {
  code: string;
  number: string;
  title: string;
  credits: number;
  faculty: { initials: string; name: string }[];
  availableSeats: number | null;
  schedules: Meeting[];
  sourceNote: string | null;
};
export type FacultyView = {
  id: string;
  initials: string;
  name: string;
  departmentId: string | null;
  department: string | null;
  photoUrl: string | null;
  courses: number;
  sections: number;
};
export type CourseView = {
  id: string;
  code: string;
  title: string;
  credits: number;
  departmentId: string | null;
  department: string | null;
};
export type SectionView = {
  id: string;
  courseId: string;
  semesterId: string;
  number: string;
  availableSeats: number | null;
  facultyIds: string[];
  schedules: Meeting[];
  groups: { id: string; url: string; createdAt: string }[];
};
export type Catalog = {
  preview: boolean;
  faculty: FacultyView[];
  courses: CourseView[];
  semesters: { id: string; name: string; isActive: boolean }[];
  departments: { id: string; code: string; name: string }[];
  sections: SectionView[];
  notice: string;
  submissionsEnabled: boolean;
};
