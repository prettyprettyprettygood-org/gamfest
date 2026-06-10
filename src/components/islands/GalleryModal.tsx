import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './GalleryModal.css';

export interface GalleryItem {
  thumbSrc: string;
  fullSrc: string;
  alt: string;
  caption: string;
  thumbPosition?: string;
}

interface Props {
  items: GalleryItem[];
}

export default function GalleryModal({ items }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  function open(i: number) {
    setActiveIdx(i);
  }

  function close() {
    setActiveIdx(null);
  }

  useEffect(() => {
    if (activeIdx !== null) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => closeRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeIdx]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && activeIdx !== null) close();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activeIdx]);

  return (
    <>
      <ul className="gallery-grid">
        {items.map((item, i) => (
          <li key={i} className="gallery-grid__item">
            <button
              className="gallery-thumb"
              onClick={() => open(i)}
              aria-label={`View full photo: ${item.caption}`}
            >
              <img
                src={item.thumbSrc}
                alt=""
                className="gallery-thumb__img"
                style={{ objectPosition: item.thumbPosition ?? 'center' }}
              />
              <span className="gallery-thumb__overlay" aria-hidden="true">
                <svg
                  className="gallery-thumb__icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </span>
            </button>
            <p className="gallery-caption">{item.caption}</p>
          </li>
        ))}
      </ul>

      <AnimatePresence>
        {activeIdx !== null && (
          <motion.div
            className="gallery-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-label={items[activeIdx]?.caption}
          >
            <motion.figure
              className="gallery-modal__frame"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                ref={closeRef}
                className="gallery-modal__close"
                onClick={close}
                aria-label="Close"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
              <img
                src={items[activeIdx]?.fullSrc}
                alt={items[activeIdx]?.alt}
                className="gallery-modal__img"
              />
              {items[activeIdx]?.caption && (
                <figcaption className="gallery-modal__caption">
                  {items[activeIdx].caption}
                </figcaption>
              )}
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
