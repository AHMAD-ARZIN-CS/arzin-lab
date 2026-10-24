#include <iostream>
#include <vector>
using namespace std;
int n;
vector<int> a, cur;
void out() {
    cout << '{';
    for (size_t i = 0; i < cur.size(); i++) cout << (i ? " " : "") << cur[i];
    cout << "}\n";
}
void dfs(int start) {
    out();
    for (int i = start; i < n; i++) {
        cur.push_back(a[i]);
        dfs(i + 1);
        cur.pop_back();
    }
}
int main() {
    cin >> n;
    a.resize(n);
    for (int& x : a) cin >> x;
    dfs(0);
}
