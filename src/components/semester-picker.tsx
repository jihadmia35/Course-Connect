'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
export function SemesterPicker({
  semesters,
  value,
}: {
  semesters: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  return (
    <select
      className="semester-select"
      value={value}
      aria-label="Select semester"
      onChange={(e) => {
        const next = new URLSearchParams(params);
        next.set('semester', e.target.value);
        router.push(`${pathname}?${next}`);
      }}
    >
      {semesters.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
