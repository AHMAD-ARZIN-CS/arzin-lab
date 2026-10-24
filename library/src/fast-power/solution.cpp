#include <iostream>
using namespace std;
int main() {
    unsigned long long a, b, m;
    cin >> a >> b >> m;
    unsigned long long r = 1 % m;
    a %= m;
    while (b) {
        if (b & 1) r = r * a % m;
        a = a * a % m;
        b >>= 1;
    }
    cout << r << '\n';
}
