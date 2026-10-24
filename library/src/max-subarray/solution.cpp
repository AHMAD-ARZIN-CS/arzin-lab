#include <iostream>
#include <algorithm>
using namespace std;
int main() {
    int n;
    cin >> n;
    long long best, cur;
    cin >> cur;
    best = cur;
    for (int i = 1; i < n; i++) {
        long long x;
        cin >> x;
        cur = max(x, cur + x);
        best = max(best, cur);
    }
    cout << best << '\n';
}
