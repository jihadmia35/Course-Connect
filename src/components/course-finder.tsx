'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  X,
  ArrowRight,
  Bookmark,
  MessageCircle,
  BookOpen,
  ArrowUpRight,
  SlidersHorizontal,
  Zap,
  Plus,
  Check,
} from 'lucide-react';
import type { Catalog } from '@/lib/types';
import { findSections } from '@/lib/section-search';
import { SectionCard } from './section-card';
import { SourceNotice } from './catalog-ui';
import { useSavedSections } from './saved-sections';
export function CourseFinder({
  catalog,
  initialQuery = '',
  initialSemester,
  onlySaved = false,
}: {
  catalog: Catalog;
  initialQuery?: string;
  initialSemester?: string;
  onlySaved?: boolean;
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
  const [withGroups, setWithGroups] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(8);
  const { ids } = useSavedSections();
  const search = useRef<HTMLInputElement>(null);
  const sectionStrip = useRef<HTMLDivElement>(null);
  const results = useMemo(
    () =>
      findSections(catalog, {
        query,
        semesterId: semester,
        area,
        withGroups,
        savedIds: ids,
        onlySaved,
      }),
    [catalog, query, semester, area, withGroups, ids, onlySaved],
  );
  const semesterSections = catalog.sections.filter((s) => s.semesterId === semester);
  const groupsCount = semesterSections.filter((s) => s.groups.length > 0).length;
  const saved = semesterSections.filter((s) => ids.includes(s.id));
  const courses = catalog.courses
    .filter((c) => semesterSections.some((s) => s.courseId === c.id))
    .sort((a, b) => a.code.localeCompare(b.code));
  const prefixes = [...new Set(courses.map((c) => c.code.match(/^[A-Z]+/)?.[0] ?? ''))]
    .filter(Boolean)
    .sort();
  const normalized = query.toUpperCase().replace(/\s/g, '');
  const focusedCourse = courses.find(
    (c) => normalized === c.code || normalized.startsWith(c.code + '.'),
  );
  const neighboring = focusedCourse
    ? semesterSections
        .filter((s) => s.courseId === focusedCourse.id && (!onlySaved || ids.includes(s.id)))
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
    : [];
  function updateQuery(value: string) {
    setQuery(value);
    setLimit(8);
  }
  function clearFilters() {
    updateQuery('');
    setArea('');
    setWithGroups(false);
  }
  useEffect(() => {
    const strip = sectionStrip.current;
    const selected = strip?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (strip && selected) {
      const left =
        selected.getBoundingClientRect().left -
        strip.getBoundingClientRect().left +
        strip.scrollLeft;
      if (
        left < strip.scrollLeft ||
        left + selected.offsetWidth > strip.scrollLeft + strip.clientWidth
      )
        strip.scrollLeft = Math.max(0, left - (strip.clientWidth - selected.offsetWidth) / 2);
    }
  }, [query]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (
        event.key === '/' ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        search.current?.focus();
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  return (
    <div className="finder-page">
      <div className="finder-heading">
        <div>
          <span className="eyebrow">
            {onlySaved ? 'YOUR PERSONAL SHORTLIST' : 'LESS SEARCHING. MORE CONNECTING.'}
          </span>
          <h1>
            {onlySaved ? (
              'Your saved sections.'
            ) : (
              <>
                Find your class group<span>.</span>
              </>
            )}
          </h1>
          <p>
            {onlySaved
              ? 'Your classes and their invites, saved on this device. No account needed.'
              : 'Search your course. Pick your section. Join your people.'}
          </p>
        </div>
        <span className="finder-campus-note">
          <span className="orange-dot" />
          Every batch. One campus.
        </span>
      </div>
      <SourceNotice catalog={catalog} />
      <div className="finder-search-panel">
        <div className="finder-search-line">
          <div className="finder-search-field">
            <Search size={24} />
            <div>
              <label htmlFor="class-search">
                Course, section or faculty
                <span className="mobile-semester-note">
                  {catalog.semesters
                    .find((s) => s.id === semester)
                    ?.name.replace(' · source snapshot', '')}
                </span>
              </label>
              <input
                ref={search}
                id="class-search"
                type="search"
                aria-label="Search courses and sections"
                placeholder="Try CSE361.9 or faculty initials"
                maxLength={100}
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') updateQuery('');
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="search"
              />{' '}
            </div>
            {query ? (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => updateQuery('')}
              >
                <X size={18} />
              </button>
            ) : (
              <kbd title="Press / to search">/</kbd>
            )}
          </div>
        </div>
        <div className={`finder-extra-filters ${filtersOpen ? 'is-open' : ''}`} id="class-filters">
          <label className="finder-semester">
            Semester
            <select
              aria-label="Select semester"
              value={semester}
              onChange={(event) => {
                setSemester(event.target.value);
                setLimit(8);
              }}
            >
              {catalog.semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name.replace(' · source snapshot', '')}
                </option>
              ))}
            </select>
          </label>
          <label className="area-filter">
            <span>Subject</span>
            <select
              aria-label="Filter by course area"
              value={area}
              onChange={(event) => {
                setArea(event.target.value);
                setLimit(8);
              }}
            >
              <option value="">All subjects</option>
              {prefixes.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="finder-filters">
          <div className="scope-switch" aria-label="Group availability">
            <button
              className={!withGroups ? 'active' : ''}
              aria-label={onlySaved ? 'All saved' : 'All sections'}
              aria-pressed={!withGroups}
              onClick={() => {
                setWithGroups(false);
                setLimit(8);
              }}
            >
              <span className="scope-label">{onlySaved ? 'All saved' : 'All sections'}</span>
              <span className="scope-mobile-label" aria-hidden="true">
                All
              </span>
              <span className="scope-count">
                {onlySaved ? saved.length : semesterSections.length}
              </span>
            </button>
            <button
              className={`group-scope ${withGroups ? 'active' : ''}`}
              aria-pressed={withGroups}
              title="Show sections with shared Messenger invites"
              onClick={() => {
                setWithGroups(true);
                setLimit(8);
              }}
            >
              {withGroups ? (
                <Check size={17} strokeWidth={2.5} aria-hidden="true" />
              ) : (
                <MessageCircle size={17} strokeWidth={2.2} aria-hidden="true" />
              )}
              With groups
              <span className="scope-count">
                {onlySaved ? saved.filter((s) => s.groups.length).length : groupsCount}
              </span>
            </button>
          </div>
          <button
            className="mobile-filter-toggle"
            aria-label="Filters"
            aria-expanded={filtersOpen}
            aria-controls="class-filters"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal size={14} />
            <span>Filters</span>
            {area && <span className="availability-dot" />}
          </button>
          <span className="instant-hint">
            <Zap size={12} />
            Instant results
          </span>
        </div>
      </div>
      {focusedCourse && neighboring.length > 1 && (
        <div className="section-jump">
          <span>{focusedCourse.code} sections</span>
          <div ref={sectionStrip}>
            <button
              aria-label={`Show all ${focusedCourse.code} sections`}
              aria-pressed={normalized === focusedCourse.code}
              className={normalized === focusedCourse.code ? 'selected' : ''}
              onClick={() => updateQuery(focusedCourse.code)}
            >
              All
            </button>
            {neighboring.map((s) => (
              <button
                key={s.id}
                aria-label={`Show ${focusedCourse.code}.${s.number}`}
                aria-pressed={normalized === `${focusedCourse.code}.${s.number}`}
                className={normalized === `${focusedCourse.code}.${s.number}` ? 'selected' : ''}
                onClick={() => {
                  updateQuery(`${focusedCourse.code}.${s.number}`);
                  setWithGroups(false);
                  setArea('');
                }}
              >
                {s.number}
                {s.groups.length > 0 && <span className="availability-dot" />}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="finder-layout">
        <section className="finder-results" aria-label="Matching course sections">
          <div className="finder-results-heading">
            <h2>
              {query
                ? 'Search results'
                : withGroups
                  ? 'Ready to connect'
                  : onlySaved
                    ? 'Your classes'
                    : 'Explore sections'}
              <span>{results.length}</span>
            </h2>
            <p role="status" aria-live="polite">
              {results.length
                ? `Showing ${Math.min(limit, results.length)} of ${results.length} sections`
                : 'No matching sections'}
            </p>
          </div>
          {results.length ? (
            <>
              <div className="finder-section-list">
                {results.slice(0, limit).map((s) => (
                  <SectionCard key={s.id} section={s} catalog={catalog} />
                ))}
              </div>
              {results.length > limit && (
                <button
                  className="button button-outline load-more"
                  onClick={() => setLimit(limit + 8)}
                >
                  Show {Math.min(8, results.length - limit)} more sections <Plus size={16} />
                </button>
              )}
            </>
          ) : (
            <div className="panel empty-state">
              <span className="empty-icon">
                {onlySaved && !ids.length ? <Bookmark size={28} /> : <Search size={28} />}
              </span>
              <h3>
                {onlySaved && !saved.length && !query
                  ? 'Keep your classes close.'
                  : 'No matches found'}
              </h3>
              <p>
                {onlySaved && !saved.length && !query
                  ? 'Tap the bookmark on a section to save its schedule and group links here.'
                  : withGroups
                    ? 'No shared invites match these filters yet. You can browse all sections or add the first invite.'
                    : 'Try a course code like CSE361, a section like CSE361.9, or your faculty’s initials.'}
              </p>
              {onlySaved && !saved.length && !query ? (
                <Link href="/" className="button button-primary">
                  Find your sections <ArrowRight size={16} />
                </Link>
              ) : (
                <button className="button button-outline" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}
          <p className="results-footnote">
            Schedules use Bangladesh time. Invites are shared by students; membership is not
            verified.
          </p>
        </section>
        <aside className="finder-aside">
          <section className="quick-course panel">
            <div className="aside-heading">
              <span className="aside-symbol">
                <BookOpen size={17} />
              </span>
              <h2>Know your course?</h2>
            </div>
            <p>Jump straight to its sections.</p>
            <select
              aria-label="Jump to a course"
              value={focusedCourse?.id ?? ''}
              onChange={(event) => {
                const c = courses.find((c) => c.id === event.target.value);
                if (c) {
                  updateQuery(c.code);
                  setArea('');
                  setWithGroups(false);
                }
              }}
            >
              <option value="">Choose a course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.title}
                </option>
              ))}
            </select>
            <Link href="/courses" className="text-link">
              Browse all courses <ArrowUpRight size={14} />
            </Link>
          </section>
          {!onlySaved && (
            <section className="saved-shortcuts panel">
              <div className="aside-heading">
                <span className="aside-symbol orange">
                  <Bookmark size={17} />
                </span>
                <h2>Your saved sections</h2>
                <span className="tiny-count">{saved.length}</span>
              </div>
              {saved.length ? (
                <div className="saved-shortcut-list">
                  {saved.slice(0, 5).map((s) => {
                    const c = catalog.courses.find((c) => c.id === s.courseId)!;
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          updateQuery(`${c.code}.${s.number}`);
                          setWithGroups(false);
                          setArea('');
                          search.current?.scrollIntoView({ block: 'center' });
                        }}
                      >
                        <span>
                          {c.code}
                          <b>.{s.number}</b>
                          <small>{c.title}</small>
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    );
                  })}
                  <Link className="text-link" href="/saved">
                    See all saved <ArrowRight size={13} />
                  </Link>
                </div>
              ) : (
                <div className="saved-placeholder">
                  <Bookmark size={24} />
                  <strong>A shortcut for next time.</strong>
                  <p>Bookmark your sections. Find their invites again in one tap.</p>
                  <span>Saved only on this device</span>
                </div>
              )}
            </section>
          )}
          <section className="community-note">
            <span className="community-note-icon">
              <MessageCircle size={23} />
            </span>
            <h2>
              Good things start
              <br />
              with a shared link.
            </h2>
            <p>Your classmates might be looking for the group you’re already in.</p>
            <Link href="/submit">
              Share a group invite <ArrowUpRight size={16} />
            </Link>
          </section>
          <div className="directory-facts">
            <span>{courses.length} courses</span>
            <i /> <span>{semesterSections.length} sections</span>
            <p>
              From the university’s advising data.
              <br />
              <Link href="/about">
                Learn about the source <ArrowUpRight size={12} />
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
