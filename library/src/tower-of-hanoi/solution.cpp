#include <iostream>
using namespace std;
int moves = 0;
void hanoi(int n, char from, char to, char via) {
    if (n == 0) return;
    hanoi(n - 1, from, via, to);
    cout << "disk " << n << ": " << from << " -> " << to << '\n';
    moves++;
    hanoi(n - 1, via, to, from);
}
int main() {
    int n;
    cin >> n;
    hanoi(n, 'A', 'C', 'B');
    cout << moves << '\n';
}
