#include <algorithm>
#include <iostream>
#include <vector>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<pair<long long, long long>> v(n);
    for (auto& [a, b] : v) cin >> a >> b;
    sort(v.begin(), v.end());
    vector<pair<long long, long long>> out;
    for (auto [a, b] : v) {
        if (!out.empty() && a <= out.back().second) out.back().second = max(out.back().second, b);
        else out.push_back({a, b});
    }
    for (auto [a, b] : out) cout << a << ' ' << b << '\n';
}
