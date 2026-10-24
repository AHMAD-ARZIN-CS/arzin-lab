# Coin change (fewest coins)

Read `n`, then `n` coin values, then `amount`. Print the fewest coins needed to make exactly `amount` (unlimited coins of each value), or `-1` if impossible.
Greedy fails for some coin sets (try coins 1 3 4 and amount 6). Use DP over amounts.
