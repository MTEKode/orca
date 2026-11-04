# Querying the graph

Matching is case-folded substring plus IDF over node labels: no stemming, no synonyms, no
cross-language matching. If the question uses different words than the code, a literal query
returns nothing.

1. Call `graphify_graph_stats` and `graphify_god_nodes` to learn the graph's vocabulary.
2. Pick query terms that actually appear in those labels (identifiers, module names). Never
   invent a term; if nothing plausible exists, say the graph has no relevant vocabulary.
3. State the terms you used before running `graphify_query_graph`.
4. Use BFS (default) for "what is connected to X"; use DFS (`mode: "dfs"`) or
   `graphify_shortest_path` for "how does X reach Y".
5. Cap output with the tool's token budget argument when the answer sprawls.
6. For a single symbol, `graphify_get_node` then `graphify_get_neighbors` explains it in
   plain language: what it is, who calls it, what it calls.

Verify surprising claims by reading the cited `source_location` before acting on them.
