'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Search,
  X,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  BookOpen,
  Users,
  CalendarDays,
  SlidersHorizontal,
} from 'lucide-react';
import type { Catalog } from '@/lib/types';
import { FacultyCard, SectionCard } from './catalog-ui';
import { CourseFinder } from './course-finder';
export function Directory({
  catalog,
  mode,
  initialSemester,
  initialQuery = '',
}: {
  catalog: Catalog;
  mode: 'faculty' | 'courses' | 'sections';
  initialSemester?: string;
  initialQuery?: string;
}) {
  if (mode === 'sections')
    return (
      <CourseFinder
        catalog={catalog}
        initialQuery={initialQuery}
        initialSemester={initialSemester}
      />
    );
  return (
    <BrowseDirectory
      catalog={catalog}
      mode={mode}
      initialSemester={initialSemester}
      initialQuery={initialQuery}
    />
  );
}
function BrowseDirectory({
  catalog,
  mode,
  initialSemester,
  initialQuery,
}: {
  catalog: Catalog;
  mode: 'faculty' | 'courses';
  initialSemester?: string;
  initialQuery: string;
}) {
  const [query, setQuery] = useState(
    typeof initialQuery === 'string' ? initialQuery.slice(0, 100) : '',
  );
  const [selectedSemester, setSemester] = useState(
    initialSemester ?? catalog.semesters[0]?.id ?? '',
  );
  const semester = catalog.semesters.some((s) => s.id === selectedSemester)
    ? selectedSemester
    : (catalog.semesters[0]?.id ?? '');
  const [area, setArea] = useState('');
  const [sort, setSort] = useState('name');
  const [limit, setLimit] = useState(12);
  const sections = catalog.sections.filter((s) => s.semesterId === semester);
  const prefixes = [...new Set(catalog.courses.map((c) => c.code.match(/^[A-Z]+/)?.[0] ?? ''))]
    .filter(Boolean)
    .sort();
  const ids = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selected = catalog.sections.filter((s) => s.semesterId === semester);
    if (mode === 'faculty')
      return catalog.faculty
        .filter(
          (f) =>
            `${f.name} ${f.initials}`.toLowerCase().includes(q) &&
            (!area ||
              selected.some(
                (s) =>
                  s.facultyIds.includes(f.id) &&
                  catalog.courses.find((c) => c.id === s.courseId)?.code.startsWith(area),
              )),
        )
        .sort((a, b) =>
          sort === 'sections'
            ? selected.filter((s) => s.facultyIds.includes(b.id)).length -
              selected.filter((s) => s.facultyIds.includes(a.id)).length
            : a.name.localeCompare(b.name),
        )
        .map((f) => f.id);
    return catalog.courses
      .filter(
        (c) =>
          `${c.code} ${c.title}`.toLowerCase().includes(q) &&
          (!area || c.code.startsWith(area)) &&
          selected.some((s) => s.courseId === c.id),
      )
      .sort((a, b) =>
        sort === 'title' ? a.title.localeCompare(b.title) : a.code.localeCompare(b.code),
      )
      .map((c) => c.id);
  }, [catalog, query, semester, area, mode, sort]);
  return (
    <>
      <div className="browse-toolbar panel">
        <div className="search-input">
          <Search size={20} />
          <input
            type="search"
            aria-label={`Search ${mode}`}
            placeholder={
              mode === 'faculty'
                ? 'Search a name or initials, e.g. SHKU'
                : 'Search a course code or title, e.g. CSE361'
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(12);
            }}
          />
          {query && (
            <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}>
              <X size={16} />
            </button>
          )}
        </div>
        <label className="browse-semester">
          <CalendarDays size={16} />
          <select
            aria-label="Select semester"
            value={semester}
            onChange={(e) => {
              setSemester(e.target.value);
              setLimit(12);
            }}
          >
            {catalog.semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name.replace(' · source snapshot', '')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="browse-results-bar">
        <p>
          <strong>{ids.length}</strong> {mode === 'faculty' ? 'faculty members' : 'courses'}
          {query ? ' found' : ' to explore'}
        </p>
        <div>
          <label className="area-filter">
            <SlidersHorizontal size={14} />
            <select
              aria-label="Filter by course area"
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setLimit(12);
              }}
            >
              <option value="">All subjects</option>
              {prefixes.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <select aria-label="Sort results" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">{mode === 'faculty' ? 'Name A–Z' : 'Course code'}</option>
            <option value={mode === 'faculty' ? 'sections' : 'title'}>
              {mode === 'faculty' ? 'Most sections' : 'Course title'}
            </option>
          </select>
        </div>
      </div>
      {ids.length ? (
        <div className={mode === 'faculty' ? 'directory-grid faculty-grid' : 'course-browser'}>
          {ids
            .slice(0, limit)
            .map((id) =>
              mode === 'faculty' ? (
                <FacultyCard
                  key={id}
                  faculty={catalog.faculty.find((f) => f.id === id)!}
                  catalog={catalog}
                  semester={semester}
                />
              ) : (
                <CourseCard
                  key={`${id}:${semester}`}
                  id={id}
                  catalog={catalog}
                  semester={semester}
                  sections={sections}
                />
              ),
            )}
        </div>
      ) : (
        <div className="panel empty-state">
          <span className="empty-icon">
            <Search size={28} />
          </span>
          <h3>No matches found</h3>
          <p>Try another name, course code or subject.</p>
          <button
            className="button button-outline"
            onClick={() => {
              setQuery('');
              setArea('');
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {ids.length > limit && (
        <button className="button button-outline load-more" onClick={() => setLimit(limit + 12)}>
          Show more {mode === 'faculty' ? 'faculty' : 'courses'} <PlusIcon />
        </button>
      )}
    </>
  );
}
function PlusIcon() {
  return <span aria-hidden="true">+</span>;
}
function CourseCard({
  id,
  catalog,
  semester,
  sections,
}: {
  id: string;
  catalog: Catalog;
  semester: string;
  sections: Catalog['sections'];
}) {
  const course = catalog.courses.find((c) => c.id === id)!;
  const assigned = sections
    .filter((s) => s.courseId === id)
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState('');
  return (
    <article className={`course-card ${open ? 'is-open' : ''}`}>
      <div className="course-summary">
        <span className="course-icon">
          <BookOpen size={23} />
        </span>
        <div className="course-summary-name">
          <Link prefetch={false} href={`/courses/${id}?semester=${semester}`} className="eyebrow">
            {course.code}
            <ArrowUpRight size={12} />
          </Link>
          <h2>{course.title}</h2>
          <p>
            <span>
              {course.credits} {course.credits === 1 ? 'credit' : 'credits'}
            </span>
            <span>
              <Users size={13} />
              {new Set(assigned.flatMap((s) => s.facultyIds)).size} faculty
            </span>
            {course.department && <span>{course.department}</span>}
          </p>
        </div>
        <button
          className="button button-outline"
          aria-expanded={open}
          aria-controls={`course-sections-${id}`}
          onClick={() => {
            setOpen(!open);
            setSectionId('');
          }}
        >
          {open
            ? 'Hide sections'
            : `Show ${assigned.length} ${assigned.length === 1 ? 'section' : 'sections'}`}
          <ChevronDown size={16} className={open ? 'rotated' : ''} />
        </button>
      </div>
      <div className="course-section-shortcuts">
        <span>Jump to section</span>
        <div className="course-section-strip">
          {assigned.map((s) => (
            <button
              key={s.id}
              aria-label={`Show ${course.code}.${s.number}`}
              aria-pressed={open && sectionId === s.id}
              className={open && sectionId === s.id ? 'selected' : ''}
              onClick={() => {
                setOpen(true);
                setSectionId(s.id);
              }}
            >
              {s.number}
              {s.groups.length > 0 && <span className="availability-dot" />}
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div className="course-expanded" id={`course-sections-${id}`}>
          <div className="course-expanded-heading">
            <p>
              {sectionId
                ? 'Selected section'
                : `${assigned.length} sections · Join or share directly below`}
            </p>
            {sectionId && (
              <button className="text-link" onClick={() => setSectionId('')}>
                Show all sections <ArrowRight size={13} />
              </button>
            )}
          </div>
          <div className="finder-section-list">
            {assigned
              .filter((s) => !sectionId || s.id === sectionId)
              .map((s) => (
                <SectionCard key={s.id} section={s} catalog={catalog} />
              ))}
          </div>
        </div>
      )}
    </article>
  );
}
