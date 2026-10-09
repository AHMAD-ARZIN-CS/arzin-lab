# Binary search

Read `n`, then `n` integers **sorted ascending**, then `q` queries. For each query value, print the
index where it appears, or `-1` if it does not. Aim for O(log n) per query, and write the loop
yourself (no `std::lower_bound`).

**Input**
```
5
1 3 5 7 9
3
7 2 1
```
**Output**
```
3
-1
0
```
