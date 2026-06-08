import { useEffect, useState } from 'react';

export interface NavLevel {
  href: string;
  label: string;
}

export interface LevelSelectNavProps {
  levels: NavLevel[];
}

/**
 * "Level select" nav with scroll-tracked active-section highlighting
 * (deferred from the static pass — PRD §6/§8/§12). Renders the same
 * `nav-link` markup server-side so it works with no JS, then layers in an
 * `IntersectionObserver` to mark whichever section is crossing the viewport's
 * "now playing" band as `aria-current`.
 */
export default function LevelSelectNav({ levels }: LevelSelectNavProps) {
  const [activeHref, setActiveHref] = useState<string | null>(null);

  useEffect(() => {
    const sections = levels
      .map((level) => document.querySelector(level.href))
      .filter((el): el is Element => el !== null);

    if (sections.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;

        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setActiveHref(`#${topmost.target.id}`);
      },
      // a thin horizontal band near the vertical center counts as "now playing"
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [levels]);

  return (
    <ul className="level-select__list">
      {levels.map((level) => (
        <li key={level.href}>
          <a
            className="nav-link"
            href={level.href}
            aria-current={activeHref === level.href ? 'true' : undefined}
          >
            {level.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
