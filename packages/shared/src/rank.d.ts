/**
 * Generate a rank strictly between `prev` and `next`.
 * Pass undefined for an open endpoint (beginning or end of the list).
 * Returned rank always compares strictly greater than prev and less than next.
 */
export declare function between(prev: string | undefined, next: string | undefined): string;
/** Initial rank when the list is empty. */
export declare const INITIAL_RANK = "U";
/** Produce `count` evenly spaced ranks after `after` (undefined = start). */
export declare function sequence(count: number, after?: string): string[];
