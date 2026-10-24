#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n;
    cin >> n;
    if (n < 2) { cout << 0 << '\n'; return 0; }
    vector<bool> comp(n + 1, false);
    int count = 0;
    for (int i = 2; i <= n; i++) {
        if (comp[i]) continue;
        count++;
        for (long long j = 1LL * i * i; j <= n; j += i) comp[j] = true;
    }
    cout << count << '\n';
}
