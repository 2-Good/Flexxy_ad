import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP Plugins safely in browser environment
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Check if the user system prefers reduced motion
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Animate message item entrance with Apple visionOS spring physics
 */
export const animateMessageEntrance = (
  target: HTMLElement | null,
  options?: { isUser?: boolean; delay?: number }
) => {
  if (!target) return;

  if (prefersReducedMotion()) {
    gsap.set(target, { opacity: 1, y: 0, scale: 1 });
    return;
  }

  const isUser = options?.isUser ?? false;
  const delay = options?.delay ?? 0;

  gsap.fromTo(
    target,
    {
      opacity: 0,
      y: isUser ? 14 : 20,
      scale: 0.98,
      filter: 'blur(4px)',
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      duration: 0.45,
      delay,
      ease: 'power3.out',
      clearProps: 'filter,scale',
    }
  );
};

/**
 * Animate chat composer dock mounting and focus response
 */
export const animateComposerEntrance = (target: HTMLElement | null) => {
  if (!target) return;

  if (prefersReducedMotion()) {
    gsap.set(target, { opacity: 1, y: 0 });
    return;
  }

  gsap.fromTo(
    target,
    {
      opacity: 0,
      y: 30,
      scale: 0.96,
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.6,
      ease: 'back.out(1.2)',
      clearProps: 'scale',
    }
  );
};

/**
 * Animate modal reveal with Apple liquid glass expansion
 */
export const animateModalReveal = (
  modalCard: HTMLElement | null,
  backdrop: HTMLElement | null
) => {
  if (!modalCard) return;

  if (prefersReducedMotion()) {
    if (backdrop) gsap.set(backdrop, { opacity: 1 });
    gsap.set(modalCard, { opacity: 1, scale: 1, y: 0 });
    return;
  }

  const tl = gsap.timeline();

  if (backdrop) {
    tl.fromTo(
      backdrop,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: 'power2.out' },
      0
    );
  }

  tl.fromTo(
    modalCard,
    {
      opacity: 0,
      scale: 0.92,
      y: 20,
      filter: 'blur(8px)',
    },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.4,
      ease: 'back.out(1.4)',
      clearProps: 'filter',
    },
    0.05
  );
};

/**
 * Specular glint sweep across glass elements
 */
export const animateSpecularSweep = (target: HTMLElement | null) => {
  if (!target || prefersReducedMotion()) return;

  gsap.fromTo(
    target,
    { xPercent: -120 },
    {
      xPercent: 220,
      duration: 1.2,
      ease: 'power2.inOut',
    }
  );
};

/**
 * Tactile micro-press feedback for buttons
 */
export const animateButtonPress = (target: HTMLElement | null) => {
  if (!target || prefersReducedMotion()) return;

  gsap.timeline()
    .to(target, { scale: 0.94, duration: 0.08, ease: 'power2.out' })
    .to(target, { scale: 1, duration: 0.16, ease: 'back.out(2)' });
};

/**
 * Physics-based spring animation when expanding or collapsing the desktop Sidebar
 */
export const animateSidebarCollapse = (
  sidebar: HTMLElement | null,
  isCollapsed: boolean,
  onComplete?: () => void
) => {
  if (!sidebar) return;

  if (prefersReducedMotion()) {
    gsap.set(sidebar, { width: isCollapsed ? 72 : 280 });
    if (onComplete) onComplete();
    ScrollTrigger.refresh();
    return;
  }

  const targetWidth = isCollapsed ? 72 : 280;

  gsap.to(sidebar, {
    width: targetWidth,
    duration: 0.38,
    ease: isCollapsed ? 'power3.inOut' : 'back.out(1.15)',
    onUpdate: () => {
      ScrollTrigger.refresh();
    },
    onComplete: () => {
      ScrollTrigger.refresh();
      if (onComplete) onComplete();
    },
  });
};

/**
 * Staggered entrance/exit for conversation items when expanding/collapsing the sidebar
 */
export const animateConversationListItems = (
  container: HTMLElement | null,
  isCollapsed: boolean
) => {
  if (!container) return;

  const items = container.querySelectorAll('.sidebar-dialogue-item');
  if (!items || items.length === 0) return;

  if (prefersReducedMotion()) {
    gsap.set(items, { opacity: 1, x: 0, scale: 1 });
    return;
  }

  if (isCollapsed) {
    // Collapsing: Smooth subtle contraction
    gsap.to(items, {
      opacity: 0.85,
      scale: 0.96,
      duration: 0.2,
      stagger: 0.015,
      ease: 'power2.inOut',
    });
  } else {
    // Expanding: Physics-based spring entrance
    gsap.fromTo(
      items,
      {
        opacity: 0,
        x: -18,
        scale: 0.94,
        filter: 'blur(3px)',
      },
      {
        opacity: 1,
        x: 0,
        scale: 1,
        filter: 'blur(0px)',
        duration: 0.35,
        stagger: 0.03,
        ease: 'back.out(1.2)',
        clearProps: 'filter,transform',
      }
    );
  }
};

/**
 * Integrate GSAP ScrollTrigger on the conversation list container.
 * Creates smooth scroll physics where items gracefully fade and scale into view,
 * with velocity-damped parallax effects as the list is scrolled.
 */
export const setupSidebarScrollTrigger = (
  scrollerElement: HTMLElement | null
): (() => void) => {
  if (!scrollerElement || prefersReducedMotion()) {
    return () => {};
  }

  const triggers: ScrollTrigger[] = [];
  const items = scrollerElement.querySelectorAll('.sidebar-dialogue-item');

  items.forEach((item) => {
    const trigger = ScrollTrigger.create({
      scroller: scrollerElement,
      trigger: item as HTMLElement,
      start: 'top 96%',
      end: 'bottom 4%',
      toggleActions: 'play reverse play reverse',
      animation: gsap.fromTo(
        item,
        {
          opacity: 0.35,
          scale: 0.97,
        },
        {
          opacity: 1,
          scale: 1,
          duration: 0.28,
          ease: 'power2.out',
          overwrite: 'auto',
        }
      ),
    });

    triggers.push(trigger);
  });

  // Return clean teardown function to prevent memory leaks
  return () => {
    triggers.forEach((t) => t.kill());
  };
};

/**
 * Refresh all ScrollTrigger instances
 */
export const refreshScrollTriggers = () => {
  if (typeof window !== 'undefined') {
    ScrollTrigger.refresh();
  }
};
