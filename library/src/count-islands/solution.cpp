#include <iostream>
#include <string>
#include <vector>
using namespace std;
int r, c;
vector<string> g;
void sink(int i, int j) {
    if (i < 0 || j < 0 || i >= r || j >= c || g[i][j] != '1') return;
    g[i][j] = '0';
    sink(i + 1, j); sink(i - 1, j); sink(i, j + 1); sink(i, j - 1);
}
int main() {
    cin >> r >> c;
    g.resize(r);
    for (auto& row : g) cin >> row;
    int count = 0;
    for (int i = 0; i < r; i++) for (int j = 0; j < c; j++) if (g[i][j] == '1') { count++; sink(i, j); }
    cout << count << '\n';
}
