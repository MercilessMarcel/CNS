import { useEffect } from 'react';

const LOCK_COUNT_KEY = 'cnsScrollLockCount';
const PREV_BODY_OVERFLOW_KEY = 'cnsPrevBodyOverflow';
const PREV_HTML_OVERFLOW_KEY = 'cnsPrevHtmlOverflow';
const PREV_BODY_POSITION_KEY = 'cnsPrevBodyPosition';
const PREV_BODY_TOP_KEY = 'cnsPrevBodyTop';
const PREV_BODY_LEFT_KEY = 'cnsPrevBodyLeft';
const PREV_BODY_RIGHT_KEY = 'cnsPrevBodyRight';
const PREV_BODY_WIDTH_KEY = 'cnsPrevBodyWidth';
const PREV_HTML_OVERSCROLL_KEY = 'cnsPrevHtmlOverscroll';
const SCROLL_Y_KEY = 'cnsScrollY';

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const body = document.body;
    const html = document.documentElement;
    const current = Number(body.dataset[LOCK_COUNT_KEY] || '0');

    if (current === 0) {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      body.dataset[SCROLL_Y_KEY] = String(scrollY);
      body.dataset[PREV_BODY_OVERFLOW_KEY] = body.style.overflow || '';
      body.dataset[PREV_HTML_OVERFLOW_KEY] = html.style.overflow || '';
      body.dataset[PREV_BODY_POSITION_KEY] = body.style.position || '';
      body.dataset[PREV_BODY_TOP_KEY] = body.style.top || '';
      body.dataset[PREV_BODY_LEFT_KEY] = body.style.left || '';
      body.dataset[PREV_BODY_RIGHT_KEY] = body.style.right || '';
      body.dataset[PREV_BODY_WIDTH_KEY] = body.style.width || '';
      body.dataset[PREV_HTML_OVERSCROLL_KEY] = html.style.overscrollBehavior || '';

      html.style.overflow = 'hidden';
      html.style.overscrollBehavior = 'none';
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.width = '100%';
    }

    body.dataset[LOCK_COUNT_KEY] = String(current + 1);

    return () => {
      const latest = Number(body.dataset[LOCK_COUNT_KEY] || '1');
      const next = Math.max(0, latest - 1);

      if (next === 0) {
        const scrollY = Number(body.dataset[SCROLL_Y_KEY] || '0');
        body.style.overflow = body.dataset[PREV_BODY_OVERFLOW_KEY] || '';
        html.style.overflow = body.dataset[PREV_HTML_OVERFLOW_KEY] || '';
        html.style.overscrollBehavior = body.dataset[PREV_HTML_OVERSCROLL_KEY] || '';
        body.style.position = body.dataset[PREV_BODY_POSITION_KEY] || '';
        body.style.top = body.dataset[PREV_BODY_TOP_KEY] || '';
        body.style.left = body.dataset[PREV_BODY_LEFT_KEY] || '';
        body.style.right = body.dataset[PREV_BODY_RIGHT_KEY] || '';
        body.style.width = body.dataset[PREV_BODY_WIDTH_KEY] || '';

        window.scrollTo(0, Number.isFinite(scrollY) ? scrollY : 0);

        delete body.dataset[PREV_BODY_OVERFLOW_KEY];
        delete body.dataset[PREV_HTML_OVERFLOW_KEY];
        delete body.dataset[PREV_BODY_POSITION_KEY];
        delete body.dataset[PREV_BODY_TOP_KEY];
        delete body.dataset[PREV_BODY_LEFT_KEY];
        delete body.dataset[PREV_BODY_RIGHT_KEY];
        delete body.dataset[PREV_BODY_WIDTH_KEY];
        delete body.dataset[PREV_HTML_OVERSCROLL_KEY];
        delete body.dataset[SCROLL_Y_KEY];
        delete body.dataset[LOCK_COUNT_KEY];
      } else {
        body.dataset[LOCK_COUNT_KEY] = String(next);
      }
    };
  }, [active]);
}
