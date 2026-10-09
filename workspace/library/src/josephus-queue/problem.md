# Hot potato (queue)

Read `n` and `k`. People 1..n stand in a circle. Starting from person 1, count k people (the k-th is eliminated), then continue counting from the next person. Print the order in which people are eliminated.

Simulate it with a `std::queue`: move people from the front to the back while counting.
