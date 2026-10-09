#include <iostream>
using namespace std;
long long gcd(long long a, long long b) { return b == 0 ? a : gcd(b, a % b); }
int main() {
    long long a, b;
    cin >> a >> b;
    long long g = gcd(a, b);
    cout << g << ' ' << a / g * b << '\n';
}
