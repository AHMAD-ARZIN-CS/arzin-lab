# Python works too. Visualize to watch the call stack grow and shrink.
def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

scores = [70, 85, 92]
scores.append(100)
print("average:", sum(scores) / len(scores))
print("5! =", fact(5))
