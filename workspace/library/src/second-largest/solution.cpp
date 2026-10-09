#include <iostream>
#include <climits>
using namespace std;
int main() {
    int n;
    cin >> n;
    long long first = LLONG_MIN, second = LLONG_MIN;
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        if (x > first) { second = first; first = x; }
        else if (x < first && x > second) second = x;
    }
    if (second == LLONG_MIN) cout << "none\n"; else cout << second << '\n';
}
