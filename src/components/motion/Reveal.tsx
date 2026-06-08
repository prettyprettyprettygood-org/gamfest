import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface RevealProps {
  children: ReactNode;
  /** Stagger offset in seconds — lets sibling Reveals cascade like a "level intro" */
  delay?: number;
  className?: string;
}

const variants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

const staticVariants: Variants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Restrained scroll-reveal wrapper — fades/slides content into place once,
 * the first time it scrolls into view ("level intro" cards, PRD §9). Renders
 * a single static frame with no transform/opacity animation under
 * `prefers-reduced-motion`, so content stays immediately readable.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
}: RevealProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={prefersReducedMotion ? staticVariants : variants}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.5,
        delay: prefersReducedMotion ? 0 : delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
