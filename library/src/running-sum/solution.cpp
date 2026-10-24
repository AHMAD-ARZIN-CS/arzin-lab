#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    long long s = 0;
    for (int i = 0; i < n; i++) {
        long long x;
        cin >> x;
        s += x;
        cout << s << (i + 1 < n ? " " : "\n");
    }
}
