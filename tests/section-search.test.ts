import { describe, expect, it } from 'vitest';
import { findSections } from '@/lib/section-search';
import type { Catalog } from '@/lib/types';
// Synthetic search fixtures, never imported into the university database.
const catalog: Catalog = {
  preview: true,
  notice: '',
  submissionsEnabled: false,
  departments: [],
  semesters: [
    { id: 'a', name: 'Test semester A', isActive: true },
    { id: 'b', name: 'Test semester B', isActive: false },
  ],
  courses: [
    {
      id: 'c',
      code: 'CSE361',
      title: 'Operating Systems',
      credits: 3,
      departmentId: null,
      department: null,
    },
  ],
  faculty: [
    {
      id: 'f',
      name: 'Search Test Faculty',
      initials: 'STF',
      department: null,
      departmentId: null,
      photoUrl: null,
      courses: 1,
      sections: 3,
    },
  ],
  sections: [
    {
      id: 'a9',
      courseId: 'c',
      semesterId: 'a',
      number: '9',
      availableSeats: null,
      facultyIds: ['f'],
      schedules: [],
      groups: [
        { id: 'g', url: 'https://m.me/j/SyntheticSearchInvite', createdAt: '2026-01-01T00:00:00Z' },
      ],
    },
    {
      id: 'a90',
      courseId: 'c',
      semesterId: 'a',
      number: '90',
      availableSeats: null,
      facultyIds: ['f'],
      schedules: [],
      groups: [],
    },
    {
      id: 'b9',
      courseId: 'c',
      semesterId: 'b',
      number: '9',
      availableSeats: null,
      facultyIds: ['f'],
      schedules: [],
      groups: [],
    },
  ],
};
describe('direct section search', () => {
  it('matches a complete section exactly, without matching section 90 or a different semester', () => {
    expect(findSections(catalog, { query: 'cse 361.9', semesterId: 'a' }).map((s) => s.id)).toEqual(
      ['a9'],
    );
    expect(findSections(catalog, { query: 'CSE361.09', semesterId: 'a' }).map((s) => s.id)).toEqual(
      ['a9'],
    );
  });
  it('finds a class by title words or faculty initials', () => {
    expect(findSections(catalog, { query: 'operating systems STF', semesterId: 'a' })).toHaveLength(
      2,
    );
    expect(findSections(catalog, { query: 'STF', semesterId: 'a' })).toHaveLength(2);
    expect(findSections(catalog, { query: 'missing faculty', semesterId: 'a' })).toEqual([]);
  });
  it('combines saved, subject and group filters without crossing semesters', () => {
    expect(
      findSections(catalog, { query: '', semesterId: 'a', withGroups: true, area: 'CSE' }).map(
        (s) => s.id,
      ),
    ).toEqual(['a9']);
    expect(
      findSections(catalog, {
        query: '',
        semesterId: 'a',
        onlySaved: true,
        savedIds: ['a90', 'b9'],
      }).map((s) => s.id),
    ).toEqual(['a90']);
    expect(findSections(catalog, { query: '', semesterId: 'a', area: 'MAT' })).toEqual([]);
  });
});
