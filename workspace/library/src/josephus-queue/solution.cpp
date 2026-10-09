#include <iostream>
#include <queue>
using namespace std;
int main() {
    int n, k;
    cin >> n >> k;
    queue<int> q;
    for (int i = 1; i <= n; i++) q.push(i);
    bool first = true;
    while (!q.empty()) {
        for (int i = 1; i < k; i++) { q.push(q.front()); q.pop(); }
        cout << (first ? "" : " ") << q.front();
        first = false;
        q.pop();
    }
    cout << '\n';
}
