#include <iostream>
#include <unordered_set>
using namespace std;
int main() {
    int n;
    cin >> n;
    unordered_set<long long> seen;
    bool dup = false;
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        if (!seen.insert(x).second) dup = true;
    }
    cout << (dup ? "yes" : "no") << '\n';
}
