import { isToolDisabled } from './registration.js'

/**
 * Guidance helpers that keep tool descriptions and runtime "next step" hints in
 * sync with which tools are actually registered.
 *
 * Tools can be disabled via `--disable-tools` / `--disable-groups`, in which case
 * they are skipped during registration and disappear from `tools/list`. Without
 * these helpers, descriptions and response fields (e.g. `next`, `appliesTo`)
 * would keep pointing users at tools that no longer exist. Each guidance snippet
 * is paired with the tool it depends on so it can be dropped automatically when
 * that tool is disabled.
 */

/** A guidance snippet tied to the tool it references. */
export interface ToolRef {
  /** Unprefixed tool name this snippet depends on, e.g. `speak_player`. */
  tool: string
  /** Display text shown only when the referenced tool is enabled. */
  text: string
}

/** True when the tool is registered (not disabled). Accepts prefixed or unprefixed names. */
export function isToolEnabled(disabledTools: Set<string>, name: string): boolean {
  return !isToolDisabled(disabledTools, name)
}

/** Keep only snippets whose referenced tool is enabled. */
export function filterToolRefs(disabledTools: Set<string>, items: ToolRef[]): string[] {
  return items.filter((item) => isToolEnabled(disabledTools, item.tool)).map((item) => item.text)
}

/**
 * Build a "next step" hint from candidate snippets, keeping only enabled tools.
 * Returns undefined when no candidate references an enabled tool, so callers can
 * omit the field entirely instead of emitting an empty hint.
 */
export function buildNext(disabledTools: Set<string>, suggestions: ToolRef[]): string | undefined {
  const texts = filterToolRefs(disabledTools, suggestions)
  return texts.length > 0 ? texts.join(' ') : undefined
}

/**
 * Compose a description from a base sentence plus optional sentences that each
 * reference another tool. Sentences referencing disabled tools are dropped.
 */
export function composeDescription(disabledTools: Set<string>, base: string, refs: ToolRef[]): string {
  return [base, ...filterToolRefs(disabledTools, refs)].join(' ')
}
