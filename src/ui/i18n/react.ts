import { useCallback, useSyncExternalStore } from 'react';
import { snapshot, subscribe, translate } from './catalog';
import type { MessageKey, MessageParams } from './catalog';

/**
 * `t()` for components. It re-renders the component when the language or an edited text changes, without remounting,
 * so unsaved work in the builder or a reference table grid is not lost.
 */
export function useT(): (key: MessageKey, params?: MessageParams) => string {
  const v = useSyncExternalStore(subscribe, snapshot, snapshot);
  // `v` is a dependency on purpose: a new function identity tells memoized children that the texts changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((key, params) => translate(key, params), [v]);
}
