import type { Catalog, SectionView } from './types';
export type SectionFilters = {
  query: string;
  semesterId: string;
  area?: string;
  withGroups?: boolean;
  savedIds?: readonly string[];
  onlySaved?: boolean;
};
const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const sectionNumber = (value: string) =>
  /^\d+$/.test(value) ? String(Number(value)) : value.toLowerCase();
/** Match a complete section precisely, or all words across the course and its assigned faculty. */
export function findSections(catalog: Catalog, filters: SectionFilters): SectionView[] {
  const query = filters.query.trim();
  const exact = query.match(/^([a-z]+\s*\d{3,4})\s*[.\/#-]\s*([a-z0-9]+)$/i);
  const terms = query.split(/\s+/).map(compact).filter(Boolean);
  const courses = new Map(catalog.courses.map((c) => [c.id, c]));
  const faculty = new Map(catalog.faculty.map((f) => [f.id, f]));
  const saved = new Set(filters.savedIds);
  return catalog.sections
    .filter((section) => {
      if (section.semesterId !== filters.semesterId) return false;
      if (filters.withGroups && !section.groups.length) return false;
      if (filters.onlySaved && !saved.has(section.id)) return false;
      const course = courses.get(section.courseId);
      if (!course || (filters.area && !course.code.startsWith(filters.area))) return false;
      if (exact)
        return (
          compact(course.code) === compact(exact[1]!) &&
          sectionNumber(section.number) === sectionNumber(exact[2]!)
        );
      const text = compact(
        `${course.code}.${section.number} ${course.code} ${course.title} ${section.facultyIds
          .map((id) => {
            const f = faculty.get(id);
            return f ? `${f.name} ${f.initials}` : '';
          })
          .join(' ')}`,
      );
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => {
      const codeOrder = (courses.get(a.courseId)?.code ?? '').localeCompare(
        courses.get(b.courseId)?.code ?? '',
        undefined,
        { numeric: true },
      );
      return codeOrder || a.number.localeCompare(b.number, undefined, { numeric: true });
    });
}
