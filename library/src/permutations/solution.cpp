#include <iostream>
#include <vector>
using namespace std;
int n;
vector<int> cur;
vector<bool> used;
void dfs() {
    if ((int)cur.size() == n) {
        for (int i = 0; i < n; i++) cout << cur[i] << (i + 1 < n ? " " : "\n");
        return;
    }
    for (int v = 1; v <= n; v++) {
        if (used[v]) continue;
        used[v] = true; cur.push_back(v);
        dfs();
        cur.pop_back(); used[v] = false;
    }
}
int main() {
    cin >> n;
    used.assign(n + 1, false);
    dfs();
}
