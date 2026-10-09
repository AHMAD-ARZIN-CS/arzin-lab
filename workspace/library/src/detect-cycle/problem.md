# Detect a cycle

Input: `n`, `n` values, then `pos`. If `pos` is -1 the list is normal; otherwise the last node's `next` points back to the node at index `pos` (0-based), creating a cycle.

Print `cycle` or `no cycle`. You may not use extra memory proportional to n. (Floyd's tortoise and hare.)
