/** 0 exact, 1 prefix, 2 substring, 3 subsequence; null when the query does not match. */
export function getNameRank(name: string, query: string): number | null {
  if (name === query) {
    return 0
  }
  if (name.startsWith(query)) {
    return 1
  }
  if (name.includes(query)) {
    return 2
  }
  return isSubsequence(query, name) ? 3 : null
}

function isSubsequence(query: string, value: string): boolean {
  let queryIndex = 0
  for (const character of value) {
    if (character === query[queryIndex]) {
      queryIndex += 1
    }
    if (queryIndex === query.length) {
      return true
    }
  }
  return false
}
